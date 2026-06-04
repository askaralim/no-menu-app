-- Add default serving information to public search results.

CREATE OR REPLACE FUNCTION public.search_public_taplist(
  p_city text DEFAULT NULL,
  p_query text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_city text := coalesce(nullif(trim(p_city), ''), 'Shanghai');
  v_q text := trim(p_query);
  v_pattern text;
BEGIN
  IF v_q = '' THEN
    RETURN jsonb_build_object('ok', true, 'results', '[]'::jsonb);
  END IF;

  v_pattern := '%' || v_q || '%';

  RETURN jsonb_build_object(
    'ok', true,
    'results', coalesce(
      (
        SELECT jsonb_agg(row_obj ORDER BY name_sort)
        FROM (
          SELECT
            jsonb_build_object(
              'drink_id', d.id,
              'name', d.name,
              'brand_name', d.brand_name,
              'image_url', d.image_url,
              'public_status', public.taplist_public_status_zh(d.public_status),
              'default_serving', (
                SELECT jsonb_build_object(
                  'label', so.label,
                  'volume_ml', so.volume_ml,
                  'price', so.price
                )
                FROM public.drink_serving_options so
                WHERE so.drink_id = d.id
                  AND so.is_active = true
                  AND so.price > 0
                ORDER BY so.is_default DESC, so.public_sort_order, so.label
                LIMIT 1
              ),
              'tenant_id', t.id,
              'tenant_slug', t.slug,
              'tenant_display_name', coalesce(nullif(trim(t.display_name), ''), t.name),
              'tenant_district', t.district,
              'tenant_address', t.address,
              'brewery', p.brewery,
              'beer_style', p.beer_style,
              'abv', p.abv
            ) AS row_obj,
            lower(d.name) AS name_sort
          FROM public.drinks d
          INNER JOIN public.tenants t ON t.id = d.tenant_id
          INNER JOIN public.categories c
            ON c.id = d.category_id AND c.tenant_id = d.tenant_id
          LEFT JOIN public.drink_beer_profiles p ON p.drink_id = d.id
          WHERE t.status = 'active'
            AND t.is_public_visible = true
            AND lower(trim(t.city)) = lower(trim(v_city))
            AND d.enabled = true
            AND d.is_public_visible = true
            AND c.enabled = true
            AND c.is_public_visible = true
            AND (
              d.name ILIKE v_pattern
              OR coalesce(d.brand_name, '') ILIKE v_pattern
              OR coalesce(p.brewery, '') ILIKE v_pattern
              OR coalesce(p.beer_style, '') ILIKE v_pattern
              OR coalesce(t.name, '') ILIKE v_pattern
              OR coalesce(t.display_name, '') ILIKE v_pattern
              OR coalesce(t.district, '') ILIKE v_pattern
              OR coalesce(t.address, '') ILIKE v_pattern
            )
          LIMIT 50
        ) sub
      ),
      '[]'::jsonb
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_public_taplist(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.search_public_taplist(text, text) TO authenticated;
