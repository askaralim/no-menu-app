-- Main public bar taplist: order by tap number (public_sort_order), not status.
-- Keep sold_out / coming_soon in separate partitions.

CREATE OR REPLACE FUNCTION public.get_public_taplist_drinks(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ok boolean;
  v_mode text;
  v_biz_start timestamptz := public.taplist_business_day_start(now());
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

  RETURN (
    WITH base AS (
      SELECT
        d.id,
        d.category_id,
        d.brand_name,
        d.public_status,
        d.public_sort_order,
        d.public_status_changed_at,
        d.product_id,
        CASE
          WHEN d.product_id IS NULL THEN d.name
          ELSE coalesce(nullif(trim(d.display_name), ''), dp.name, d.name)
        END AS display_name,
        CASE
          WHEN d.product_id IS NULL THEN d.image_url
          ELSE coalesce(nullif(trim(d.image_url), ''), dp.image_url)
        END AS image_url,
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
        END AS description,
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
        END AS serving_options
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
        AND c.enabled = true
        AND c.is_public_visible = true
    ),
    shaped AS (
      SELECT
        jsonb_build_object(
          'id', b.id,
          'category_id', b.category_id,
          'brand_name', b.brand_name,
          'name', b.display_name,
          'image_url', b.image_url,
          'public_status', public.taplist_public_status_zh(b.public_status),
          'public_sort_order', b.public_sort_order,
          'product_id', b.product_id,
          'public_status_changed_at', b.public_status_changed_at,
          'beer', CASE
            WHEN b.brewery IS NULL
              AND b.beer_style IS NULL
              AND b.abv IS NULL
              AND b.ibu IS NULL
              AND b.country IS NULL
              AND b.description IS NULL
            THEN NULL
            ELSE jsonb_build_object(
              'brewery', b.brewery,
              'beer_style', b.beer_style,
              'abv', b.abv,
              'ibu', b.ibu,
              'country', b.country,
              'description', b.description
            )
          END,
          'serving_options', b.serving_options
        ) AS drink_obj,
        b.public_status,
        b.public_sort_order,
        b.public_status_changed_at,
        lower(b.display_name) AS name_sort
      FROM base b
    )
    SELECT jsonb_build_object(
      'ok', true,
      'public_price_mode', v_mode,
      'business_day_start', v_biz_start,
      'drinks', coalesce(
        (
          SELECT jsonb_agg(drink_obj ORDER BY public_sort_order, name_sort)
          FROM shaped
          WHERE public_status NOT IN ('sold_out', 'coming_soon')
        ),
        '[]'::jsonb
      ),
      'coming_soon', coalesce(
        (
          SELECT jsonb_agg(drink_obj ORDER BY public_sort_order, name_sort)
          FROM shaped
          WHERE public_status = 'coming_soon'
        ),
        '[]'::jsonb
      ),
      'recently_sold_out', coalesce(
        (
          SELECT jsonb_agg(drink_obj ORDER BY public_status_changed_at DESC NULLS LAST, public_sort_order, name_sort)
          FROM shaped
          WHERE public_status = 'sold_out'
            AND public_status_changed_at IS NOT NULL
            AND public_status_changed_at >= v_biz_start
        ),
        '[]'::jsonb
      )
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_taplist_drinks(uuid) TO anon, authenticated;
