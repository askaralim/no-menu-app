-- Make sold_out a real lifecycle boundary. The drink row may stay assigned to
-- its tap for consumer display, but the physical serving cycle stops when the
-- status is witnessed as sold out. A later active status always opens a fresh
-- exact session.
-- Requires 20261029110918_tap_lifecycle_planned_operations.sql first because
-- it replaces the physical helper and creates the plan-aware overview wrapper.

DO $$
BEGIN
  IF to_regprocedure(
    'public._record_single_tap_lifecycle_transition_without_plan(uuid,uuid,text,integer,integer,text,text,text,text)'
  ) IS NULL
     OR to_regprocedure(
       'public._get_tap_lifecycle_overview_without_plan_metrics(uuid)'
     ) IS NULL THEN
    RAISE EXCEPTION
      'Apply 20261029110918_tap_lifecycle_planned_operations.sql before 20261029145403';
  END IF;
END;
$$;

-- Keep drink state, reconciliation and function replacement on one snapshot.
-- Reads remain available while tap-list writers wait for the migration commit.
LOCK TABLE public.drinks IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE public.tap_lifecycle_events
  DROP CONSTRAINT IF EXISTS tap_lifecycle_events_end_reason_check;

ALTER TABLE public.tap_lifecycle_events
  ADD CONSTRAINT tap_lifecycle_events_end_reason_check
  CHECK (
    end_reason IS NULL
    OR end_reason IN ('replace', 'clear', 'archive', 'cancel', 'sold_out')
  );

-- The plan migration deliberately wraps this helper, so replace the physical
-- implementation below that wrapper rather than changing the public/internal
-- signature chain again.
CREATE OR REPLACE FUNCTION public._record_single_tap_lifecycle_transition_without_plan(
  p_tenant_id uuid,
  p_drink_id uuid,
  p_drink_name text,
  p_from_tap integer,
  p_to_tap integer,
  p_from_status text,
  p_to_status text,
  p_action_hint text,
  p_source text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_before_active boolean := false;
  v_after_active boolean := false;
  v_action text;
  v_session_id uuid;
  v_accuracy text := 'exact';
  v_event_from_tap integer := p_from_tap;
  v_event_to_tap integer := p_to_tap;
  v_end_reason text;
BEGIN
  SELECT s.session_id
  INTO v_session_id
  FROM public.tap_lifecycle_sessions_v1 s
  WHERE s.tenant_id = p_tenant_id
    AND s.drink_id = p_drink_id
    AND s.ended_at IS NULL
    AND s.canceled IS NOT TRUE
  ORDER BY s.started_at DESC NULLS LAST, s.session_id
  LIMIT 1;

  v_before_active := p_from_tap IS NOT NULL
    AND (
      p_from_status IN ('new', 'available', 'low')
      OR (p_from_status = 'sold_out' AND v_session_id IS NOT NULL)
    );
  v_after_active := p_to_tap IS NOT NULL
    AND p_to_status IN ('new', 'available', 'low');

  IF NOT v_before_active AND NOT v_after_active THEN
    RETURN;
  END IF;

  IF NOT v_before_active AND v_after_active THEN
    v_action := CASE WHEN p_action_hint = 'baseline' THEN 'baseline' ELSE 'assign' END;
    v_event_from_tap := NULL;
    v_session_id := gen_random_uuid();
  ELSIF v_before_active AND NOT v_after_active THEN
    IF p_to_tap IS NOT NULL AND p_to_status = 'sold_out' THEN
      -- The drink remains assigned on the row, but the serving cycle ends.
      -- A missing active session must not be replaced with fabricated history.
      IF v_session_id IS NULL THEN
        RETURN;
      END IF;
      v_action := 'sold_out';
      v_end_reason := 'sold_out';
    ELSIF p_to_tap IS NOT NULL AND p_to_status = 'coming_soon' THEN
      v_action := 'cancel';
      v_end_reason := 'cancel';
    ELSIF p_action_hint = 'archive' THEN
      v_action := 'archive';
      v_end_reason := 'archive';
    ELSE
      v_action := 'clear';
      v_end_reason := 'clear';
    END IF;
    v_event_to_tap := NULL;
  ELSIF p_from_tap IS DISTINCT FROM p_to_tap THEN
    v_action := 'move';
  ELSE
    RETURN;
  END IF;

  IF v_session_id IS NULL THEN
    v_session_id := gen_random_uuid();
    v_accuracy := 'unclassified';
  END IF;

  PERFORM public._record_tap_lifecycle_event(
    p_tenant_id,
    gen_random_uuid(),
    1::smallint,
    v_action,
    p_drink_id,
    p_drink_name,
    v_session_id,
    v_event_from_tap,
    v_event_to_tap,
    p_from_status,
    p_to_status,
    clock_timestamp(),
    v_accuracy,
    v_end_reason,
    p_source,
    auth.uid()
  );
END;
$$;

REVOKE ALL ON FUNCTION public._record_single_tap_lifecycle_transition_without_plan(
  uuid, uuid, text, integer, integer, text, text, text, text
) FROM PUBLIC, anon, authenticated;

-- The canonical pair helper from the pending-status migration considered a
-- sold-out row physically active while it still had a tap. Keep that verified
-- pair writer for regular replace/swap operations, but route any operation
-- involving sold_out through the single-drink helper so the status boundary
-- cannot be hidden inside a swap-shaped operation.
ALTER FUNCTION public._record_canonical_tap_operation(
  uuid, text, uuid, text, integer, integer, text, text,
  uuid, text, integer, integer, text, text, text
)
  RENAME TO _record_canonical_tap_operation_without_sold_out_boundary;

REVOKE ALL ON FUNCTION public._record_canonical_tap_operation_without_sold_out_boundary(
  uuid, text, uuid, text, integer, integer, text, text,
  uuid, text, integer, integer, text, text, text
) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._record_canonical_tap_operation(
  p_tenant_id uuid,
  p_action text,
  p_drink_id uuid,
  p_drink_name text,
  p_from_tap integer,
  p_to_tap integer,
  p_from_status text,
  p_to_status text,
  p_other_drink_id uuid,
  p_other_drink_name text,
  p_other_from_tap integer,
  p_other_to_tap integer,
  p_other_from_status text,
  p_other_to_status text,
  p_source text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_from_status = 'sold_out'
     OR p_to_status = 'sold_out'
     OR p_other_from_status = 'sold_out'
     OR p_other_to_status = 'sold_out' THEN
    IF p_other_drink_id IS NOT NULL THEN
      PERFORM public._record_single_tap_lifecycle_transition(
        p_tenant_id,
        p_other_drink_id,
        p_other_drink_name,
        p_other_from_tap,
        p_other_to_tap,
        p_other_from_status,
        p_other_to_status,
        p_action,
        p_source
      );
    END IF;

    PERFORM public._record_single_tap_lifecycle_transition(
      p_tenant_id,
      p_drink_id,
      p_drink_name,
      p_from_tap,
      p_to_tap,
      p_from_status,
      p_to_status,
      p_action,
      p_source
    );
    RETURN;
  END IF;

  PERFORM public._record_canonical_tap_operation_without_sold_out_boundary(
    p_tenant_id,
    p_action,
    p_drink_id,
    p_drink_name,
    p_from_tap,
    p_to_tap,
    p_from_status,
    p_to_status,
    p_other_drink_id,
    p_other_drink_name,
    p_other_from_tap,
    p_other_to_tap,
    p_other_from_status,
    p_other_to_status,
    p_source
  );
END;
$$;

REVOKE ALL ON FUNCTION public._record_canonical_tap_operation(
  uuid, text, uuid, text, integer, integer, text, text,
  uuid, text, integer, integer, text, text, text
) FROM PUBLIC, anon, authenticated;

-- Direct table writes follow the same boundary. This remains a private trigger
-- function and preserves operation context supplied by canonical writers.
CREATE OR REPLACE FUNCTION public.capture_drink_tap_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_drink_id uuid;
  v_drink_name text;
  v_action text;
  v_action_hint text;
  v_accuracy text;
  v_source text;
  v_operation_id uuid;
  v_operation_text text;
  v_operation_seq smallint;
  v_session_id uuid;
  v_from_tap integer;
  v_to_tap integer;
  v_from_status text;
  v_to_status text;
  v_at timestamptz := clock_timestamp();
  v_end_reason text;
  v_before_active boolean := false;
  v_after_active boolean := false;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_tenant_id := OLD.tenant_id;
    v_drink_id := OLD.id;
  ELSE
    v_tenant_id := NEW.tenant_id;
    v_drink_id := NEW.id;
  END IF;

  IF coalesce(current_setting('app.tap_lifecycle.suppress_trigger', true), '') = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tenants t
    WHERE t.id = v_tenant_id
      AND t.tap_lifecycle_started_at IS NOT NULL
      AND v_at >= t.tap_lifecycle_started_at
  ) THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  v_accuracy := coalesce(
    nullif(current_setting('app.tap_lifecycle.accuracy', true), ''),
    'unclassified'
  );
  IF v_accuracy NOT IN ('exact', 'partial_start', 'unclassified') THEN
    v_accuracy := 'unclassified';
  END IF;
  v_source := coalesce(
    nullif(current_setting('app.tap_lifecycle.source', true), ''),
    'direct_drinks_write'
  );
  v_action_hint := nullif(current_setting('app.tap_lifecycle.action', true), '');

  SELECT s.session_id
  INTO v_session_id
  FROM public.tap_lifecycle_sessions_v1 s
  WHERE s.tenant_id = v_tenant_id
    AND s.drink_id = v_drink_id
    AND s.ended_at IS NULL
    AND s.canceled IS NOT TRUE
  ORDER BY s.started_at DESC NULLS LAST, s.session_id
  LIMIT 1;

  IF TG_OP = 'INSERT' THEN
    v_after_active := NEW.enabled IS TRUE
      AND NEW.public_sort_order IS NOT NULL
      AND NEW.public_status IN ('new', 'available', 'low');
    IF NOT v_after_active THEN RETURN NEW; END IF;

    v_action := CASE WHEN v_action_hint = 'baseline' THEN 'baseline' ELSE 'assign' END;
    v_from_tap := NULL;
    v_to_tap := NEW.public_sort_order;
    v_from_status := NEW.public_status;
    v_to_status := NEW.public_status;
    v_drink_name := coalesce(
      public._tap_lifecycle_drink_name(NEW.id),
      nullif(trim(NEW.name), ''),
      '未命名酒款'
    );
  ELSIF TG_OP = 'DELETE' THEN
    v_before_active := OLD.enabled IS TRUE
      AND OLD.public_sort_order IS NOT NULL
      AND (
        OLD.public_status IN ('new', 'available', 'low')
        OR (OLD.public_status = 'sold_out' AND v_session_id IS NOT NULL)
      );
    IF NOT v_before_active THEN RETURN OLD; END IF;

    v_action := 'archive';
    v_from_tap := OLD.public_sort_order;
    v_to_tap := NULL;
    v_from_status := OLD.public_status;
    v_to_status := OLD.public_status;
    v_end_reason := 'archive';
    v_drink_name := coalesce(
      nullif(trim(OLD.display_name), ''),
      nullif(trim(OLD.name), ''),
      '未命名酒款'
    );
  ELSE
    v_before_active := OLD.enabled IS TRUE
      AND OLD.public_sort_order IS NOT NULL
      AND (
        OLD.public_status IN ('new', 'available', 'low')
        OR (OLD.public_status = 'sold_out' AND v_session_id IS NOT NULL)
      );
    v_after_active := NEW.enabled IS TRUE
      AND NEW.public_sort_order IS NOT NULL
      AND NEW.public_status IN ('new', 'available', 'low');

    IF NOT v_before_active AND NOT v_after_active THEN
      RETURN NEW;
    END IF;

    v_from_tap := OLD.public_sort_order;
    v_to_tap := NEW.public_sort_order;
    v_from_status := OLD.public_status;
    v_to_status := NEW.public_status;
    v_drink_name := coalesce(
      public._tap_lifecycle_drink_name(NEW.id),
      nullif(trim(NEW.name), ''),
      '未命名酒款'
    );

    IF NOT v_before_active AND v_after_active THEN
      v_action := CASE WHEN v_action_hint = 'baseline' THEN 'baseline' ELSE 'assign' END;
      v_from_tap := NULL;
    ELSIF v_before_active AND NOT v_after_active THEN
      IF NEW.enabled IS TRUE
         AND NEW.public_sort_order IS NOT NULL
         AND NEW.public_status = 'sold_out' THEN
        IF v_session_id IS NULL THEN
          RETURN NEW;
        END IF;
        v_action := 'sold_out';
        v_end_reason := 'sold_out';
      ELSIF NEW.enabled IS TRUE
         AND NEW.public_sort_order IS NOT NULL
         AND NEW.public_status = 'coming_soon' THEN
        v_action := 'cancel';
        v_end_reason := 'cancel';
      ELSIF NEW.enabled IS NOT TRUE OR v_action_hint = 'archive' THEN
        v_action := 'archive';
        v_end_reason := 'archive';
      ELSE
        v_action := 'clear';
        v_end_reason := 'clear';
      END IF;
      v_to_tap := NULL;
    ELSIF OLD.public_sort_order IS DISTINCT FROM NEW.public_sort_order THEN
      v_action := 'move';
    ELSE
      RETURN NEW;
    END IF;
  END IF;

  IF v_action IN ('assign', 'baseline') THEN
    v_session_id := gen_random_uuid();
  ELSE
    SELECT s.session_id
    INTO v_session_id
    FROM public.tap_lifecycle_sessions_v1 s
    WHERE s.tenant_id = v_tenant_id
      AND s.drink_id = v_drink_id
      AND s.ended_at IS NULL
      AND s.canceled IS NOT TRUE
    ORDER BY s.started_at DESC NULLS LAST, s.session_id
    LIMIT 1;

    IF v_session_id IS NULL THEN
      -- In particular, never fabricate a session merely because a row was
      -- changed to sold_out without a witnessed active cycle.
      IF v_action = 'sold_out' THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
      END IF;
      v_session_id := gen_random_uuid();
      v_accuracy := 'unclassified';
    END IF;
  END IF;

  v_operation_text := nullif(current_setting('app.tap_lifecycle.operation_id', true), '');
  IF v_operation_text IS NULL THEN
    v_operation_id := gen_random_uuid();
  ELSE
    BEGIN
      v_operation_id := v_operation_text::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      v_operation_id := gen_random_uuid();
      v_accuracy := 'unclassified';
    END;
  END IF;

  SELECT (coalesce(max(e.operation_seq), 0) + 1)::smallint
  INTO v_operation_seq
  FROM public.tap_lifecycle_events e
  WHERE e.tenant_id = v_tenant_id
    AND e.operation_id = v_operation_id;

  PERFORM public._record_tap_lifecycle_event(
    v_tenant_id, v_operation_id, v_operation_seq, v_action,
    v_drink_id, v_drink_name, v_session_id,
    v_from_tap, v_to_tap, v_from_status, v_to_status,
    v_at, v_accuracy, v_end_reason, v_source, auth.uid()
  );

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.capture_drink_tap_lifecycle()
  FROM PUBLIC, anon, authenticated;

-- A regular keg change remains inside the current session. When the drink is
-- already sold out, the prior session is closed and the replacement keg starts
-- a fresh exact session. The start-boundary keg_change keeps the user's chosen
-- operation auditable without pretending it was a second keg in the new cycle.
CREATE OR REPLACE FUNCTION public.record_tap_keg_change(
  p_drink_id uuid,
  p_operation_id uuid DEFAULT gen_random_uuid()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_enabled boolean;
  v_tap integer;
  v_from_status text;
  v_to_status text;
  v_is_public_visible boolean;
  v_drink_name text;
  v_session_id uuid;
  v_changed_at timestamptz;
  v_starts_new_session boolean := false;
  v_existing_count integer := 0;
  v_existing_action text;
  v_existing_drink_id uuid;
  v_existing_actor_user_id uuid;
  v_existing_session_id uuid;
  v_existing_tap integer;
  v_existing_status text;
  v_existing_changed_at timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_drink_id IS NULL THEN
    RAISE EXCEPTION 'Drink id is required';
  END IF;
  IF p_operation_id IS NULL THEN
    RAISE EXCEPTION 'Operation id is required';
  END IF;

  SELECT d.tenant_id
  INTO v_tenant_id
  FROM public.drinks d
  WHERE d.id = p_drink_id;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Drink not found';
  END IF;
  IF NOT public.taplist_can_view_tenant(v_tenant_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_tenant_id::text, 0));

  SELECT count(*)::integer
  INTO v_existing_count
  FROM public.tap_lifecycle_events e
  WHERE e.tenant_id = v_tenant_id
    AND e.operation_id = p_operation_id;

  IF v_existing_count > 0 THEN
    SELECT
      e.action,
      e.drink_id,
      e.actor_user_id,
      e.session_id,
      e.to_tap,
      e.to_status,
      e.occurred_at
    INTO
      v_existing_action,
      v_existing_drink_id,
      v_existing_actor_user_id,
      v_existing_session_id,
      v_existing_tap,
      v_existing_status,
      v_existing_changed_at
    FROM public.tap_lifecycle_events e
    WHERE e.tenant_id = v_tenant_id
      AND e.operation_id = p_operation_id
    ORDER BY e.operation_seq, e.id
    LIMIT 1;

    IF v_existing_count = 1
       AND v_existing_action = 'keg_change'
       AND v_existing_drink_id = p_drink_id
       AND v_existing_actor_user_id IS NOT DISTINCT FROM auth.uid() THEN
      SELECT d.is_public_visible
      INTO v_is_public_visible
      FROM public.drinks d
      WHERE d.id = p_drink_id
        AND d.tenant_id = v_tenant_id;

      RETURN jsonb_build_object(
        'ok', true,
        'operation_id', p_operation_id,
        'drink_id', p_drink_id,
        'session_id', v_existing_session_id,
        'tap_number', v_existing_tap,
        'public_status', v_existing_status,
        'is_public_visible', v_is_public_visible,
        'keg_changed_at', v_existing_changed_at,
        'replayed', true
      );
    END IF;

    RAISE EXCEPTION 'Operation id conflict: already used by another tap lifecycle operation';
  END IF;

  SELECT
    d.enabled,
    d.public_sort_order,
    d.public_status,
    d.is_public_visible,
    coalesce(public._tap_lifecycle_drink_name(d.id), '未命名酒款')
  INTO
    v_enabled,
    v_tap,
    v_from_status,
    v_is_public_visible,
    v_drink_name
  FROM public.drinks d
  WHERE d.id = p_drink_id
    AND d.tenant_id = v_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Drink not found';
  END IF;
  IF v_enabled IS NOT TRUE OR v_tap IS NULL THEN
    RAISE EXCEPTION 'Drink is not assigned to a tap';
  END IF;

  SELECT s.session_id
  INTO v_session_id
  FROM public.tap_lifecycle_sessions_v1 s
  WHERE s.tenant_id = v_tenant_id
    AND s.drink_id = p_drink_id
    AND s.ended_at IS NULL
    AND s.canceled IS NOT TRUE
  ORDER BY s.started_at DESC NULLS LAST, s.session_id
  LIMIT 1;

  IF v_from_status = 'sold_out' THEN
    IF v_session_id IS NOT NULL THEN
      RAISE EXCEPTION 'Sold-out tap lifecycle session must be ended before keg change';
    END IF;
    v_starts_new_session := true;
    v_session_id := gen_random_uuid();
  ELSIF v_session_id IS NULL THEN
    RAISE EXCEPTION 'Active tap lifecycle session not found';
  END IF;

  v_changed_at := clock_timestamp();
  v_to_status := CASE
    WHEN v_from_status = 'sold_out' THEN 'available'
    ELSE v_from_status
  END;

  IF v_to_status IS DISTINCT FROM v_from_status THEN
    PERFORM set_config('app.tap_lifecycle.suppress_trigger', 'on', true);
    UPDATE public.drinks
    SET public_status = v_to_status
    WHERE id = p_drink_id
      AND tenant_id = v_tenant_id;
    PERFORM set_config('app.tap_lifecycle.suppress_trigger', 'off', true);
  END IF;

  PERFORM public._record_tap_lifecycle_event(
    v_tenant_id,
    p_operation_id,
    1::smallint,
    'keg_change',
    p_drink_id,
    v_drink_name,
    v_session_id,
    CASE WHEN v_starts_new_session THEN NULL ELSE v_tap END,
    v_tap,
    v_from_status,
    v_to_status,
    v_changed_at,
    'exact',
    NULL,
    'record_tap_keg_change',
    auth.uid()
  );

  IF v_to_status IS DISTINCT FROM v_from_status THEN
    UPDATE public.tenants
    SET last_menu_updated_at = v_changed_at
    WHERE id = v_tenant_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'operation_id', p_operation_id,
    'drink_id', p_drink_id,
    'session_id', v_session_id,
    'tap_number', v_tap,
    'public_status', v_to_status,
    'is_public_visible', v_is_public_visible,
    'keg_changed_at', v_changed_at,
    'replayed', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_tap_keg_change(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_tap_keg_change(uuid, uuid)
  TO authenticated;

-- Do not count the start-boundary "keg change and resume" as a replacement
-- inside its newly created session. It is the first keg of that session.
CREATE OR REPLACE FUNCTION public.list_tap_lifecycle_sessions(
  p_tenant_id uuid,
  p_status text DEFAULT 'completed'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text := lower(trim(coalesce(p_status, 'completed')));
  v_data_since timestamptz;
  v_window_start timestamptz;
  v_items jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant id is required';
  END IF;
  IF v_status NOT IN ('completed', 'active') THEN
    RAISE EXCEPTION 'Invalid lifecycle session status';
  END IF;
  IF NOT public.taplist_can_view_tenant(p_tenant_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT t.tap_lifecycle_started_at
  INTO v_data_since
  FROM public.tenants t
  WHERE t.id = p_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tenant not found';
  END IF;

  v_window_start := greatest(
    coalesce(v_data_since, '-infinity'::timestamptz),
    statement_timestamp() - interval '30 days'
  );

  WITH session_rows AS (
    SELECT
      s.*,
      coalesce(
        nullif(trim(dp.brewery), ''),
        nullif(trim(dp.brand_name), ''),
        nullif(trim(p.brewery), ''),
        nullif(trim(d.brand_name), '')
      ) AS brewery_name,
      coalesce(k.keg_change_count, 0)::integer AS keg_change_count,
      CASE
        WHEN k.last_keg_changed_at IS NOT NULL THEN k.last_keg_changed_at
        WHEN s.accuracy = 'exact' THEN s.started_at
        ELSE NULL
      END AS current_keg_started_at
    FROM public.tap_lifecycle_sessions_v1 s
    LEFT JOIN public.drinks d
      ON d.tenant_id = s.tenant_id
     AND d.id = s.drink_id
    LEFT JOIN public.drink_products dp ON dp.id = d.product_id
    LEFT JOIN public.drink_beer_profiles p ON p.drink_id = d.id
    LEFT JOIN LATERAL (
      SELECT
        count(*) FILTER (
          WHERE e.action = 'keg_change'
            AND e.from_tap IS NOT NULL
            AND e.to_tap IS NOT NULL
        )::integer AS keg_change_count,
        max(e.occurred_at) FILTER (
          WHERE e.action = 'keg_change'
            AND e.from_tap IS NOT NULL
            AND e.to_tap IS NOT NULL
        ) AS last_keg_changed_at
      FROM public.tap_lifecycle_events e
      WHERE e.tenant_id = s.tenant_id
        AND e.session_id = s.session_id
    ) k ON true
    WHERE s.tenant_id = p_tenant_id
      AND s.canceled IS NOT TRUE
      AND (
        (
          v_status = 'active'
          AND s.ended_at IS NULL
          AND s.accuracy IN ('exact', 'partial_start')
        )
        OR
        (
          v_status = 'completed'
          AND s.ended_at IS NOT NULL
          AND s.ended_at >= v_window_start
          AND s.accuracy IN ('exact', 'partial_start')
        )
      )
  )
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'session_id', s.session_id,
        'drink_id', s.drink_id,
        'drink_name', s.drink_name,
        'brewery_name', s.brewery_name,
        'state', CASE WHEN s.ended_at IS NULL THEN 'active' ELSE 'completed' END,
        'accuracy', s.accuracy,
        'current_tap', s.current_tap,
        'started_at', s.started_at,
        'ended_at', s.ended_at,
        'duration_seconds', CASE
          WHEN s.accuracy <> 'exact' OR s.started_at IS NULL THEN NULL
          ELSE greatest(
            0,
            floor(extract(epoch FROM (
              coalesce(s.ended_at, statement_timestamp()) - s.started_at
            )))::bigint
          )
        END,
        'keg_change_count', s.keg_change_count,
        'current_keg_started_at', s.current_keg_started_at,
        'current_keg_duration_seconds', CASE
          WHEN s.current_keg_started_at IS NULL THEN NULL
          ELSE greatest(
            0,
            floor(extract(epoch FROM (
              coalesce(s.ended_at, statement_timestamp()) - s.current_keg_started_at
            )))::bigint
          )
        END,
        'end_reason', s.end_reason,
        'actor_name', CASE
          WHEN s.ended_at IS NULL THEN public._tap_lifecycle_actor_display_name(
            s.start_actor_user_id,
            p_tenant_id,
            s.start_actor_name
          )
          ELSE public._tap_lifecycle_actor_display_name(
            coalesce(s.end_actor_user_id, s.start_actor_user_id),
            p_tenant_id,
            coalesce(s.end_actor_name, s.start_actor_name)
          )
        END
      )
      ORDER BY
        CASE WHEN s.ended_at IS NULL THEN s.started_at ELSE s.ended_at END DESC NULLS LAST,
        s.session_id
    ),
    '[]'::jsonb
  )
  INTO v_items
  FROM session_rows s;

  RETURN jsonb_build_object(
    'ok', true,
    'data_since', v_data_since,
    'status', v_status,
    'items', v_items
  );
END;
$$;

REVOKE ALL ON FUNCTION public.list_tap_lifecycle_sessions(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_tap_lifecycle_sessions(uuid, text)
  TO authenticated;

-- Preserve the plan-aware metrics wrapper and only correct the operation
-- duration for a keg_change that is itself the start of a fresh session.
CREATE OR REPLACE FUNCTION public.get_tap_lifecycle_overview(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_operations jsonb;
  v_data_since timestamptz;
  v_window_start timestamptz;
  v_assign_count integer := 0;
  v_clear_count integer := 0;
  v_replace_count integer := 0;
  v_move_count integer := 0;
  v_keg_change_count integer := 0;
BEGIN
  v_result := public._get_tap_lifecycle_overview_without_plan_metrics(p_tenant_id);
  v_data_since := (v_result->>'data_since')::timestamptz;
  v_window_start := greatest(
    coalesce(v_data_since, '-infinity'::timestamptz),
    statement_timestamp() - interval '30 days'
  );

  SELECT coalesce(
    jsonb_agg(
      CASE
        WHEN operation->>'action' = 'keg_change'
          AND operation->'from_tap' = 'null'::jsonb
        THEN jsonb_set(operation, '{duration_seconds}', 'null'::jsonb, true)
        ELSE operation
      END
      ORDER BY ordinal
    ),
    '[]'::jsonb
  )
  INTO v_operations
  FROM jsonb_array_elements(coalesce(v_result->'operations', '[]'::jsonb))
    WITH ORDINALITY AS items(operation, ordinal)
  WHERE NOT EXISTS (
    -- Exact reconciliation adds a one-row physical end boundary next to the
    -- already-recorded status operation. Show the physical boundary (which
    -- has the duration) and suppress only its superseded status-only twin.
    SELECT 1
    FROM public.tap_lifecycle_events legacy
    JOIN public.tap_lifecycle_events boundary
      ON boundary.tenant_id = legacy.tenant_id
     AND boundary.session_id = legacy.session_id
     AND boundary.occurred_at = legacy.occurred_at
     AND boundary.action = 'sold_out'
     AND boundary.source = 'migration_sold_out_reconciliation'
     AND boundary.end_reason = 'sold_out'
     AND boundary.from_tap IS NOT NULL
     AND boundary.to_tap IS NULL
     AND boundary.operation_id <> legacy.operation_id
    WHERE legacy.tenant_id = p_tenant_id
      AND legacy.operation_id = (operation->>'operation_id')::uuid
      AND legacy.action = 'sold_out'
      AND legacy.to_status = 'sold_out'
      AND legacy.source IS DISTINCT FROM 'migration_sold_out_reconciliation'
  );

  WITH countable_events AS (
    SELECT e.*
    FROM public.tap_lifecycle_events e
    WHERE e.tenant_id = p_tenant_id
      AND e.occurred_at >= v_window_start
      AND NOT EXISTS (
        SELECT 1
        FROM public.tap_lifecycle_events boundary
        WHERE boundary.tenant_id = e.tenant_id
          AND boundary.session_id = e.session_id
          AND boundary.occurred_at = e.occurred_at
          AND boundary.action = 'sold_out'
          AND boundary.source = 'migration_sold_out_reconciliation'
          AND boundary.end_reason = 'sold_out'
          AND boundary.from_tap IS NOT NULL
          AND boundary.to_tap IS NULL
          AND boundary.operation_id <> e.operation_id
          AND e.action = 'sold_out'
          AND e.to_status = 'sold_out'
          AND e.source IS DISTINCT FROM 'migration_sold_out_reconciliation'
      )
  )
  SELECT
    count(DISTINCT e.operation_id) FILTER (
      WHERE e.session_id IS NOT NULL
        AND e.accuracy = 'exact'
        AND e.from_tap IS NULL
        AND e.to_tap IS NOT NULL
        AND e.action <> 'baseline'
        AND coalesce(s.canceled, false) IS NOT TRUE
    )::integer,
    count(DISTINCT e.operation_id) FILTER (
      WHERE e.session_id IS NOT NULL
        AND e.accuracy = 'exact'
        AND e.from_tap IS NOT NULL
        AND e.to_tap IS NULL
        AND e.action <> 'cancel'
        AND coalesce(s.canceled, false) IS NOT TRUE
    )::integer,
    count(DISTINCT e.operation_id) FILTER (
      WHERE e.session_id IS NOT NULL
        AND e.accuracy = 'exact'
        AND e.action = 'replace'
        AND e.from_tap IS NULL
        AND e.to_tap IS NOT NULL
        AND coalesce(s.canceled, false) IS NOT TRUE
    )::integer,
    count(DISTINCT e.operation_id) FILTER (
      WHERE e.session_id IS NOT NULL
        AND e.accuracy = 'exact'
        AND e.action IN ('move', 'swap')
        AND coalesce(s.canceled, false) IS NOT TRUE
    )::integer,
    count(DISTINCT e.operation_id) FILTER (
      WHERE e.session_id IS NOT NULL
        AND e.accuracy = 'exact'
        AND e.action = 'keg_change'
        AND coalesce(s.canceled, false) IS NOT TRUE
    )::integer
  INTO
    v_assign_count,
    v_clear_count,
    v_replace_count,
    v_move_count,
    v_keg_change_count
  FROM countable_events e
  LEFT JOIN public.tap_lifecycle_sessions_v1 s
    ON s.tenant_id = e.tenant_id
   AND s.session_id = e.session_id
  ;

  v_result := jsonb_set(v_result, '{operations}', v_operations, true);
  RETURN jsonb_set(
    v_result,
    '{counts}',
    jsonb_build_object(
      'assign', coalesce(v_assign_count, 0),
      'clear', coalesce(v_clear_count, 0),
      'replace', coalesce(v_replace_count, 0),
      'move', coalesce(v_move_count, 0),
      'keg_change', coalesce(v_keg_change_count, 0)
    ),
    true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_tap_lifecycle_overview(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_tap_lifecycle_overview(uuid)
  TO authenticated;

-- Reconcile sessions that the previous rules intentionally kept open while a
-- row was sold out. Use the latest proven status transition into sold_out when
-- it is the current status transition; otherwise close at migration time with
-- unclassified accuracy rather than inventing an exact historical time. Each
-- repair is its own one-row operation so normal operation-shape invariants stay
-- valid; the overview above hides only the superseded status-only twin.
WITH active_sold_out AS (
  SELECT
    s.tenant_id,
    s.session_id,
    s.drink_id,
    s.drink_name,
    coalesce(s.current_tap, d.public_sort_order) AS current_tap,
    status_event.occurred_at AS proven_occurred_at,
    status_event.actor_user_id AS proven_actor_user_id
  FROM public.tap_lifecycle_sessions_v1 s
  JOIN public.drinks d
    ON d.tenant_id = s.tenant_id
   AND d.id = s.drink_id
  LEFT JOIN LATERAL (
    SELECT
      e.occurred_at,
      e.actor_user_id,
      e.accuracy,
      e.action,
      e.to_status
    FROM public.tap_lifecycle_events e
    WHERE e.tenant_id = s.tenant_id
      AND e.session_id = s.session_id
      AND e.from_status IS DISTINCT FROM e.to_status
    ORDER BY e.occurred_at DESC, e.operation_seq DESC, e.id DESC
    LIMIT 1
  ) status_event
    ON status_event.action = 'sold_out'
   AND status_event.to_status = 'sold_out'
   AND status_event.accuracy = 'exact'
  WHERE s.ended_at IS NULL
    AND s.canceled IS NOT TRUE
    AND d.public_status = 'sold_out'
    AND coalesce(s.current_tap, d.public_sort_order) BETWEEN 1 AND 99
), reconciled AS (
  SELECT
    a.*,
    gen_random_uuid() AS operation_id,
    1::smallint AS operation_seq
  FROM active_sold_out a
)
INSERT INTO public.tap_lifecycle_events (
  tenant_id,
  operation_id,
  operation_seq,
  action,
  drink_id,
  drink_name_snapshot,
  session_id,
  from_tap,
  to_tap,
  from_status,
  to_status,
  actor_user_id,
  actor_name_snapshot,
  occurred_at,
  accuracy,
  end_reason,
  source
)
SELECT
  r.tenant_id,
  r.operation_id,
  r.operation_seq,
  'sold_out',
  r.drink_id,
  r.drink_name,
  r.session_id,
  r.current_tap,
  NULL,
  'sold_out',
  'sold_out',
  r.proven_actor_user_id,
  public._tap_lifecycle_actor_name(r.proven_actor_user_id, r.tenant_id),
  coalesce(r.proven_occurred_at, clock_timestamp()),
  CASE WHEN r.proven_occurred_at IS NULL THEN 'unclassified' ELSE 'exact' END,
  'sold_out',
  'migration_sold_out_reconciliation'
FROM reconciled r;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.tap_lifecycle_sessions_v1 s
    JOIN public.drinks d
      ON d.tenant_id = s.tenant_id
     AND d.id = s.drink_id
    WHERE s.ended_at IS NULL
      AND s.canceled IS NOT TRUE
      AND d.public_status = 'sold_out'
  ) THEN
    RAISE EXCEPTION 'Sold-out lifecycle reconciliation left an active session';
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
