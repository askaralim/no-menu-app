-- A1/A2: upsert_drink_product
-- - Serving label: empty stays empty (no silent default to '杯')
-- - New drinks: auto-pick only enabled categories; reject assigning a disabled category
--   unless it is already the drink's current category (edit keep).

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
  v_category_enabled boolean;
  v_current_category_id uuid;
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
  IF v_category_id IS NOT NULL THEN
    SELECT c.enabled INTO v_category_enabled
    FROM public.categories c
    WHERE c.id = v_category_id AND c.tenant_id = p_tenant_id;

    IF v_category_enabled IS NULL THEN
      v_category_id := NULL;
    ELSIF v_category_enabled IS NOT TRUE THEN
      IF v_drink_id IS NOT NULL THEN
        SELECT d.category_id INTO v_current_category_id
        FROM public.drinks d
        WHERE d.id = v_drink_id AND d.tenant_id = p_tenant_id;
      END IF;

      IF v_current_category_id IS DISTINCT FROM v_category_id THEN
        RETURN jsonb_build_object(
          'ok', false,
          'errors', jsonb_build_array(jsonb_build_object(
            'field', 'category_id', 'message', '分类已关闭，请选择其他分类')));
      END IF;
    END IF;
  END IF;

  IF v_drink_id IS NULL THEN
    v_is_new := true;

    IF v_category_id IS NULL THEN
      SELECT c.id INTO v_category_id
      FROM public.categories c
      WHERE c.tenant_id = p_tenant_id
        AND c.enabled = true
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
          label = trim(coalesce(v_elem->>'label', '')),
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
          trim(coalesce(v_elem->>'label', '')),
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
