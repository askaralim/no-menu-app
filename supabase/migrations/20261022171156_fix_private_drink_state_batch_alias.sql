-- Fix the requested-id aggregate alias in the private drink-state batch helper.

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

  SELECT coalesce(array_agg(requested_id), '{}'::uuid[])
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

REVOKE ALL ON FUNCTION public.get_my_drink_states(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_drink_states(uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_drink_states(uuid[]) TO authenticated;
