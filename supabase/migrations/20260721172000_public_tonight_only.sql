-- Public taplist only includes drinks currently on tonight (public_sort_order >= 1).
-- Catalog-only rows with is_public_visible must not appear on Consumer.

CREATE OR REPLACE FUNCTION public.get_public_taplist_drinks(p_tenant_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ok boolean;
  v_mode text;
BEGIN
  SELECT (t.status = 'active' AND t.is_public_visible), coalesce(t.public_price_mode, 'hide')
  INTO v_ok, v_mode
  FROM public.tenants t
  WHERE t.id = p_tenant_id;

  IF v_ok IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END IF;

  IF NOT v_ok THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_public');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'public_price_mode', v_mode,
    'drinks', coalesce(
      (
        SELECT jsonb_agg(drink_obj ORDER BY sold_rank, public_sort, name_sort)
        FROM (
          SELECT
            jsonb_build_object(
              'id', d.id,
              'category_id', d.category_id,
              'brand_name', d.brand_name,
              'name', CASE
                WHEN d.product_id IS NULL THEN d.name
                ELSE coalesce(nullif(trim(d.display_name), ''), dp.name, d.name)
              END,
              'image_url', CASE
                WHEN d.product_id IS NULL THEN d.image_url
                ELSE coalesce(nullif(trim(d.image_url), ''), dp.image_url)
              END,
              'public_status', public.taplist_public_status_zh(d.public_status),
              'public_sort_order', d.public_sort_order,
              'product_id', d.product_id,
              'beer', (
                SELECT CASE
                  WHEN sub.brewery IS NULL
                    AND sub.beer_style IS NULL
                    AND sub.abv IS NULL
                    AND sub.ibu IS NULL
                    AND sub.country IS NULL
                    AND sub.description IS NULL
                  THEN NULL
                  ELSE jsonb_build_object(
                    'brewery', sub.brewery,
                    'beer_style', sub.beer_style,
                    'abv', sub.abv,
                    'ibu', sub.ibu,
                    'country', sub.country,
                    'description', sub.description
                  )
                END
                FROM (
                  SELECT
                    coalesce(dp.brewery, dp.brand_name, p.brewery, d.brand_name) AS brewery,
                    coalesce(dp.beer_style, p.beer_style) AS beer_style,
                    coalesce(dp.abv, p.abv) AS abv,
                    coalesce(dp.ibu, p.ibu) AS ibu,
                    coalesce(dp.country, p.country) AS country,
                    CASE
                      WHEN d.product_id IS NULL THEN p.description
                      ELSE coalesce(
                        nullif(trim(d.display_description), ''),
                        dp.tasting_note,
                        dp.description,
                        p.description
                      )
                    END AS description
                ) sub
              ),
              'serving_options', (
                CASE
                  WHEN v_mode = 'hide' THEN '[]'::jsonb
                  ELSE (
                    SELECT coalesce(
                      jsonb_agg(
                        jsonb_build_object(
                          'id', so.id,
                          'serving_type', so.serving_type,
                          'label', so.label,
                          'volume_ml', so.volume_ml,
                          'price', so.price,
                          'is_default', so.is_default,
                          'is_active', so.is_active,
                          'public_sort_order', so.public_sort_order
                        )
                        ORDER BY so.public_sort_order, so.label
                      ),
                      '[]'::jsonb
                    )
                    FROM public.drink_serving_options so
                    WHERE so.drink_id = d.id
                      AND so.is_active = true
                      AND so.price > 0
                  )
                END
              )
            ) AS drink_obj,
            CASE WHEN d.public_status = 'sold_out' THEN 1 ELSE 0 END AS sold_rank,
            d.public_sort_order AS public_sort,
            lower(d.name) AS name_sort
          FROM public.drinks d
          INNER JOIN public.categories c
            ON c.id = d.category_id AND c.tenant_id = d.tenant_id
          LEFT JOIN public.drink_beer_profiles p ON p.drink_id = d.id
          LEFT JOIN public.drink_products dp
            ON dp.id = d.product_id AND dp.status = 'active'
          WHERE d.tenant_id = p_tenant_id
            AND d.enabled = true
            AND d.is_public_visible = true
            AND d.public_sort_order IS NOT NULL
            AND d.public_sort_order >= 1
            AND d.public_sort_order IS NOT NULL
            AND d.public_sort_order >= 1
            AND c.enabled = true
            AND c.is_public_visible = true
        ) x
      ),
      '[]'::jsonb
    )
  );
END;
$function$;

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
          WHERE tenant_rank <= 2
          ORDER BY status_changed_at DESC NULLS LAST, public_sort, name_sort
          LIMIT 10
        ) sub
      ),
      '[]'::jsonb
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.search_public_taplist(p_city text DEFAULT NULL::text, p_query text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
            lower(d.name) AS name_sort
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
            AND d.public_sort_order IS NOT NULL
            AND d.public_sort_order >= 1
            AND c.enabled = true
            AND c.is_public_visible = true
            AND (
              d.name ILIKE v_pattern
              OR coalesce(d.brand_name, '') ILIKE v_pattern
              OR coalesce(p.brewery, '') ILIKE v_pattern
              OR coalesce(p.beer_style, '') ILIKE v_pattern
              OR coalesce(dp.name, '') ILIKE v_pattern
              OR coalesce(dp.name_en, '') ILIKE v_pattern
              OR coalesce(dp.brand_name, '') ILIKE v_pattern
              OR coalesce(dp.brewery, '') ILIKE v_pattern
              OR coalesce(dp.beer_style, '') ILIKE v_pattern
              OR EXISTS (
                SELECT 1
                FROM unnest(dp.aliases) AS alias_item
                WHERE alias_item ILIKE v_pattern
              )
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
$function$;
