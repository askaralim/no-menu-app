-- POS: staff can manage bar_events; evergreen events (no time bounds) stay public via toggle only.

-- ---------------------------------------------------------------------------
-- RLS: allow staff (same tenant) alongside owner / super_admin
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS bar_events_admin_select ON public.bar_events;
CREATE POLICY bar_events_admin_select
  ON public.bar_events FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND (
          ur.role = 'super_admin'
          OR (ur.tenant_id = bar_events.tenant_id AND ur.role IN ('owner', 'staff'))
        )
    )
  );

DROP POLICY IF EXISTS bar_events_admin_insert ON public.bar_events;
CREATE POLICY bar_events_admin_insert
  ON public.bar_events FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND (
          ur.role = 'super_admin'
          OR (ur.tenant_id = bar_events.tenant_id AND ur.role IN ('owner', 'staff'))
        )
    )
  );

DROP POLICY IF EXISTS bar_events_admin_update ON public.bar_events;
CREATE POLICY bar_events_admin_update
  ON public.bar_events FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND (
          ur.role = 'super_admin'
          OR (ur.tenant_id = bar_events.tenant_id AND ur.role IN ('owner', 'staff'))
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND (
          ur.role = 'super_admin'
          OR (ur.tenant_id = bar_events.tenant_id AND ur.role IN ('owner', 'staff'))
        )
    )
  );

-- ---------------------------------------------------------------------------
-- Public visibility: no time bounds = evergreen (toggle only)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.taplist_event_is_not_expired(
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_visible_until_at timestamptz
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_start_at IS NULL AND p_end_at IS NULL AND p_visible_until_at IS NULL THEN true
    ELSE coalesce(p_visible_until_at, p_end_at, p_start_at + interval '18 hours') >= now()
  END;
$$;

CREATE OR REPLACE FUNCTION public.taplist_event_display_state(
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_visible_until_at timestamptz
)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE
    -- Evergreen / long-running board: no structured start → surface in TONIGHT
    WHEN p_start_at IS NULL
      AND p_end_at IS NULL
      AND p_visible_until_at IS NULL
      THEN 'TONIGHT'
    -- Label-only with explicit visibility window
    WHEN p_start_at IS NULL
      AND p_visible_until_at IS NOT NULL
      AND p_visible_until_at >= now()
      THEN 'TONIGHT'
    WHEN p_start_at IS NOT NULL
      AND p_start_at <= now()
      AND coalesce(p_end_at, p_visible_until_at, p_start_at + interval '18 hours') >= now()
      THEN 'ONGOING'
    WHEN p_start_at IS NOT NULL
      AND (p_start_at AT TIME ZONE 'Asia/Shanghai')::date = (now() AT TIME ZONE 'Asia/Shanghai')::date
      THEN 'TONIGHT'
    ELSE 'UPCOMING'
  END;
$$;

CREATE OR REPLACE FUNCTION public.get_public_taplist_events(
  p_city text DEFAULT NULL,
  p_tenant_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_city text := coalesce(nullif(trim(p_city), ''), 'Shanghai');
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 50));
BEGIN
  RETURN jsonb_build_object(
    'ok', true,
    'results', coalesce(
      (
        SELECT jsonb_agg(row_obj ORDER BY state_rank, starts_at NULLS LAST, sort_order, lower(title))
        FROM (
          SELECT
            public.taplist_public_event_row(e, t) AS row_obj,
            CASE public.taplist_event_display_state(e.start_at, e.end_at, e.visible_until_at)
              WHEN 'ONGOING' THEN 0
              WHEN 'TONIGHT' THEN 1
              ELSE 2
            END AS state_rank,
            e.start_at AS starts_at,
            e.sort_order,
            e.title
          FROM public.bar_events e
          INNER JOIN public.tenants t ON t.id = e.tenant_id
          WHERE t.status = 'active'
            AND t.is_public_visible = true
            AND (p_tenant_id IS NULL OR e.tenant_id = p_tenant_id)
            AND (p_tenant_id IS NOT NULL OR lower(trim(t.city)) = lower(trim(v_city)))
            AND e.is_public_visible = true
            AND e.status = 'scheduled'
            AND public.taplist_event_is_not_expired(e.start_at, e.end_at, e.visible_until_at)
          ORDER BY state_rank, e.start_at NULLS LAST, e.sort_order, lower(e.title)
          LIMIT v_limit
        ) sub
      ),
      '[]'::jsonb
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_public_taplist_event(p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  e public.bar_events;
  t public.tenants;
BEGIN
  SELECT * INTO e
  FROM public.bar_events
  WHERE id = p_event_id;

  IF e.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END IF;

  SELECT * INTO t
  FROM public.tenants
  WHERE id = e.tenant_id;

  IF t.id IS NULL OR t.status <> 'active' OR NOT t.is_public_visible OR NOT e.is_public_visible THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_public');
  END IF;

  IF e.status = 'cancelled' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'cancelled');
  END IF;

  IF NOT public.taplist_event_is_not_expired(e.start_at, e.end_at, e.visible_until_at) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'expired');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'event', public.taplist_public_event_row(e, t)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.taplist_event_is_not_expired(timestamptz, timestamptz, timestamptz) TO anon;
GRANT EXECUTE ON FUNCTION public.taplist_event_is_not_expired(timestamptz, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_taplist_events(text, uuid, integer) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_taplist_events(text, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_taplist_event(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_taplist_event(uuid) TO authenticated;
