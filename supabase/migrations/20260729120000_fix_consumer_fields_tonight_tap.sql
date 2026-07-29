-- Harden legacy set_drink_taplist_consumer_fields: never write public_sort_order 0
-- (tonight = 1–99, not on tonight = NULL). Prefer set_drink_taplist_listing /
-- remove_drink_from_tonight from clients; this keeps old callers from hitting
-- drinks_tenant_public_sort_order_unique with duplicate zeros.

CREATE OR REPLACE FUNCTION public.set_drink_taplist_consumer_fields(
  p_drink_id uuid,
  p_image_url text,
  p_is_public_visible boolean,
  p_public_status text,
  p_public_sort_order integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_enabled boolean;
  v_tap integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT d.tenant_id, d.enabled INTO v_tenant_id, v_enabled
  FROM public.drinks d
  WHERE d.id = p_drink_id;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Drink not found';
  END IF;

  IF NOT public.taplist_can_view_tenant(v_tenant_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_is_public_visible AND NOT v_enabled THEN
    RAISE EXCEPTION 'Cannot make disabled drink public on Tap List';
  END IF;

  v_tap := CASE
    WHEN p_public_sort_order IS NULL OR p_public_sort_order < 1 THEN NULL
    WHEN p_public_sort_order > 99 THEN 99
    ELSE p_public_sort_order
  END;

  UPDATE public.drinks
  SET
    image_url = nullif(trim(p_image_url), ''),
    is_public_visible = CASE
      WHEN v_tap IS NULL THEN false
      ELSE coalesce(p_is_public_visible, false)
    END,
    public_status = coalesce(nullif(trim(p_public_status), ''), 'available'),
    public_sort_order = v_tap
  WHERE id = p_drink_id;

  UPDATE public.tenants
  SET last_menu_updated_at = now()
  WHERE id = v_tenant_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_drink_taplist_consumer_fields(uuid, text, boolean, text, integer) TO authenticated;
