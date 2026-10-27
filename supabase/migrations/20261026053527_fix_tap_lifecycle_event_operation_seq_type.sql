-- PostgreSQL resolves the integer literals 1 and 2 as integer, while the
-- lifecycle event writer requires smallint for operation_seq. Cast the four
-- canonical call sites explicitly so function lookup succeeds.
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
DECLARE
  v_operation_id uuid := gen_random_uuid();
  v_at timestamptz := clock_timestamp();
  v_accuracy text := 'exact';
  v_primary_session uuid;
  v_other_session uuid;
  v_end_reason text;
BEGIN
  IF p_action NOT IN (
    'assign', 'replace', 'clear', 'move', 'swap',
    'sold_out', 'reactivate', 'archive'
  ) THEN
    RAISE EXCEPTION 'Unsupported tap lifecycle action: %', p_action;
  END IF;

  IF p_action = 'assign' THEN
    v_primary_session := gen_random_uuid();
  ELSIF p_action = 'replace' THEN
    SELECT s.session_id
    INTO v_other_session
    FROM public.tap_lifecycle_sessions_v1 s
    WHERE s.tenant_id = p_tenant_id
      AND s.drink_id = p_other_drink_id
      AND s.ended_at IS NULL
    ORDER BY s.started_at DESC NULLS LAST, s.session_id
    LIMIT 1;

    v_primary_session := gen_random_uuid();
    IF v_other_session IS NULL THEN
      v_other_session := gen_random_uuid();
      v_accuracy := 'unclassified';
    END IF;
  ELSE
    SELECT s.session_id
    INTO v_primary_session
    FROM public.tap_lifecycle_sessions_v1 s
    WHERE s.tenant_id = p_tenant_id
      AND s.drink_id = p_drink_id
      AND s.ended_at IS NULL
    ORDER BY s.started_at DESC NULLS LAST, s.session_id
    LIMIT 1;

    IF v_primary_session IS NULL THEN
      v_primary_session := gen_random_uuid();
      v_accuracy := 'unclassified';
    END IF;

    IF p_action = 'swap' THEN
      SELECT s.session_id
      INTO v_other_session
      FROM public.tap_lifecycle_sessions_v1 s
      WHERE s.tenant_id = p_tenant_id
        AND s.drink_id = p_other_drink_id
        AND s.ended_at IS NULL
      ORDER BY s.started_at DESC NULLS LAST, s.session_id
      LIMIT 1;

      IF v_other_session IS NULL THEN
        v_other_session := gen_random_uuid();
        v_accuracy := 'unclassified';
      END IF;
    END IF;
  END IF;

  v_end_reason := CASE p_action
    WHEN 'replace' THEN 'replace'
    WHEN 'clear' THEN 'clear'
    WHEN 'archive' THEN 'archive'
    ELSE NULL
  END;

  IF p_action = 'replace' THEN
    PERFORM public._record_tap_lifecycle_event(
      p_tenant_id,
      v_operation_id,
      1::smallint,
      p_action,
      p_other_drink_id,
      p_other_drink_name,
      v_other_session,
      p_other_from_tap,
      p_other_to_tap,
      p_other_from_status,
      p_other_to_status,
      v_at,
      v_accuracy,
      v_end_reason,
      p_source,
      auth.uid()
    );

    PERFORM public._record_tap_lifecycle_event(
      p_tenant_id,
      v_operation_id,
      2::smallint,
      p_action,
      p_drink_id,
      p_drink_name,
      v_primary_session,
      p_from_tap,
      p_to_tap,
      p_from_status,
      p_to_status,
      v_at,
      v_accuracy,
      NULL,
      p_source,
      auth.uid()
    );
    RETURN;
  END IF;

  PERFORM public._record_tap_lifecycle_event(
    p_tenant_id,
    v_operation_id,
    1::smallint,
    p_action,
    p_drink_id,
    p_drink_name,
    v_primary_session,
    p_from_tap,
    p_to_tap,
    p_from_status,
    p_to_status,
    v_at,
    v_accuracy,
    v_end_reason,
    p_source,
    auth.uid()
  );

  IF p_action = 'swap' THEN
    PERFORM public._record_tap_lifecycle_event(
      p_tenant_id,
      v_operation_id,
      2::smallint,
      p_action,
      p_other_drink_id,
      p_other_drink_name,
      v_other_session,
      p_other_from_tap,
      p_other_to_tap,
      p_other_from_status,
      p_other_to_status,
      v_at,
      v_accuracy,
      NULL,
      p_source,
      auth.uid()
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public._record_canonical_tap_operation(
  uuid, text, uuid, text, integer, integer, text, text,
  uuid, text, integer, integer, text, text, text
) FROM PUBLIC, anon, authenticated;
