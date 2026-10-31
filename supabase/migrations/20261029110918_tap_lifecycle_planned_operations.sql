-- Record planned tap placements without turning them into physical on-tap
-- sessions. A plan event is an audit fact only: it never starts a timer and
-- never contributes to operating metrics.

ALTER TABLE public.tap_lifecycle_events
  DROP CONSTRAINT IF EXISTS tap_lifecycle_events_action_check;

ALTER TABLE public.tap_lifecycle_events
  ADD CONSTRAINT tap_lifecycle_events_action_check
  CHECK (action IN (
    'assign', 'replace', 'clear', 'move', 'swap',
    'sold_out', 'reactivate', 'archive', 'baseline', 'keg_change', 'cancel',
    'plan'
  ));

ALTER TABLE public.tap_lifecycle_events
  DROP CONSTRAINT IF EXISTS tap_lifecycle_events_plan_shape_check;

ALTER TABLE public.tap_lifecycle_events
  ADD CONSTRAINT tap_lifecycle_events_plan_shape_check
  CHECK (
    (
      action = 'plan'
      AND session_id IS NULL
      AND end_reason IS NULL
      AND ((from_status = 'coming_soon' OR to_status = 'coming_soon') IS TRUE)
      AND from_tap IS DISTINCT FROM to_tap
      AND (from_tap IS NOT NULL OR to_tap IS NOT NULL)
    )
    OR
    (
      action <> 'plan'
      AND session_id IS NOT NULL
    )
  );

COMMENT ON TABLE public.tap_lifecycle_events IS
  'Append-only tap operation facts captured after tenants.tap_lifecycle_started_at. Rows with action=plan have no session and never represent witnessed on-tap time.';

-- Keep the already-verified physical lifecycle logic intact and wrap it with
-- the missing planned-position audit behavior.
ALTER FUNCTION public._record_single_tap_lifecycle_transition(
  uuid, uuid, text, integer, integer, text, text, text, text
)
  RENAME TO _record_single_tap_lifecycle_transition_without_plan;

REVOKE ALL ON FUNCTION public._record_single_tap_lifecycle_transition_without_plan(
  uuid, uuid, text, integer, integer, text, text, text, text
) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._record_single_tap_lifecycle_transition(
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
  v_active_session_id uuid;
  v_before_active boolean := false;
  v_after_active boolean := false;
  v_plan_from_tap integer;
  v_plan_to_tap integer;
BEGIN
  SELECT s.session_id
  INTO v_active_session_id
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
      OR (p_from_status = 'sold_out' AND v_active_session_id IS NOT NULL)
    );
  v_after_active := p_to_tap IS NOT NULL
    AND (
      p_to_status IN ('new', 'available', 'low')
      OR (p_to_status = 'sold_out' AND v_before_active)
    );

  -- Preserve the physical-session behavior first. This records assign/cancel
  -- boundaries when a planned state is confirmed or an active state is
  -- corrected back to planned.
  PERFORM public._record_single_tap_lifecycle_transition_without_plan(
    p_tenant_id,
    p_drink_id,
    p_drink_name,
    p_from_tap,
    p_to_tap,
    p_from_status,
    p_to_status,
    p_action_hint,
    p_source
  );

  v_plan_from_tap := CASE
    WHEN p_from_status = 'coming_soon'
      AND p_from_tap BETWEEN 1 AND 99 THEN p_from_tap
    ELSE NULL
  END;
  v_plan_to_tap := CASE
    WHEN p_to_status = 'coming_soon'
      AND p_to_tap BETWEEN 1 AND 99 THEN p_to_tap
    ELSE NULL
  END;

  IF v_plan_from_tap IS NOT DISTINCT FROM v_plan_to_tap THEN
    RETURN;
  END IF;

  -- A same-tap active -> planned correction is already represented by cancel;
  -- the reverse is already represented by assign. Do not duplicate either.
  IF p_from_status IS DISTINCT FROM 'coming_soon'
     AND p_to_status = 'coming_soon'
     AND v_before_active
     AND p_from_tap IS NOT DISTINCT FROM p_to_tap THEN
    RETURN;
  END IF;

  IF p_from_status = 'coming_soon'
     AND p_to_status IS DISTINCT FROM 'coming_soon'
     AND v_after_active
     AND p_from_tap IS NOT DISTINCT FROM p_to_tap THEN
    RETURN;
  END IF;

  PERFORM public._record_tap_lifecycle_event(
    p_tenant_id,
    gen_random_uuid(),
    1::smallint,
    'plan',
    p_drink_id,
    p_drink_name,
    NULL,
    v_plan_from_tap,
    v_plan_to_tap,
    p_from_status,
    p_to_status,
    clock_timestamp(),
    'exact',
    NULL,
    p_source,
    auth.uid()
  );
END;
$$;

REVOKE ALL ON FUNCTION public._record_single_tap_lifecycle_transition(
  uuid, uuid, text, integer, integer, text, text, text, text
) FROM PUBLIC, anon, authenticated;

-- Canonical RPCs suppress the fallback trigger and are covered by the wrapper
-- above. This second trigger only protects future direct table writes.
CREATE OR REPLACE FUNCTION public.capture_drink_tap_plan_operation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_drink_id uuid;
  v_drink_name text;
  v_from_tap integer;
  v_to_tap integer;
  v_from_status text;
  v_to_status text;
  v_active_session_id uuid;
  v_before_active boolean := false;
  v_after_active boolean := false;
  v_accuracy text;
  v_source text;
  v_at timestamptz := clock_timestamp();
BEGIN
  IF coalesce(current_setting('app.tap_lifecycle.suppress_trigger', true), '') = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_tenant_id := NEW.tenant_id;
    v_drink_id := NEW.id;
    v_from_tap := NULL;
    v_to_tap := CASE
      WHEN NEW.enabled IS TRUE AND NEW.public_status = 'coming_soon'
        AND NEW.public_sort_order BETWEEN 1 AND 99
        THEN NEW.public_sort_order
      ELSE NULL
    END;
    v_from_status := NEW.public_status;
    v_to_status := NEW.public_status;
  ELSIF TG_OP = 'DELETE' THEN
    v_tenant_id := OLD.tenant_id;
    v_drink_id := OLD.id;
    v_from_tap := CASE
      WHEN OLD.enabled IS TRUE AND OLD.public_status = 'coming_soon'
        AND OLD.public_sort_order BETWEEN 1 AND 99
        THEN OLD.public_sort_order
      ELSE NULL
    END;
    v_to_tap := NULL;
    v_from_status := OLD.public_status;
    v_to_status := OLD.public_status;
  ELSE
    v_tenant_id := NEW.tenant_id;
    v_drink_id := NEW.id;
    v_from_tap := CASE
      WHEN OLD.enabled IS TRUE AND OLD.public_status = 'coming_soon'
        AND OLD.public_sort_order BETWEEN 1 AND 99
        THEN OLD.public_sort_order
      ELSE NULL
    END;
    v_to_tap := CASE
      WHEN NEW.enabled IS TRUE AND NEW.public_status = 'coming_soon'
        AND NEW.public_sort_order BETWEEN 1 AND 99
        THEN NEW.public_sort_order
      ELSE NULL
    END;
    v_from_status := OLD.public_status;
    v_to_status := NEW.public_status;
  END IF;

  IF v_from_tap IS NOT DISTINCT FROM v_to_tap THEN
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

  SELECT s.session_id
  INTO v_active_session_id
  FROM public.tap_lifecycle_sessions_v1 s
  WHERE s.tenant_id = v_tenant_id
    AND s.drink_id = v_drink_id
    AND s.ended_at IS NULL
    AND s.canceled IS NOT TRUE
  ORDER BY s.started_at DESC NULLS LAST, s.session_id
  LIMIT 1;

  IF TG_OP <> 'INSERT' THEN
    v_before_active := OLD.enabled IS TRUE
      AND OLD.public_sort_order IS NOT NULL
      AND (
        OLD.public_status IN ('new', 'available', 'low')
        OR (OLD.public_status = 'sold_out' AND v_active_session_id IS NOT NULL)
      );
  END IF;

  IF TG_OP <> 'DELETE' THEN
    v_after_active := NEW.enabled IS TRUE
      AND NEW.public_sort_order IS NOT NULL
      AND (
        NEW.public_status IN ('new', 'available', 'low')
        OR (NEW.public_status = 'sold_out' AND v_before_active)
      );
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.public_status IS DISTINCT FROM 'coming_soon'
     AND NEW.public_status = 'coming_soon'
     AND v_before_active
     AND OLD.public_sort_order IS NOT DISTINCT FROM NEW.public_sort_order THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.public_status = 'coming_soon'
     AND NEW.public_status IS DISTINCT FROM 'coming_soon'
     AND v_after_active
     AND OLD.public_sort_order IS NOT DISTINCT FROM NEW.public_sort_order THEN
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
  v_drink_name := CASE
    WHEN TG_OP = 'DELETE' THEN coalesce(
      nullif(trim(OLD.display_name), ''),
      nullif(trim(OLD.name), ''),
      '未命名酒款'
    )
    ELSE coalesce(
      public._tap_lifecycle_drink_name(NEW.id),
      nullif(trim(NEW.name), ''),
      '未命名酒款'
    )
  END;

  PERFORM public._record_tap_lifecycle_event(
    v_tenant_id,
    gen_random_uuid(),
    1::smallint,
    'plan',
    v_drink_id,
    v_drink_name,
    NULL,
    v_from_tap,
    v_to_tap,
    v_from_status,
    v_to_status,
    v_at,
    v_accuracy,
    NULL,
    v_source,
    auth.uid()
  );

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.capture_drink_tap_plan_operation()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS drinks_zy_capture_tap_plan ON public.drinks;
CREATE TRIGGER drinks_zy_capture_tap_plan
  AFTER INSERT OR UPDATE OF enabled, public_sort_order, public_status, is_public_visible OR DELETE
  ON public.drinks
  FOR EACH ROW
  EXECUTE FUNCTION public.capture_drink_tap_plan_operation();

-- The existing overview already shapes every ledger action, including plan.
-- Wrap only its metrics so sessionless plan boundaries can never count as a
-- physical assign or clear.
ALTER FUNCTION public.get_tap_lifecycle_overview(uuid)
  RENAME TO _get_tap_lifecycle_overview_without_plan_metrics;

REVOKE ALL ON FUNCTION public._get_tap_lifecycle_overview_without_plan_metrics(uuid)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_tap_lifecycle_overview(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
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
  FROM public.tap_lifecycle_events e
  LEFT JOIN public.tap_lifecycle_sessions_v1 s
    ON s.tenant_id = e.tenant_id
   AND s.session_id = e.session_id
  WHERE e.tenant_id = p_tenant_id
    AND e.occurred_at >= v_window_start;

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
