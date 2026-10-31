-- Cursor-paginated dashboard ledger. Keep get_tap_lifecycle_overview(uuid)
-- unchanged for deployed clients; new clients can page only the operations
-- that are visible in the dashboard instead of downloading the full 30-day
-- ledger on every request.

-- Every logical operation has exactly one sequence-1 row and one shared
-- timestamp. This partial index lets the page query seek directly to the next
-- requested logical-operation page before the heavier session/duration work.
CREATE INDEX IF NOT EXISTS tap_lifecycle_events_dashboard_page_idx
  ON public.tap_lifecycle_events (
    tenant_id,
    occurred_at DESC,
    operation_id DESC
  )
  INCLUDE (action, accuracy)
  WHERE operation_seq = 1
    AND action <> 'baseline'
    AND accuracy IN ('exact', 'unclassified');

CREATE OR REPLACE FUNCTION public.get_tap_lifecycle_dashboard_page(
  p_tenant_id uuid,
  p_limit integer DEFAULT 20,
  p_before_occurred_at timestamptz DEFAULT NULL,
  p_before_operation_key text DEFAULT NULL,
  p_include_summary boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_page_size integer := least(greatest(coalesce(p_limit, 20), 1), 100);
  v_before_operation_key text := nullif(trim(p_before_operation_key), '');
  v_before_operation_id uuid;
  v_include_summary boolean := coalesce(p_include_summary, true);
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
  v_has_more boolean := false;
  v_next_cursor jsonb := NULL;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant id is required';
  END IF;
  IF (p_before_occurred_at IS NULL) <> (v_before_operation_key IS NULL) THEN
    RAISE EXCEPTION 'Invalid pagination cursor';
  END IF;
  IF v_before_operation_key IS NOT NULL THEN
    BEGIN
      v_before_operation_id := v_before_operation_key::uuid;
    EXCEPTION
      WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'Invalid pagination cursor';
    END;
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

  IF v_include_summary THEN
    SELECT count(*)::integer
    INTO v_current_on_tap_count
    FROM public.drinks d
    WHERE d.tenant_id = p_tenant_id
      AND d.enabled = true
      AND d.public_sort_order BETWEEN 1 AND 99
      AND (
        d.public_status IN ('new', 'available', 'low')
        OR (
          d.public_status = 'sold_out'
          AND EXISTS (
            SELECT 1
            FROM public.tap_lifecycle_sessions_v1 active_session
            WHERE active_session.tenant_id = d.tenant_id
              AND active_session.drink_id = d.id
              AND active_session.ended_at IS NULL
              AND active_session.canceled IS NOT TRUE
          )
        )
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
     AND s.session_id = e.session_id;
  END IF;

  WITH candidate_operations AS (
    SELECT
      e.operation_id,
      e.operation_id::text AS operation_key,
      e.action,
      e.occurred_at,
      e.accuracy
    FROM public.tap_lifecycle_events e
    WHERE e.tenant_id = p_tenant_id
      AND e.occurred_at >= v_window_start
      AND e.operation_seq = 1
      AND e.action <> 'baseline'
      AND e.accuracy IN ('exact', 'unclassified')
      AND (e.occurred_at, e.operation_id) < (
        coalesce(p_before_occurred_at, 'infinity'::timestamptz),
        coalesce(
          v_before_operation_id,
          'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid
        )
      )
      AND NOT EXISTS (
        -- Exact sold-out reconciliation creates a physical end boundary next
        -- to an older status-only event. Keep the boundary and hide only the
        -- superseded status-only twin, matching the current overview wrapper.
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
          AND legacy.operation_id = e.operation_id
          AND legacy.action = 'sold_out'
          AND legacy.to_status = 'sold_out'
          AND legacy.source IS DISTINCT FROM 'migration_sold_out_reconciliation'
      )
    ORDER BY e.occurred_at DESC, e.operation_id DESC
    LIMIT (v_page_size + 1)
  ),
  limited_candidates AS (
    SELECT
      candidate.*,
      row_number() OVER (
        ORDER BY candidate.occurred_at DESC, candidate.operation_id DESC
      ) AS page_row
    FROM candidate_operations candidate
  ),
  page_candidates AS (
    SELECT candidate.*
    FROM limited_candidates candidate
    WHERE candidate.page_row <= v_page_size
  ),
  operation_events AS (
    SELECT e.*
    FROM public.tap_lifecycle_events e
    JOIN page_candidates page
      ON page.operation_id = e.operation_id
    WHERE e.tenant_id = p_tenant_id
  ),
  grouped AS (
    SELECT
      page.operation_id,
      page.operation_key,
      (array_agg(e.action ORDER BY e.operation_seq, e.id))[1] AS action,
      page.occurred_at,
      (array_agg(e.actor_user_id ORDER BY e.operation_seq, e.id))[1]
        AS actor_user_id,
      (array_agg(e.actor_name_snapshot ORDER BY e.operation_seq, e.id))[1]
        AS actor_name_snapshot,
      page.accuracy,
      (array_agg(e.drink_id ORDER BY e.operation_seq, e.id))[1] AS first_drink_id,
      (array_agg(e.drink_name_snapshot ORDER BY e.operation_seq, e.id))[1]
        AS first_drink_name,
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
            AND e.action <> 'cancel'
            AND s.accuracy = 'exact'
            AND s.started_at IS NOT NULL
            AND s.canceled IS NOT TRUE
          THEN greatest(
            0,
            floor(extract(epoch FROM (e.occurred_at - s.started_at)))::bigint
          )
          WHEN e.action = 'keg_change'
            AND s.canceled IS NOT TRUE
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
    FROM page_candidates page
    JOIN operation_events e
      ON e.operation_id = page.operation_id
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
    GROUP BY
      page.operation_id,
      page.operation_key,
      page.occurred_at,
      page.accuracy
  ),
  shaped AS (
    SELECT
      g.operation_id,
      g.operation_key,
      g.action,
      g.occurred_at,
      g.actor_user_id,
      g.actor_name_snapshot,
      CASE WHEN g.action = 'replace' THEN g.outgoing_tap ELSE g.first_from_tap END
        AS from_tap,
      CASE WHEN g.action = 'replace' THEN g.incoming_tap ELSE g.first_to_tap END
        AS to_tap,
      CASE WHEN g.action = 'replace' THEN g.incoming_drink_id ELSE g.first_drink_id END
        AS drink_id,
      CASE WHEN g.action = 'replace' THEN g.incoming_drink_name ELSE g.first_drink_name END
        AS drink_name,
      CASE
        WHEN g.action IN ('replace', 'clear', 'archive', 'cancel') THEN
          coalesce(g.outgoing_drink_id, g.first_drink_id)
        WHEN g.action = 'assign' THEN NULL
        WHEN g.action = 'swap' THEN g.second_drink_id
        WHEN g.action = 'move' THEN g.first_drink_id
        ELSE NULL
      END AS previous_drink_id,
      CASE
        WHEN g.action IN ('replace', 'clear', 'archive', 'cancel') THEN
          coalesce(g.outgoing_drink_name, g.first_drink_name)
        WHEN g.action = 'assign' THEN NULL
        WHEN g.action = 'swap' THEN g.second_drink_name
        WHEN g.action = 'move' THEN g.first_drink_name
        ELSE NULL
      END AS previous_drink_name,
      CASE
        WHEN g.action IN ('replace', 'assign') THEN
          coalesce(g.incoming_drink_id, g.first_drink_id)
        WHEN g.action IN ('swap', 'move') THEN g.first_drink_id
        ELSE NULL
      END AS next_drink_id,
      CASE
        WHEN g.action IN ('replace', 'assign') THEN
          coalesce(g.incoming_drink_name, g.first_drink_name)
        WHEN g.action IN ('swap', 'move') THEN g.first_drink_name
        ELSE NULL
      END AS next_drink_name,
      CASE
        -- A keg_change can also be the first boundary of a newly reactivated
        -- session. It has no completed keg whose duration can be reported.
        WHEN g.action = 'keg_change' AND g.first_from_tap IS NULL THEN NULL
        ELSE g.duration_seconds
      END AS duration_seconds,
      g.accuracy,
      g.end_reason
    FROM grouped g
  ),
  page_result AS (
    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object(
          'operation_id', s.operation_id,
          'operation_key', s.operation_key,
          'action', s.action,
          'occurred_at', s.occurred_at,
          'actor_name', public._tap_lifecycle_actor_display_name(
            s.actor_user_id,
            p_tenant_id,
            s.actor_name_snapshot
          ),
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
        ORDER BY s.occurred_at DESC, s.operation_id DESC
      ),
      '[]'::jsonb
    ) AS operations
    FROM shaped s
  )
  SELECT
    page_result.operations,
    (SELECT count(*) > v_page_size FROM limited_candidates),
    CASE
      WHEN (SELECT count(*) > v_page_size FROM limited_candidates) THEN (
        SELECT jsonb_build_object(
          'occurred_at', page.occurred_at,
          'operation_key', page.operation_key
        )
        FROM page_candidates page
        WHERE page.page_row = v_page_size
      )
      ELSE NULL
    END
  INTO v_operations, v_has_more, v_next_cursor
  FROM page_result;

  v_result := jsonb_build_object(
    'ok', true,
    'operations', v_operations,
    'pagination', jsonb_build_object(
      'page_size', v_page_size,
      'has_more', coalesce(v_has_more, false),
      'next_cursor', v_next_cursor
    )
  );

  IF v_include_summary THEN
    v_result := v_result || jsonb_build_object(
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
      )
    );
  END IF;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_tap_lifecycle_dashboard_page(
  uuid,
  integer,
  timestamptz,
  text,
  boolean
) IS
  'Returns a stable keyset-paginated page of visible 30-day tap lifecycle operations; summary fields are optional.';

REVOKE ALL ON FUNCTION public.get_tap_lifecycle_dashboard_page(
  uuid,
  integer,
  timestamptz,
  text,
  boolean
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_tap_lifecycle_dashboard_page(
  uuid,
  integer,
  timestamptz,
  text,
  boolean
) TO authenticated;
