-- A7: collab_breweries in upsert + owner payload; brand_name = primary brewery

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
      tenant_id, drink_id, brewery, beer_style, abv, ibu, country, description, collab_breweries
    )
    VALUES (
      p_tenant_id, v_drink_id,
      nullif(trim(v_profile->>'brewery'), ''),
      nullif(trim(v_profile->>'beer_style'), ''),
      nullif(trim(v_profile->>'abv'), '')::numeric,
      nullif(trim(v_profile->>'ibu'), '')::integer,
      nullif(trim(v_profile->>'country'), ''),
      nullif(trim(v_profile->>'description'), ''),
      coalesce(
        (
          SELECT array_agg(trim(x) ORDER BY ord)
          FROM jsonb_array_elements_text(coalesce(v_profile->'collab_breweries', '[]'::jsonb))
            WITH ORDINALITY AS t(x, ord)
          WHERE trim(x) <> ''
        ),
        '{}'::text[]
      )
    )
    ON CONFLICT (drink_id) DO UPDATE SET
      brewery = excluded.brewery,
      beer_style = excluded.beer_style,
      abv = excluded.abv,
      ibu = excluded.ibu,
      country = excluded.country,
      description = excluded.description,
      collab_breweries = excluded.collab_breweries,
      updated_at = now();

    -- brand_name tracks primary brewery only (not collabs)
    UPDATE public.drinks
    SET brand_name = nullif(trim(v_profile->>'brewery'), '')
    WHERE id = v_drink_id AND tenant_id = p_tenant_id;
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

CREATE OR REPLACE FUNCTION public.get_owner_taplist_payload(p_tenant_id uuid DEFAULT NULL)
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

  v_tenant_id := p_tenant_id;
  IF v_tenant_id IS NULL THEN
    SELECT ur.tenant_id INTO v_tenant_id
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('owner', 'staff')
    ORDER BY ur.created_at
    LIMIT 1;
  END IF;

  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'no_tenant');
  END IF;

  IF NOT public.taplist_can_view_tenant(v_tenant_id) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'is_owner', EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND (
          ur.role = 'super_admin'
          OR (ur.tenant_id = v_tenant_id AND ur.role = 'owner')
        )
    ),
    'tenant', (
      SELECT jsonb_build_object(
        'id', t.id,
        'slug', t.slug,
        'name', t.name,
        'display_name', t.display_name,
        'is_public_visible', t.is_public_visible,
        'last_menu_updated_at', t.last_menu_updated_at,
        'status', t.status,
        'public_price_mode', coalesce(t.public_price_mode, 'hide')
      )
      FROM public.tenants t
      WHERE t.id = v_tenant_id
    ),
    'categories', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'name', c.name,
          'sort_order', c.sort_order,
          'enabled', c.enabled,
          'is_public_visible', c.is_public_visible
        ) ORDER BY c.sort_order, c.name
      )
      FROM public.categories c
      WHERE c.tenant_id = v_tenant_id
    ), '[]'::jsonb),
    'drinks', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', d.id,
          'category_id', d.category_id,
          'brand_name', d.brand_name,
          'name', d.name,
          'enabled', d.enabled,
          'image_url', d.image_url,
          'is_public_visible', d.is_public_visible,
          'public_status', d.public_status,
          'public_sort_order', d.public_sort_order,
          'product_id', d.product_id,
          'display_name', d.display_name,
          'display_description', d.display_description,
          'created_at', d.created_at,
          'updated_at', d.updated_at
        ) ORDER BY d.enabled DESC, d.updated_at DESC NULLS LAST, lower(d.name)
      )
      FROM public.drinks d
      WHERE d.tenant_id = v_tenant_id
    ), '[]'::jsonb),
    'beer_profiles', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'drink_id', p.drink_id,
          'brewery', p.brewery,
          'collab_breweries', coalesce(to_jsonb(p.collab_breweries), '[]'::jsonb),
          'beer_style', p.beer_style,
          'abv', p.abv,
          'ibu', p.ibu,
          'country', p.country,
          'description', p.description
        )
      )
      FROM public.drink_beer_profiles p
      JOIN public.drinks d ON d.id = p.drink_id
      WHERE p.tenant_id = v_tenant_id
    ), '[]'::jsonb),
    'serving_options', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', so.id,
          'drink_id', so.drink_id,
          'serving_type', so.serving_type,
          'label', so.label,
          'volume_ml', so.volume_ml,
          'price', so.price,
          'is_default', so.is_default,
          'is_active', so.is_active,
          'public_sort_order', so.public_sort_order
        ) ORDER BY so.public_sort_order
      )
      FROM public.drink_serving_options so
      JOIN public.drinks d ON d.id = so.drink_id
      WHERE so.tenant_id = v_tenant_id
    ), '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_owner_taplist_payload(uuid) TO authenticated;
