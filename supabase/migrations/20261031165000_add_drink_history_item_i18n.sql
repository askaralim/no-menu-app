-- Additive private-history detail wrapper. Released clients keep the original
-- RPC; new clients receive product-pool English data and company-level origin.

CREATE OR REPLACE FUNCTION public.get_my_drink_history_item_i18n(p_light_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb := public.get_my_drink_history_item(p_light_id);
  v_item jsonb;
  v_venues jsonb;
BEGIN
  IF v_result->'result' IS NULL OR v_result->'result' = 'null'::jsonb THEN
    RETURN v_result;
  END IF;

  SELECT (v_result->'result') || jsonb_build_object(
    'name_en', CASE WHEN dp.id IS NULL THEN NULL ELSE dp.name_en END,
    'brewery_en', dc.canonical_name_en,
    'country', dc.country,
    'country_en', dc.country_en,
    'origin_region', dc.origin_region,
    'origin_region_en', dc.origin_region_en
  )
  INTO v_item
  FROM (SELECT nullif(v_result->'result'->>'product_id', '')::uuid AS product_id) source
  LEFT JOIN public.drink_products dp ON dp.id = source.product_id AND dp.status = 'active'
  LEFT JOIN public.drink_companies dc ON dc.id = dp.company_id AND dc.status = 'active';

  SELECT coalesce(jsonb_agg(venue || jsonb_build_object(
    'tenant_name_en', t.display_name_en,
    'city_label_en', c.label_en,
    'district_en', t.district_en,
    'address_en', t.address_en
  ) ORDER BY ord), '[]'::jsonb)
  INTO v_venues
  FROM jsonb_array_elements(coalesce(v_result->'result'->'venues', '[]'::jsonb)) WITH ORDINALITY AS rows(venue, ord)
  LEFT JOIN public.tenants t ON t.id = nullif(venue->>'tenant_id', '')::uuid
  LEFT JOIN public.taplist_public_cities c ON lower(trim(c.city)) = lower(trim(t.city));

  RETURN jsonb_set(v_result, '{result}', jsonb_set(v_item, '{venues}', v_venues));
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_drink_history_item_i18n(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_drink_history_item_i18n(uuid)
  TO authenticated;
