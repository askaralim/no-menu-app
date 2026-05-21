-- Consumer-facing Chinese labels for drinks.public_status (DB values stay English).

CREATE OR REPLACE FUNCTION public.taplist_public_status_zh(p_status text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE p_status
    WHEN 'new' THEN '上新'
    WHEN 'available' THEN '在售'
    WHEN 'low' THEN '少量'
    WHEN 'sold_out' THEN '售罄'
    WHEN 'coming_soon' THEN '即将上新'
    ELSE coalesce(nullif(trim(p_status), ''), '在售')
  END;
$$;

CREATE OR REPLACE FUNCTION public.get_public_taplist_drinks(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ok boolean;
BEGIN
  SELECT (t.status = 'active' AND t.is_public_visible)
  INTO v_ok
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
    'drinks', coalesce(
      (
        SELECT jsonb_agg(drink_obj ORDER BY sold_rank, public_sort, name_sort)
        FROM (
          SELECT
            jsonb_build_object(
              'id', d.id,
              'category_id', d.category_id,
              'brand_name', d.brand_name,
              'name', d.name,
              'image_url', d.image_url,
              'public_status', public.taplist_public_status_zh(d.public_status),
              'public_sort_order', d.public_sort_order,
              'beer', (
                SELECT jsonb_build_object(
                  'brewery', p.brewery,
                  'beer_style', p.beer_style,
                  'abv', p.abv,
                  'ibu', p.ibu,
                  'country', p.country
                )
                FROM public.drink_beer_profiles p
                WHERE p.drink_id = d.id
                LIMIT 1
              ),
              'serving_options', (
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
                WHERE so.drink_id = d.id AND so.is_active = true
              )
            ) AS drink_obj,
            CASE WHEN d.public_status = 'sold_out' THEN 1 ELSE 0 END AS sold_rank,
            d.public_sort_order AS public_sort,
            lower(d.name) AS name_sort
          FROM public.drinks d
          INNER JOIN public.categories c
            ON c.id = d.category_id AND c.tenant_id = d.tenant_id
          WHERE d.tenant_id = p_tenant_id
            AND d.enabled = true
            AND d.is_public_visible = true
            AND c.enabled = true
            AND c.is_public_visible = true
        ) x
      ),
      '[]'::jsonb
    )
  );
END;
$$;

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
              'tenant_id', t.id,
              'tenant_slug', t.slug,
              'tenant_display_name', coalesce(nullif(trim(t.display_name), ''), t.name),
              'tenant_district', t.district,
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
            )
          LIMIT 50
        ) sub
      ),
      '[]'::jsonb
    )
  );
END;
$$;
