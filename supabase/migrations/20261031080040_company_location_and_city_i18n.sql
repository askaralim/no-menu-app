-- Move consumer-facing origin data to drink_companies and add bilingual city
-- labels without changing any released RPC signature or removing legacy data.

ALTER TABLE public.drink_companies
  ADD COLUMN IF NOT EXISTS country_en text,
  ADD COLUMN IF NOT EXISTS origin_region_en text;

ALTER TABLE public.taplist_public_cities
  ADD COLUMN IF NOT EXISTS label_en text,
  ADD COLUMN IF NOT EXISTS region_label_en text;

COMMENT ON COLUMN public.drink_companies.country_en IS
  'English country display label. Consumer product origin is derived from the linked company.';
COMMENT ON COLUMN public.drink_companies.origin_region_en IS
  'English province/state/region display label.';
COMMENT ON COLUMN public.drink_products.country_en IS
  'Legacy product-level origin label. New consumer clients derive origin from drink_companies.';

UPDATE public.taplist_public_cities AS c
SET
  label = v.label,
  label_en = v.label_en,
  region_code = v.region_code,
  region_label = v.region_label,
  region_label_en = v.region_label_en,
  updated_at = now()
FROM (
  VALUES
    ('Shanghai', '上海', 'Shanghai', NULL, NULL, NULL),
    ('Beijing', '北京', 'Beijing', NULL, NULL, NULL),
    ('Tianjin', '天津', 'Tianjin', NULL, NULL, NULL),
    ('Qingdao', '青岛', 'Qingdao', 'shandong', '山东', 'Shandong'),
    ('Shenyang', '沈阳', 'Shenyang', 'liaoning', '辽宁', 'Liaoning'),
    ('Linxi', '临沂', 'Linyi', 'shandong', '山东', 'Shandong'),
    ('Changchun', '长春', 'Changchun', 'jilin', '吉林', 'Jilin'),
    ('Binzhou', '滨州', 'Binzhou', 'shandong', '山东', 'Shandong'),
    ('Chengdu', '成都', 'Chengdu', 'sichuan', '四川', 'Sichuan'),
    ('Guiyang', '贵阳', 'Guiyang', 'guizhou', '贵州', 'Guizhou'),
    ('Hangzhou', '杭州', 'Hangzhou', 'zhejiang', '浙江', 'Zhejiang'),
    ('Jiaxing', '嘉兴', 'Jiaxing', 'zhejiang', '浙江', 'Zhejiang'),
    ('Nanjing', '南京', 'Nanjing', 'jiangsu', '江苏', 'Jiangsu'),
    ('Suzhou', '苏州', 'Suzhou', 'jiangsu', '江苏', 'Jiangsu'),
    ('Xi''an', '西安', 'Xi''an', 'shaanxi', '陕西', 'Shaanxi')
) AS v(city, label, label_en, region_code, region_label, region_label_en)
WHERE lower(trim(c.city)) = lower(v.city);

-- Standard country names can be filled deterministically. Unknown values stay
-- null for review in Web Admin.
UPDATE public.drink_companies
SET country_en = CASE lower(trim(country))
  WHEN '中国' THEN 'China'
  WHEN 'china' THEN 'China'
  WHEN '美国' THEN 'United States'
  WHEN 'united states' THEN 'United States'
  WHEN '英国' THEN 'United Kingdom'
  WHEN 'united kingdom' THEN 'United Kingdom'
  WHEN '日本' THEN 'Japan'
  WHEN 'japan' THEN 'Japan'
  WHEN '比利时' THEN 'Belgium'
  WHEN 'belgium' THEN 'Belgium'
  WHEN '德国' THEN 'Germany'
  WHEN 'germany' THEN 'Germany'
  WHEN '加拿大' THEN 'Canada'
  WHEN 'canada' THEN 'Canada'
  WHEN '澳大利亚' THEN 'Australia'
  WHEN 'australia' THEN 'Australia'
  WHEN '新西兰' THEN 'New Zealand'
  WHEN 'new zealand' THEN 'New Zealand'
  WHEN '丹麦' THEN 'Denmark'
  WHEN 'denmark' THEN 'Denmark'
  WHEN '瑞典' THEN 'Sweden'
  WHEN 'sweden' THEN 'Sweden'
  WHEN '俄罗斯' THEN 'Russia'
  WHEN 'russia' THEN 'Russia'
  ELSE country_en
END
WHERE nullif(trim(country_en), '') IS NULL;

CREATE OR REPLACE FUNCTION public.get_public_taplist_cities()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN jsonb_build_object(
    'ok', true,
    'cities', coalesce((
      SELECT jsonb_agg(row_obj ORDER BY sort_order, lower(label), lower(city))
      FROM (
        SELECT jsonb_build_object(
          'city', c.city,
          'label', c.label,
          'label_en', c.label_en,
          'country', c.country,
          'region_code', c.region_code,
          'region_label', c.region_label,
          'region_label_en', c.region_label_en,
          'sort_order', c.sort_order,
          'bar_count', count(t.id)::int
        ) AS row_obj, c.sort_order, c.label, c.city
        FROM public.taplist_public_cities c
        INNER JOIN public.tenants t
          ON lower(trim(t.city)) = lower(trim(c.city))
         AND t.status = 'active'
         AND t.is_public_visible = true
        WHERE c.is_enabled = true
        GROUP BY c.city, c.label, c.label_en, c.country, c.region_code,
          c.region_label, c.region_label_en, c.sort_order
        HAVING count(t.id) > 0
      ) cities
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_taplist_cities() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_taplist_cities() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_drink_company_i18n(
  p_company_id uuid,
  p_country_en text DEFAULT NULL,
  p_origin_region_en text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Unauthorized: super_admin role required';
  END IF;

  UPDATE public.drink_companies
  SET country_en = nullif(trim(p_country_en), ''),
      origin_region_en = nullif(trim(p_origin_region_en), '')
  WHERE id = p_company_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Company not found'; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_drink_company_i18n(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_drink_company_i18n(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_taplist_city_i18n(
  p_city text,
  p_label_en text DEFAULT NULL,
  p_region_code text DEFAULT NULL,
  p_region_label text DEFAULT NULL,
  p_region_label_en text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Unauthorized: super_admin role required';
  END IF;

  UPDATE public.taplist_public_cities
  SET label_en = nullif(trim(p_label_en), ''),
      region_code = nullif(trim(p_region_code), ''),
      region_label = nullif(trim(p_region_label), ''),
      region_label_en = nullif(trim(p_region_label_en), ''),
      updated_at = now()
  WHERE lower(trim(city)) = lower(trim(p_city));

  IF NOT FOUND THEN RAISE EXCEPTION 'City not found'; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_taplist_city_i18n(text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_taplist_city_i18n(text, text, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_taplist_cities()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Unauthorized: super_admin role required';
  END IF;
  RETURN jsonb_build_object('ok', true, 'cities', coalesce((
    SELECT jsonb_agg(row_obj ORDER BY sort_order, lower(label), lower(city))
    FROM (
      SELECT jsonb_build_object(
        'city', c.city, 'label', c.label, 'label_en', c.label_en,
        'country', c.country, 'region_code', c.region_code,
        'region_label', c.region_label, 'region_label_en', c.region_label_en,
        'sort_order', c.sort_order, 'is_enabled', c.is_enabled,
        'updated_at', c.updated_at,
        'active_bar_count', count(t.id) FILTER (WHERE t.status = 'active'),
        'public_bar_count', count(t.id) FILTER (
          WHERE t.status = 'active' AND t.is_public_visible = true
        )
      ) AS row_obj, c.sort_order, c.label, c.city
      FROM public.taplist_public_cities c
      LEFT JOIN public.tenants t ON lower(trim(t.city)) = lower(trim(c.city))
      GROUP BY c.city, c.label, c.label_en, c.country, c.region_code,
        c.region_label, c.region_label_en, c.sort_order, c.is_enabled, c.updated_at
    ) rows
  ), '[]'::jsonb));
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_taplist_cities() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_taplist_cities() TO authenticated;

CREATE OR REPLACE FUNCTION nomenu_i18n.public_drink(item jsonb)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT item || jsonb_build_object(
    'name_en', CASE WHEN d.product_id IS NULL THEN NULL ELSE dp.name_en END,
    'beer', CASE
      WHEN item->'beer' IS NULL OR item->'beer' = 'null'::jsonb THEN item->'beer'
      ELSE item->'beer' || jsonb_build_object(
        'brewery_en', dc.canonical_name_en,
        'country', dc.country,
        'country_en', dc.country_en,
        'origin_region', dc.origin_region,
        'origin_region_en', dc.origin_region_en
      )
    END
  )
  FROM public.drinks d
  LEFT JOIN public.drink_products dp ON dp.id = d.product_id AND dp.status = 'active'
  LEFT JOIN public.drink_companies dc ON dc.id = dp.company_id AND dc.status = 'active'
  WHERE d.id = nullif(item->>'id', '')::uuid;
$$;

REVOKE ALL ON FUNCTION nomenu_i18n.public_drink(jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_public_taplist_drink_i18n(p_slug text, p_drink_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb := public.get_public_taplist_drink(p_slug, p_drink_id);
BEGIN
  IF coalesce((v_result->>'ok')::boolean, false) IS NOT TRUE THEN RETURN v_result; END IF;
  RETURN jsonb_set(v_result, '{drink}', nomenu_i18n.public_drink(v_result->'drink'));
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_taplist_drink_i18n(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_taplist_drink_i18n(text, uuid) TO anon, authenticated;

-- Replace the already additive mini wrappers. Base RPCs remain untouched.
CREATE OR REPLACE FUNCTION public.search_mini_products_i18n(
  p_city text DEFAULT NULL,
  p_query text DEFAULT '',
  p_style text DEFAULT NULL,
  p_brewery text DEFAULT NULL,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_result jsonb := public.search_mini_products(p_city, p_query, p_style, p_brewery, p_offset); v_items jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(item || jsonb_build_object(
    'name_en', CASE WHEN dp.id IS NULL THEN NULL ELSE dp.name_en END,
    'brewery_en', dc.canonical_name_en,
    'country', dc.country,
    'country_en', dc.country_en,
    'origin_region', dc.origin_region,
    'origin_region_en', dc.origin_region_en,
    'venues', coalesce((
      SELECT jsonb_agg(venue || jsonb_build_object('display_name_en', t.display_name_en) ORDER BY venue_ord)
      FROM jsonb_array_elements(coalesce(item->'venues', '[]'::jsonb)) WITH ORDINALITY AS vr(venue, venue_ord)
      LEFT JOIN public.tenants t ON t.id = nullif(venue->>'id', '')::uuid
    ), '[]'::jsonb)
  ) ORDER BY ord), '[]'::jsonb)
  INTO v_items
  FROM jsonb_array_elements(coalesce(v_result->'results', '[]'::jsonb)) WITH ORDINALITY AS rows(item, ord)
  LEFT JOIN public.drink_products dp ON dp.id = nullif(item->>'product_id', '')::uuid AND dp.status = 'active'
  LEFT JOIN public.drink_companies dc ON dc.id = dp.company_id AND dc.status = 'active';
  RETURN jsonb_set(v_result, '{results}', v_items);
END;
$$;

REVOKE ALL ON FUNCTION public.search_mini_products_i18n(text, text, text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_mini_products_i18n(text, text, text, text, integer) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_mini_product_i18n(
  p_product_id uuid DEFAULT NULL,
  p_drink_id uuid DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_source_slug text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_result jsonb := public.get_mini_product(p_product_id, p_drink_id, p_city, p_source_slug); v_product jsonb; v_venues jsonb;
BEGIN
  IF coalesce((v_result->>'ok')::boolean, false) IS NOT TRUE THEN RETURN v_result; END IF;
  SELECT (v_result->'product') || jsonb_build_object(
    'name_en', CASE WHEN dp.id IS NULL THEN NULL ELSE dp.name_en END,
    'brewery_en', dc.canonical_name_en,
    'country', dc.country,
    'country_en', dc.country_en,
    'origin_region', dc.origin_region,
    'origin_region_en', dc.origin_region_en
  ) INTO v_product
  FROM (SELECT nullif(v_result->'product'->>'product_id', '')::uuid AS product_id) source
  LEFT JOIN public.drink_products dp ON dp.id = source.product_id AND dp.status = 'active'
  LEFT JOIN public.drink_companies dc ON dc.id = dp.company_id AND dc.status = 'active';

  SELECT coalesce(jsonb_agg(venue || jsonb_build_object('display_name_en', t.display_name_en) ORDER BY ord), '[]'::jsonb)
  INTO v_venues
  FROM jsonb_array_elements(coalesce(v_result->'venues', '[]'::jsonb)) WITH ORDINALITY AS rows(venue, ord)
  LEFT JOIN public.tenants t ON t.id = nullif(venue->>'id', '')::uuid;
  RETURN jsonb_set(jsonb_set(v_result, '{product}', v_product), '{venues}', v_venues);
END;
$$;

REVOKE ALL ON FUNCTION public.get_mini_product_i18n(uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_mini_product_i18n(uuid, uuid, text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_public_taplist_new_drinks_i18n(p_city text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb := public.get_public_taplist_new_drinks(p_city);
  v_items jsonb;
BEGIN
  IF coalesce((v_result->>'ok')::boolean, false) IS NOT TRUE THEN RETURN v_result; END IF;

  SELECT coalesce(jsonb_agg(item || jsonb_build_object(
    'name_en', CASE WHEN dp.id IS NULL THEN NULL ELSE dp.name_en END,
    'brewery_en', dc.canonical_name_en,
    'country', dc.country,
    'country_en', dc.country_en,
    'origin_region', dc.origin_region,
    'origin_region_en', dc.origin_region_en,
    'tenant_display_name_en', t.display_name_en
  ) ORDER BY ord), '[]'::jsonb)
  INTO v_items
  FROM jsonb_array_elements(coalesce(v_result->'results', '[]'::jsonb)) WITH ORDINALITY AS rows(item, ord)
  LEFT JOIN public.drinks d ON d.id = nullif(item->>'drink_id', '')::uuid
  LEFT JOIN public.drink_products dp ON dp.id = d.product_id AND dp.status = 'active'
  LEFT JOIN public.drink_companies dc ON dc.id = dp.company_id AND dc.status = 'active'
  LEFT JOIN public.tenants t ON t.id = d.tenant_id;

  RETURN jsonb_set(v_result, '{results}', v_items);
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_taplist_new_drinks_i18n(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_taplist_new_drinks_i18n(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_my_followed_bars_i18n()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_result jsonb := public.get_my_followed_bars(); v_items jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(item || jsonb_build_object(
    'tenant_display_name_en', t.display_name_en,
    'tenant_district_en', t.district_en,
    'tenant_city_label_en', c.label_en
  ) ORDER BY ord), '[]'::jsonb)
  INTO v_items
  FROM jsonb_array_elements(coalesce(v_result->'results', '[]'::jsonb)) WITH ORDINALITY AS rows(item, ord)
  LEFT JOIN public.tenants t ON t.id = nullif(item->>'tenant_id', '')::uuid
  LEFT JOIN public.taplist_public_cities c ON lower(trim(c.city)) = lower(trim(t.city));
  RETURN jsonb_set(v_result, '{results}', v_items);
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_followed_bars_i18n() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_followed_bars_i18n() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_drink_history_i18n(p_cursor timestamptz DEFAULT NULL, p_limit integer DEFAULT 60)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_result jsonb := public.get_my_drink_history(p_cursor, p_limit); v_items jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(item || jsonb_build_object(
    'name_en', CASE WHEN dp.id IS NULL THEN NULL ELSE dp.name_en END,
    'brewery_en', dc.canonical_name_en,
    'venues', coalesce((
      SELECT jsonb_agg(venue || jsonb_build_object(
        'tenant_name_en', t.display_name_en,
        'district_en', t.district_en,
        'address_en', t.address_en,
        'city_label_en', c.label_en
      ) ORDER BY venue_ord)
      FROM jsonb_array_elements(coalesce(item->'venues', '[]'::jsonb)) WITH ORDINALITY AS vr(venue, venue_ord)
      LEFT JOIN public.tenants t ON t.id = nullif(venue->>'tenant_id', '')::uuid
      LEFT JOIN public.taplist_public_cities c ON lower(trim(c.city)) = lower(trim(t.city))
    ), '[]'::jsonb)
  ) ORDER BY ord), '[]'::jsonb)
  INTO v_items
  FROM jsonb_array_elements(coalesce(v_result->'results', '[]'::jsonb)) WITH ORDINALITY AS rows(item, ord)
  LEFT JOIN public.drink_products dp ON dp.id = nullif(item->>'product_id', '')::uuid AND dp.status = 'active'
  LEFT JOIN public.drink_companies dc ON dc.id = dp.company_id AND dc.status = 'active';
  RETURN jsonb_set(v_result, '{results}', v_items);
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_drink_history_i18n(timestamptz, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_drink_history_i18n(timestamptz, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_mini_breweries_i18n(p_city text DEFAULT NULL, p_offset integer DEFAULT 0)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_result jsonb := public.list_mini_breweries(p_city, p_offset); v_items jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(item || jsonb_build_object(
    'name_en', details.payload->'brewery'->>'name_en'
  ) ORDER BY ord), '[]'::jsonb)
  INTO v_items
  FROM jsonb_array_elements(coalesce(v_result->'results', '[]'::jsonb)) WITH ORDINALITY AS rows(item, ord)
  CROSS JOIN LATERAL (
    SELECT public.get_mini_brewery(item->>'brewery') AS payload
  ) details;
  RETURN jsonb_set(v_result, '{results}', v_items);
END;
$$;

REVOKE ALL ON FUNCTION public.list_mini_breweries_i18n(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_mini_breweries_i18n(text, integer) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_mini_brewery_i18n(p_name text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_result jsonb := public.get_mini_brewery(p_name); v_company public.drink_companies%ROWTYPE;
BEGIN
  SELECT dc.* INTO v_company
  FROM public.drink_companies dc
  WHERE dc.status = 'active' AND (
    lower(trim(dc.canonical_name)) = lower(trim(p_name))
    OR lower(trim(coalesce(dc.canonical_name_en, ''))) = lower(trim(p_name))
    OR EXISTS (
      SELECT 1 FROM public.drink_company_aliases a
      WHERE a.company_id = dc.id AND a.alias_normalized = lower(trim(p_name))
    )
  )
  ORDER BY dc.updated_at DESC
  LIMIT 1;

  IF v_company.id IS NULL OR v_result->'brewery' IS NULL THEN RETURN v_result; END IF;
  RETURN jsonb_set(v_result, '{brewery}', (v_result->'brewery') || jsonb_build_object(
    'name_en', v_company.canonical_name_en,
    'country', v_company.country,
    'country_en', v_company.country_en,
    'origin_region', v_company.origin_region,
    'origin_region_en', v_company.origin_region_en
  ));
END;
$$;

REVOKE ALL ON FUNCTION public.get_mini_brewery_i18n(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_mini_brewery_i18n(text) TO anon, authenticated;
