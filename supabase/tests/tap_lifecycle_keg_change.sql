-- Tap lifecycle keg-change SQL tests (run locally after migrations as DB superuser).
-- Usage: psql "$DATABASE_URL" -f supabase/tests/tap_lifecycle_keg_change.sql

BEGIN;

DO $$
DECLARE
  v_tenant_id uuid;
  v_user_id uuid;
  v_taps integer[];
  v_tap_limit integer;
  v_max_used_tap integer;
  v_exact_drink_id uuid;
  v_partial_drink_id uuid;
  v_orphan_drink_id uuid;
  v_replacement_drink_id uuid;
  v_exact_session_id uuid;
  v_resumed_session_id uuid;
  v_partial_session_id uuid := gen_random_uuid();
  v_idempotency_operation_id uuid := gen_random_uuid();
  v_session_after uuid;
  v_operation_id uuid;
  v_event_at timestamptz;
  v_last_keg_at timestamptz;
  v_ended_event_at timestamptz;
  v_last_menu_updated_at timestamptz;
  v_from_tap integer;
  v_to_tap integer;
  v_from_status text;
  v_to_status text;
  v_accuracy text;
  v_end_reason text;
  v_status text;
  v_visible boolean;
  v_result jsonb;
  v_replayed_result jsonb;
  v_overview jsonb;
  v_sessions jsonb;
  v_item jsonb;
  v_operation jsonb;
  v_before_keg_count integer;
  v_after_keg_count integer;
  v_before_assign_count integer;
  v_after_assign_count integer;
  v_before_resume_keg_count integer;
  v_after_resume_keg_count integer;
  v_before_event_count integer;
  v_after_event_count integer;
BEGIN
  SELECT ur.tenant_id, ur.user_id
  INTO v_tenant_id, v_user_id
  FROM public.user_roles ur
  JOIN public.tenants t ON t.id = ur.tenant_id
  WHERE ur.tenant_id IS NOT NULL
    AND ur.role IN ('owner', 'staff')
    AND t.tap_lifecycle_started_at IS NOT NULL
  ORDER BY ur.created_at
  LIMIT 1;

  IF v_tenant_id IS NULL OR v_user_id IS NULL THEN
    RAISE EXCEPTION 'No tenant member available for tap lifecycle tests';
  END IF;

  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_user_id, 'role', 'authenticated')::text,
    true
  );
  PERFORM set_config('request.jwt.claim.sub', v_user_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  SELECT
    least(99, greatest(1, coalesce(t.tap_slot_count, 99))),
    coalesce(max(d.public_sort_order) FILTER (
      WHERE d.enabled = true AND d.public_sort_order BETWEEN 1 AND 99
    ), 0)
  INTO v_tap_limit, v_max_used_tap
  FROM public.tenants t
  LEFT JOIN public.drinks d ON d.tenant_id = t.id
  WHERE t.id = v_tenant_id
  GROUP BY t.tap_slot_count;

  SELECT array_agg(candidate.tap_number ORDER BY candidate.tap_number)
  INTO v_taps
  FROM (
    SELECT tap_number
    FROM generate_series(1, v_tap_limit) AS tap_number
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.drinks d
      WHERE d.tenant_id = v_tenant_id
        AND d.enabled = true
        AND d.public_sort_order = tap_number
    )
    ORDER BY tap_number DESC
    LIMIT 3
  ) candidate;

  IF coalesce(array_length(v_taps, 1), 0) < 3
     AND greatest(v_tap_limit, v_max_used_tap) <= 96 THEN
    v_tap_limit := greatest(v_tap_limit, v_max_used_tap) + 3;

    UPDATE public.tenants
    SET tap_slot_count = v_tap_limit
    WHERE id = v_tenant_id;

    SELECT array_agg(candidate.tap_number ORDER BY candidate.tap_number)
    INTO v_taps
    FROM (
      SELECT tap_number
      FROM generate_series(1, v_tap_limit) AS tap_number
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.drinks d
        WHERE d.tenant_id = v_tenant_id
          AND d.enabled = true
          AND d.public_sort_order = tap_number
      )
      ORDER BY tap_number DESC
      LIMIT 3
    ) candidate;
  END IF;

  IF coalesce(array_length(v_taps, 1), 0) < 3 THEN
    RAISE EXCEPTION 'Three free tap numbers are required for tap lifecycle tests';
  END IF;

  -- Exact session: ordinary keg change keeps status, visibility, tap and session.
  INSERT INTO public.drinks (
    tenant_id,
    name,
    price,
    price_unit,
    sort_order,
    enabled,
    is_public_visible,
    public_status,
    public_sort_order
  ) VALUES (
    v_tenant_id,
    '__test_keg_change_exact__',
    0,
    '杯',
    900001,
    true,
    false,
    'available',
    NULL
  )
  RETURNING id INTO v_exact_drink_id;

  PERFORM public.assign_drink_tap_number(v_exact_drink_id, v_taps[1]);
  PERFORM public.set_drink_taplist_status(v_exact_drink_id, true, 'available');

  SELECT s.session_id
  INTO v_exact_session_id
  FROM public.tap_lifecycle_sessions_v1 s
  WHERE s.tenant_id = v_tenant_id
    AND s.drink_id = v_exact_drink_id
    AND s.ended_at IS NULL;

  IF v_exact_session_id IS NULL THEN
    RAISE EXCEPTION 'Exact assignment did not create an active lifecycle session';
  END IF;

  SELECT public.get_tap_lifecycle_overview(v_tenant_id)
  INTO v_overview;
  v_before_keg_count := coalesce((v_overview->'counts'->>'keg_change')::integer, 0);

  SELECT public.record_tap_keg_change(
    v_exact_drink_id,
    v_idempotency_operation_id
  )
  INTO v_result;

  SELECT public.record_tap_keg_change(
    v_exact_drink_id,
    v_idempotency_operation_id
  )
  INTO v_replayed_result;

  SELECT count(*)::integer
  INTO v_after_event_count
  FROM public.tap_lifecycle_events e
  WHERE e.tenant_id = v_tenant_id
    AND e.operation_id = v_idempotency_operation_id;

  IF v_after_event_count <> 1
     OR (v_result->>'operation_id')::uuid IS DISTINCT FROM v_idempotency_operation_id
     OR coalesce((v_result->>'replayed')::boolean, false) IS NOT FALSE
     OR coalesce((v_replayed_result->>'replayed')::boolean, false) IS NOT TRUE
     OR v_replayed_result->>'session_id' IS DISTINCT FROM v_result->>'session_id'
     OR v_replayed_result->>'tap_number' IS DISTINCT FROM v_result->>'tap_number'
     OR v_replayed_result->>'public_status' IS DISTINCT FROM v_result->>'public_status'
     OR v_replayed_result->>'keg_changed_at' IS DISTINCT FROM v_result->>'keg_changed_at' THEN
    RAISE EXCEPTION 'Keg-change operation id replay was not idempotent: first %, replay %',
      v_result,
      v_replayed_result;
  END IF;

  IF coalesce((v_result->>'ok')::boolean, false) IS NOT TRUE
     OR (v_result->>'tap_number')::integer <> v_taps[1]
     OR (v_result->>'public_status') IS DISTINCT FROM 'available' THEN
    RAISE EXCEPTION 'Available keg-change response is incorrect: %', v_result;
  END IF;

  SELECT
    e.operation_id,
    e.occurred_at,
    e.from_tap,
    e.to_tap,
    e.from_status,
    e.to_status,
    e.accuracy,
    e.end_reason
  INTO
    v_operation_id,
    v_event_at,
    v_from_tap,
    v_to_tap,
    v_from_status,
    v_to_status,
    v_accuracy,
    v_end_reason
  FROM public.tap_lifecycle_events e
  WHERE e.tenant_id = v_tenant_id
    AND e.drink_id = v_exact_drink_id
    AND e.action = 'keg_change'
  ORDER BY e.occurred_at DESC, e.id DESC
  LIMIT 1;

  SELECT d.public_status, d.is_public_visible
  INTO v_status, v_visible
  FROM public.drinks d
  WHERE d.id = v_exact_drink_id;

  SELECT s.session_id
  INTO v_session_after
  FROM public.tap_lifecycle_sessions_v1 s
  WHERE s.tenant_id = v_tenant_id
    AND s.drink_id = v_exact_drink_id
    AND s.ended_at IS NULL;

  IF v_session_after IS DISTINCT FROM v_exact_session_id
     OR v_from_tap IS DISTINCT FROM v_taps[1]
     OR v_to_tap IS DISTINCT FROM v_taps[1]
     OR v_from_status IS DISTINCT FROM 'available'
     OR v_to_status IS DISTINCT FROM 'available'
     OR v_accuracy IS DISTINCT FROM 'exact'
     OR v_end_reason IS NOT NULL
     OR v_status IS DISTINCT FROM 'available'
     OR v_visible IS NOT TRUE THEN
    RAISE EXCEPTION 'Available keg change changed tap-session or public state';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tap_lifecycle_events e
    WHERE e.tenant_id = v_tenant_id
      AND e.operation_id = v_idempotency_operation_id
      AND e.operation_seq = 1::smallint
      AND e.action = 'keg_change'
      AND e.drink_id = v_exact_drink_id
      AND e.session_id = v_exact_session_id
      AND e.from_tap = v_taps[1]
      AND e.to_tap = v_taps[1]
      AND e.from_status = 'available'
      AND e.to_status = 'available'
      AND e.actor_user_id = v_user_id
      AND e.occurred_at = (v_result->>'keg_changed_at')::timestamptz
      AND e.accuracy = 'exact'
      AND e.end_reason IS NULL
      AND e.source = 'record_tap_keg_change'
  ) THEN
    RAISE EXCEPTION 'Keg-change event fields are incomplete or inconsistent';
  END IF;

  SELECT public.get_tap_lifecycle_overview(v_tenant_id)
  INTO v_overview;

  SELECT operation
  INTO v_operation
  FROM jsonb_array_elements(v_overview->'operations') AS operation
  WHERE operation->>'operation_id' = v_operation_id::text;

  IF v_operation IS NULL
     OR v_operation->>'action' IS DISTINCT FROM 'keg_change'
     OR v_operation->'duration_seconds' = 'null'::jsonb THEN
    RAISE EXCEPTION 'Exact first keg change must expose previous-keg duration: %', v_operation;
  END IF;

  SELECT public.list_tap_lifecycle_sessions(v_tenant_id, 'active')
  INTO v_sessions;

  SELECT item
  INTO v_item
  FROM jsonb_array_elements(v_sessions->'items') AS item
  WHERE item->>'session_id' = v_exact_session_id::text;

  IF v_item IS NULL
     OR (v_item->>'keg_change_count')::integer <> 1
     OR (v_item->>'current_keg_started_at')::timestamptz IS DISTINCT FROM v_event_at
     OR v_item->'current_keg_duration_seconds' = 'null'::jsonb THEN
    RAISE EXCEPTION 'Exact active session keg fields are incorrect: %', v_item;
  END IF;

  -- sold_out is a hard lifecycle boundary. "Change keg and resume" starts a
  -- fresh exact session while preserving the sold-out drink's tap assignment.
  PERFORM public.set_drink_taplist_status(v_exact_drink_id, true, 'sold_out');

  SELECT max(e.occurred_at)
  INTO v_ended_event_at
  FROM public.tap_lifecycle_events e
  WHERE e.tenant_id = v_tenant_id
    AND e.session_id = v_exact_session_id
    AND e.action = 'sold_out'
    AND e.end_reason = 'sold_out'
    AND e.from_tap = v_taps[1]
    AND e.to_tap IS NULL;

  SELECT public.list_tap_lifecycle_sessions(v_tenant_id, 'completed')
  INTO v_sessions;

  SELECT item
  INTO v_item
  FROM jsonb_array_elements(v_sessions->'items') AS item
  WHERE item->>'session_id' = v_exact_session_id::text;

  IF v_ended_event_at IS NULL
     OR v_item IS NULL
     OR v_item->>'end_reason' IS DISTINCT FROM 'sold_out'
     OR (v_item->>'ended_at')::timestamptz IS DISTINCT FROM v_ended_event_at
     OR (v_item->>'keg_change_count')::integer <> 1
     OR v_item->'duration_seconds' = 'null'::jsonb
     OR EXISTS (
       SELECT 1
       FROM public.tap_lifecycle_sessions_v1 s
       WHERE s.tenant_id = v_tenant_id
         AND s.drink_id = v_exact_drink_id
         AND s.ended_at IS NULL
         AND s.canceled IS NOT TRUE
     ) THEN
    RAISE EXCEPTION 'Sold-out status did not close the original exact session: %', v_item;
  END IF;

  SELECT public.get_tap_lifecycle_overview(v_tenant_id)
  INTO v_overview;
  v_before_assign_count := coalesce((v_overview->'counts'->>'assign')::integer, 0);
  v_before_resume_keg_count := coalesce((v_overview->'counts'->>'keg_change')::integer, 0);

  SELECT public.record_tap_keg_change(v_exact_drink_id, gen_random_uuid())
  INTO v_result;

  SELECT t.last_menu_updated_at
  INTO v_last_menu_updated_at
  FROM public.tenants t
  WHERE t.id = v_tenant_id;

  SELECT d.public_status, d.is_public_visible
  INTO v_status, v_visible
  FROM public.drinks d
  WHERE d.id = v_exact_drink_id;

  SELECT s.session_id
  INTO v_resumed_session_id
  FROM public.tap_lifecycle_sessions_v1 s
  WHERE s.tenant_id = v_tenant_id
    AND s.drink_id = v_exact_drink_id
    AND s.ended_at IS NULL
    AND s.canceled IS NOT TRUE;

  SELECT e.from_tap, e.to_tap, e.from_status, e.to_status, e.occurred_at
  INTO v_from_tap, v_to_tap, v_from_status, v_to_status, v_event_at
  FROM public.tap_lifecycle_events e
  WHERE e.tenant_id = v_tenant_id
    AND e.drink_id = v_exact_drink_id
    AND e.action = 'keg_change'
  ORDER BY e.occurred_at DESC, e.id DESC
  LIMIT 1;

  IF v_resumed_session_id IS NULL
     OR v_resumed_session_id = v_exact_session_id
     OR v_resumed_session_id IS DISTINCT FROM (v_result->>'session_id')::uuid
     OR v_status IS DISTINCT FROM 'available'
     OR v_visible IS NOT TRUE
     OR v_from_tap IS NOT NULL
     OR v_to_tap IS DISTINCT FROM v_taps[1]
     OR v_from_status IS DISTINCT FROM 'sold_out'
     OR v_to_status IS DISTINCT FROM 'available'
     OR v_last_menu_updated_at IS DISTINCT FROM
       (v_result->>'keg_changed_at')::timestamptz THEN
    RAISE EXCEPTION 'Sold-out keg change must start a fresh available session: %', v_result;
  END IF;

  SELECT public.get_tap_lifecycle_overview(v_tenant_id)
  INTO v_overview;
  v_after_assign_count := coalesce((v_overview->'counts'->>'assign')::integer, 0);
  v_after_resume_keg_count := coalesce((v_overview->'counts'->>'keg_change')::integer, 0);

  SELECT operation
  INTO v_operation
  FROM jsonb_array_elements(v_overview->'operations') AS operation
  WHERE operation->>'operation_id' = v_result->>'operation_id';

  SELECT public.list_tap_lifecycle_sessions(v_tenant_id, 'active')
  INTO v_sessions;

  SELECT item
  INTO v_item
  FROM jsonb_array_elements(v_sessions->'items') AS item
  WHERE item->>'session_id' = v_resumed_session_id::text;

  IF v_operation IS NULL
     OR v_operation->>'action' IS DISTINCT FROM 'keg_change'
     OR v_operation->'duration_seconds' <> 'null'::jsonb
     OR v_after_assign_count IS DISTINCT FROM v_before_assign_count + 1
     OR v_after_resume_keg_count IS DISTINCT FROM v_before_resume_keg_count + 1
     OR v_item IS NULL
     OR (v_item->>'keg_change_count')::integer <> 0
     OR (v_item->>'current_keg_started_at')::timestamptz IS DISTINCT FROM v_event_at
     OR v_item->'current_keg_duration_seconds' = 'null'::jsonb THEN
    RAISE EXCEPTION 'Fresh keg-resume session analytics are incorrect: operation %, session %',
      v_operation,
      v_item;
  END IF;

  -- A hidden on-tap drink stays hidden and keeps its current status.
  PERFORM public.set_drink_taplist_status(v_exact_drink_id, false, 'available');
  SELECT public.record_tap_keg_change(v_exact_drink_id, gen_random_uuid())
  INTO v_result;

  SELECT d.public_status, d.is_public_visible
  INTO v_status, v_visible
  FROM public.drinks d
  WHERE d.id = v_exact_drink_id;

  SELECT s.session_id
  INTO v_session_after
  FROM public.tap_lifecycle_sessions_v1 s
  WHERE s.tenant_id = v_tenant_id
    AND s.drink_id = v_exact_drink_id
    AND s.ended_at IS NULL;

  IF v_session_after IS DISTINCT FROM v_resumed_session_id
     OR v_status IS DISTINCT FROM 'available'
     OR v_visible IS NOT FALSE THEN
    RAISE EXCEPTION 'Hidden keg change must preserve visibility, status and session';
  END IF;

  -- Partial baseline: never invent an original keg start. The first witnessed
  -- keg change establishes an exact current-keg start; the second establishes
  -- a measurable completed-keg duration.
  PERFORM set_config('app.tap_lifecycle.suppress_trigger', 'on', true);
  INSERT INTO public.drinks (
    tenant_id,
    name,
    price,
    price_unit,
    sort_order,
    enabled,
    is_public_visible,
    public_status,
    public_sort_order
  ) VALUES (
    v_tenant_id,
    '__test_keg_change_partial__',
    0,
    '杯',
    900002,
    true,
    false,
    'available',
    v_taps[2]
  )
  RETURNING id INTO v_partial_drink_id;
  PERFORM set_config('app.tap_lifecycle.suppress_trigger', 'off', true);

  PERFORM public._record_tap_lifecycle_event(
    v_tenant_id,
    gen_random_uuid(),
    1::smallint,
    'baseline',
    v_partial_drink_id,
    '__test_keg_change_partial__',
    v_partial_session_id,
    NULL,
    v_taps[2],
    'available',
    'available',
    clock_timestamp() - interval '5 minutes',
    'partial_start',
    NULL,
    'tap_lifecycle_keg_change_test',
    v_user_id
  );

  SELECT public.list_tap_lifecycle_sessions(v_tenant_id, 'active')
  INTO v_sessions;

  SELECT item
  INTO v_item
  FROM jsonb_array_elements(v_sessions->'items') AS item
  WHERE item->>'session_id' = v_partial_session_id::text;

  IF v_item IS NULL
     OR (v_item->>'keg_change_count')::integer <> 0
     OR v_item->'current_keg_started_at' <> 'null'::jsonb
     OR v_item->'current_keg_duration_seconds' <> 'null'::jsonb THEN
    RAISE EXCEPTION 'Partial baseline must not invent a current-keg start: %', v_item;
  END IF;

  SELECT public.record_tap_keg_change(v_partial_drink_id, gen_random_uuid())
  INTO v_result;
  v_operation_id := NULL;

  SELECT e.operation_id
  INTO v_operation_id
  FROM public.tap_lifecycle_events e
  WHERE e.tenant_id = v_tenant_id
    AND e.drink_id = v_partial_drink_id
    AND e.action = 'keg_change'
  ORDER BY e.occurred_at DESC, e.id DESC
  LIMIT 1;

  SELECT public.get_tap_lifecycle_overview(v_tenant_id)
  INTO v_overview;

  SELECT operation
  INTO v_operation
  FROM jsonb_array_elements(v_overview->'operations') AS operation
  WHERE operation->>'operation_id' = v_operation_id::text;

  IF v_operation IS NULL OR v_operation->'duration_seconds' <> 'null'::jsonb THEN
    RAISE EXCEPTION 'First partial-session keg change duration must be unknown: %', v_operation;
  END IF;

  SELECT public.list_tap_lifecycle_sessions(v_tenant_id, 'active')
  INTO v_sessions;

  SELECT item
  INTO v_item
  FROM jsonb_array_elements(v_sessions->'items') AS item
  WHERE item->>'session_id' = v_partial_session_id::text;

  IF v_item IS NULL
     OR (v_item->>'keg_change_count')::integer <> 1
     OR v_item->'current_keg_started_at' = 'null'::jsonb
     OR v_item->'current_keg_duration_seconds' = 'null'::jsonb THEN
    RAISE EXCEPTION 'First partial-session keg change must start exact current-keg timing: %', v_item;
  END IF;

  SELECT public.record_tap_keg_change(v_partial_drink_id, gen_random_uuid())
  INTO v_result;
  v_operation_id := NULL;

  SELECT e.operation_id
  INTO v_operation_id
  FROM public.tap_lifecycle_events e
  WHERE e.tenant_id = v_tenant_id
    AND e.drink_id = v_partial_drink_id
    AND e.action = 'keg_change'
  ORDER BY e.occurred_at DESC, e.id DESC
  LIMIT 1;

  SELECT public.get_tap_lifecycle_overview(v_tenant_id)
  INTO v_overview;

  SELECT operation
  INTO v_operation
  FROM jsonb_array_elements(v_overview->'operations') AS operation
  WHERE operation->>'operation_id' = v_operation_id::text;

  IF v_operation IS NULL OR v_operation->'duration_seconds' = 'null'::jsonb THEN
    RAISE EXCEPTION 'Second partial-session keg change must expose measured duration: %', v_operation;
  END IF;

  -- On-tap state without a lifecycle session is rejected rather than silently
  -- fabricating a new session boundary.
  PERFORM set_config('app.tap_lifecycle.suppress_trigger', 'on', true);
  INSERT INTO public.drinks (
    tenant_id,
    name,
    price,
    price_unit,
    sort_order,
    enabled,
    is_public_visible,
    public_status,
    public_sort_order
  ) VALUES (
    v_tenant_id,
    '__test_keg_change_no_session__',
    0,
    '杯',
    900003,
    true,
    false,
    'available',
    v_taps[3]
  )
  RETURNING id INTO v_orphan_drink_id;
  PERFORM set_config('app.tap_lifecycle.suppress_trigger', 'off', true);

  BEGIN
    PERFORM public.record_tap_keg_change(v_orphan_drink_id, gen_random_uuid());
    RAISE EXCEPTION 'Expected missing active session to be rejected';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%Active tap lifecycle session not found%' THEN
        RAISE;
      END IF;
  END;

  BEGIN
    PERFORM public.record_tap_keg_change(
      v_orphan_drink_id,
      v_idempotency_operation_id
    );
    RAISE EXCEPTION 'Expected reused operation id to be rejected';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%Operation id conflict%' THEN
        RAISE;
      END IF;
  END;

  -- Replacing an on-tap row whose historical session is missing only marks
  -- the outgoing synthetic session unclassified. The newly observed incoming
  -- assignment remains exact and therefore appears in the active session UI.
  INSERT INTO public.drinks (
    tenant_id,
    name,
    price,
    price_unit,
    sort_order,
    enabled,
    is_public_visible,
    public_status,
    public_sort_order
  ) VALUES (
    v_tenant_id,
    '__test_replace_incoming_exact__',
    0,
    '杯',
    900004,
    true,
    false,
    'available',
    NULL
  )
  RETURNING id INTO v_replacement_drink_id;

  PERFORM public.assign_drink_tap_number(v_replacement_drink_id, v_taps[3]);

  SELECT e.operation_id
  INTO v_operation_id
  FROM public.tap_lifecycle_events e
  WHERE e.tenant_id = v_tenant_id
    AND e.action = 'replace'
    AND e.drink_id = v_replacement_drink_id
  ORDER BY e.occurred_at DESC, e.operation_seq DESC, e.id DESC
  LIMIT 1;

  IF v_operation_id IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM public.tap_lifecycle_events e
       WHERE e.tenant_id = v_tenant_id
         AND e.operation_id = v_operation_id
         AND e.drink_id = v_orphan_drink_id
         AND e.accuracy = 'unclassified'
         AND e.from_tap = v_taps[3]
         AND e.to_tap IS NULL
     )
     OR NOT EXISTS (
       SELECT 1
       FROM public.tap_lifecycle_events e
       WHERE e.tenant_id = v_tenant_id
         AND e.operation_id = v_operation_id
         AND e.drink_id = v_replacement_drink_id
         AND e.accuracy = 'exact'
         AND e.from_tap IS NULL
         AND e.to_tap = v_taps[3]
     ) THEN
    RAISE EXCEPTION 'Replace accuracy must be isolated per outgoing/incoming side';
  END IF;

  SELECT s.session_id, s.accuracy
  INTO v_session_after, v_accuracy
  FROM public.tap_lifecycle_sessions_v1 s
  WHERE s.tenant_id = v_tenant_id
    AND s.drink_id = v_replacement_drink_id
    AND s.ended_at IS NULL;

  SELECT public.list_tap_lifecycle_sessions(v_tenant_id, 'active')
  INTO v_sessions;

  SELECT item
  INTO v_item
  FROM jsonb_array_elements(v_sessions->'items') AS item
  WHERE item->>'session_id' = v_session_after::text;

  IF v_session_after IS NULL
     OR v_accuracy IS DISTINCT FROM 'exact'
     OR v_item IS NULL THEN
    RAISE EXCEPTION 'Exact incoming replacement session must remain visible';
  END IF;

  -- An authenticated non-member cannot record a keg change.
  SELECT count(*)::integer
  INTO v_before_event_count
  FROM public.tap_lifecycle_events e
  WHERE e.tenant_id = v_tenant_id
    AND e.drink_id = v_exact_drink_id
    AND e.action = 'keg_change';

  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', 'ffffffff-ffff-ffff-ffff-ffffffffffff',
      'role', 'authenticated'
    )::text,
    true
  );
  PERFORM set_config(
    'request.jwt.claim.sub',
    'ffffffff-ffff-ffff-ffff-ffffffffffff',
    true
  );

  BEGIN
    PERFORM public.record_tap_keg_change(v_exact_drink_id, gen_random_uuid());
    RAISE EXCEPTION 'Expected non-member keg change to be rejected';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%Forbidden%' THEN
        RAISE;
      END IF;
  END;

  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_user_id, 'role', 'authenticated')::text,
    true
  );
  PERFORM set_config('request.jwt.claim.sub', v_user_id::text, true);

  SELECT count(*)::integer
  INTO v_after_event_count
  FROM public.tap_lifecycle_events e
  WHERE e.tenant_id = v_tenant_id
    AND e.drink_id = v_exact_drink_id
    AND e.action = 'keg_change';

  IF v_after_event_count IS DISTINCT FROM v_before_event_count THEN
    RAISE EXCEPTION 'Rejected non-member call wrote a keg-change event';
  END IF;

  -- Completing the resumed session preserves its full duration and the final
  -- keg's independently measured duration. Its start-boundary keg change is
  -- the first keg, not a change inside the new session.
  PERFORM public.remove_drink_from_tonight(v_exact_drink_id);

  SELECT max(e.occurred_at)
  INTO v_last_keg_at
  FROM public.tap_lifecycle_events e
  WHERE e.tenant_id = v_tenant_id
    AND e.session_id = v_resumed_session_id
    AND e.action = 'keg_change'
    AND e.from_tap IS NOT NULL
    AND e.to_tap IS NOT NULL;

  SELECT max(e.occurred_at)
  INTO v_ended_event_at
  FROM public.tap_lifecycle_events e
  WHERE e.tenant_id = v_tenant_id
    AND e.session_id = v_resumed_session_id
    AND e.from_tap IS NOT NULL
    AND e.to_tap IS NULL;

  SELECT public.list_tap_lifecycle_sessions(v_tenant_id, 'completed')
  INTO v_sessions;

  SELECT item
  INTO v_item
  FROM jsonb_array_elements(v_sessions->'items') AS item
  WHERE item->>'session_id' = v_resumed_session_id::text;

  IF v_item IS NULL
     OR v_item->>'state' IS DISTINCT FROM 'completed'
     OR (v_item->>'ended_at')::timestamptz IS DISTINCT FROM v_ended_event_at
     OR (v_item->>'keg_change_count')::integer <> 1
     OR (v_item->>'current_keg_started_at')::timestamptz IS DISTINCT FROM v_last_keg_at
     OR (v_item->>'duration_seconds')::bigint IS DISTINCT FROM greatest(
       0,
       floor(extract(epoch FROM (
         (v_item->>'ended_at')::timestamptz
           - (v_item->>'started_at')::timestamptz
       )))::bigint
     )
     OR (v_item->>'current_keg_duration_seconds')::bigint IS DISTINCT FROM greatest(
       0,
       floor(extract(epoch FROM (
         (v_item->>'ended_at')::timestamptz
           - (v_item->>'current_keg_started_at')::timestamptz
       )))::bigint
     ) THEN
    RAISE EXCEPTION 'Completed changed-keg session fields are incorrect: %', v_item;
  END IF;

  SELECT public.list_tap_lifecycle_sessions(v_tenant_id, 'active')
  INTO v_sessions;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_sessions->'items') AS item
    WHERE item->>'session_id' = v_resumed_session_id::text
  ) THEN
    RAISE EXCEPTION 'Completed session remained visible as active';
  END IF;

  SELECT public.get_tap_lifecycle_overview(v_tenant_id)
  INTO v_overview;
  v_after_keg_count := coalesce((v_overview->'counts'->>'keg_change')::integer, 0);

  IF v_after_keg_count <> v_before_keg_count + 5 THEN
    RAISE EXCEPTION
      'Overview keg-change count expected %, got %',
      v_before_keg_count + 5,
      v_after_keg_count;
  END IF;

  RAISE NOTICE 'tap_lifecycle_keg_change.sql: RPC, state, session and analytics checks passed';
END $$;

ROLLBACK;
