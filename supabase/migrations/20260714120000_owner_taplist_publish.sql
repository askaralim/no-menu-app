-- Tonight Control (No Menu POS 酒单): full taplist parity for owner AND staff,
-- with atomic, immediate per-beer saves.
--
-- Rationale: many owners will not (or cannot) create beers themselves, and some
-- bars have no staff while others rely entirely on staff. Whoever is on the
-- floor must be able to add a newly-tapped beer end-to-end and manage the
-- taplist. There is therefore no owner-only taplist distinction.
--
-- Any tenant member (owner / staff / super_admin) may:
--   - create a new beer and put it on the taplist
--   - edit profile / servings / image / status / visibility
--   - toggle the whole taplist online/offline (go-live)
--   - set category public visibility
--
-- No new columns. Reuses existing taplist schema (drinks, categories,
-- drink_beer_profiles, drink_serving_options, tenants).

-- ---------------------------------------------------------------------------
-- Role helper: any tenant member may edit the taplist
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.taplist_can_view_tenant(p_tenant_id uuid)
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
        OR (ur.tenant_id = p_tenant_id AND ur.role IN ('owner', 'staff'))
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.taplist_can_view_tenant(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Remove the earlier owner-only hardening (staff now have full parity)
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_drinks_block_staff_taplist_fields ON public.drinks;
DROP FUNCTION IF EXISTS public.trg_drinks_block_staff_taplist_fields();

DROP TRIGGER IF EXISTS trg_categories_block_staff_public_visible ON public.categories;
DROP FUNCTION IF EXISTS public.trg_categories_block_staff_public_visible();

DROP FUNCTION IF EXISTS public.publish_owner_taplist_snapshot(uuid, jsonb);

-- Restore tenant-member read/write on the extension tables.
DROP POLICY IF EXISTS drink_beer_profiles_owner_write ON public.drink_beer_profiles;
DROP POLICY IF EXISTS drink_beer_profiles_tenant_select ON public.drink_beer_profiles;
DROP POLICY IF EXISTS drink_beer_profiles_tenant_rw ON public.drink_beer_profiles;
CREATE POLICY drink_beer_profiles_tenant_rw
  ON public.drink_beer_profiles FOR ALL TO authenticated
  USING (tenant_id = public.get_auth_tenant_id())
  WITH CHECK (tenant_id = public.get_auth_tenant_id());

DROP POLICY IF EXISTS drink_serving_options_owner_write ON public.drink_serving_options;
DROP POLICY IF EXISTS drink_serving_options_tenant_select ON public.drink_serving_options;
DROP POLICY IF EXISTS drink_serving_options_tenant_rw ON public.drink_serving_options;
CREATE POLICY drink_serving_options_tenant_rw
  ON public.drink_serving_options FOR ALL TO authenticated
  USING (tenant_id = public.get_auth_tenant_id())
  WITH CHECK (tenant_id = public.get_auth_tenant_id());

-- Owner-only helper is no longer used anywhere.
DROP FUNCTION IF EXISTS public.taplist_is_tenant_owner(uuid);

-- ---------------------------------------------------------------------------
-- Drink consumer fields (image + sort): any tenant member
-- ---------------------------------------------------------------------------

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

  UPDATE public.drinks
  SET
    image_url = nullif(trim(p_image_url), ''),
    is_public_visible = p_is_public_visible,
    public_status = coalesce(nullif(trim(p_public_status), ''), 'available'),
    public_sort_order = coalesce(p_public_sort_order, 0)
  WHERE id = p_drink_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_drink_taplist_consumer_fields(uuid, text, boolean, text, integer) TO authenticated;

-- ---------------------------------------------------------------------------
-- Immediate status + visibility (any tenant member)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_drink_taplist_status(
  p_drink_id uuid,
  p_is_public_visible boolean,
  p_public_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_enabled boolean;
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

  IF coalesce(nullif(trim(p_public_status), ''), 'available')
     NOT IN ('new', 'available', 'low', 'sold_out', 'coming_soon') THEN
    RAISE EXCEPTION 'Invalid public_status';
  END IF;

  UPDATE public.drinks
  SET
    is_public_visible = p_is_public_visible,
    public_status = coalesce(nullif(trim(p_public_status), ''), 'available')
  WHERE id = p_drink_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_drink_taplist_status(uuid, boolean, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Whole-taplist go-live: any tenant member (override base owner-only def)
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
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.taplist_can_view_tenant(p_tenant_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  UPDATE public.tenants
  SET is_public_visible = p_visible, last_menu_updated_at = now()
  WHERE id = p_tenant_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_tenant_public_visibility(uuid, boolean) TO authenticated;

-- ---------------------------------------------------------------------------
-- Read full Tap List editing payload for a tenant (any tenant member)
-- ---------------------------------------------------------------------------

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
        'status', t.status
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
          'display_description', d.display_description
        ) ORDER BY d.public_sort_order, lower(d.name)
      )
      FROM public.drinks d
      WHERE d.tenant_id = v_tenant_id
        AND d.enabled = true
    ), '[]'::jsonb),
    'beer_profiles', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'drink_id', p.drink_id,
          'brewery', p.brewery,
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
        AND d.enabled = true
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
        AND d.enabled = true
    ), '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_owner_taplist_payload(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Create OR update one beer atomically (any tenant member)
-- ---------------------------------------------------------------------------
-- p_drink shape:
-- {
--   "id"?, "category_id"?, "name", "brand_name", "image_url",
--   "is_public_visible", "public_status",
--   "profile": { "brewery","beer_style","abv","ibu","country","description" },
--   "servings": [ { "id"?, "client_id"?, "serving_type","label","volume_ml",
--                   "price","is_default","is_active","public_sort_order","delete"? } ]
-- }
-- Validation runs before any write; on error nothing is applied.

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

  -- ===== Validation (no writes) =====
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
    ELSIF v_is_public AND NOT EXISTS (
      SELECT 1 FROM public.drinks d WHERE d.id = v_drink_id AND d.enabled = true
    ) THEN
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'field', 'is_public_visible', 'message', '未上架（enabled=false）的酒款不能公开'));
    END IF;
  END IF;

  IF jsonb_array_length(v_errors) > 0 THEN
    RETURN jsonb_build_object('ok', false, 'errors', v_errors);
  END IF;

  -- ===== Resolve category =====
  v_category_id := nullif(p_drink->>'category_id', '')::uuid;
  IF v_category_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.categories c WHERE c.id = v_category_id AND c.tenant_id = p_tenant_id
     ) THEN
    v_category_id := NULL;
  END IF;

  -- ===== Write: drink =====
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
      true,
      nullif(trim(p_drink->>'image_url'), ''),
      v_is_public, v_status,
      coalesce((SELECT max(public_sort_order) FROM public.drinks WHERE tenant_id = p_tenant_id), 0) + 1
    )
    RETURNING id INTO v_drink_id;
  ELSE
    UPDATE public.drinks
    SET
      brand_name = nullif(trim(p_drink->>'brand_name'), ''),
      name = v_name,
      image_url = nullif(trim(p_drink->>'image_url'), ''),
      is_public_visible = v_is_public,
      public_status = v_status,
      category_id = coalesce(v_category_id, category_id)
    WHERE id = v_drink_id AND tenant_id = p_tenant_id;
  END IF;

  -- ===== Write: beer profile (upsert by drink_id) =====
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

  -- ===== Write: serving options (insert / update / delete) =====
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

    -- Enforce at most one default serving (keep the lowest sort order).
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

  UPDATE public.tenants SET last_menu_updated_at = now() WHERE id = p_tenant_id;

  RETURN jsonb_build_object('ok', true, 'drink_id', v_drink_id, 'created', v_is_new);
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_taplist_drink(uuid, jsonb) TO authenticated;
