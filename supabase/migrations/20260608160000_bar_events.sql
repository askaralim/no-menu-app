-- Public bar events for NO MENU consumer discovery.

CREATE TABLE IF NOT EXISTS public.bar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  title text NOT NULL,
  subtitle text,
  description text,
  event_type text NOT NULL DEFAULT 'other',
  image_url text,
  start_at timestamptz,
  end_at timestamptz,
  visible_until_at timestamptz,
  date_label text,
  time_label text,
  status text NOT NULL DEFAULT 'scheduled',
  is_public_visible boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bar_events_event_type_check'
  ) THEN
    ALTER TABLE public.bar_events
      ADD CONSTRAINT bar_events_event_type_check
      CHECK (event_type IN (
        'new_tap',
        'tap_takeover',
        'guest_shift',
        'tasting',
        'dj',
        'live_music',
        'quiz',
        'party',
        'other'
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bar_events_status_check'
  ) THEN
    ALTER TABLE public.bar_events
      ADD CONSTRAINT bar_events_status_check
      CHECK (status IN ('scheduled', 'cancelled'));
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_bar_events_tenant ON public.bar_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_bar_events_public ON public.bar_events(is_public_visible, status);
CREATE INDEX IF NOT EXISTS idx_bar_events_time ON public.bar_events(start_at, end_at, visible_until_at);

CREATE OR REPLACE FUNCTION public.bar_events_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bar_events_set_updated_at ON public.bar_events;
CREATE TRIGGER trg_bar_events_set_updated_at
BEFORE UPDATE ON public.bar_events
FOR EACH ROW
EXECUTE FUNCTION public.bar_events_set_updated_at();

ALTER TABLE public.bar_events ENABLE ROW LEVEL SECURITY;

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
          OR (ur.tenant_id = bar_events.tenant_id AND ur.role = 'owner')
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
          OR (ur.tenant_id = bar_events.tenant_id AND ur.role = 'owner')
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
          OR (ur.tenant_id = bar_events.tenant_id AND ur.role = 'owner')
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
          OR (ur.tenant_id = bar_events.tenant_id AND ur.role = 'owner')
        )
    )
  );

CREATE OR REPLACE FUNCTION public.taplist_event_type_label(p_type text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE p_type
    WHEN 'new_tap' THEN '新酒上架'
    WHEN 'tap_takeover' THEN 'Tap Takeover'
    WHEN 'guest_shift' THEN 'Guest Shift'
    WHEN 'tasting' THEN '品鉴'
    WHEN 'dj' THEN 'DJ / 音乐'
    WHEN 'live_music' THEN 'Live Music'
    WHEN 'quiz' THEN 'Quiz Night'
    WHEN 'party' THEN '派对'
    ELSE '其他活动'
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

CREATE OR REPLACE FUNCTION public.taplist_event_display_time(
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_date_label text,
  p_time_label text
)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT coalesce(
    nullif(concat_ws(' · ', nullif(trim(p_date_label), ''), nullif(trim(p_time_label), '')), ''),
    CASE
      WHEN p_start_at IS NULL THEN NULL
      WHEN p_end_at IS NOT NULL THEN
        to_char(p_start_at AT TIME ZONE 'Asia/Shanghai', 'MM-DD HH24:MI')
        || ' - '
        || to_char(p_end_at AT TIME ZONE 'Asia/Shanghai', 'HH24:MI')
      ELSE to_char(p_start_at AT TIME ZONE 'Asia/Shanghai', 'MM-DD HH24:MI')
    END
  );
$$;

CREATE OR REPLACE FUNCTION public.taplist_public_event_row(e public.bar_events, t public.tenants)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', e.id,
    'title', e.title,
    'subtitle', e.subtitle,
    'description', e.description,
    'event_type', e.event_type,
    'event_type_label', public.taplist_event_type_label(e.event_type),
    'image_url', e.image_url,
    'start_at', e.start_at,
    'end_at', e.end_at,
    'date_label', e.date_label,
    'time_label', e.time_label,
    'display_state', public.taplist_event_display_state(e.start_at, e.end_at, e.visible_until_at),
    'display_time', public.taplist_event_display_time(e.start_at, e.end_at, e.date_label, e.time_label),
    'tenant_id', t.id,
    'tenant_slug', t.slug,
    'tenant_display_name', coalesce(nullif(trim(t.display_name), ''), t.name),
    'tenant_district', t.district,
    'tenant_address', t.address,
    'tenant_cover_image_url', t.cover_image_url
  );
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
            AND coalesce(e.visible_until_at, e.end_at, e.start_at + interval '18 hours') >= now()
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

  IF coalesce(e.visible_until_at, e.end_at, e.start_at + interval '18 hours') < now() THEN
    RETURN jsonb_build_object('ok', false, 'code', 'expired');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'event', public.taplist_public_event_row(e, t)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_taplist_events(text, uuid, integer) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_taplist_events(text, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_taplist_event(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_taplist_event(uuid) TO authenticated;
