-- Keep brewery city separate from province/state. Existing product-level and
-- region fields stay intact for old clients; new i18n DTOs add city keys.

ALTER TABLE public.drink_companies
  ADD COLUMN IF NOT EXISTS origin_city text,
  ADD COLUMN IF NOT EXISTS origin_city_en text;

COMMENT ON COLUMN public.drink_companies.origin_city IS
  'Company city/locality in the primary language; independent from province/state.';
COMMENT ON COLUMN public.drink_companies.origin_city_en IS
  'English company city/locality used by consumer i18n DTOs.';

CREATE OR REPLACE FUNCTION public.admin_set_drink_company_origin_city(
  p_company_id uuid,
  p_origin_city text DEFAULT NULL,
  p_origin_city_en text DEFAULT NULL
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
  SET origin_city = nullif(trim(p_origin_city), ''),
      origin_city_en = nullif(trim(p_origin_city_en), '')
  WHERE id = p_company_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Company not found'; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_drink_company_origin_city(uuid, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_drink_company_origin_city(uuid, text, text)
  TO authenticated;

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
        'origin_region_en', dc.origin_region_en,
        'origin_city', dc.origin_city,
        'origin_city_en', dc.origin_city_en
      )
    END
  )
  FROM public.drinks d
  LEFT JOIN public.drink_products dp ON dp.id = d.product_id AND dp.status = 'active'
  LEFT JOIN public.drink_companies dc ON dc.id = dp.company_id AND dc.status = 'active'
  WHERE d.id = nullif(item->>'id', '')::uuid;
$$;

REVOKE ALL ON FUNCTION nomenu_i18n.public_drink(jsonb)
  FROM PUBLIC, anon, authenticated;

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
    'origin_city', dc.origin_city,
    'origin_city_en', dc.origin_city_en,
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
    'origin_region_en', dc.origin_region_en,
    'origin_city', dc.origin_city,
    'origin_city_en', dc.origin_city_en
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
DECLARE v_result jsonb := public.get_public_taplist_new_drinks(p_city); v_items jsonb;
BEGIN
  IF coalesce((v_result->>'ok')::boolean, false) IS NOT TRUE THEN RETURN v_result; END IF;
  SELECT coalesce(jsonb_agg(item || jsonb_build_object(
    'name_en', CASE WHEN dp.id IS NULL THEN NULL ELSE dp.name_en END,
    'brewery_en', dc.canonical_name_en,
    'country', dc.country,
    'country_en', dc.country_en,
    'origin_region', dc.origin_region,
    'origin_region_en', dc.origin_region_en,
    'origin_city', dc.origin_city,
    'origin_city_en', dc.origin_city_en,
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
    'country', dc.country,
    'country_en', dc.country_en,
    'origin_region', dc.origin_region,
    'origin_region_en', dc.origin_region_en,
    'origin_city', dc.origin_city,
    'origin_city_en', dc.origin_city_en,
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

CREATE OR REPLACE FUNCTION public.get_my_drink_history_item_i18n(p_light_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_result jsonb := public.get_my_drink_history_item(p_light_id); v_item jsonb; v_venues jsonb;
BEGIN
  IF v_result->'result' IS NULL OR v_result->'result' = 'null'::jsonb THEN RETURN v_result; END IF;
  SELECT (v_result->'result') || jsonb_build_object(
    'name_en', CASE WHEN dp.id IS NULL THEN NULL ELSE dp.name_en END,
    'brewery_en', dc.canonical_name_en,
    'country', dc.country,
    'country_en', dc.country_en,
    'origin_region', dc.origin_region,
    'origin_region_en', dc.origin_region_en,
    'origin_city', dc.origin_city,
    'origin_city_en', dc.origin_city_en
  ) INTO v_item
  FROM (SELECT nullif(v_result->'result'->>'product_id', '')::uuid AS product_id) source
  LEFT JOIN public.drink_products dp ON dp.id = source.product_id AND dp.status = 'active'
  LEFT JOIN public.drink_companies dc ON dc.id = dp.company_id AND dc.status = 'active';

  SELECT coalesce(jsonb_agg(venue || jsonb_build_object(
    'tenant_name_en', t.display_name_en, 'city_label_en', c.label_en,
    'district_en', t.district_en, 'address_en', t.address_en
  ) ORDER BY ord), '[]'::jsonb)
  INTO v_venues
  FROM jsonb_array_elements(coalesce(v_result->'result'->'venues', '[]'::jsonb)) WITH ORDINALITY AS rows(venue, ord)
  LEFT JOIN public.tenants t ON t.id = nullif(venue->>'tenant_id', '')::uuid
  LEFT JOIN public.taplist_public_cities c ON lower(trim(c.city)) = lower(trim(t.city));
  RETURN jsonb_set(v_result, '{result}', jsonb_set(v_item, '{venues}', v_venues));
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_drink_history_item_i18n(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_drink_history_item_i18n(uuid) TO authenticated;

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
    'origin_region_en', v_company.origin_region_en,
    'origin_city', v_company.origin_city,
    'origin_city_en', v_company.origin_city_en
  ));
END;
$$;

REVOKE ALL ON FUNCTION public.get_mini_brewery_i18n(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_mini_brewery_i18n(text) TO anon, authenticated;
