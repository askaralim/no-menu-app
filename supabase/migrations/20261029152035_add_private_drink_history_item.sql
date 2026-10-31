-- Fetch one private TAP-history item directly so older records do not depend
-- on the paginated history-list window.

CREATE OR REPLACE FUNCTION public.get_my_drink_history_item(p_light_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_result jsonb;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT jsonb_build_object(
    'light_id', l.id,
    'product_id', l.product_id,
    'source_drink_id', coalesce(representative.source_drink_id, l.provisional_drink_id),
    'source_drink_is_public', coalesce(representative.source_drink_is_public, false),
    'tenant_slug', representative.tenant_slug,
    'name', coalesce(dp.name, representative.drink_name),
    'brewery', coalesce(dp.brewery, representative.brewery, representative.brand_name),
    'beer_style', coalesce(dp.beer_style, representative.beer_style),
    'abv', coalesce(dp.abv, representative.abv),
    'ibu', coalesce(dp.ibu, representative.ibu),
    'country', coalesce(dp.country, representative.country),
    'image_url', coalesce(dp.image_url, representative.image_url),
    'first_lit_at', l.first_lit_at,
    'last_activity_at', l.last_activity_at,
    'venue_count', (SELECT count(*) FROM public.user_drink_venues uv WHERE uv.light_id = l.id),
    'venues', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'tenant_id', uv.tenant_id,
        'tenant_name', coalesce(t.display_name, t.name),
        'tenant_slug', t.slug,
        'country', t.country,
        'city', t.city,
        'city_label', public.taplist_default_city_label(t.city),
        'district', t.district,
        'address', t.address,
        'first_drank_at', uv.first_drank_at
      ) ORDER BY uv.first_drank_at DESC)
      FROM public.user_drink_venues uv
      JOIN public.tenants t ON t.id = uv.tenant_id
      WHERE uv.light_id = l.id
    ), '[]'::jsonb)
  )
  INTO v_result
  FROM public.user_drink_lights l
  LEFT JOIN public.drink_products dp ON dp.id = l.product_id
  LEFT JOIN LATERAL (
    SELECT
      uv.source_drink_id,
      t.slug AS tenant_slug,
      d.name AS drink_name,
      d.brand_name,
      d.image_url,
      p.brewery,
      p.beer_style,
      p.abv,
      p.ibu,
      p.country,
      (
        t.status = 'active'
        AND t.is_public_visible = true
        AND d.enabled = true
        AND d.is_public_visible = true
        AND c.enabled = true
        AND c.is_public_visible = true
      ) AS source_drink_is_public
    FROM public.user_drink_venues uv
    LEFT JOIN public.drinks d ON d.id = uv.source_drink_id
    LEFT JOIN public.categories c
      ON c.id = d.category_id AND c.tenant_id = d.tenant_id
    LEFT JOIN public.drink_beer_profiles p ON p.drink_id = d.id
    JOIN public.tenants t ON t.id = uv.tenant_id
    WHERE uv.light_id = l.id
    ORDER BY uv.first_drank_at DESC
    LIMIT 1
  ) representative ON true
  WHERE l.id = p_light_id
    AND l.user_id = v_user_id;

  RETURN jsonb_build_object('ok', true, 'result', v_result);
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_drink_history_item(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_drink_history_item(uuid) TO authenticated;
