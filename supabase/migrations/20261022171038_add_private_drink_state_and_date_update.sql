-- Private consumer helpers for taplist drink state and venue-date editing.

CREATE OR REPLACE FUNCTION public.get_my_drink_states(p_drink_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_drink_ids uuid[];
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF coalesce(cardinality(p_drink_ids), 0) > 99 THEN
    RAISE EXCEPTION 'Too many drink ids';
  END IF;

  SELECT coalesce(array_agg(id), '{}'::uuid[])
  INTO v_drink_ids
  FROM (
    SELECT DISTINCT requested_id
    FROM unnest(coalesce(p_drink_ids, '{}'::uuid[])) AS requested(requested_id)
    WHERE requested_id IS NOT NULL
  ) requested;

  RETURN jsonb_build_object(
    'ok', true,
    'results', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'drink_id', d.id,
          'light_id', light.id,
          'is_lit', light.id IS NOT NULL,
          'is_current_venue_lit', coalesce(light.is_current_venue_lit, false)
        )
        ORDER BY d.id
      )
      FROM public.drinks d
      LEFT JOIN LATERAL (
        SELECT
          l.id,
          EXISTS (
            SELECT 1
            FROM public.user_drink_venues uv
            WHERE uv.light_id = l.id
              AND uv.tenant_id = d.tenant_id
          ) AS is_current_venue_lit
        FROM public.user_drink_lights l
        WHERE l.user_id = v_user_id
          AND (
            (d.product_id IS NOT NULL AND l.product_id = d.product_id)
            OR (
              d.product_id IS NULL
              AND l.product_id IS NULL
              AND l.provisional_drink_id = d.id
            )
          )
        LIMIT 1
      ) light ON true
      WHERE d.id = ANY(v_drink_ids)
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.update_my_drink_venue_date(
  p_light_id uuid,
  p_tenant_id uuid,
  p_first_drank_on date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_original_at timestamptz;
  v_updated_at timestamptz;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_first_drank_on IS NULL
    OR p_first_drank_on < date '1970-01-01'
    OR p_first_drank_on > (now() AT TIME ZONE 'Asia/Shanghai')::date THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_DATE');
  END IF;

  SELECT uv.first_drank_at
  INTO v_original_at
  FROM public.user_drink_venues uv
  WHERE uv.light_id = p_light_id
    AND uv.tenant_id = p_tenant_id
    AND uv.user_id = v_user_id
  FOR UPDATE;

  IF v_original_at IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'VENUE_RECORD_NOT_FOUND');
  END IF;

  v_updated_at := (
    p_first_drank_on
    + (v_original_at AT TIME ZONE 'Asia/Shanghai')::time
  ) AT TIME ZONE 'Asia/Shanghai';

  UPDATE public.user_drink_venues
  SET first_drank_at = v_updated_at
  WHERE light_id = p_light_id
    AND tenant_id = p_tenant_id
    AND user_id = v_user_id;

  UPDATE public.user_drink_lights l
  SET
    first_lit_at = activity.first_lit_at,
    last_activity_at = activity.last_activity_at,
    updated_at = now()
  FROM (
    SELECT min(first_drank_at) AS first_lit_at, max(first_drank_at) AS last_activity_at
    FROM public.user_drink_venues
    WHERE light_id = p_light_id AND user_id = v_user_id
  ) activity
  WHERE l.id = p_light_id AND l.user_id = v_user_id;

  RETURN jsonb_build_object('ok', true, 'first_drank_at', v_updated_at);
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_drink_states(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_drink_states(uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_drink_states(uuid[]) TO authenticated;

REVOKE ALL ON FUNCTION public.update_my_drink_venue_date(uuid, uuid, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_my_drink_venue_date(uuid, uuid, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_my_drink_venue_date(uuid, uuid, date) TO authenticated;
