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

  UPDATE public.drink_products
  SET image_url = v_image_url
  WHERE id = p_product_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found';
  END IF;

  RETURN jsonb_build_object('ok', true, 'product_id', p_product_id, 'image_url', v_image_url);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_drink_product_image(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_drink_product_image(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_set_drink_product_image(uuid, text) TO authenticated;
