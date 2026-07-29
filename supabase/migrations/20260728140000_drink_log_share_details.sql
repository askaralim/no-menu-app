-- Add share/detail metadata to drink history and increase summary recents to 9.

CREATE OR REPLACE FUNCTION public.get_my_drink_history(p_cursor timestamptz DEFAULT NULL, p_limit integer DEFAULT 60)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  RETURN jsonb_build_object(
    'ok', true,
    'results', coalesce((
      SELECT jsonb_agg(row_obj ORDER BY activity_at DESC)
      FROM (
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
        ) AS row_obj,
        l.last_activity_at AS activity_at
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
        WHERE l.user_id = v_user_id
          AND (p_cursor IS NULL OR l.last_activity_at < p_cursor)
        ORDER BY l.last_activity_at DESC
        LIMIT greatest(1, least(coalesce(p_limit, 60), 100))
      ) rows
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_drink_summary()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_history jsonb;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  v_history := public.get_my_drink_history(NULL, 9);
  RETURN jsonb_build_object(
    'ok', true,
    'drink_count', (SELECT count(*) FROM public.user_drink_lights WHERE user_id = v_user_id),
    'bar_count', (SELECT count(DISTINCT tenant_id) FROM public.user_drink_venues WHERE user_id = v_user_id),
    'started_at', (SELECT min(first_lit_at) FROM public.user_drink_lights WHERE user_id = v_user_id),
    'recent', coalesce(v_history->'results', '[]'::jsonb)
  );
END;
$$;
