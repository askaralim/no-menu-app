-- When linking a venue drink to the product pool, copy the product image onto
-- drinks.image_url if the drink has no image of its own (or still has the
-- previous product's image). Matches POS applyProductToDraftDrink fill-if-empty.
-- Consumer taplist already falls back to drink_products.image_url; this keeps
-- admin / POS / owner payloads that read drinks.image_url in sync.

CREATE OR REPLACE FUNCTION public.link_drink_to_product(
  p_drink_id uuid,
  p_product_id uuid,
  p_display_name text DEFAULT NULL,
  p_display_description text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_old_product_id uuid;
  v_old_image text;
  v_old_product_image text;
  v_new_product_image text;
  v_next_image text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT d.tenant_id, d.product_id, nullif(trim(d.image_url), '')
  INTO v_tenant_id, v_old_product_id, v_old_image
  FROM public.drinks d
  WHERE d.id = p_drink_id;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Drink not found';
  END IF;

  IF NOT public.can_manage_tenant_drink(v_tenant_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT nullif(trim(dp.image_url), '')
  INTO v_new_product_image
  FROM public.drink_products dp
  WHERE dp.id = p_product_id
    AND dp.status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found or not active';
  END IF;

  IF v_old_product_id IS NOT NULL THEN
    SELECT nullif(trim(dp.image_url), '')
    INTO v_old_product_image
    FROM public.drink_products dp
    WHERE dp.id = v_old_product_id;
  END IF;

  IF v_old_image IS NULL THEN
    v_next_image := v_new_product_image;
  ELSIF v_old_product_id IS DISTINCT FROM p_product_id
    AND v_old_image IS NOT DISTINCT FROM v_old_product_image THEN
    v_next_image := coalesce(v_new_product_image, v_old_image);
  ELSE
    v_next_image := v_old_image;
  END IF;

  UPDATE public.drinks
  SET
    product_id = p_product_id,
    display_name = nullif(trim(p_display_name), ''),
    display_description = nullif(trim(p_display_description), ''),
    image_url = v_next_image
  WHERE id = p_drink_id;

  RETURN jsonb_build_object('ok', true, 'drink_id', p_drink_id, 'product_id', p_product_id);
END;
$$;

-- Existing linked drinks that never received a copied product image.
UPDATE public.drinks d
SET image_url = nullif(trim(dp.image_url), '')
FROM public.drink_products dp
WHERE d.product_id = dp.id
  AND nullif(trim(d.image_url), '') IS NULL
  AND nullif(trim(dp.image_url), '') IS NOT NULL;
