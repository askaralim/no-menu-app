-- Atomic tap-number assign/swap for Tonight control.
-- Uses drinks.public_sort_order as the wall tap number (1-based).
-- If target slot is occupied, swap; otherwise move this drink into the empty slot.

CREATE OR REPLACE FUNCTION public.assign_drink_tap_number(
  p_drink_id uuid,
  p_tap_number integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_from integer;
  v_other_id uuid;
  v_other_from integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_tap_number IS NULL OR p_tap_number < 1 OR p_tap_number > 99 THEN
    RAISE EXCEPTION 'Invalid tap number';
  END IF;

  SELECT d.tenant_id, coalesce(d.public_sort_order, 0)
  INTO v_tenant_id, v_from
  FROM public.drinks d
  WHERE d.id = p_drink_id;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Drink not found';
  END IF;

  IF NOT public.taplist_can_view_tenant(v_tenant_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF v_from = p_tap_number THEN
    RETURN jsonb_build_object(
      'ok', true,
      'drink_id', p_drink_id,
      'tap_number', p_tap_number,
      'swapped_with', null
    );
  END IF;

  -- Occupant of the target slot (if any). Prefer an exact match; ignore self.
  SELECT d.id, coalesce(d.public_sort_order, 0)
  INTO v_other_id, v_other_from
  FROM public.drinks d
  WHERE d.tenant_id = v_tenant_id
    AND d.id <> p_drink_id
    AND coalesce(d.public_sort_order, 0) = p_tap_number
  ORDER BY d.created_at
  LIMIT 1;

  IF v_other_id IS NOT NULL THEN
    -- Swap: other takes this drink's previous number (0 stays 0 / unassigned).
    UPDATE public.drinks
    SET public_sort_order = v_from
    WHERE id = v_other_id;

    UPDATE public.drinks
    SET public_sort_order = p_tap_number
    WHERE id = p_drink_id;

    UPDATE public.tenants
    SET last_menu_updated_at = now()
    WHERE id = v_tenant_id;

    RETURN jsonb_build_object(
      'ok', true,
      'drink_id', p_drink_id,
      'tap_number', p_tap_number,
      'swapped_with', jsonb_build_object(
        'drink_id', v_other_id,
        'tap_number', v_from
      )
    );
  END IF;

  UPDATE public.drinks
  SET public_sort_order = p_tap_number
  WHERE id = p_drink_id;

  UPDATE public.tenants
  SET last_menu_updated_at = now()
  WHERE id = v_tenant_id;

  RETURN jsonb_build_object(
    'ok', true,
    'drink_id', p_drink_id,
    'tap_number', p_tap_number,
    'swapped_with', null
  );
END;
$$;

REVOKE ALL ON FUNCTION public.assign_drink_tap_number(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_drink_tap_number(uuid, integer) TO authenticated;
