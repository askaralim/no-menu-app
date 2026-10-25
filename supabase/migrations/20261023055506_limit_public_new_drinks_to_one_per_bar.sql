-- Keep the existing NEW ON TAP freshness and total result limits, but avoid
-- showing more than one drink from the same bar in the discovery rail.
CREATE OR REPLACE FUNCTION public.get_public_taplist_new_drinks(p_city text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_city text := coalesce(nullif(trim(p_city), ''), 'Shanghai');
BEGIN
  RETURN jsonb_build_object(
    'ok', true,
    'results', coalesce(
      (
        WITH ranked AS (
          SELECT
            jsonb_build_object(
              'drink_id', d.id,
              'name', CASE
                WHEN d.product_id IS NULL THEN d.name
                ELSE coalesce(nullif(trim(d.display_name), ''), dp.name, d.name)
              END,
              'brand_name', d.brand_name,
              'image_url', CASE
                WHEN d.product_id IS NULL THEN d.image_url
                ELSE coalesce(nullif(trim(d.image_url), ''), dp.image_url)
              END,
              'public_status', public.taplist_public_status_zh(d.public_status),
              'product_id', d.product_id,
              'default_serving', (
                CASE
                  WHEN coalesce(t.public_price_mode, 'hide') = 'hide' THEN NULL
                  ELSE (
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
                  )
                END
              ),
              'tenant_id', t.id,
              'tenant_slug', t.slug,
              'tenant_display_name', coalesce(nullif(trim(t.display_name), ''), t.name),
              'tenant_district', t.district,
              'tenant_address', t.address,
              'brewery', coalesce(dp.brewery, dp.brand_name, p.brewery, d.brand_name),
              'beer_style', coalesce(dp.beer_style, p.beer_style),
              'abv', coalesce(dp.abv, p.abv)
            ) AS row_obj,
            d.public_status_changed_at AS status_changed_at,
            d.public_sort_order AS public_sort,
            lower(d.name) AS name_sort,
            row_number() OVER (
              PARTITION BY t.id
              ORDER BY d.public_status_changed_at DESC NULLS LAST, d.public_sort_order, lower(d.name)
            ) AS tenant_rank
          FROM public.drinks d
          INNER JOIN public.tenants t ON t.id = d.tenant_id
          INNER JOIN public.categories c
            ON c.id = d.category_id AND c.tenant_id = d.tenant_id
          LEFT JOIN public.drink_beer_profiles p ON p.drink_id = d.id
          LEFT JOIN public.drink_products dp
            ON dp.id = d.product_id AND dp.status = 'active'
          WHERE t.status = 'active'
            AND t.is_public_visible = true
            AND lower(trim(t.city)) = lower(trim(v_city))
            AND d.enabled = true
            AND d.is_public_visible = true
            AND d.public_sort_order IS NOT NULL
            AND d.public_sort_order >= 1
            AND d.public_status = 'new'
            AND d.public_status_changed_at >= now() - interval '14 days'
            AND c.enabled = true
            AND c.is_public_visible = true
        )
        SELECT jsonb_agg(row_obj ORDER BY status_changed_at DESC NULLS LAST, public_sort, name_sort)
        FROM (
          SELECT row_obj, status_changed_at, public_sort, name_sort
          FROM ranked
          WHERE tenant_rank <= 1
          ORDER BY status_changed_at DESC NULLS LAST, public_sort, name_sort
          LIMIT 10
        ) sub
      ),
      '[]'::jsonb
    )
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_public_taplist_new_drinks(text) TO anon, authenticated;
