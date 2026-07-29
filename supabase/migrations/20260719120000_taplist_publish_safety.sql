-- Phase 0 safety: owner-only tenant publish, minimum publish guard,
-- and taplist price sync so POS never shows orderable unset ¥0 beers.
-- Forward-only: does not edit 20260714120000_owner_taplist_publish.sql.

-- ---------------------------------------------------------------------------
-- Owner helper (tenant owner or platform super_admin)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.taplist_is_tenant_owner(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND (
        ur.role = 'super_admin'
        OR (ur.tenant_id = p_tenant_id AND ur.role = 'owner')
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.taplist_is_tenant_owner(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Minimum readiness for making a tenant public
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_tenant_publish_readiness(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant public.tenants%ROWTYPE;
  v_errors jsonb := '[]'::jsonb;
  v_public_count integer := 0;
  v_unpriced integer := 0;
  v_has_owner boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.taplist_can_view_tenant(p_tenant_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT * INTO v_tenant FROM public.tenants WHERE id = p_tenant_id;
  IF v_tenant.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'errors', jsonb_build_array('门店不存在'));
  END IF;

  IF coalesce(v_tenant.status, 'active') <> 'active' THEN
    v_errors := v_errors || jsonb_build_array('门店未处于活跃状态');
  END IF;

  IF nullif(trim(coalesce(v_tenant.display_name, v_tenant.name, '')), '') IS NULL THEN
    v_errors := v_errors || jsonb_build_array('请填写门店名称');
  END IF;

  IF nullif(trim(coalesce(v_tenant.city, '')), '') IS NULL THEN
    v_errors := v_errors || jsonb_build_array('请填写城市');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.tenant_id = p_tenant_id AND ur.role = 'owner'
  ) INTO v_has_owner;

  IF NOT v_has_owner AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role = 'super_admin'
  ) THEN
    v_errors := v_errors || jsonb_build_array('门店尚未认领店主');
  END IF;

  SELECT count(*) INTO v_public_count
  FROM public.drinks d
  WHERE d.tenant_id = p_tenant_id
    AND d.enabled = true
    AND d.is_public_visible = true;

  IF v_public_count < 1 THEN
    v_errors := v_errors || jsonb_build_array('至少需要 1 个公开酒款');
  END IF;

  SELECT count(*) INTO v_unpriced
  FROM public.drinks d
  WHERE d.tenant_id = p_tenant_id
    AND d.enabled = true
    AND d.is_public_visible = true
    AND NOT EXISTS (
      SELECT 1 FROM public.drink_serving_options so
      WHERE so.drink_id = d.id
        AND so.is_active = true
        AND so.price > 0
        AND (
          so.is_default = true
          OR (
            SELECT count(*) FROM public.drink_serving_options so2
            WHERE so2.drink_id = d.id AND so2.is_active = true AND so2.price > 0
          ) = 1
        )
    );

  IF v_unpriced > 0 THEN
    v_errors := v_errors || jsonb_build_array(
      format('%s 个公开酒款缺少有效价格规格', v_unpriced));
  END IF;

  RETURN jsonb_build_object(
    'ok', jsonb_array_length(v_errors) = 0,
    'errors', v_errors,
    'public_drink_count', v_public_count,
    'has_owner', v_has_owner
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_tenant_publish_readiness(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Owner-only publish / unpublish with minimum guard
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_tenant_public_visibility(
  p_tenant_id uuid,
  p_visible boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ready jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.taplist_is_tenant_owner(p_tenant_id) THEN
    RAISE EXCEPTION 'Forbidden: only owner can publish or unpublish the storefront';
  END IF;

  IF p_visible THEN
    v_ready := public.get_tenant_publish_readiness(p_tenant_id);
    IF NOT coalesce((v_ready->>'ok')::boolean, false) THEN
      RAISE EXCEPTION 'Publish blocked: %', coalesce(v_ready->>'errors', '[]');
    END IF;
  END IF;

  UPDATE public.tenants
  SET is_public_visible = p_visible, last_menu_updated_at = now()
  WHERE id = p_tenant_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_tenant_public_visibility(uuid, boolean) TO authenticated;

-- ---------------------------------------------------------------------------
-- upsert_taplist_drink: sync drinks.price from servings; disable POS if unset
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
  v_errors jsonb := '[]'::jsonb;
  v_drink_id uuid;
  v_category_id uuid;
  v_is_new boolean := false;
  v_name text;
  v_status text;
  v_is_public boolean;
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
  v_status := coalesce(nullif(trim(p_drink->>'public_status'), ''), 'available');
  v_is_public := coalesce((p_drink->>'is_public_visible')::boolean, false);
  v_profile := p_drink->'profile';
  v_servings := p_drink->'servings';

  IF v_name = '' THEN
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'field', 'name', 'message', '请填写酒款名称'));
  END IF;

  IF v_status NOT IN ('new', 'available', 'low', 'sold_out', 'coming_soon') THEN
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'field', 'public_status', 'message', '无效的状态值'));
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

    -- Start not POS-orderable until priced serving sync runs below.
    INSERT INTO public.drinks (
      tenant_id, category_id, brand_name, name, price, price_unit,
      sort_order, enabled, image_url, is_public_visible, public_status, public_sort_order
    )
    VALUES (
      p_tenant_id, v_category_id,
      nullif(trim(p_drink->>'brand_name'), ''),
      v_name,
      0, '杯',
      coalesce((SELECT max(sort_order) FROM public.drinks WHERE tenant_id = p_tenant_id), 0) + 1,
      false,
      nullif(trim(p_drink->>'image_url'), ''),
      false, v_status,
      coalesce((SELECT max(public_sort_order) FROM public.drinks WHERE tenant_id = p_tenant_id), 0) + 1
    )
    RETURNING id INTO v_drink_id;
  ELSE
    UPDATE public.drinks
    SET
      brand_name = nullif(trim(p_drink->>'brand_name'), ''),
      name = v_name,
      image_url = nullif(trim(p_drink->>'image_url'), ''),
      public_status = v_status,
      category_id = coalesce(v_category_id, category_id)
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

  -- Sync legacy drinks.price from servings (never invent from cheapest of many).
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

  IF v_sync_price IS NOT NULL THEN
    UPDATE public.drinks
    SET
      price = v_sync_price,
      enabled = true,
      is_public_visible = v_is_public
    WHERE id = v_drink_id AND tenant_id = p_tenant_id;
  ELSE
    -- No valid priced serving: not POS-orderable; cannot be public.
    UPDATE public.drinks
    SET
      price = 0,
      enabled = false,
      is_public_visible = false
    WHERE id = v_drink_id AND tenant_id = p_tenant_id;
  END IF;

  UPDATE public.tenants SET last_menu_updated_at = now() WHERE id = p_tenant_id;

  RETURN jsonb_build_object(
    'ok', true,
    'drink_id', v_drink_id,
    'created', v_is_new,
    'pos_orderable', v_sync_price IS NOT NULL,
    'public_cleared', v_sync_price IS NULL AND v_is_public
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_taplist_drink(uuid, jsonb) TO authenticated;
