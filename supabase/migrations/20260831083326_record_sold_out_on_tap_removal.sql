-- Treat removing an occupied tap as a sold-out event for legacy POS clients.
-- The drink still returns to the catalog as hidden + available; analytics gets
-- the explicit sold_out event that the client cannot currently ask about.

CREATE OR REPLACE FUNCTION public.set_drink_taplist_listing(
  p_drink_id uuid,
  p_is_public_visible boolean,
  p_public_status text,
  p_public_sort_order integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_errors jsonb := '[]'::jsonb;
  v_tenant_id uuid;
  v_enabled boolean;
  v_from integer;
  v_other_id uuid;
  v_mode text;
  v_status text;
  v_visible boolean;
  v_tap integer;
  v_limit integer;
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

  IF NOT v_enabled THEN
    RETURN jsonb_build_object(
      'ok', false,
      'errors', jsonb_build_array(jsonb_build_object(
        'field', 'enabled', 'message', '已下架商品请先恢复后再加入今晚')));
  END IF;

  v_status := coalesce(nullif(trim(p_public_status), ''), 'available');
  IF v_status NOT IN ('new', 'available', 'low', 'sold_out', 'coming_soon') THEN
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'field', 'public_status', 'message', '无效的状态值'));
  END IF;

  SELECT coalesce(t.public_price_mode, 'hide'), t.tap_slot_count
  INTO v_mode, v_limit
  FROM public.tenants t
  WHERE t.id = v_tenant_id;

  v_tap := p_public_sort_order;
  IF v_tap IS NULL OR v_tap < 1 OR v_tap > coalesce(v_limit, 99) THEN
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'field', 'public_sort_order',
      'message', format('加入今晚必须分配酒头编号（1–%s）', coalesce(v_limit, 99))));
  END IF;

  v_visible := coalesce(p_is_public_visible, false);

  IF v_visible AND v_mode = 'show' AND NOT public.drink_has_orderable_price(p_drink_id) THEN
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'field', 'price',
      'message', '门店设置为公开显示价格：请先设置有效价格规格'));
  END IF;

  IF jsonb_array_length(v_errors) > 0 THEN
    RETURN jsonb_build_object('ok', false, 'errors', v_errors);
  END IF;

  IF v_from IS DISTINCT FROM v_tap THEN
    SELECT d.id INTO v_other_id
    FROM public.drinks d
    WHERE d.tenant_id = v_tenant_id
      AND d.id <> p_drink_id
      AND d.enabled = true
      AND d.public_sort_order = v_tap
    ORDER BY d.created_at
    LIMIT 1;

    UPDATE public.drinks
    SET public_sort_order = NULL
    WHERE id = p_drink_id;

    IF v_other_id IS NOT NULL THEN
      -- A catalog drink replacing an occupied tap removes the old drink.
      -- Tap-to-tap moves are swaps, so the other drink remains listed and is
      -- not counted as sold out.
      IF v_from IS NULL OR v_from < 1 THEN
        INSERT INTO public.drink_status_events (
          tenant_id,
          drink_id,
          from_status,
          to_status,
          actor_user_id
        )
        SELECT
          d.tenant_id,
          d.id,
          d.public_status,
          'sold_out',
          auth.uid()
        FROM public.drinks d
        WHERE d.id = v_other_id
          AND d.public_status IS DISTINCT FROM 'sold_out';
      END IF;

      UPDATE public.drinks
      SET
        public_sort_order = NULLIF(v_from, 0),
        is_public_visible = CASE
          WHEN v_from IS NULL OR v_from < 1 THEN false
          ELSE is_public_visible
        END,
        public_status = CASE
          WHEN v_from IS NULL OR v_from < 1 THEN 'available'
          ELSE public_status
        END
      WHERE id = v_other_id;
    END IF;

    UPDATE public.drinks
    SET public_sort_order = v_tap
    WHERE id = p_drink_id;
  END IF;

  UPDATE public.drinks
  SET
    is_public_visible = v_visible,
    public_status = v_status
  WHERE id = p_drink_id AND tenant_id = v_tenant_id;

  UPDATE public.tenants
  SET last_menu_updated_at = now()
  WHERE id = v_tenant_id;

  RETURN jsonb_build_object(
    'ok', true,
    'drink_id', p_drink_id,
    'public_sort_order', v_tap,
    'is_public_visible', v_visible,
    'public_status', v_status,
    'swapped_with', CASE
      WHEN v_other_id IS NULL THEN NULL
      ELSE jsonb_build_object('drink_id', v_other_id, 'tap_number', NULLIF(v_from, 0))
    END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_drink_from_tonight(
  p_drink_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_status text;
  v_tap integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT d.tenant_id, d.public_status, d.public_sort_order
  INTO v_tenant_id, v_status, v_tap
  FROM public.drinks d
  WHERE d.id = p_drink_id;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Drink not found';
  END IF;

  IF NOT public.taplist_can_view_tenant(v_tenant_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF v_tap IS NOT NULL AND v_tap >= 1 AND v_status IS DISTINCT FROM 'sold_out' THEN
    INSERT INTO public.drink_status_events (
      tenant_id,
      drink_id,
      from_status,
      to_status,
      actor_user_id
    ) VALUES (
      v_tenant_id,
      p_drink_id,
      v_status,
      'sold_out',
      auth.uid()
    );
  END IF;

  UPDATE public.drinks
  SET
    public_sort_order = NULL,
    is_public_visible = false,
    public_status = 'available'
    -- enabled unchanged
  WHERE id = p_drink_id AND tenant_id = v_tenant_id;

  UPDATE public.tenants
  SET last_menu_updated_at = now()
  WHERE id = v_tenant_id;

  RETURN jsonb_build_object(
    'ok', true,
    'drink_id', p_drink_id,
    'public_sort_order', null,
    'is_public_visible', false,
    'public_status', 'available'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_drink_taplist_listing(uuid, boolean, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.remove_drink_from_tonight(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_drink_taplist_listing(uuid, boolean, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_drink_from_tonight(uuid) TO authenticated;
