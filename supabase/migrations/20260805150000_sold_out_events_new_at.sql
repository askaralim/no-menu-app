-- Enrich monthly sold-out list with last 上新 time before each sold_out.

CREATE OR REPLACE FUNCTION public.list_tenant_sold_out_events_this_month(
  p_tenant_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start timestamptz;
  v_end timestamptz;
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

  v_start := date_trunc('month', (now() AT TIME ZONE 'Asia/Shanghai')) AT TIME ZONE 'Asia/Shanghai';
  v_end := (date_trunc('month', (now() AT TIME ZONE 'Asia/Shanghai')) + interval '1 month')
    AT TIME ZONE 'Asia/Shanghai';

  RETURN jsonb_build_object(
    'ok', true,
    'month_start', v_start,
    'events', coalesce(
      (
        SELECT jsonb_agg(row_obj ORDER BY sold_out_at DESC)
        FROM (
          SELECT
            jsonb_build_object(
              'id', e.id,
              'drink_id', e.drink_id,
              'drink_name', coalesce(nullif(trim(d.display_name), ''), d.name),
              'from_status', e.from_status,
              'to_status', e.to_status,
              'from_status_zh', CASE
                WHEN e.from_status IS NULL THEN NULL
                ELSE public.taplist_public_status_zh(e.from_status)
              END,
              'to_status_zh', public.taplist_public_status_zh(e.to_status),
              'created_at', e.created_at,
              'sold_out_at', e.created_at,
              'new_at', (
                SELECT e2.created_at
                FROM public.drink_status_events e2
                WHERE e2.tenant_id = e.tenant_id
                  AND e2.drink_id = e.drink_id
                  AND e2.to_status = 'new'
                  AND e2.created_at <= e.created_at
                ORDER BY e2.created_at DESC
                LIMIT 1
              )
            ) AS row_obj,
            e.created_at AS sold_out_at
          FROM public.drink_status_events e
          JOIN public.drinks d ON d.id = e.drink_id
          WHERE e.tenant_id = p_tenant_id
            AND e.to_status = 'sold_out'
            AND e.created_at >= v_start
            AND e.created_at < v_end
          ORDER BY e.created_at DESC
          LIMIT 200
        ) x
      ),
      '[]'::jsonb
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_tenant_sold_out_events_this_month(uuid) TO authenticated;
