-- Additive English fields for the first consumer internationalization slice.
-- Existing Chinese payload keys and RPCs remain unchanged so released clients
-- continue to work. The mini program opts into the *_i18n RPC wrappers.

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS display_name_en text,
  ADD COLUMN IF NOT EXISTS district_en text,
  ADD COLUMN IF NOT EXISTS address_en text;

ALTER TABLE public.drink_products
  ADD COLUMN IF NOT EXISTS country_en text;

ALTER TABLE public.bar_tag_definitions
  ADD COLUMN IF NOT EXISTS label_en text,
  ADD COLUMN IF NOT EXISTS category_en text;

UPDATE public.bar_tag_definitions AS d
SET
  label_en = v.label_en,
  category_en = v.category_en
FROM (
  VALUES
    ('seats_small', 'Small venue', 'Size'),
    ('seats_medium', 'Around 20 seats', 'Size'),
    ('seats_large', 'Large space', 'Size'),
    ('outdoor_seating', 'Outdoor seating', 'Space'),
    ('pet_friendly', 'Pet friendly', 'Policies'),
    ('family_friendly', 'Family friendly', 'Policies'),
    ('late_night', 'Open late', 'Amenities'),
    ('wifi', 'Wi-Fi', 'Amenities'),
    ('card_payment', 'Card payment', 'Amenities')
) AS v(key, label_en, category_en)
WHERE d.key = v.key;

CREATE OR REPLACE FUNCTION public.set_tenant_storefront_english(
  p_tenant_id uuid,
  p_display_name_en text DEFAULT NULL,
  p_district_en text DEFAULT NULL,
  p_address_en text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.taplist_can_view_tenant(p_tenant_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  UPDATE public.tenants
  SET
    display_name_en = nullif(trim(p_display_name_en), ''),
    district_en = nullif(trim(p_district_en), ''),
    address_en = nullif(trim(p_address_en), '')
  WHERE id = p_tenant_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_tenant_storefront_english(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_tenant_storefront_english(uuid, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_public_taplist_bars_i18n(p_city text DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(
    jsonb_agg(
      item || jsonb_build_object(
        'display_name_en', t.display_name_en,
        'district_en', t.district_en,
        'address_en', t.address_en
      )
      ORDER BY ord
    ),
    '[]'::jsonb
  )
  FROM jsonb_array_elements(public.get_public_taplist_bars(p_city)) WITH ORDINALITY AS rows(item, ord)
  LEFT JOIN public.tenants t ON t.id = nullif(item->>'id', '')::uuid;
$$;

REVOKE ALL ON FUNCTION public.get_public_taplist_bars_i18n(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_taplist_bars_i18n(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_public_taplist_tenant_i18n(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb := public.get_public_taplist_tenant(p_slug);
  v_tenant_id uuid;
  v_english jsonb;
BEGIN
  IF coalesce((v_result->>'ok')::boolean, false) IS NOT TRUE THEN
    RETURN v_result;
  END IF;

  v_tenant_id := nullif(v_result#>>'{tenant,id}', '')::uuid;
  SELECT jsonb_build_object(
    'display_name_en', t.display_name_en,
    'district_en', t.district_en,
    'address_en', t.address_en,
    'tags', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'key', d.key,
          'label', d.label_zh,
          'label_en', d.label_en
        )
        ORDER BY d.sort_order, d.key
      )
      FROM public.tenant_bar_tags tbt
      INNER JOIN public.bar_tag_definitions d ON d.key = tbt.tag_key
      WHERE tbt.tenant_id = t.id
    ), '[]'::jsonb)
  )
  INTO v_english
  FROM public.tenants t
  WHERE t.id = v_tenant_id;

  RETURN jsonb_set(v_result, '{tenant}', (v_result->'tenant') || coalesce(v_english, '{}'::jsonb));
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_taplist_tenant_i18n(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_taplist_tenant_i18n(text) TO anon, authenticated;

CREATE SCHEMA IF NOT EXISTS nomenu_i18n;
REVOKE ALL ON SCHEMA nomenu_i18n FROM PUBLIC, anon, authenticated;

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
        'country_en', dp.country_en
      )
    END
  )
  FROM public.drinks d
  LEFT JOIN public.drink_products dp ON dp.id = d.product_id AND dp.status = 'active'
  LEFT JOIN public.drink_companies dc ON dc.id = dp.company_id AND dc.status = 'active'
  WHERE d.id = nullif(item->>'id', '')::uuid;
$$;

REVOKE ALL ON FUNCTION nomenu_i18n.public_drink(jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_public_taplist_drinks_i18n(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb := public.get_public_taplist_drinks(p_tenant_id);
  v_key text;
  v_items jsonb;
BEGIN
  IF coalesce((v_result->>'ok')::boolean, false) IS NOT TRUE THEN
    RETURN v_result;
  END IF;

  FOREACH v_key IN ARRAY ARRAY['drinks', 'coming_soon', 'recently_sold_out'] LOOP
    SELECT coalesce(jsonb_agg(nomenu_i18n.public_drink(item) ORDER BY ord), '[]'::jsonb)
    INTO v_items
    FROM jsonb_array_elements(coalesce(v_result->v_key, '[]'::jsonb)) WITH ORDINALITY AS rows(item, ord);
    v_result := jsonb_set(v_result, ARRAY[v_key], v_items);
  END LOOP;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_taplist_drinks_i18n(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_taplist_drinks_i18n(uuid) TO anon, authenticated;

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
  IF coalesce((v_result->>'ok')::boolean, false) IS NOT TRUE THEN
    RETURN v_result;
  END IF;

  SELECT coalesce(
    jsonb_agg(
      item || jsonb_build_object(
        'name_en', CASE WHEN d.product_id IS NULL THEN NULL ELSE dp.name_en END,
        'brewery_en', dc.canonical_name_en,
        'country_en', dp.country_en,
        'tenant_display_name_en', t.display_name_en
      )
      ORDER BY ord
    ),
    '[]'::jsonb
  )
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

COMMENT ON COLUMN public.drink_products.country_en IS
  'English country/origin label for consumer display. Product-pool products only.';
COMMENT ON COLUMN public.tenants.display_name_en IS
  'Optional English public venue name.';
