-- Phase 1a: product / listing RPC split + unique tap numbers
-- - upsert_drink_product: catalog fields only (no listing flags)
-- - set_drink_taplist_listing: tonight listing (visibility / status / tap #)
-- - remove_drink_from_tonight: clear listing, keep enabled
-- - Unique (tenant_id, public_sort_order) among enabled drinks
-- Forward-only.

-- ---------------------------------------------------------------------------
-- 1) Resolve duplicate tap numbers, then unique index
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_dup record;
  v_victim record;
  v_keep uuid;
  v_next integer;
  v_tenant uuid;
BEGIN
  FOR v_dup IN
    SELECT tenant_id, public_sort_order
    FROM public.drinks
    WHERE enabled = true
      AND public_sort_order IS NOT NULL
    GROUP BY tenant_id, public_sort_order
    HAVING count(*) > 1
  LOOP
    SELECT d.id INTO v_keep
    FROM public.drinks d
    WHERE d.tenant_id = v_dup.tenant_id
      AND d.enabled = true
      AND d.public_sort_order = v_dup.public_sort_order
    ORDER BY d.created_at, d.id
    LIMIT 1;

    FOR v_victim IN
      SELECT d.id AS drink_id, d.tenant_id
      FROM public.drinks d
      WHERE d.tenant_id = v_dup.tenant_id
        AND d.enabled = true
        AND d.public_sort_order = v_dup.public_sort_order
        AND d.id <> v_keep
      ORDER BY d.created_at, d.id
    LOOP
      v_tenant := v_victim.tenant_id;

      SELECT gs INTO v_next
      FROM generate_series(1, 99) AS gs
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.drinks x
        WHERE x.tenant_id = v_tenant
          AND x.enabled = true
          AND x.public_sort_order = gs
      )
      ORDER BY gs
      LIMIT 1;

      IF v_next IS NULL THEN
        UPDATE public.drinks
        SET public_sort_order = NULL
        WHERE id = v_victim.drink_id;
      ELSE
        UPDATE public.drinks
        SET public_sort_order = v_next
        WHERE id = v_victim.drink_id;
      END IF;
    END LOOP;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS drinks_tenant_public_sort_order_unique
  ON public.drinks (tenant_id, public_sort_order)
  WHERE enabled = true AND public_sort_order IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2) upsert_drink_product — product fields only
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.upsert_drink_product(
  p_tenant_id uuid,
  p_drink jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_errors jsonb := '[]'::jsonb;
  v_drink_id uuid;
  v_category_id uuid;
  v_is_new boolean := false;
  v_name text;
  v_profile jsonb;
  v_servings jsonb;
  v_elem jsonb;
  v_type text;
  v_default_count integer;
  v_sync_price numeric;
  v_priced_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant id is required';
  END IF;

  IF NOT public.taplist_can_view_tenant(p_tenant_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_drink IS NULL OR jsonb_typeof(p_drink) <> 'object' THEN
    RAISE EXCEPTION 'p_drink must be a JSON object';
  END IF;

  v_drink_id := nullif(p_drink->>'id', '')::uuid;
  v_name := trim(coalesce(p_drink->>'name', ''));
  v_profile := p_drink->'profile';
  v_servings := p_drink->'servings';

  IF v_name = '' THEN
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'field', 'name', 'message', '请填写酒款名称'));
  END IF;

  IF jsonb_typeof(v_servings) = 'array' THEN
    FOR v_elem IN SELECT value FROM jsonb_array_elements(v_servings) LOOP
      v_type := coalesce(nullif(trim(v_elem->>'serving_type'), ''), 'draft');
      IF v_type NOT IN ('draft', 'can', 'bottle', 'flight', 'other') THEN
        v_errors := v_errors || jsonb_build_array(jsonb_build_object(
          'field', 'serving_type', 'message', '无效的规格类型'));
      END IF;
    END LOOP;
  END IF;

  IF v_drink_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.drinks d WHERE d.id = v_drink_id AND d.tenant_id = p_tenant_id
    ) THEN
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'field', 'id', 'message', '酒款不属于该门店'));
    END IF;
  END IF;

  IF jsonb_array_length(v_errors) > 0 THEN
    RETURN jsonb_build_object('ok', false, 'errors', v_errors);
  END IF;

  v_category_id := nullif(p_drink->>'category_id', '')::uuid;
  IF v_category_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.categories c WHERE c.id = v_category_id AND c.tenant_id = p_tenant_id
     ) THEN
    v_category_id := NULL;
  END IF;

  IF v_drink_id IS NULL THEN
    v_is_new := true;

    IF v_category_id IS NULL THEN
      SELECT c.id INTO v_category_id
      FROM public.categories c
      WHERE c.tenant_id = p_tenant_id
      ORDER BY c.sort_order, c.created_at, c.id
      LIMIT 1;

      IF v_category_id IS NULL THEN
        INSERT INTO public.categories (tenant_id, name, sort_order, enabled, is_public_visible)
        VALUES (p_tenant_id, '生啤', 1, true, true)
        RETURNING id INTO v_category_id;
      END IF;
    END IF;

    -- Catalog only: not on tonight, not public until listing RPC.
    INSERT INTO public.drinks (
      tenant_id, category_id, brand_name, name, price, price_unit,
      sort_order, enabled, image_url,
      is_public_visible, public_status, public_sort_order
    )
    VALUES (
      p_tenant_id, v_category_id,
      nullif(trim(p_drink->>'brand_name'), ''),
      v_name,
      0, '杯',
      coalesce((SELECT max(sort_order) FROM public.drinks WHERE tenant_id = p_tenant_id), 0) + 1,
      true,
      nullif(trim(p_drink->>'image_url'), ''),
      false,
      'available',
      NULL
    )
    RETURNING id INTO v_drink_id;
  ELSE
    -- Do NOT touch is_public_visible / public_status / public_sort_order.
    UPDATE public.drinks
    SET
      brand_name = nullif(trim(p_drink->>'brand_name'), ''),
      name = v_name,
      image_url = nullif(trim(p_drink->>'image_url'), ''),
      category_id = coalesce(v_category_id, category_id),
      enabled = true
    WHERE id = v_drink_id AND tenant_id = p_tenant_id;
  END IF;

  IF v_profile IS NOT NULL AND jsonb_typeof(v_profile) = 'object' THEN
    INSERT INTO public.drink_beer_profiles (
      tenant_id, drink_id, brewery, beer_style, abv, ibu, country, description
    )
    VALUES (
      p_tenant_id, v_drink_id,
      nullif(trim(v_profile->>'brewery'), ''),
      nullif(trim(v_profile->>'beer_style'), ''),
      nullif(trim(v_profile->>'abv'), '')::numeric,
      nullif(trim(v_profile->>'ibu'), '')::integer,
      nullif(trim(v_profile->>'country'), ''),
      nullif(trim(v_profile->>'description'), '')
    )
    ON CONFLICT (drink_id) DO UPDATE SET
      brewery = excluded.brewery,
      beer_style = excluded.beer_style,
      abv = excluded.abv,
      ibu = excluded.ibu,
      country = excluded.country,
      description = excluded.description,
      updated_at = now();
  END IF;

  IF jsonb_typeof(v_servings) = 'array' THEN
    FOR v_elem IN SELECT value FROM jsonb_array_elements(v_servings) LOOP
      IF coalesce((v_elem->>'delete')::boolean, false) THEN
        IF nullif(v_elem->>'id', '') IS NOT NULL THEN
          DELETE FROM public.drink_serving_options
          WHERE id = (v_elem->>'id')::uuid AND tenant_id = p_tenant_id;
        END IF;
        CONTINUE;
      END IF;

      IF nullif(v_elem->>'id', '') IS NOT NULL THEN
        UPDATE public.drink_serving_options
        SET
          serving_type = coalesce(nullif(trim(v_elem->>'serving_type'), ''), 'draft'),
          label = coalesce(nullif(trim(v_elem->>'label'), ''), '杯'),
          volume_ml = nullif(trim(v_elem->>'volume_ml'), '')::integer,
          price = coalesce((v_elem->>'price')::numeric, 0),
          is_default = coalesce((v_elem->>'is_default')::boolean, false),
          is_active = coalesce((v_elem->>'is_active')::boolean, true),
          public_sort_order = coalesce((v_elem->>'public_sort_order')::integer, 0),
          updated_at = now()
        WHERE id = (v_elem->>'id')::uuid AND tenant_id = p_tenant_id;
      ELSE
        INSERT INTO public.drink_serving_options (
          tenant_id, drink_id, serving_type, label, volume_ml, price,
          is_default, is_active, public_sort_order
        )
        VALUES (
          p_tenant_id, v_drink_id,
          coalesce(nullif(trim(v_elem->>'serving_type'), ''), 'draft'),
          coalesce(nullif(trim(v_elem->>'label'), ''), '杯'),
          nullif(trim(v_elem->>'volume_ml'), '')::integer,
          coalesce((v_elem->>'price')::numeric, 0),
          coalesce((v_elem->>'is_default')::boolean, false),
          coalesce((v_elem->>'is_active')::boolean, true),
          coalesce((v_elem->>'public_sort_order')::integer, 0)
        );
      END IF;
    END LOOP;

    SELECT count(*) INTO v_default_count
    FROM public.drink_serving_options
    WHERE drink_id = v_drink_id AND is_default = true;

    IF v_default_count > 1 THEN
      UPDATE public.drink_serving_options so
      SET is_default = false
      WHERE so.drink_id = v_drink_id
        AND so.is_default = true
        AND so.id <> (
          SELECT id FROM public.drink_serving_options
          WHERE drink_id = v_drink_id AND is_default = true
          ORDER BY public_sort_order, created_at
          LIMIT 1
        );
    END IF;
  END IF;

  -- Sync legacy drinks.price from servings (compat only).
  SELECT so.price INTO v_sync_price
  FROM public.drink_serving_options so
  WHERE so.drink_id = v_drink_id
    AND so.is_active = true
    AND so.is_default = true
    AND so.price > 0
  ORDER BY so.public_sort_order, so.created_at
  LIMIT 1;

  IF v_sync_price IS NULL THEN
    SELECT count(*) INTO v_priced_count
    FROM public.drink_serving_options so
    WHERE so.drink_id = v_drink_id
      AND so.is_active = true
      AND so.price > 0;

    IF v_priced_count = 1 THEN
      SELECT so.price INTO v_sync_price
      FROM public.drink_serving_options so
      WHERE so.drink_id = v_drink_id
        AND so.is_active = true
        AND so.price > 0
      LIMIT 1;
    END IF;
  END IF;

  UPDATE public.drinks
  SET price = coalesce(v_sync_price, 0)
  WHERE id = v_drink_id AND tenant_id = p_tenant_id;

  UPDATE public.tenants SET last_menu_updated_at = now() WHERE id = p_tenant_id;

  RETURN jsonb_build_object(
    'ok', true,
    'drink_id', v_drink_id,
    'created', v_is_new,
    'pos_orderable', public.drink_is_orderable(v_drink_id, p_tenant_id),
    'missing_price_warning', v_sync_price IS NULL
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_drink_product(uuid, jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3) set_drink_taplist_listing — tonight listing fields
-- ---------------------------------------------------------------------------

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

  v_tap := p_public_sort_order;
  IF v_tap IS NULL OR v_tap < 1 OR v_tap > 99 THEN
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'field', 'public_sort_order', 'message', '加入今晚必须分配酒头编号（1–99）'));
  END IF;

  v_visible := coalesce(p_is_public_visible, false);

  SELECT coalesce(t.public_price_mode, 'hide') INTO v_mode
  FROM public.tenants t
  WHERE t.id = v_tenant_id;

  IF v_visible AND v_mode = 'show' AND NOT public.drink_has_orderable_price(p_drink_id) THEN
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'field', 'price',
      'message', '门店设置为公开显示价格：请先设置有效价格规格'));
  END IF;

  IF jsonb_array_length(v_errors) > 0 THEN
    RETURN jsonb_build_object('ok', false, 'errors', v_errors);
  END IF;

  -- Assign / swap tap with NULL intermediate to satisfy unique index.
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
      UPDATE public.drinks
      SET public_sort_order = NULLIF(v_from, 0)
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

GRANT EXECUTE ON FUNCTION public.set_drink_taplist_listing(uuid, boolean, text, integer) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4) remove_drink_from_tonight
-- ---------------------------------------------------------------------------

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
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT d.tenant_id INTO v_tenant_id
  FROM public.drinks d
  WHERE d.id = p_drink_id;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Drink not found';
  END IF;

  IF NOT public.taplist_can_view_tenant(v_tenant_id) THEN
    RAISE EXCEPTION 'Forbidden';
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

GRANT EXECUTE ON FUNCTION public.remove_drink_from_tonight(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5) assign_drink_tap_number: NULL intermediate for unique index
-- ---------------------------------------------------------------------------

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
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_tap_number IS NULL OR p_tap_number < 1 OR p_tap_number > 99 THEN
    RAISE EXCEPTION 'Invalid tap number';
  END IF;

  SELECT d.tenant_id, d.public_sort_order
  INTO v_tenant_id, v_from
  FROM public.drinks d
  WHERE d.id = p_drink_id;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Drink not found';
  END IF;

  IF NOT public.taplist_can_view_tenant(v_tenant_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF v_from IS NOT DISTINCT FROM p_tap_number THEN
    RETURN jsonb_build_object(
      'ok', true,
      'drink_id', p_drink_id,
      'tap_number', p_tap_number,
      'swapped_with', null
    );
  END IF;

  SELECT d.id INTO v_other_id
  FROM public.drinks d
  WHERE d.tenant_id = v_tenant_id
    AND d.id <> p_drink_id
    AND d.enabled = true
    AND d.public_sort_order = p_tap_number
  ORDER BY d.created_at
  LIMIT 1;

  UPDATE public.drinks
  SET public_sort_order = NULL
  WHERE id = p_drink_id;

  IF v_other_id IS NOT NULL THEN
    UPDATE public.drinks
    SET public_sort_order = NULLIF(v_from, 0)
    WHERE id = v_other_id;
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
    'swapped_with', CASE
      WHEN v_other_id IS NULL THEN NULL
      ELSE jsonb_build_object('drink_id', v_other_id, 'tap_number', NULLIF(v_from, 0))
    END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_drink_tap_number(uuid, integer) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6) Legacy upsert_taplist_drink → thin wrapper (product + listing)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.upsert_taplist_drink(
  p_tenant_id uuid,
  p_drink jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product jsonb;
  v_listing jsonb;
  v_drink_id uuid;
  v_tap integer;
  v_status text;
  v_visible boolean;
  v_existing_tap integer;
BEGIN
  v_product := public.upsert_drink_product(p_tenant_id, p_drink);
  IF coalesce((v_product->>'ok')::boolean, false) IS NOT TRUE THEN
    RETURN v_product;
  END IF;

  v_drink_id := (v_product->>'drink_id')::uuid;
  v_status := coalesce(nullif(trim(p_drink->>'public_status'), ''), 'available');
  v_visible := coalesce((p_drink->>'is_public_visible')::boolean, false);

  SELECT d.public_sort_order INTO v_existing_tap
  FROM public.drinks d
  WHERE d.id = v_drink_id;

  v_tap := nullif((p_drink->>'public_sort_order')::integer, 0);
  IF v_tap IS NULL THEN
    v_tap := v_existing_tap;
  END IF;
  IF v_tap IS NULL OR v_tap < 1 THEN
    SELECT coalesce(max(d.public_sort_order), 0) + 1 INTO v_tap
    FROM public.drinks d
    WHERE d.tenant_id = p_tenant_id
      AND d.enabled = true
      AND d.public_sort_order IS NOT NULL;
    IF v_tap > 99 THEN
      RETURN jsonb_build_object(
        'ok', false,
        'errors', jsonb_build_array(jsonb_build_object(
          'field', 'public_sort_order', 'message', '酒头编号已满，请先移出或调整编号')));
    END IF;
  END IF;

  v_listing := public.set_drink_taplist_listing(
    v_drink_id,
    v_visible,
    v_status,
    v_tap
  );

  IF coalesce((v_listing->>'ok')::boolean, false) IS NOT TRUE THEN
    RETURN v_listing;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'drink_id', v_drink_id,
    'created', coalesce((v_product->>'created')::boolean, false),
    'pos_orderable', coalesce((v_product->>'pos_orderable')::boolean, false),
    'missing_price_warning', coalesce((v_product->>'missing_price_warning')::boolean, false),
    'public_cleared', false,
    'public_sort_order', v_tap
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_taplist_drink(uuid, jsonb) TO authenticated;
