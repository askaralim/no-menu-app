-- Additive English DTOs for consumer discovery. Existing RPCs remain unchanged.

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
DECLARE
  v_result jsonb := public.search_mini_products(p_city, p_query, p_style, p_brewery, p_offset);
  v_items jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(
    item || jsonb_build_object(
      'name_en', CASE WHEN dp.id IS NULL THEN NULL ELSE dp.name_en END,
      'brewery_en', dc.canonical_name_en,
      'country_en', dp.country_en,
      'venues', coalesce((
        SELECT jsonb_agg(
          venue || jsonb_build_object('display_name_en', t.display_name_en)
          ORDER BY venue_ord
        )
        FROM jsonb_array_elements(coalesce(item->'venues', '[]'::jsonb)) WITH ORDINALITY AS venue_rows(venue, venue_ord)
        LEFT JOIN public.tenants t ON t.id = nullif(venue->>'id', '')::uuid
      ), '[]'::jsonb)
    )
    ORDER BY ord
  ), '[]'::jsonb)
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
DECLARE
  v_result jsonb := public.get_mini_product(p_product_id, p_drink_id, p_city, p_source_slug);
  v_product jsonb;
  v_venues jsonb;
BEGIN
  IF coalesce((v_result->>'ok')::boolean, false) IS NOT TRUE THEN
    RETURN v_result;
  END IF;

  SELECT (v_result->'product') || jsonb_build_object(
    'name_en', CASE WHEN dp.id IS NULL THEN NULL ELSE dp.name_en END,
    'brewery_en', dc.canonical_name_en,
    'country_en', dp.country_en
  )
  INTO v_product
  FROM (SELECT nullif(v_result->'product'->>'product_id', '')::uuid AS product_id) source
  LEFT JOIN public.drink_products dp ON dp.id = source.product_id AND dp.status = 'active'
  LEFT JOIN public.drink_companies dc ON dc.id = dp.company_id AND dc.status = 'active';

  SELECT coalesce(jsonb_agg(
    venue || jsonb_build_object('display_name_en', t.display_name_en)
    ORDER BY ord
  ), '[]'::jsonb)
  INTO v_venues
  FROM jsonb_array_elements(coalesce(v_result->'venues', '[]'::jsonb)) WITH ORDINALITY AS rows(venue, ord)
  LEFT JOIN public.tenants t ON t.id = nullif(venue->>'id', '')::uuid;

  RETURN jsonb_set(jsonb_set(v_result, '{product}', v_product), '{venues}', v_venues);
END;
$$;

REVOKE ALL ON FUNCTION public.get_mini_product_i18n(uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_mini_product_i18n(uuid, uuid, text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_mini_breweries_i18n(p_city text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb := public.get_mini_breweries(p_city);
  v_items jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(
    item || jsonb_build_object(
      'name_en', public.get_mini_brewery(item->>'brewery')->'brewery'->>'name_en'
    )
    ORDER BY ord
  ), '[]'::jsonb)
  INTO v_items
  FROM jsonb_array_elements(coalesce(v_result->'results', '[]'::jsonb)) WITH ORDINALITY AS rows(item, ord);

  RETURN jsonb_set(v_result, '{results}', v_items);
END;
$$;

REVOKE ALL ON FUNCTION public.get_mini_breweries_i18n(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_mini_breweries_i18n(text) TO anon, authenticated;
