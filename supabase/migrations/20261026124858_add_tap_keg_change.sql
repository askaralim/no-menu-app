-- Record a physical keg replacement without ending the beer's tap session.
-- A keg change is an internal operating fact. It only changes public state
-- when the drink was sold out, in which case it becomes available again.

ALTER TABLE public.tap_lifecycle_events
  DROP CONSTRAINT IF EXISTS tap_lifecycle_events_action_check;

ALTER TABLE public.tap_lifecycle_events
  ADD CONSTRAINT tap_lifecycle_events_action_check
  CHECK (action IN (
    'assign', 'replace', 'clear', 'move', 'swap',
    'sold_out', 'reactivate', 'archive', 'baseline', 'keg_change'
  ));

-- Keep accuracy local to each side of a multi-drink operation. A missing
-- outgoing session must not downgrade a newly witnessed incoming assignment.
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
  v_primary_accuracy text := 'exact';
  v_other_accuracy text := 'exact';
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
      v_other_accuracy := 'unclassified';
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
      v_primary_accuracy := 'unclassified';
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
        v_other_accuracy := 'unclassified';
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
      v_other_accuracy,
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
      v_primary_accuracy,
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
    v_primary_accuracy,
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
      v_other_accuracy,
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

  -- Discover the tenant without taking a row lock, then follow the same
  -- tenant-advisory-lock -> drink-row-lock order as canonical tap writers.
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
  ORDER BY s.started_at DESC NULLS LAST, s.session_id
  LIMIT 1;

  IF v_session_id IS NULL THEN
    RAISE EXCEPTION 'Active tap lifecycle session not found';
  END IF;

  -- Timestamp the witnessed operation after any lock wait, not when the RPC
  -- first entered and might still have been queued behind another writer.
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
    v_tap,
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

CREATE OR REPLACE FUNCTION public.get_tap_lifecycle_overview(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_data_since timestamptz;
  v_window_start timestamptz;
  v_tap_count integer;
  v_current_on_tap_count integer;
  v_assign_count integer := 0;
  v_clear_count integer := 0;
  v_replace_count integer := 0;
  v_move_count integer := 0;
  v_keg_change_count integer := 0;
  v_operations jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant id is required';
  END IF;

  IF NOT public.taplist_can_view_tenant(p_tenant_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT t.tap_lifecycle_started_at, t.tap_slot_count
  INTO v_data_since, v_tap_count
  FROM public.tenants t
  WHERE t.id = p_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tenant not found';
  END IF;

  v_window_start := greatest(
    coalesce(v_data_since, '-infinity'::timestamptz),
    statement_timestamp() - interval '30 days'
  );

  SELECT count(*)::integer
  INTO v_current_on_tap_count
  FROM public.drinks d
  WHERE d.tenant_id = p_tenant_id
    AND d.enabled = true
    AND d.public_sort_order BETWEEN 1 AND 99;

  SELECT
    count(DISTINCT e.operation_id) FILTER (
      WHERE e.accuracy = 'exact'
        AND e.from_tap IS NULL
        AND e.to_tap IS NOT NULL
    )::integer,
    count(DISTINCT e.operation_id) FILTER (
      WHERE e.accuracy = 'exact'
        AND e.from_tap IS NOT NULL
        AND e.to_tap IS NULL
    )::integer,
    count(DISTINCT e.operation_id) FILTER (
      WHERE e.accuracy = 'exact'
        AND e.action = 'replace'
    )::integer,
    count(DISTINCT e.operation_id) FILTER (
      WHERE e.accuracy = 'exact'
        AND e.action IN ('move', 'swap')
    )::integer,
    count(DISTINCT e.operation_id) FILTER (
      WHERE e.accuracy = 'exact'
        AND e.action = 'keg_change'
    )::integer
  INTO
    v_assign_count,
    v_clear_count,
    v_replace_count,
    v_move_count,
    v_keg_change_count
  FROM public.tap_lifecycle_events e
  WHERE e.tenant_id = p_tenant_id
    AND e.occurred_at >= v_window_start;

  WITH window_events AS (
    SELECT e.*
    FROM public.tap_lifecycle_events e
    WHERE e.tenant_id = p_tenant_id
      AND e.occurred_at >= v_window_start
      AND e.action <> 'baseline'
  ),
  grouped AS (
    SELECT
      e.operation_id,
      (array_agg(e.action ORDER BY e.operation_seq, e.id))[1] AS action,
      min(e.occurred_at) AS occurred_at,
      (array_agg(e.actor_name_snapshot ORDER BY e.operation_seq, e.id))[1] AS actor_name,
      CASE
        WHEN bool_or(e.accuracy = 'unclassified') THEN 'unclassified'
        WHEN bool_or(e.accuracy = 'partial_start') THEN 'partial_start'
        ELSE 'exact'
      END AS accuracy,
      (array_agg(e.drink_id ORDER BY e.operation_seq, e.id))[1] AS first_drink_id,
      (array_agg(e.drink_name_snapshot ORDER BY e.operation_seq, e.id))[1] AS first_drink_name,
      (array_agg(e.from_tap ORDER BY e.operation_seq, e.id))[1] AS first_from_tap,
      (array_agg(e.to_tap ORDER BY e.operation_seq, e.id))[1] AS first_to_tap,
      (array_agg(e.drink_id ORDER BY e.operation_seq, e.id)
        FILTER (WHERE e.from_tap IS NOT NULL AND e.to_tap IS NULL))[1]
        AS outgoing_drink_id,
      (array_agg(e.drink_name_snapshot ORDER BY e.operation_seq, e.id)
        FILTER (WHERE e.from_tap IS NOT NULL AND e.to_tap IS NULL))[1]
        AS outgoing_drink_name,
      (array_agg(e.from_tap ORDER BY e.operation_seq, e.id)
        FILTER (WHERE e.from_tap IS NOT NULL AND e.to_tap IS NULL))[1]
        AS outgoing_tap,
      (array_agg(e.drink_id ORDER BY e.operation_seq, e.id)
        FILTER (WHERE e.from_tap IS NULL AND e.to_tap IS NOT NULL))[1]
        AS incoming_drink_id,
      (array_agg(e.drink_name_snapshot ORDER BY e.operation_seq, e.id)
        FILTER (WHERE e.from_tap IS NULL AND e.to_tap IS NOT NULL))[1]
        AS incoming_drink_name,
      (array_agg(e.to_tap ORDER BY e.operation_seq, e.id)
        FILTER (WHERE e.from_tap IS NULL AND e.to_tap IS NOT NULL))[1]
        AS incoming_tap,
      (array_agg(e.drink_id ORDER BY e.operation_seq, e.id))[2] AS second_drink_id,
      (array_agg(e.drink_name_snapshot ORDER BY e.operation_seq, e.id))[2]
        AS second_drink_name,
      max(
        CASE
          WHEN e.to_tap IS NULL
            AND s.accuracy = 'exact'
            AND s.started_at IS NOT NULL
          THEN greatest(0, floor(extract(epoch FROM (e.occurred_at - s.started_at))))::bigint
          WHEN e.action = 'keg_change'
            AND coalesce(
              previous_keg.started_at,
              CASE WHEN s.accuracy = 'exact' THEN s.started_at END
            ) IS NOT NULL
          THEN greatest(
            0,
            floor(extract(epoch FROM (
              e.occurred_at - coalesce(
                previous_keg.started_at,
                CASE WHEN s.accuracy = 'exact' THEN s.started_at END
              )
            )))::bigint
          )
          ELSE NULL
        END
      ) AS duration_seconds,
      (array_agg(e.end_reason ORDER BY e.operation_seq, e.id)
        FILTER (WHERE e.end_reason IS NOT NULL))[1] AS end_reason
    FROM window_events e
    LEFT JOIN public.tap_lifecycle_sessions_v1 s
      ON s.tenant_id = e.tenant_id
     AND s.session_id = e.session_id
    LEFT JOIN LATERAL (
      SELECT max(prior_event.occurred_at) AS started_at
      FROM public.tap_lifecycle_events prior_event
      WHERE e.action = 'keg_change'
        AND prior_event.tenant_id = e.tenant_id
        AND prior_event.session_id = e.session_id
        AND prior_event.action = 'keg_change'
        AND (
          prior_event.occurred_at,
          prior_event.operation_seq,
          prior_event.id
        ) < (
          e.occurred_at,
          e.operation_seq,
          e.id
        )
    ) previous_keg ON true
    GROUP BY e.operation_id
  ),
  shaped AS (
    SELECT
      g.operation_id,
      g.action,
      g.occurred_at,
      g.actor_name,
      CASE
        WHEN g.action = 'replace' THEN g.outgoing_tap
        ELSE g.first_from_tap
      END AS from_tap,
      CASE
        WHEN g.action = 'replace' THEN g.incoming_tap
        ELSE g.first_to_tap
      END AS to_tap,
      CASE
        WHEN g.action = 'replace' THEN g.incoming_drink_id
        ELSE g.first_drink_id
      END AS drink_id,
      CASE
        WHEN g.action = 'replace' THEN g.incoming_drink_name
        ELSE g.first_drink_name
      END AS drink_name,
      CASE
        WHEN g.action IN ('replace', 'clear', 'archive') THEN
          coalesce(g.outgoing_drink_id, g.first_drink_id)
        WHEN g.action = 'assign' THEN NULL
        WHEN g.action = 'swap' THEN g.second_drink_id
        WHEN g.action = 'move' THEN g.first_drink_id
        ELSE NULL
      END AS previous_drink_id,
      CASE
        WHEN g.action IN ('replace', 'clear', 'archive') THEN
          coalesce(g.outgoing_drink_name, g.first_drink_name)
        WHEN g.action = 'assign' THEN NULL
        WHEN g.action = 'swap' THEN g.second_drink_name
        WHEN g.action = 'move' THEN g.first_drink_name
        ELSE NULL
      END AS previous_drink_name,
      CASE
        WHEN g.action IN ('replace', 'assign') THEN
          coalesce(g.incoming_drink_id, g.first_drink_id)
        WHEN g.action = 'swap' THEN g.first_drink_id
        WHEN g.action = 'move' THEN g.first_drink_id
        ELSE NULL
      END AS next_drink_id,
      CASE
        WHEN g.action IN ('replace', 'assign') THEN
          coalesce(g.incoming_drink_name, g.first_drink_name)
        WHEN g.action = 'swap' THEN g.first_drink_name
        WHEN g.action = 'move' THEN g.first_drink_name
        ELSE NULL
      END AS next_drink_name,
      g.duration_seconds,
      g.accuracy,
      g.end_reason
    FROM grouped g
  )
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'operation_id', s.operation_id,
        'action', s.action,
        'occurred_at', s.occurred_at,
        'actor_name', s.actor_name,
        'from_tap', s.from_tap,
        'to_tap', s.to_tap,
        'drink_id', s.drink_id,
        'drink_name', s.drink_name,
        'previous_drink_id', s.previous_drink_id,
        'previous_drink_name', s.previous_drink_name,
        'next_drink_id', s.next_drink_id,
        'next_drink_name', s.next_drink_name,
        'duration_seconds', s.duration_seconds,
        'accuracy', s.accuracy,
        'end_reason', s.end_reason
      )
      ORDER BY s.occurred_at DESC, s.operation_id
    ),
    '[]'::jsonb
  )
  INTO v_operations
  FROM shaped s;

  RETURN jsonb_build_object(
    'ok', true,
    'data_since', v_data_since,
    'window_days', 30,
    'tap_count', v_tap_count,
    'tap_count_confirmed', v_tap_count IS NOT NULL,
    'current_on_tap_count', v_current_on_tap_count,
    'empty_tap_count', CASE
      WHEN v_tap_count IS NULL THEN NULL
      ELSE greatest(v_tap_count - v_current_on_tap_count, 0)
    END,
    'counts', jsonb_build_object(
      'assign', coalesce(v_assign_count, 0),
      'clear', coalesce(v_clear_count, 0),
      'replace', coalesce(v_replace_count, 0),
      'move', coalesce(v_move_count, 0),
      'keg_change', coalesce(v_keg_change_count, 0)
    ),
    'operations', v_operations
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_tap_lifecycle_overview(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_tap_lifecycle_overview(uuid)
  TO authenticated;

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
      coalesce(k.keg_change_count, 0)::integer AS keg_change_count,
      CASE
        WHEN k.last_keg_changed_at IS NOT NULL THEN k.last_keg_changed_at
        WHEN s.accuracy = 'exact' THEN s.started_at
        ELSE NULL
      END AS current_keg_started_at
    FROM public.tap_lifecycle_sessions_v1 s
    LEFT JOIN LATERAL (
      SELECT
        count(*) FILTER (WHERE e.action = 'keg_change')::integer
          AS keg_change_count,
        max(e.occurred_at) FILTER (WHERE e.action = 'keg_change')
          AS last_keg_changed_at
      FROM public.tap_lifecycle_events e
      WHERE e.tenant_id = s.tenant_id
        AND e.session_id = s.session_id
    ) k ON true
    WHERE s.tenant_id = p_tenant_id
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
        'state', CASE WHEN s.ended_at IS NULL THEN 'active' ELSE 'completed' END,
        'accuracy', s.accuracy,
        'current_tap', s.current_tap,
        'started_at', s.started_at,
        'ended_at', s.ended_at,
        'duration_seconds', CASE
          WHEN s.accuracy <> 'exact' OR s.started_at IS NULL THEN NULL
          ELSE greatest(
            0,
            floor(extract(epoch FROM (coalesce(s.ended_at, statement_timestamp()) - s.started_at)))::bigint
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
          WHEN s.ended_at IS NULL THEN s.start_actor_name
          ELSE coalesce(s.end_actor_name, s.start_actor_name)
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

-- The legacy Web wrapper used to let upsert_drink_product lock a drink row
-- before set_drink_taplist_listing acquired the tenant advisory lock. Acquire
-- the tenant lock at the wrapper boundary so every path uses one lock order.
CREATE OR REPLACE FUNCTION public.upsert_taplist_drink(
  p_tenant_id uuid,
  p_drink jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product jsonb;
  v_listing jsonb;
  v_drink_id uuid;
  v_tap integer;
  v_status text;
  v_visible boolean;
  v_existing_tap integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant id is required';
  END IF;

  IF NOT public.taplist_can_view_tenant(p_tenant_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text, 0));

  v_product := public.upsert_drink_product(p_tenant_id, p_drink);
  IF coalesce((v_product->>'ok')::boolean, false) IS NOT TRUE THEN
    RETURN v_product;
  END IF;

  v_drink_id := (v_product->>'drink_id')::uuid;
  v_status := coalesce(nullif(trim(p_drink->>'public_status'), ''), 'available');
  v_visible := coalesce((p_drink->>'is_public_visible')::boolean, false);

  SELECT d.public_sort_order
  INTO v_existing_tap
  FROM public.drinks d
  WHERE d.id = v_drink_id;

  v_tap := nullif((p_drink->>'public_sort_order')::integer, 0);
  IF v_tap IS NULL THEN
    v_tap := v_existing_tap;
  END IF;
  IF v_tap IS NULL OR v_tap < 1 THEN
    SELECT coalesce(max(d.public_sort_order), 0) + 1
    INTO v_tap
    FROM public.drinks d
    WHERE d.tenant_id = p_tenant_id
      AND d.enabled = true
      AND d.public_sort_order IS NOT NULL;

    IF v_tap > 99 THEN
      RETURN jsonb_build_object(
        'ok', false,
        'errors', jsonb_build_array(jsonb_build_object(
          'field', 'public_sort_order',
          'message', '酒头编号已满，请先移出或调整编号'
        ))
      );
    END IF;
  END IF;

  v_listing := public.set_drink_taplist_listing(
    v_drink_id,
    v_visible,
    v_status,
    v_tap
  );

  IF coalesce((v_listing->>'ok')::boolean, false) IS NOT TRUE THEN
    RETURN v_listing;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'drink_id', v_drink_id,
    'created', coalesce((v_product->>'created')::boolean, false),
    'pos_orderable', coalesce((v_product->>'pos_orderable')::boolean, false),
    'missing_price_warning', coalesce((v_product->>'missing_price_warning')::boolean, false),
    'public_cleared', false,
    'public_sort_order', v_tap
  );
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_taplist_drink(uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_taplist_drink(uuid, jsonb)
  TO authenticated;

-- Make the new RPC signature available to PostgREST immediately after commit.
NOTIFY pgrst, 'reload schema';
