-- Narrow consumer-facing last_menu_updated_at to intentional tonight / public
-- tap-list changes. Do not refresh home-feed freshness for:
-- - catalog / product metadata edits (upsert_drink_product, profiles, product pool)
-- - storefront / public price mode toggles
-- Existing timestamps are left unchanged (no backfill).

-- ---------------------------------------------------------------------------
-- 1) drinks / servings touch: only listing-relevant (or tonight-serving) changes
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.taplist_touch_tenant_menu_updated()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_drink_id uuid;
  v_on_tonight boolean := false;
BEGIN
  IF TG_TABLE_NAME = 'drinks' THEN
    IF TG_OP = 'UPDATE' THEN
      IF NEW.is_public_visible IS NOT DISTINCT FROM OLD.is_public_visible
         AND NEW.public_status IS NOT DISTINCT FROM OLD.public_status
         AND NEW.public_sort_order IS NOT DISTINCT FROM OLD.public_sort_order THEN
        RETURN NEW;
      END IF;
    ELSIF TG_OP = 'INSERT' THEN
      -- New catalog rows start hidden / untapped; do not bump home freshness.
      IF coalesce(NEW.is_public_visible, false) = false
         AND NEW.public_sort_order IS NULL THEN
        RETURN NEW;
      END IF;
    END IF;

    IF TG_OP = 'DELETE' THEN
      v_tenant_id := OLD.tenant_id;
    ELSE
      v_tenant_id := NEW.tenant_id;
    END IF;

  ELSIF TG_TABLE_NAME = 'drink_serving_options' THEN
    v_drink_id := coalesce(NEW.drink_id, OLD.drink_id);

    SELECT d.tenant_id,
           (d.enabled = true AND d.is_public_visible = true AND d.public_sort_order IS NOT NULL)
    INTO v_tenant_id, v_on_tonight
    FROM public.drinks d
    WHERE d.id = v_drink_id;

    IF v_tenant_id IS NULL OR NOT v_on_tonight THEN
      RETURN coalesce(NEW, OLD);
    END IF;

    IF TG_OP = 'UPDATE' THEN
      IF NEW.price IS NOT DISTINCT FROM OLD.price
         AND NEW.label IS NOT DISTINCT FROM OLD.label
         AND NEW.volume_ml IS NOT DISTINCT FROM OLD.volume_ml
         AND NEW.serving_type IS NOT DISTINCT FROM OLD.serving_type
         AND NEW.is_active IS NOT DISTINCT FROM OLD.is_active
         AND NEW.is_default IS NOT DISTINCT FROM OLD.is_default
         AND NEW.public_sort_order IS NOT DISTINCT FROM OLD.public_sort_order
         AND NEW.archived_at IS NOT DISTINCT FROM OLD.archived_at THEN
        RETURN NEW;
      END IF;
    END IF;

  ELSE
    IF TG_OP = 'DELETE' THEN
      v_tenant_id := OLD.tenant_id;
    ELSE
      v_tenant_id := NEW.tenant_id;
    END IF;
  END IF;

  IF v_tenant_id IS NULL THEN
    RETURN coalesce(NEW, OLD);
  END IF;

  PERFORM public.taplist_mark_public_projection_changed(v_tenant_id, TG_TABLE_NAME);

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2) Beer profile metadata must not bump home freshness
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trg_drink_beer_profiles_taplist_touch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN coalesce(NEW, OLD);
END;
$$;

-- ---------------------------------------------------------------------------
-- 3) Shared product-pool edits must not fan out freshness to linked bars
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trg_drink_products_taplist_fanout()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN coalesce(NEW, OLD);
END;
$$;

-- ---------------------------------------------------------------------------
-- 4) upsert_drink_product: catalog save no longer touches last_menu_updated_at
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
  v_category_enabled boolean;
  v_current_category_id uuid;
  v_serving_id uuid;
  v_serving_in_use boolean;
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

    UPDATE public.drinks
    SET brand_name = nullif(trim(v_profile->>'brewery'), '')
    WHERE id = v_drink_id AND tenant_id = p_tenant_id;
  END IF;

  IF jsonb_typeof(v_servings) = 'array' THEN
    FOR v_elem IN SELECT value FROM jsonb_array_elements(v_servings) LOOP
      IF coalesce((v_elem->>'delete')::boolean, false) THEN
        IF nullif(v_elem->>'id', '') IS NOT NULL THEN
          v_serving_id := (v_elem->>'id')::uuid;
          SELECT EXISTS (
            SELECT 1
            FROM public.order_items oi
            WHERE oi.serving_option_id = v_serving_id
          ) INTO v_serving_in_use;

          IF v_serving_in_use THEN
            UPDATE public.drink_serving_options
            SET
              is_active = false,
              is_default = false,
              archived_at = coalesce(archived_at, now()),
              updated_at = now()
            WHERE id = v_serving_id AND tenant_id = p_tenant_id;
          ELSE
            DELETE FROM public.drink_serving_options
            WHERE id = v_serving_id AND tenant_id = p_tenant_id;
          END IF;
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
          archived_at = NULL,
          updated_at = now()
        WHERE id = (v_elem->>'id')::uuid AND tenant_id = p_tenant_id;
      ELSE
        INSERT INTO public.drink_serving_options (
          tenant_id, drink_id, serving_type, label, volume_ml, price,
          is_default, is_active, public_sort_order, archived_at
        )
        VALUES (
          p_tenant_id, v_drink_id,
          coalesce(nullif(trim(v_elem->>'serving_type'), ''), 'draft'),
          trim(coalesce(v_elem->>'label', '')),
          nullif(trim(v_elem->>'volume_ml'), '')::integer,
          coalesce((v_elem->>'price')::numeric, 0),
          coalesce((v_elem->>'is_default')::boolean, false),
          coalesce((v_elem->>'is_active')::boolean, true),
          coalesce((v_elem->>'public_sort_order')::integer, 0),
          NULL
        );
      END IF;
    END LOOP;

    SELECT count(*) INTO v_default_count
    FROM public.drink_serving_options
    WHERE drink_id = v_drink_id
      AND is_default = true
      AND archived_at IS NULL;

    IF v_default_count > 1 THEN
      UPDATE public.drink_serving_options so
      SET is_default = false
      WHERE so.drink_id = v_drink_id
        AND so.is_default = true
        AND so.archived_at IS NULL
        AND so.id <> (
          SELECT id FROM public.drink_serving_options
          WHERE drink_id = v_drink_id AND is_default = true AND archived_at IS NULL
          ORDER BY public_sort_order, created_at
          LIMIT 1
        );
    END IF;
  END IF;

  SELECT so.price INTO v_sync_price
  FROM public.drink_serving_options so
  WHERE so.drink_id = v_drink_id
    AND so.archived_at IS NULL
    AND so.is_active = true
    AND so.is_default = true
    AND so.price > 0
  ORDER BY so.public_sort_order, so.created_at
  LIMIT 1;

  IF v_sync_price IS NULL THEN
    SELECT count(*) INTO v_priced_count
    FROM public.drink_serving_options so
    WHERE so.drink_id = v_drink_id
      AND so.archived_at IS NULL
      AND so.is_active = true
      AND so.price > 0;

    IF v_priced_count = 1 THEN
      SELECT so.price INTO v_sync_price
      FROM public.drink_serving_options so
      WHERE so.drink_id = v_drink_id
        AND so.archived_at IS NULL
        AND so.is_active = true
        AND so.price > 0
      LIMIT 1;
    END IF;
  END IF;

  UPDATE public.drinks
  SET price = coalesce(v_sync_price, 0)
  WHERE id = v_drink_id AND tenant_id = p_tenant_id;

  -- Intentionally do not set tenants.last_menu_updated_at here.
  -- Catalog / product metadata edits are not tonight tap-list changes.
  -- Serving edits on a drink already on tonight still bump via the servings trigger.

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
-- 5) Storefront: do not treat profile edits as menu freshness
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_tenant_taplist_storefront(
  p_tenant_id uuid,
  p_display_name text,
  p_district text,
  p_address text,
  p_cover_image_url text,
  p_city text,
  p_opening_hour jsonb DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_tag_keys text[] DEFAULT NULL,
  p_brewing_type text DEFAULT NULL,
  p_update_storefront_extras boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tag_key text;
  v_brewing_type text;
  v_city text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.taplist_can_view_tenant(p_tenant_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  v_city := public.taplist_canonical_city_key(coalesce(nullif(trim(p_city), ''), 'Shanghai'));

  IF p_update_storefront_extras THEN
    IF p_brewing_type IS NOT NULL THEN
      v_brewing_type := nullif(trim(p_brewing_type), '');
      IF v_brewing_type IS NOT NULL
         AND v_brewing_type NOT IN ('house_brand', 'on_site_brewery') THEN
        RAISE EXCEPTION 'Invalid brewing_type: %', v_brewing_type;
      END IF;
    END IF;

    IF p_tag_keys IS NOT NULL THEN
      FOREACH v_tag_key IN ARRAY p_tag_keys LOOP
        IF v_tag_key IS NULL OR trim(v_tag_key) = '' THEN
          CONTINUE;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM public.bar_tag_definitions d WHERE d.key = trim(v_tag_key)
        ) THEN
          RAISE EXCEPTION 'Unknown tag key: %', v_tag_key;
        END IF;
      END LOOP;
    END IF;
  END IF;

  UPDATE public.tenants
  SET
    display_name = nullif(trim(p_display_name), ''),
    district = nullif(trim(p_district), ''),
    address = nullif(trim(p_address), ''),
    cover_image_url = CASE
      WHEN p_cover_image_url IS NULL THEN cover_image_url
      ELSE nullif(trim(p_cover_image_url), '')
    END,
    city = v_city,
    opening_hour = CASE
      WHEN p_opening_hour IS NULL THEN NULL
      WHEN p_opening_hour = 'null'::jsonb THEN NULL
      ELSE p_opening_hour
    END,
    description = nullif(trim(p_description), ''),
    brewing_type = CASE
      WHEN NOT p_update_storefront_extras THEN brewing_type
      WHEN p_brewing_type IS NULL THEN brewing_type
      ELSE v_brewing_type
    END
  WHERE id = p_tenant_id;

  -- Do not call taplist_mark_public_projection_changed: storefront ≠ tonight menu.

  IF p_update_storefront_extras THEN
    DELETE FROM public.tenant_bar_tags WHERE tenant_id = p_tenant_id;

    INSERT INTO public.tenant_bar_tags (tenant_id, tag_key)
    SELECT DISTINCT p_tenant_id, trim(k)
    FROM unnest(coalesce(p_tag_keys, ARRAY[]::text[])) AS k
    WHERE k IS NOT NULL AND trim(k) <> '';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_tenant_taplist_storefront(
  uuid, text, text, text, text, text, jsonb, text, text[], text, boolean
) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6) Public price mode toggle: not a tap-list composition change
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_tenant_public_price_mode(
  p_tenant_id uuid,
  p_mode text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_before text;
  v_mode text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.taplist_can_view_tenant(p_tenant_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  v_mode := lower(trim(coalesce(p_mode, '')));
  IF v_mode NOT IN ('show', 'hide') THEN
    RAISE EXCEPTION 'Invalid public_price_mode';
  END IF;

  SELECT coalesce(t.public_price_mode, 'hide')
  INTO v_before
  FROM public.tenants t
  WHERE t.id = p_tenant_id;

  IF v_before IS NULL THEN
    RAISE EXCEPTION 'Tenant not found';
  END IF;

  UPDATE public.tenants
  SET public_price_mode = v_mode
  WHERE id = p_tenant_id;

  PERFORM public._audit_log(
    p_tenant_id,
    'tenant_public_price_mode_changed',
    'tenant',
    p_tenant_id,
    jsonb_build_object('public_price_mode', v_before),
    jsonb_build_object('public_price_mode', v_mode)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'tenant_id', p_tenant_id,
    'public_price_mode', v_mode
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_tenant_public_price_mode(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7) restore_drink returns to catalog only — not a tonight menu change
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.restore_drink(p_drink_id uuid)
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
    enabled = true,
    is_public_visible = false,
    public_sort_order = NULL,
    public_status = 'available'
  WHERE id = p_drink_id
    AND tenant_id = v_tenant_id;

  RETURN jsonb_build_object(
    'ok', true,
    'drink_id', p_drink_id,
    'enabled', true,
    'is_public_visible', false,
    'public_sort_order', null,
    'public_status', 'available'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.restore_drink(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 8) archive_drink: bump only when the drink was actually on tonight
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.archive_drink(p_drink_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_was_on_tonight boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT
    d.tenant_id,
    (d.is_public_visible = true AND d.public_sort_order IS NOT NULL)
  INTO v_tenant_id, v_was_on_tonight
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
    enabled = false,
    is_public_visible = false,
    public_sort_order = NULL
  WHERE id = p_drink_id
    AND tenant_id = v_tenant_id;

  -- Trigger also bumps when listing fields change; explicit bump retained for
  -- clarity when removing a tonight drink. Catalog-only archive stays quiet.
  IF v_was_on_tonight THEN
    UPDATE public.tenants
    SET last_menu_updated_at = now()
    WHERE id = v_tenant_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'drink_id', p_drink_id,
    'enabled', false,
    'is_public_visible', false,
    'public_sort_order', null
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.archive_drink(uuid) TO authenticated;
