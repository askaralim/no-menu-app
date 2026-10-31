-- Tap lifecycle pending-status SQL tests (run locally after migrations as DB superuser).
-- Usage: psql "$DATABASE_URL" -f supabase/tests/tap_lifecycle_pending_status.sql

BEGIN;

DO $$
DECLARE
  v_tenant_id uuid;
  v_user_id uuid;
  v_user_role text;
  v_test_phone text;
  v_expected_actor_snapshot text;
  v_taps integer[];
  v_tap_limit integer;
  v_max_used_tap integer;
  v_pending_drink_id uuid;
  v_available_drink_id uuid;
  v_new_drink_id uuid;
  v_pending_clear_drink_id uuid;
  v_consumer_drink_id uuid;
  v_direct_update_drink_id uuid;
  v_pending_sold_out_drink_id uuid;
  v_direct_sold_out_drink_id uuid;
  v_swap_pending_drink_id uuid;
  v_replace_active_drink_id uuid;
  v_replace_pending_drink_id uuid;
  v_pending_session_id uuid;
  v_restarted_session_id uuid;
  v_available_session_id uuid;
  v_new_session_id uuid;
  v_consumer_session_id uuid;
  v_direct_update_session_id uuid;
  v_reactivated_session_id uuid;
  v_replace_active_session_id uuid;
  v_started_at timestamptz;
  v_started_at_after timestamptz;
  v_sold_out_at timestamptz;
  v_operation_id uuid;
  v_pending_plan_operation_id uuid;
  v_cancel_operation_id uuid;
  v_sold_out_operation_id uuid;
  v_legacy_operation_id uuid := gen_random_uuid();
  v_legacy_actor_id uuid;
  v_accuracy text;
  v_actor_snapshot text;
  v_actor_display text;
  v_changed_role text;
  v_changed_phone text;
  v_result jsonb;
  v_overview jsonb;
  v_sessions jsonb;
  v_item jsonb;
  v_operation jsonb;
  v_baseline_current_count integer;
  v_baseline_assign_count integer;
  v_baseline_clear_count integer;
  v_before_event_count integer;
  v_after_event_count integer;
  v_before_clear_count integer;
  v_before_assign_count integer;
  v_before_current_count integer;
  v_before_status_event_count integer;
  v_after_status_event_count integer;
  v_session_count integer;
BEGIN
  SELECT ur.tenant_id, ur.user_id, ur.role
  INTO v_tenant_id, v_user_id, v_user_role
  FROM public.user_roles ur
  JOIN public.tenants t ON t.id = ur.tenant_id
  WHERE ur.tenant_id IS NOT NULL
    AND ur.role IN ('owner', 'staff')
    AND t.tap_lifecycle_started_at IS NOT NULL
  ORDER BY CASE ur.role WHEN 'owner' THEN 0 ELSE 1 END, ur.created_at
  LIMIT 1;

  IF v_tenant_id IS NULL OR v_user_id IS NULL THEN
    RAISE EXCEPTION 'No tenant member available for pending-status lifecycle tests';
  END IF;

  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_user_id, 'role', 'authenticated')::text,
    true
  );
  PERFORM set_config('request.jwt.claim.sub', v_user_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  IF EXISTS (
    SELECT 1
    FROM public.tap_lifecycle_events e
    WHERE e.source = 'migration_sold_out_reconciliation'
      AND e.actor_name_snapshot ~ '[0-9]{7,}'
  ) THEN
    RAISE EXCEPTION 'Sold-out reconciliation copied an unsafe full-phone actor snapshot';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tap_lifecycle_events e
    WHERE e.source = 'migration_sold_out_reconciliation'
    GROUP BY e.tenant_id, e.operation_id
    HAVING count(*) <> 1
       OR min(e.operation_seq) <> 1
       OR max(e.operation_seq) <> 1
       OR count(DISTINCT e.action) <> 1
       OR count(DISTINCT e.occurred_at) <> 1
  ) THEN
    RAISE EXCEPTION 'Sold-out reconciliation broke one-row operation invariants';
  END IF;

  -- Exercise the future snapshot formatter with a phone-shaped profile value.
  -- This is transaction-scoped and rolled back with the rest of the fixture.
  v_test_phone := '199' || substr(
    rpad(regexp_replace(v_user_id::text, '[^0-9]', '', 'g'), 10, '0'),
    1,
    10
  );
  v_expected_actor_snapshot := CASE v_user_role
    WHEN 'owner' THEN '店主'
    ELSE '员工'
  END || ' · ' || right(v_test_phone, 4);

  INSERT INTO public.user_profiles (user_id, mobile, display_name)
  VALUES (v_user_id, v_test_phone, v_test_phone)
  ON CONFLICT (user_id) DO UPDATE
  SET
    mobile = excluded.mobile,
    display_name = excluded.display_name;

  -- Use a real auth.users row for the legacy actor fixture. Prefer an existing
  -- account with no membership or phone so its raw historical snapshot drives
  -- the fallback label; create a transaction-scoped account only if needed.
  SELECT u.id
  INTO v_legacy_actor_id
  FROM auth.users u
  LEFT JOIN public.user_profiles up ON up.user_id = u.id
  WHERE u.id <> v_user_id
    AND coalesce(nullif(trim(up.mobile), ''), nullif(trim(u.phone), '')) IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = u.id
    )
  ORDER BY u.created_at, u.id
  LIMIT 1;

  IF v_legacy_actor_id IS NULL THEN
    v_legacy_actor_id := gen_random_uuid();

    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      recovery_token,
      email_change_token_new,
      email_change,
      phone,
      phone_change,
      phone_change_token,
      email_change_token_current,
      reauthentication_token,
      is_sso_user,
      is_anonymous
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_legacy_actor_id,
      'authenticated',
      'authenticated',
      'tap-lifecycle-' || replace(v_legacy_actor_id::text, '-', '') || '@example.invalid',
      '',
      now(),
      jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
      '{}'::jsonb,
      now(),
      now(),
      '',
      '',
      '',
      '',
      NULL,
      '',
      '',
      '',
      '',
      false,
      false
    );
  END IF;

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
    LIMIT 4
  ) candidate;

  IF coalesce(array_length(v_taps, 1), 0) < 4
     AND greatest(v_tap_limit, v_max_used_tap) <= 95 THEN
    v_tap_limit := greatest(v_tap_limit, v_max_used_tap) + 4;

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
      LIMIT 4
    ) candidate;
  END IF;

  IF coalesce(array_length(v_taps, 1), 0) < 4 THEN
    RAISE EXCEPTION 'Four free tap numbers are required for pending-status tests';
  END IF;

  SELECT public.get_tap_lifecycle_overview(v_tenant_id)
  INTO v_overview;
  v_baseline_current_count := (v_overview->>'current_on_tap_count')::integer;
  v_baseline_assign_count := coalesce((v_overview->'counts'->>'assign')::integer, 0);
  v_baseline_clear_count := coalesce((v_overview->'counts'->>'clear')::integer, 0);

  -- A planned assignment reserves a display position only. It must not start
  -- a lifecycle, count as currently on tap, or accept a keg change.
  INSERT INTO public.drinks (
    tenant_id,
    brand_name,
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
    '__test_pending_brewery__',
    '__test_pending_status__',
    0,
    '杯',
    910001,
    true,
    false,
    'coming_soon',
    NULL
  )
  RETURNING id INTO v_pending_drink_id;

  SELECT public.set_drink_taplist_listing(
    v_pending_drink_id,
    false,
    'coming_soon',
    v_taps[1]
  )
  INTO v_result;

  IF coalesce((v_result->>'ok')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Planned assignment failed: %', v_result;
  END IF;

  SELECT e.operation_id
  INTO v_pending_plan_operation_id
  FROM public.tap_lifecycle_events e
  WHERE e.tenant_id = v_tenant_id
    AND e.drink_id = v_pending_drink_id
    AND e.action = 'plan'
  ORDER BY e.occurred_at DESC, e.id DESC
  LIMIT 1;

  IF v_pending_plan_operation_id IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM public.tap_lifecycle_events e
       WHERE e.tenant_id = v_tenant_id
         AND e.operation_id = v_pending_plan_operation_id
         AND e.action = 'plan'
         AND e.session_id IS NULL
         AND e.from_tap IS NULL
         AND e.to_tap = v_taps[1]
         AND e.to_status = 'coming_soon'
         AND e.accuracy = 'exact'
     ) OR EXISTS (
       SELECT 1
       FROM public.tap_lifecycle_events e
       WHERE e.tenant_id = v_tenant_id
         AND e.drink_id = v_pending_drink_id
         AND e.action <> 'plan'
     ) OR EXISTS (
    SELECT 1
    FROM public.tap_lifecycle_sessions_v1 s
    WHERE s.tenant_id = v_tenant_id
      AND s.drink_id = v_pending_drink_id
  ) THEN
    RAISE EXCEPTION 'coming_soon assignment did not create one sessionless plan operation';
  END IF;

  SELECT public.get_tap_lifecycle_overview(v_tenant_id)
  INTO v_overview;

  SELECT operation
  INTO v_operation
  FROM jsonb_array_elements(v_overview->'operations') AS operation
  WHERE operation->>'operation_id' = v_pending_plan_operation_id::text;

  IF (v_overview->>'current_on_tap_count')::integer
       IS DISTINCT FROM v_baseline_current_count
     OR coalesce((v_overview->'counts'->>'assign')::integer, 0)
       IS DISTINCT FROM v_baseline_assign_count
     OR v_operation IS NULL
     OR v_operation->>'action' IS DISTINCT FROM 'plan'
     OR v_operation->>'actor_name' IS DISTINCT FROM '你' THEN
    RAISE EXCEPTION 'coming_soon assignment changed current or assign counts: %', v_overview;
  END IF;

  SELECT public.list_tap_lifecycle_sessions(v_tenant_id, 'active')
  INTO v_sessions;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_sessions->'items') AS item
    WHERE item->>'drink_id' = v_pending_drink_id::text
  ) THEN
    RAISE EXCEPTION 'coming_soon assignment appeared in active sessions';
  END IF;

  BEGIN
    PERFORM public.record_tap_keg_change(v_pending_drink_id, gen_random_uuid());
    RAISE EXCEPTION 'Expected coming_soon keg change to be rejected';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%Active tap lifecycle session not found%' THEN
        RAISE;
      END IF;
  END;

  -- Confirming the planned item as new starts one exact lifecycle.
  SELECT public.set_drink_taplist_listing(
    v_pending_drink_id,
    false,
    'new',
    v_taps[1]
  )
  INTO v_result;

  SELECT s.session_id, s.started_at, s.accuracy
  INTO v_pending_session_id, v_started_at, v_accuracy
  FROM public.tap_lifecycle_sessions_v1 s
  WHERE s.tenant_id = v_tenant_id
    AND s.drink_id = v_pending_drink_id
    AND s.ended_at IS NULL
    AND s.canceled IS NOT TRUE;

  IF v_pending_session_id IS NULL
     OR v_started_at IS NULL
     OR v_accuracy IS DISTINCT FROM 'exact'
     OR NOT EXISTS (
       SELECT 1
       FROM public.tap_lifecycle_events e
       WHERE e.tenant_id = v_tenant_id
         AND e.session_id = v_pending_session_id
         AND e.action = 'assign'
         AND e.from_tap IS NULL
         AND e.to_tap = v_taps[1]
         AND e.from_status = 'coming_soon'
         AND e.to_status = 'new'
         AND e.accuracy = 'exact'
     ) THEN
    RAISE EXCEPTION 'coming_soon -> new did not start one exact lifecycle';
  END IF;

  SELECT public.get_tap_lifecycle_overview(v_tenant_id)
  INTO v_overview;

  IF (v_overview->>'current_on_tap_count')::integer
       IS DISTINCT FROM v_baseline_current_count + 1
     OR coalesce((v_overview->'counts'->>'assign')::integer, 0)
       IS DISTINCT FROM v_baseline_assign_count + 1 THEN
    RAISE EXCEPTION 'Confirmed new lifecycle was not counted once: %', v_overview;
  END IF;

  SELECT count(*)::integer
  INTO v_before_event_count
  FROM public.tap_lifecycle_events e
  WHERE e.tenant_id = v_tenant_id
    AND e.drink_id = v_pending_drink_id;

  -- new -> available is merchandising status only; it keeps the same start.
  PERFORM public.set_drink_taplist_status(
    v_pending_drink_id,
    false,
    'available'
  );

  SELECT s.session_id, s.started_at
  INTO v_restarted_session_id, v_started_at_after
  FROM public.tap_lifecycle_sessions_v1 s
  WHERE s.tenant_id = v_tenant_id
    AND s.drink_id = v_pending_drink_id
    AND s.ended_at IS NULL
    AND s.canceled IS NOT TRUE;

  SELECT count(*)::integer
  INTO v_after_event_count
  FROM public.tap_lifecycle_events e
  WHERE e.tenant_id = v_tenant_id
    AND e.drink_id = v_pending_drink_id;

  IF v_restarted_session_id IS DISTINCT FROM v_pending_session_id
     OR v_started_at_after IS DISTINCT FROM v_started_at
     OR v_after_event_count IS DISTINCT FROM v_before_event_count THEN
    RAISE EXCEPTION 'new -> available restarted or changed the lifecycle';
  END IF;

  -- Correcting an active item back to planned records a cancel boundary. The
  -- canceled period remains auditable but is not an active/completed cycle or
  -- an assignment metric.
  PERFORM public.set_drink_taplist_status(
    v_pending_drink_id,
    false,
    'coming_soon'
  );

  SELECT e.operation_id
  INTO v_cancel_operation_id
  FROM public.tap_lifecycle_events e
  WHERE e.tenant_id = v_tenant_id
    AND e.session_id = v_pending_session_id
    AND e.action = 'cancel'
  ORDER BY e.occurred_at DESC, e.id DESC
  LIMIT 1;

  IF v_cancel_operation_id IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM public.tap_lifecycle_events e
       WHERE e.tenant_id = v_tenant_id
         AND e.operation_id = v_cancel_operation_id
         AND e.session_id = v_pending_session_id
         AND e.action = 'cancel'
         AND e.from_tap = v_taps[1]
         AND e.to_tap IS NULL
         AND e.from_status = 'available'
         AND e.to_status = 'coming_soon'
         AND e.end_reason = 'cancel'
         AND e.accuracy = 'exact'
     ) OR NOT EXISTS (
       SELECT 1
       FROM public.tap_lifecycle_sessions_v1 s
       WHERE s.tenant_id = v_tenant_id
         AND s.session_id = v_pending_session_id
         AND s.ended_at IS NOT NULL
         AND s.canceled IS TRUE
     ) THEN
    RAISE EXCEPTION 'active -> coming_soon did not write a valid cancel boundary';
  END IF;

  SELECT public.list_tap_lifecycle_sessions(v_tenant_id, 'active')
  INTO v_sessions;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_sessions->'items') AS item
    WHERE item->>'session_id' = v_pending_session_id::text
  ) THEN
    RAISE EXCEPTION 'Canceled lifecycle remained in the active list';
  END IF;

  SELECT public.list_tap_lifecycle_sessions(v_tenant_id, 'completed')
  INTO v_sessions;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_sessions->'items') AS item
    WHERE item->>'session_id' = v_pending_session_id::text
  ) THEN
    RAISE EXCEPTION 'Canceled lifecycle appeared in the completed list';
  END IF;

  SELECT public.get_tap_lifecycle_overview(v_tenant_id)
  INTO v_overview;

  SELECT operation
  INTO v_operation
  FROM jsonb_array_elements(v_overview->'operations') AS operation
  WHERE operation->>'operation_id' = v_cancel_operation_id::text;

  IF (v_overview->>'current_on_tap_count')::integer
       IS DISTINCT FROM v_baseline_current_count
     OR coalesce((v_overview->'counts'->>'assign')::integer, 0)
       IS DISTINCT FROM v_baseline_assign_count
     OR coalesce((v_overview->'counts'->>'clear')::integer, 0)
       IS DISTINCT FROM v_baseline_clear_count
     OR v_operation IS NULL
     OR v_operation->>'action' IS DISTINCT FROM 'cancel'
     OR v_operation->>'actor_name' IS DISTINCT FROM '你' THEN
    RAISE EXCEPTION 'Canceled lifecycle was counted or lost from the audit trail: %', v_overview;
  END IF;

  -- A later explicit available state starts a fresh exact cycle.
  SELECT public.set_drink_taplist_listing(
    v_pending_drink_id,
    false,
    'available',
    v_taps[1]
  )
  INTO v_result;

  SELECT s.session_id, s.accuracy
  INTO v_restarted_session_id, v_accuracy
  FROM public.tap_lifecycle_sessions_v1 s
  WHERE s.tenant_id = v_tenant_id
    AND s.drink_id = v_pending_drink_id
    AND s.ended_at IS NULL
    AND s.canceled IS NOT TRUE;

  IF v_restarted_session_id IS NULL
     OR v_restarted_session_id = v_pending_session_id
     OR v_accuracy IS DISTINCT FROM 'exact'
     OR NOT EXISTS (
       SELECT 1
       FROM public.tap_lifecycle_events e
       WHERE e.tenant_id = v_tenant_id
         AND e.session_id = v_restarted_session_id
         AND e.action = 'assign'
         AND e.from_tap IS NULL
         AND e.to_tap = v_taps[1]
         AND e.from_status = 'coming_soon'
         AND e.to_status = 'available'
     ) THEN
    RAISE EXCEPTION 'coming_soon -> available did not start a fresh exact lifecycle';
  END IF;

  SELECT public.get_tap_lifecycle_overview(v_tenant_id)
  INTO v_overview;

  IF (v_overview->>'current_on_tap_count')::integer
       IS DISTINCT FROM v_baseline_current_count + 1
     OR coalesce((v_overview->'counts'->>'assign')::integer, 0)
       IS DISTINCT FROM v_baseline_assign_count + 1 THEN
    RAISE EXCEPTION 'Fresh available lifecycle was not counted once: %', v_overview;
  END IF;

  -- Direct available and direct new assignments both start exact cycles.
  INSERT INTO public.drinks (
    tenant_id,
    brand_name,
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
    '__test_brewery__',
    '__test_direct_available__',
    0,
    '杯',
    910002,
    true,
    false,
    'available',
    NULL
  )
  RETURNING id INTO v_available_drink_id;

  INSERT INTO public.drink_beer_profiles (tenant_id, drink_id, brewery)
  VALUES (v_tenant_id, v_available_drink_id, '__test_brewery__');

  SELECT public.set_drink_taplist_listing(
    v_available_drink_id,
    false,
    'available',
    v_taps[2]
  )
  INTO v_result;

  SELECT s.session_id, s.accuracy
  INTO v_available_session_id, v_accuracy
  FROM public.tap_lifecycle_sessions_v1 s
  WHERE s.tenant_id = v_tenant_id
    AND s.drink_id = v_available_drink_id
    AND s.ended_at IS NULL
    AND s.canceled IS NOT TRUE;

  SELECT e.operation_id, e.actor_name_snapshot
  INTO v_operation_id, v_actor_snapshot
  FROM public.tap_lifecycle_events e
  WHERE e.tenant_id = v_tenant_id
    AND e.session_id = v_available_session_id
    AND e.action = 'assign'
  ORDER BY e.occurred_at, e.id
  LIMIT 1;

  IF v_available_session_id IS NULL
     OR v_accuracy IS DISTINCT FROM 'exact'
     OR v_operation_id IS NULL
     OR v_actor_snapshot IS DISTINCT FROM v_expected_actor_snapshot
     OR v_actor_snapshot ~ '[0-9]{7,}' THEN
    RAISE EXCEPTION 'Direct available assignment or safe actor snapshot is invalid: %',
      v_actor_snapshot;
  END IF;

  SELECT public.list_tap_lifecycle_sessions(v_tenant_id, 'active')
  INTO v_sessions;

  SELECT item
  INTO v_item
  FROM jsonb_array_elements(v_sessions->'items') AS item
  WHERE item->>'session_id' = v_available_session_id::text;

  IF v_item IS NULL
     OR v_item->>'accuracy' IS DISTINCT FROM 'exact'
     OR v_item->>'brewery_name' IS DISTINCT FROM '__test_brewery__'
     OR v_item->>'actor_name' IS DISTINCT FROM '你' THEN
    RAISE EXCEPTION 'Active session brewery or actor projection is incorrect: %', v_item;
  END IF;

  SELECT public.get_tap_lifecycle_overview(v_tenant_id)
  INTO v_overview;

  SELECT operation
  INTO v_operation
  FROM jsonb_array_elements(v_overview->'operations') AS operation
  WHERE operation->>'operation_id' = v_operation_id::text;

  IF v_operation IS NULL OR v_operation->>'actor_name' IS DISTINCT FROM '你' THEN
    RAISE EXCEPTION 'Current actor was not rendered as 你: %', v_operation;
  END IF;

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
    '__test_direct_new__',
    0,
    '杯',
    910003,
    true,
    false,
    'new',
    NULL
  )
  RETURNING id INTO v_new_drink_id;

  SELECT public.set_drink_taplist_listing(
    v_new_drink_id,
    false,
    'new',
    v_taps[3]
  )
  INTO v_result;

  SELECT s.session_id, s.accuracy
  INTO v_new_session_id, v_accuracy
  FROM public.tap_lifecycle_sessions_v1 s
  WHERE s.tenant_id = v_tenant_id
    AND s.drink_id = v_new_drink_id
    AND s.ended_at IS NULL
    AND s.canceled IS NOT TRUE;

  IF v_new_session_id IS NULL
     OR v_accuracy IS DISTINCT FROM 'exact'
     OR NOT EXISTS (
       SELECT 1
       FROM public.tap_lifecycle_events e
       WHERE e.tenant_id = v_tenant_id
         AND e.session_id = v_new_session_id
         AND e.action = 'assign'
         AND e.from_tap IS NULL
         AND e.to_tap = v_taps[3]
         AND e.to_status = 'new'
     ) THEN
    RAISE EXCEPTION 'Direct new assignment did not start an exact lifecycle';
  END IF;

  -- A legacy full-phone snapshot must be masked at every RPC boundary.
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
  ) VALUES (
    v_tenant_id,
    v_legacy_operation_id,
    1::smallint,
    'keg_change',
    v_available_drink_id,
    '__test_direct_available__',
    v_available_session_id,
    v_taps[2],
    v_taps[2],
    'available',
    'available',
    NULL,
    '8615998568171',
    clock_timestamp(),
    'exact',
    NULL,
    'tap_lifecycle_pending_status_test_legacy'
  );

  SELECT public.get_tap_lifecycle_overview(v_tenant_id)
  INTO v_overview;

  SELECT operation
  INTO v_operation
  FROM jsonb_array_elements(v_overview->'operations') AS operation
  WHERE operation->>'operation_id' = v_legacy_operation_id::text;

  IF v_operation IS NULL
     OR v_operation->>'actor_name' IS DISTINCT FROM '手机尾号 8171'
     OR v_operation::text LIKE '%8615998568171%' THEN
    RAISE EXCEPTION 'Legacy full-phone actor snapshot was not masked: %', v_operation;
  END IF;

  -- Clearing a planned item removes it from tonight without inventing a
  -- completed lifecycle or a clear metric.
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
    '__test_pending_clear__',
    0,
    '杯',
    910004,
    true,
    false,
    'coming_soon',
    NULL
  )
  RETURNING id INTO v_pending_clear_drink_id;

  SELECT public.set_drink_taplist_listing(
    v_pending_clear_drink_id,
    false,
    'coming_soon',
    v_taps[4]
  )
  INTO v_result;

  SELECT public.get_tap_lifecycle_overview(v_tenant_id)
  INTO v_overview;
  v_before_clear_count := coalesce((v_overview->'counts'->>'clear')::integer, 0);

  SELECT public.remove_drink_from_tonight(v_pending_clear_drink_id)
  INTO v_result;

  IF coalesce((v_result->>'ok')::boolean, false) IS NOT TRUE
     OR EXISTS (
       SELECT 1
       FROM public.tap_lifecycle_events e
       WHERE e.tenant_id = v_tenant_id
         AND e.drink_id = v_pending_clear_drink_id
         AND e.action <> 'plan'
     ) OR (
       SELECT count(*)
       FROM public.tap_lifecycle_events e
       WHERE e.tenant_id = v_tenant_id
         AND e.drink_id = v_pending_clear_drink_id
         AND e.action = 'plan'
         AND e.session_id IS NULL
     ) <> 2 OR EXISTS (
       SELECT 1
       FROM public.tap_lifecycle_sessions_v1 s
       WHERE s.tenant_id = v_tenant_id
         AND s.drink_id = v_pending_clear_drink_id
     ) OR EXISTS (
       SELECT 1
       FROM public.drink_status_events e
       WHERE e.tenant_id = v_tenant_id
         AND e.drink_id = v_pending_clear_drink_id
         AND e.from_status = 'coming_soon'
         AND e.to_status = 'sold_out'
     ) OR EXISTS (
       SELECT 1
       FROM public.drinks d
       WHERE d.id = v_pending_clear_drink_id
         AND (d.public_sort_order IS NOT NULL OR d.public_status <> 'available')
     ) THEN
    RAISE EXCEPTION 'Clearing coming_soon created a lifecycle or left invalid state';
  END IF;

  SELECT public.list_tap_lifecycle_sessions(v_tenant_id, 'completed')
  INTO v_sessions;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_sessions->'items') AS item
    WHERE item->>'drink_id' = v_pending_clear_drink_id::text
  ) THEN
    RAISE EXCEPTION 'Cleared coming_soon item appeared as a completed lifecycle';
  END IF;

  SELECT public.get_tap_lifecycle_overview(v_tenant_id)
  INTO v_overview;

  IF coalesce((v_overview->'counts'->>'clear')::integer, 0)
       IS DISTINCT FROM v_before_clear_count
     OR (v_overview->>'current_on_tap_count')::integer
       IS DISTINCT FROM v_baseline_current_count + 3 THEN
    RAISE EXCEPTION 'Pending clear changed clear/current counts: %', v_overview;
  END IF;

  -- The mini-program writer has the same pending boundary as the POS writer.
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
    '__test_consumer_fields_pending__',
    0,
    '杯',
    910005,
    true,
    false,
    'coming_soon',
    NULL
  )
  RETURNING id INTO v_consumer_drink_id;

  PERFORM public.set_drink_taplist_consumer_fields(
    v_consumer_drink_id,
    NULL::text,
    false,
    'coming_soon',
    v_taps[4]
  );

  IF NOT EXISTS (
    SELECT 1
    FROM public.tap_lifecycle_events e
    WHERE e.tenant_id = v_tenant_id
      AND e.drink_id = v_consumer_drink_id
      AND e.action = 'plan'
      AND e.session_id IS NULL
      AND e.from_tap IS NULL
      AND e.to_tap = v_taps[4]
      AND e.accuracy = 'exact'
  ) OR EXISTS (
    SELECT 1
    FROM public.tap_lifecycle_events e
    WHERE e.tenant_id = v_tenant_id
      AND e.drink_id = v_consumer_drink_id
      AND e.action <> 'plan'
  ) THEN
    RAISE EXCEPTION 'Consumer-fields pending assignment did not create a clean plan operation';
  END IF;

  PERFORM public.set_drink_taplist_consumer_fields(
    v_consumer_drink_id,
    NULL::text,
    false,
    'available',
    v_taps[4]
  );

  SELECT s.session_id, s.accuracy
  INTO v_consumer_session_id, v_accuracy
  FROM public.tap_lifecycle_sessions_v1 s
  WHERE s.tenant_id = v_tenant_id
    AND s.drink_id = v_consumer_drink_id
    AND s.ended_at IS NULL
    AND s.canceled IS NOT TRUE;

  IF v_consumer_session_id IS NULL
     OR v_accuracy IS DISTINCT FROM 'exact'
     OR (
       SELECT count(*)
       FROM public.tap_lifecycle_events e
       WHERE e.tenant_id = v_tenant_id
         AND e.session_id = v_consumer_session_id
         AND e.from_tap IS NULL
         AND e.to_tap = v_taps[4]
     ) <> 1 THEN
    RAISE EXCEPTION 'Consumer-fields pending -> active boundary is invalid';
  END IF;

  PERFORM public.set_drink_taplist_consumer_fields(
    v_consumer_drink_id,
    NULL::text,
    false,
    'coming_soon',
    v_taps[4]
  );

  IF NOT EXISTS (
    SELECT 1
    FROM public.tap_lifecycle_events e
    WHERE e.tenant_id = v_tenant_id
      AND e.session_id = v_consumer_session_id
      AND e.action = 'cancel'
      AND e.end_reason = 'cancel'
      AND e.from_tap = v_taps[4]
      AND e.to_tap IS NULL
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.tap_lifecycle_sessions_v1 s
    WHERE s.tenant_id = v_tenant_id
      AND s.session_id = v_consumer_session_id
      AND s.canceled IS TRUE
      AND s.ended_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Consumer-fields active -> pending did not cancel the cycle';
  END IF;

  SELECT public.list_tap_lifecycle_sessions(v_tenant_id, 'active')
  INTO v_sessions;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_sessions->'items') AS item
    WHERE item->>'session_id' = v_consumer_session_id::text
  ) THEN
    RAISE EXCEPTION 'Consumer-fields canceled cycle remained active';
  END IF;

  SELECT public.list_tap_lifecycle_sessions(v_tenant_id, 'completed')
  INTO v_sessions;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_sessions->'items') AS item
    WHERE item->>'session_id' = v_consumer_session_id::text
  ) THEN
    RAISE EXCEPTION 'Consumer-fields canceled cycle appeared completed';
  END IF;

  PERFORM public.set_drink_taplist_consumer_fields(
    v_consumer_drink_id,
    NULL::text,
    false,
    'coming_soon',
    NULL
  );

  -- Direct writes are a conservative fallback: boundaries are captured once,
  -- but their accuracy stays unclassified because no canonical RPC witnessed
  -- the operation.
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
    '__test_direct_update_pending__',
    0,
    '杯',
    910006,
    true,
    false,
    'coming_soon',
    v_taps[4]
  )
  RETURNING id INTO v_direct_update_drink_id;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tap_lifecycle_events e
    WHERE e.tenant_id = v_tenant_id
      AND e.drink_id = v_direct_update_drink_id
      AND e.action = 'plan'
      AND e.session_id IS NULL
      AND e.from_tap IS NULL
      AND e.to_tap = v_taps[4]
      AND e.accuracy = 'unclassified'
      AND e.source = 'direct_drinks_write'
  ) OR EXISTS (
    SELECT 1
    FROM public.tap_lifecycle_events e
    WHERE e.tenant_id = v_tenant_id
      AND e.drink_id = v_direct_update_drink_id
      AND e.action <> 'plan'
  ) THEN
    RAISE EXCEPTION 'Direct INSERT of pending item did not create an unclassified plan operation';
  END IF;

  UPDATE public.drinks
  SET public_status = 'available'
  WHERE id = v_direct_update_drink_id;

  SELECT s.session_id, s.accuracy
  INTO v_direct_update_session_id, v_accuracy
  FROM public.tap_lifecycle_sessions_v1 s
  WHERE s.tenant_id = v_tenant_id
    AND s.drink_id = v_direct_update_drink_id
    AND s.ended_at IS NULL
    AND s.canceled IS NOT TRUE;

  SELECT count(*)::integer
  INTO v_session_count
  FROM public.tap_lifecycle_events e
  WHERE e.tenant_id = v_tenant_id
    AND e.drink_id = v_direct_update_drink_id
    AND e.session_id = v_direct_update_session_id
    AND e.from_tap IS NULL
    AND e.to_tap = v_taps[4];

  IF v_direct_update_session_id IS NULL
     OR v_accuracy IS DISTINCT FROM 'unclassified'
     OR v_session_count <> 1
     OR NOT EXISTS (
       SELECT 1
       FROM public.tap_lifecycle_events e
       WHERE e.tenant_id = v_tenant_id
         AND e.session_id = v_direct_update_session_id
         AND e.action = 'assign'
         AND e.source = 'direct_drinks_write'
         AND e.accuracy = 'unclassified'
     ) THEN
    RAISE EXCEPTION 'Direct UPDATE pending -> active fallback is invalid';
  END IF;

  UPDATE public.drinks
  SET public_status = 'coming_soon'
  WHERE id = v_direct_update_drink_id;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tap_lifecycle_events e
    WHERE e.tenant_id = v_tenant_id
      AND e.session_id = v_direct_update_session_id
      AND e.action = 'cancel'
      AND e.source = 'direct_drinks_write'
      AND e.accuracy = 'unclassified'
      AND e.end_reason = 'cancel'
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.tap_lifecycle_sessions_v1 s
    WHERE s.tenant_id = v_tenant_id
      AND s.session_id = v_direct_update_session_id
      AND s.canceled IS TRUE
      AND s.ended_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Direct UPDATE active -> pending fallback is invalid';
  END IF;

  SELECT public.list_tap_lifecycle_sessions(v_tenant_id, 'active')
  INTO v_sessions;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_sessions->'items') AS item
    WHERE item->>'session_id' = v_direct_update_session_id::text
  ) THEN
    RAISE EXCEPTION 'Direct UPDATE canceled cycle remained active';
  END IF;

  SELECT public.list_tap_lifecycle_sessions(v_tenant_id, 'completed')
  INTO v_sessions;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_sessions->'items') AS item
    WHERE item->>'session_id' = v_direct_update_session_id::text
  ) THEN
    RAISE EXCEPTION 'Direct UPDATE canceled cycle appeared completed';
  END IF;

  UPDATE public.drinks
  SET public_sort_order = NULL,
      public_status = 'available'
  WHERE id = v_direct_update_drink_id;

  -- sold_out ends an exact active cycle while keeping the drink assigned for
  -- display. Returning to available starts a new exact assignment session.
  SELECT public.get_tap_lifecycle_overview(v_tenant_id)
  INTO v_overview;
  v_before_current_count := (v_overview->>'current_on_tap_count')::integer;
  v_before_assign_count := coalesce((v_overview->'counts'->>'assign')::integer, 0);
  v_before_clear_count := coalesce((v_overview->'counts'->>'clear')::integer, 0);

  PERFORM public.set_drink_taplist_status(
    v_available_drink_id,
    false,
    'sold_out'
  );

  SELECT e.operation_id, e.occurred_at
  INTO v_sold_out_operation_id, v_sold_out_at
  FROM public.tap_lifecycle_events e
  WHERE e.tenant_id = v_tenant_id
    AND e.session_id = v_available_session_id
    AND e.action = 'sold_out'
    AND e.end_reason = 'sold_out'
    AND e.from_tap = v_taps[2]
    AND e.to_tap IS NULL
  ORDER BY e.occurred_at DESC, e.id DESC
  LIMIT 1;

  SELECT public.get_tap_lifecycle_overview(v_tenant_id)
  INTO v_overview;

  SELECT operation
  INTO v_operation
  FROM jsonb_array_elements(v_overview->'operations') AS operation
  WHERE operation->>'operation_id' = v_sold_out_operation_id::text;

  SELECT public.list_tap_lifecycle_sessions(v_tenant_id, 'completed')
  INTO v_sessions;

  SELECT item
  INTO v_item
  FROM jsonb_array_elements(v_sessions->'items') AS item
  WHERE item->>'session_id' = v_available_session_id::text;

  IF v_sold_out_operation_id IS NULL
     OR v_item IS NULL
     OR (v_item->>'ended_at')::timestamptz IS DISTINCT FROM v_sold_out_at
     OR v_item->>'end_reason' IS DISTINCT FROM 'sold_out'
     OR v_item->'duration_seconds' = 'null'::jsonb
     OR v_operation IS NULL
     OR v_operation->>'action' IS DISTINCT FROM 'sold_out'
     OR v_operation->'duration_seconds' = 'null'::jsonb
     OR EXISTS (
       SELECT 1
       FROM public.tap_lifecycle_sessions_v1 s
       WHERE s.tenant_id = v_tenant_id
         AND s.drink_id = v_available_drink_id
         AND s.ended_at IS NULL
         AND s.canceled IS NOT TRUE
     ) OR NOT EXISTS (
       SELECT 1
       FROM public.drinks d
       WHERE d.id = v_available_drink_id
         AND d.public_sort_order = v_taps[2]
         AND d.public_status = 'sold_out'
     ) OR (v_overview->>'current_on_tap_count')::integer
       IS DISTINCT FROM v_before_current_count - 1
     OR coalesce((v_overview->'counts'->>'clear')::integer, 0)
       IS DISTINCT FROM v_before_clear_count + 1 THEN
    RAISE EXCEPTION 'available -> sold_out did not close and count the exact cycle: operation %, session %',
      v_operation,
      v_item;
  END IF;

  PERFORM public.set_drink_taplist_status(
    v_available_drink_id,
    false,
    'available'
  );

  SELECT s.session_id, s.accuracy
  INTO v_reactivated_session_id, v_accuracy
  FROM public.tap_lifecycle_sessions_v1 s
  WHERE s.tenant_id = v_tenant_id
    AND s.drink_id = v_available_drink_id
    AND s.ended_at IS NULL
    AND s.canceled IS NOT TRUE;

  SELECT public.get_tap_lifecycle_overview(v_tenant_id)
  INTO v_overview;

  IF v_reactivated_session_id IS NULL
     OR v_reactivated_session_id = v_available_session_id
     OR v_accuracy IS DISTINCT FROM 'exact'
     OR NOT EXISTS (
       SELECT 1
       FROM public.tap_lifecycle_events e
       WHERE e.tenant_id = v_tenant_id
         AND e.session_id = v_reactivated_session_id
         AND e.action = 'assign'
         AND e.from_tap IS NULL
         AND e.to_tap = v_taps[2]
         AND e.from_status = 'sold_out'
         AND e.to_status = 'available'
         AND e.accuracy = 'exact'
     ) OR EXISTS (
       SELECT 1
       FROM public.tap_lifecycle_events e
       WHERE e.tenant_id = v_tenant_id
         AND e.session_id = v_reactivated_session_id
         AND e.action = 'reactivate'
     ) OR (v_overview->>'current_on_tap_count')::integer
       IS DISTINCT FROM v_before_current_count
     OR coalesce((v_overview->'counts'->>'assign')::integer, 0)
       IS DISTINCT FROM v_before_assign_count + 1
     OR coalesce((v_overview->'counts'->>'clear')::integer, 0)
       IS DISTINCT FROM v_before_clear_count + 1 THEN
    RAISE EXCEPTION 'sold_out -> available did not start a fresh exact cycle: %', v_overview;
  END IF;

  -- Later fixtures use this drink as the active side of swap/replace tests.
  v_available_session_id := v_reactivated_session_id;

  -- The canonical listing writer must produce the same single end/start pair;
  -- its suppressed fallback trigger must not duplicate either boundary.
  v_restarted_session_id := v_new_session_id;

  SELECT public.set_drink_taplist_listing(
    v_new_drink_id,
    false,
    'sold_out',
    v_taps[3]
  )
  INTO v_result;

  IF (
    SELECT count(*)
    FROM public.tap_lifecycle_events e
    WHERE e.tenant_id = v_tenant_id
      AND e.session_id = v_restarted_session_id
      AND e.action = 'sold_out'
      AND e.end_reason = 'sold_out'
      AND e.from_tap = v_taps[3]
      AND e.to_tap IS NULL
  ) <> 1 OR EXISTS (
    SELECT 1
    FROM public.tap_lifecycle_sessions_v1 s
    WHERE s.tenant_id = v_tenant_id
      AND s.drink_id = v_new_drink_id
      AND s.ended_at IS NULL
      AND s.canceled IS NOT TRUE
  ) THEN
    RAISE EXCEPTION 'Canonical listing writer duplicated or missed sold-out boundary';
  END IF;

  SELECT public.set_drink_taplist_listing(
    v_new_drink_id,
    false,
    'new',
    v_taps[3]
  )
  INTO v_result;

  SELECT s.session_id
  INTO v_new_session_id
  FROM public.tap_lifecycle_sessions_v1 s
  WHERE s.tenant_id = v_tenant_id
    AND s.drink_id = v_new_drink_id
    AND s.ended_at IS NULL
    AND s.canceled IS NOT TRUE;

  IF v_new_session_id IS NULL
     OR v_new_session_id = v_restarted_session_id
     OR (
       SELECT count(*)
       FROM public.tap_lifecycle_events e
       WHERE e.tenant_id = v_tenant_id
         AND e.session_id = v_new_session_id
         AND e.action = 'assign'
         AND e.from_tap IS NULL
         AND e.to_tap = v_taps[3]
         AND e.from_status = 'sold_out'
         AND e.to_status = 'new'
     ) <> 1 THEN
    RAISE EXCEPTION 'Canonical sold_out -> new did not create one fresh cycle';
  END IF;

  -- A status change and occupied-tap move can arrive in one canonical call.
  -- sold_out must still end the primary session instead of being hidden inside
  -- a swap operation, while the displaced active session remains continuous.
  v_restarted_session_id := v_new_session_id;

  SELECT public.set_drink_taplist_listing(
    v_new_drink_id,
    false,
    'sold_out',
    v_taps[2]
  )
  INTO v_result;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tap_lifecycle_events e
    WHERE e.tenant_id = v_tenant_id
      AND e.session_id = v_restarted_session_id
      AND e.action = 'sold_out'
      AND e.end_reason = 'sold_out'
      AND e.from_tap = v_taps[3]
      AND e.to_tap IS NULL
      AND e.accuracy = 'exact'
  ) OR EXISTS (
    SELECT 1
    FROM public.tap_lifecycle_sessions_v1 s
    WHERE s.tenant_id = v_tenant_id
      AND s.drink_id = v_new_drink_id
      AND s.ended_at IS NULL
      AND s.canceled IS NOT TRUE
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.tap_lifecycle_sessions_v1 s
    WHERE s.tenant_id = v_tenant_id
      AND s.session_id = v_available_session_id
      AND s.ended_at IS NULL
      AND s.canceled IS NOT TRUE
      AND s.current_tap = v_taps[3]
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.tap_lifecycle_events e
    WHERE e.tenant_id = v_tenant_id
      AND e.session_id = v_available_session_id
      AND e.action = 'move'
      AND e.from_tap = v_taps[2]
      AND e.to_tap = v_taps[3]
  ) THEN
    RAISE EXCEPTION 'Combined occupied-tap move + sold_out left an invalid physical cycle';
  END IF;

  -- Restore the fixture positions for the remaining pending/swap scenarios.
  SELECT public.set_drink_taplist_listing(
    v_new_drink_id,
    false,
    'new',
    v_taps[2]
  )
  INTO v_result;

  SELECT s.session_id
  INTO v_new_session_id
  FROM public.tap_lifecycle_sessions_v1 s
  WHERE s.tenant_id = v_tenant_id
    AND s.drink_id = v_new_drink_id
    AND s.ended_at IS NULL
    AND s.canceled IS NOT TRUE;

  PERFORM public.assign_drink_tap_number(v_new_drink_id, v_taps[3]);

  IF v_new_session_id IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM public.tap_lifecycle_sessions_v1 s
       WHERE s.tenant_id = v_tenant_id
         AND s.session_id = v_new_session_id
         AND s.ended_at IS NULL
         AND s.canceled IS NOT TRUE
         AND s.current_tap = v_taps[3]
     ) OR NOT EXISTS (
       SELECT 1
       FROM public.tap_lifecycle_sessions_v1 s
       WHERE s.tenant_id = v_tenant_id
         AND s.session_id = v_available_session_id
         AND s.ended_at IS NULL
         AND s.canceled IS NOT TRUE
         AND s.current_tap = v_taps[2]
     ) THEN
    RAISE EXCEPTION 'Combined sold-out regression fixture did not restore cleanly';
  END IF;

  -- sold_out describes an unavailable item; without a witnessed new/available
  -- transition it must never create a lifecycle of its own.
  SELECT public.get_tap_lifecycle_overview(v_tenant_id)
  INTO v_overview;
  v_before_current_count := (v_overview->>'current_on_tap_count')::integer;

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
    '__test_pending_to_sold_out__',
    0,
    '杯',
    910007,
    true,
    false,
    'coming_soon',
    NULL
  )
  RETURNING id INTO v_pending_sold_out_drink_id;

  SELECT public.set_drink_taplist_listing(
    v_pending_sold_out_drink_id,
    false,
    'coming_soon',
    v_taps[4]
  )
  INTO v_result;

  PERFORM public.set_drink_taplist_status(
    v_pending_sold_out_drink_id,
    false,
    'sold_out'
  );

  SELECT public.get_tap_lifecycle_overview(v_tenant_id)
  INTO v_overview;

  IF EXISTS (
    SELECT 1
    FROM public.tap_lifecycle_events e
    WHERE e.tenant_id = v_tenant_id
      AND e.drink_id = v_pending_sold_out_drink_id
      AND e.action <> 'plan'
  ) OR (
    SELECT count(*)
    FROM public.tap_lifecycle_events e
    WHERE e.tenant_id = v_tenant_id
      AND e.drink_id = v_pending_sold_out_drink_id
      AND e.action = 'plan'
      AND e.session_id IS NULL
  ) <> 2 OR EXISTS (
    SELECT 1
    FROM public.drink_status_events e
    WHERE e.tenant_id = v_tenant_id
      AND e.drink_id = v_pending_sold_out_drink_id
      AND e.from_status = 'coming_soon'
      AND e.to_status = 'sold_out'
  ) OR EXISTS (
    SELECT 1
    FROM public.tap_lifecycle_sessions_v1 s
    WHERE s.tenant_id = v_tenant_id
      AND s.drink_id = v_pending_sold_out_drink_id
  ) OR (v_overview->>'current_on_tap_count')::integer
       IS DISTINCT FROM v_before_current_count THEN
    RAISE EXCEPTION 'coming_soon -> sold_out incorrectly started a lifecycle';
  END IF;

  PERFORM public.remove_drink_from_tonight(v_pending_sold_out_drink_id);

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
    '__test_direct_sold_out__',
    0,
    '杯',
    910008,
    true,
    false,
    'sold_out',
    NULL
  )
  RETURNING id INTO v_direct_sold_out_drink_id;

  SELECT public.set_drink_taplist_listing(
    v_direct_sold_out_drink_id,
    false,
    'sold_out',
    v_taps[4]
  )
  INTO v_result;

  SELECT public.get_tap_lifecycle_overview(v_tenant_id)
  INTO v_overview;

  IF EXISTS (
    SELECT 1
    FROM public.tap_lifecycle_events e
    WHERE e.tenant_id = v_tenant_id
      AND e.drink_id = v_direct_sold_out_drink_id
  ) OR EXISTS (
    SELECT 1
    FROM public.tap_lifecycle_sessions_v1 s
    WHERE s.tenant_id = v_tenant_id
      AND s.drink_id = v_direct_sold_out_drink_id
  ) OR (v_overview->>'current_on_tap_count')::integer
       IS DISTINCT FROM v_before_current_count THEN
    RAISE EXCEPTION 'Direct sold_out assignment incorrectly started a lifecycle';
  END IF;

  PERFORM public.remove_drink_from_tonight(v_direct_sold_out_drink_id);

  -- A pending/active swap moves the active session and writes one plan move for
  -- the planned item. The planned side must never receive a physical event or
  -- session.
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
    '__test_pending_swap__',
    0,
    '杯',
    910009,
    true,
    false,
    'coming_soon',
    NULL
  )
  RETURNING id INTO v_swap_pending_drink_id;

  SELECT public.set_drink_taplist_listing(
    v_swap_pending_drink_id,
    false,
    'coming_soon',
    v_taps[4]
  )
  INTO v_result;

  SELECT count(*)::integer
  INTO v_before_event_count
  FROM public.tap_lifecycle_events e
  WHERE e.tenant_id = v_tenant_id
    AND e.drink_id = v_swap_pending_drink_id;

  PERFORM public.assign_drink_tap_number(
    v_swap_pending_drink_id,
    v_taps[2]
  );

  SELECT count(*)::integer
  INTO v_after_event_count
  FROM public.tap_lifecycle_events e
  WHERE e.tenant_id = v_tenant_id
    AND e.drink_id = v_swap_pending_drink_id;

  IF v_after_event_count IS DISTINCT FROM v_before_event_count + 1
     OR NOT EXISTS (
       SELECT 1
       FROM public.tap_lifecycle_events e
       WHERE e.tenant_id = v_tenant_id
         AND e.drink_id = v_swap_pending_drink_id
         AND e.action = 'plan'
         AND e.session_id IS NULL
         AND e.from_tap = v_taps[4]
         AND e.to_tap = v_taps[2]
     ) OR EXISTS (
       SELECT 1
       FROM public.tap_lifecycle_events e
       WHERE e.tenant_id = v_tenant_id
         AND e.drink_id = v_swap_pending_drink_id
         AND e.action <> 'plan'
     )
     OR EXISTS (
       SELECT 1
       FROM public.tap_lifecycle_sessions_v1 s
       WHERE s.tenant_id = v_tenant_id
         AND s.drink_id = v_swap_pending_drink_id
     ) OR NOT EXISTS (
       SELECT 1
       FROM public.tap_lifecycle_events e
       WHERE e.tenant_id = v_tenant_id
         AND e.session_id = v_available_session_id
         AND e.action IN ('move', 'swap')
         AND e.from_tap = v_taps[2]
         AND e.to_tap = v_taps[4]
     ) OR NOT EXISTS (
       SELECT 1
       FROM public.tap_lifecycle_sessions_v1 s
       WHERE s.tenant_id = v_tenant_id
         AND s.session_id = v_available_session_id
         AND s.ended_at IS NULL
         AND s.current_tap = v_taps[4]
         AND s.canceled IS NOT TRUE
     ) THEN
    RAISE EXCEPTION 'Pending/active swap did not isolate the real active side';
  END IF;

  -- Replacing that pending slot with an active item starts only the incoming
  -- active cycle and must not fabricate a coming_soon -> sold_out status event.
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
    '__test_active_replaces_pending__',
    0,
    '杯',
    910010,
    true,
    false,
    'available',
    NULL
  )
  RETURNING id INTO v_replace_active_drink_id;

  SELECT count(*)::integer
  INTO v_before_status_event_count
  FROM public.drink_status_events e
  WHERE e.tenant_id = v_tenant_id
    AND e.drink_id = v_swap_pending_drink_id
    AND e.from_status = 'coming_soon'
    AND e.to_status = 'sold_out';

  SELECT public.set_drink_taplist_listing(
    v_replace_active_drink_id,
    false,
    'available',
    v_taps[2]
  )
  INTO v_result;

  SELECT count(*)::integer
  INTO v_after_status_event_count
  FROM public.drink_status_events e
  WHERE e.tenant_id = v_tenant_id
    AND e.drink_id = v_swap_pending_drink_id
    AND e.from_status = 'coming_soon'
    AND e.to_status = 'sold_out';

  SELECT s.session_id, s.accuracy
  INTO v_replace_active_session_id, v_accuracy
  FROM public.tap_lifecycle_sessions_v1 s
  WHERE s.tenant_id = v_tenant_id
    AND s.drink_id = v_replace_active_drink_id
    AND s.ended_at IS NULL
    AND s.canceled IS NOT TRUE;

  IF v_after_status_event_count IS DISTINCT FROM v_before_status_event_count
     OR (
       SELECT count(*)
       FROM public.tap_lifecycle_events e
       WHERE e.tenant_id = v_tenant_id
         AND e.drink_id = v_swap_pending_drink_id
         AND e.action = 'plan'
         AND e.session_id IS NULL
     ) <> 3 OR NOT EXISTS (
       SELECT 1
       FROM public.tap_lifecycle_events e
       WHERE e.tenant_id = v_tenant_id
         AND e.drink_id = v_swap_pending_drink_id
         AND e.action = 'plan'
         AND e.session_id IS NULL
         AND e.from_tap = v_taps[2]
         AND e.to_tap IS NULL
     ) OR EXISTS (
       SELECT 1
       FROM public.tap_lifecycle_events e
       WHERE e.tenant_id = v_tenant_id
         AND e.drink_id = v_swap_pending_drink_id
         AND e.action <> 'plan'
     ) OR EXISTS (
       SELECT 1
       FROM public.tap_lifecycle_sessions_v1 s
       WHERE s.tenant_id = v_tenant_id
         AND s.drink_id = v_swap_pending_drink_id
     ) OR v_replace_active_session_id IS NULL
     OR v_accuracy IS DISTINCT FROM 'exact' THEN
    RAISE EXCEPTION 'Active replacement of pending item created false history';
  END IF;

  -- The opposite replacement direction ends only the outgoing active cycle.
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
    '__test_pending_replaces_active__',
    0,
    '杯',
    910011,
    true,
    false,
    'coming_soon',
    NULL
  )
  RETURNING id INTO v_replace_pending_drink_id;

  SELECT public.set_drink_taplist_listing(
    v_replace_pending_drink_id,
    false,
    'coming_soon',
    v_taps[3]
  )
  INTO v_result;

  IF (
    SELECT count(*)
    FROM public.tap_lifecycle_events e
    WHERE e.tenant_id = v_tenant_id
      AND e.drink_id = v_replace_pending_drink_id
      AND e.action = 'plan'
      AND e.session_id IS NULL
  ) <> 1 OR NOT EXISTS (
    SELECT 1
    FROM public.tap_lifecycle_events e
    WHERE e.tenant_id = v_tenant_id
      AND e.drink_id = v_replace_pending_drink_id
      AND e.action = 'plan'
      AND e.session_id IS NULL
      AND e.from_tap IS NULL
      AND e.to_tap = v_taps[3]
  ) OR EXISTS (
    SELECT 1
    FROM public.tap_lifecycle_events e
    WHERE e.tenant_id = v_tenant_id
      AND e.drink_id = v_replace_pending_drink_id
      AND e.action <> 'plan'
  ) OR EXISTS (
    SELECT 1
    FROM public.tap_lifecycle_sessions_v1 s
    WHERE s.tenant_id = v_tenant_id
      AND s.drink_id = v_replace_pending_drink_id
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.tap_lifecycle_sessions_v1 s
    WHERE s.tenant_id = v_tenant_id
      AND s.session_id = v_new_session_id
      AND s.ended_at IS NOT NULL
      AND s.canceled IS NOT TRUE
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.tap_lifecycle_events e
    WHERE e.tenant_id = v_tenant_id
      AND e.session_id = v_new_session_id
      AND e.from_tap = v_taps[3]
      AND e.to_tap IS NULL
  ) THEN
    RAISE EXCEPTION 'Pending replacement of active item did not isolate the active side';
  END IF;

  -- A sanitized snapshot is immutable history. Later membership or phone
  -- changes must not relabel the old operation when another viewer reads it.
  v_changed_role := CASE v_user_role WHEN 'owner' THEN 'staff' ELSE 'owner' END;
  v_changed_phone := '188' || substr(
    rpad(regexp_replace(v_user_id::text, '[^0-9]', '', 'g'), 10, '9'),
    1,
    10
  );

  UPDATE public.user_roles
  SET role = v_changed_role
  WHERE user_id = v_user_id
    AND tenant_id = v_tenant_id;

  UPDATE public.user_profiles
  SET mobile = v_changed_phone,
      display_name = v_changed_phone
  WHERE user_id = v_user_id;

  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_legacy_actor_id, 'role', 'authenticated')::text,
    true
  );
  PERFORM set_config('request.jwt.claim.sub', v_legacy_actor_id::text, true);

  SELECT public._tap_lifecycle_actor_display_name(
    v_user_id,
    v_tenant_id,
    v_actor_snapshot
  )
  INTO v_actor_display;

  IF v_actor_display IS DISTINCT FROM v_actor_snapshot THEN
    RAISE EXCEPTION
      'Safe actor snapshot changed after role/phone update: stored %, displayed %',
      v_actor_snapshot,
      v_actor_display;
  END IF;

  RAISE NOTICE 'tap_lifecycle_pending_status.sql: all pending paths, mixed operations, safe actors and brewery projection passed';
END $$;

ROLLBACK;
