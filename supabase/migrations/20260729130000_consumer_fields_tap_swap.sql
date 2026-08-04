-- Make set_drink_taplist_consumer_fields safe under drinks_tenant_public_sort_order_unique.
-- Old admin upload path still calls this RPC with image + sort together; a naive
-- UPDATE to an occupied tap # raised 23505. Use NULL-intermediate swap like
-- set_drink_taplist_listing / assign_drink_tap_number.

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
  v_from integer;
  v_tap integer;
  v_other_id uuid;
  v_visible boolean;
  v_status text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT d.tenant_id, d.enabled, d.public_sort_order
  INTO v_tenant_id, v_enabled, v_from
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

  v_status := coalesce(nullif(trim(p_public_status), ''), 'available');
  v_visible := CASE
    WHEN v_tap IS NULL THEN false
    ELSE coalesce(p_is_public_visible, false)
  END;

  -- Assign / clear tap with swap so unique (tenant_id, public_sort_order) holds.
  IF v_from IS DISTINCT FROM v_tap THEN
    UPDATE public.drinks
    SET public_sort_order = NULL
    WHERE id = p_drink_id;

    IF v_tap IS NOT NULL THEN
      SELECT d.id INTO v_other_id
      FROM public.drinks d
      WHERE d.tenant_id = v_tenant_id
        AND d.id <> p_drink_id
        AND d.enabled = true
        AND d.public_sort_order = v_tap
      ORDER BY d.created_at
      LIMIT 1;

      IF v_other_id IS NOT NULL THEN
        UPDATE public.drinks
        SET public_sort_order = NULLIF(v_from, 0)
        WHERE id = v_other_id;
      END IF;

      UPDATE public.drinks
      SET public_sort_order = v_tap
      WHERE id = p_drink_id;
    END IF;
  END IF;

  UPDATE public.drinks
  SET
    image_url = nullif(trim(p_image_url), ''),
    is_public_visible = v_visible,
    public_status = v_status
  WHERE id = p_drink_id;

  UPDATE public.tenants
  SET last_menu_updated_at = now()
  WHERE id = v_tenant_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_drink_taplist_consumer_fields(uuid, text, boolean, text, integer) TO authenticated;
