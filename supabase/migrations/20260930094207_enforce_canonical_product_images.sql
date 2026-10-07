-- Keep first-party product images in the product namespace. The constraint is
-- initially NOT VALID so existing legacy rows can be migrated without blocking
-- deployment; PostgreSQL still enforces it for all new and updated rows.
ALTER TABLE public.drink_products
  ADD CONSTRAINT drink_products_canonical_first_party_image
  CHECK (
    image_url IS NULL
    OR image_url ~ (
      '^https://img\.nomenuapp\.com/prod/products/' ||
      id::text ||
      '/[A-Za-z0-9_-][A-Za-z0-9._-]{0,119}$'
    )
    OR (
      image_url !~ '^https://img\.nomenuapp\.com/'
      AND image_url !~ '^https://agtujigvxxdppngirqtu\.supabase\.co/storage/v1/object/public/taplist-media/'
    )
  ) NOT VALID;

-- A drink image must be archived after the new product id exists. Keep external
-- URLs as-is, but never copy a first-party drink URL into the product row.
CREATE OR REPLACE FUNCTION public.admin_create_drink_product_from_drink(
  p_drink_id uuid,
  p_auto_link boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_drink record;
  v_profile record;
  v_product_id uuid;
  v_product_image_url text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Unauthorized: super_admin role required';
  END IF;

  SELECT d.id, d.name, d.brand_name, d.image_url
  INTO v_drink
  FROM public.drinks d
  WHERE d.id = p_drink_id;

  IF v_drink.id IS NULL THEN
    RAISE EXCEPTION 'Drink not found';
  END IF;

  SELECT p.brewery, p.beer_style, p.abv, p.ibu, p.country, p.description
  INTO v_profile
  FROM public.drink_beer_profiles p
  WHERE p.drink_id = p_drink_id;

  v_product_image_url := nullif(trim(v_drink.image_url), '');
  IF v_product_image_url ~ '^https://img\.nomenuapp\.com/'
    OR v_product_image_url ~ '^https://agtujigvxxdppngirqtu\.supabase\.co/storage/v1/object/public/taplist-media/'
  THEN
    v_product_image_url := NULL;
  END IF;

  INSERT INTO public.drink_products (
    name,
    brand_name,
    brewery,
    beer_style,
    abv,
    ibu,
    country,
    image_url,
    description,
    tasting_note,
    source,
    created_by
  )
  VALUES (
    v_drink.name,
    nullif(trim(v_drink.brand_name), ''),
    nullif(trim(coalesce(v_profile.brewery, v_drink.brand_name)), ''),
    nullif(trim(v_profile.beer_style), ''),
    v_profile.abv,
    v_profile.ibu,
    nullif(trim(v_profile.country), ''),
    v_product_image_url,
    nullif(trim(v_profile.description), ''),
    nullif(trim(v_profile.description), ''),
    'imported_from_drink',
    auth.uid()
  )
  RETURNING id INTO v_product_id;

  IF p_auto_link THEN
    PERFORM public.link_drink_to_product(p_drink_id, v_product_id, NULL, NULL);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'product_id', v_product_id,
    'drink_id', p_drink_id,
    'linked', p_auto_link
  );
END;
$$;

-- Promotion changes only drinks that still contain the exact inherited source
-- URL. Merchant-specific replacements are intentionally left untouched.
CREATE OR REPLACE FUNCTION public.admin_set_drink_product_image(
  p_product_id uuid,
  p_image_url text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_image_url text := nullif(trim(p_image_url), '');
  v_old_image_url text;
  v_synced_drinks integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Unauthorized: super_admin role required';
  END IF;

  IF v_image_url IS NULL OR v_image_url !~ (
    '^https://img\.nomenuapp\.com/prod/products/' ||
    p_product_id::text ||
    '/[A-Za-z0-9_-][A-Za-z0-9._-]{0,119}$'
  ) THEN
    RAISE EXCEPTION 'Invalid product image URL';
  END IF;

  SELECT image_url
  INTO v_old_image_url
  FROM public.drink_products
  WHERE id = p_product_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found';
  END IF;

  UPDATE public.drink_products
  SET image_url = v_image_url
  WHERE id = p_product_id;

  IF v_old_image_url IS NOT NULL AND v_old_image_url IS DISTINCT FROM v_image_url THEN
    UPDATE public.drinks
    SET image_url = v_image_url
    WHERE product_id = p_product_id
      AND image_url = v_old_image_url;
    GET DIAGNOSTICS v_synced_drinks = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'product_id', p_product_id,
    'image_url', v_image_url,
    'synced_drinks', v_synced_drinks
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_drink_product_image(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_drink_product_image(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_set_drink_product_image(uuid, text) TO authenticated;
