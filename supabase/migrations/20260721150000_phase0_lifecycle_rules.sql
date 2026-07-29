-- Phase 0: lifecycle rule stopgap
-- - Allow public drinks without priced servings
-- - tenants.public_price_mode (default hide); public RPCs null out price when hide
-- - Normalize public_sort_order <= 0 to NULL
-- - Server-side orderable guard on order_items
-- Forward-only.

-- ---------------------------------------------------------------------------
-- 1) tenants.public_price_mode
-- ---------------------------------------------------------------------------

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS public_price_mode text NOT NULL DEFAULT 'hide';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tenants_public_price_mode_check'
  ) THEN
    ALTER TABLE public.tenants
      ADD CONSTRAINT tenants_public_price_mode_check
      CHECK (public_price_mode IN ('show', 'hide'));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2) Normalize tap numbers: not-on-tonight = NULL (never 0)
-- ---------------------------------------------------------------------------

ALTER TABLE public.drinks
  ALTER COLUMN public_sort_order DROP NOT NULL;

ALTER TABLE public.drinks
  ALTER COLUMN public_sort_order SET DEFAULT NULL;

UPDATE public.drinks
SET public_sort_order = NULL
WHERE public_sort_order IS NOT NULL
  AND public_sort_order <= 0;

-- ---------------------------------------------------------------------------
-- 3) Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.taplist_public_price(p_mode text, p_price numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE WHEN coalesce(p_mode, 'hide') = 'show' THEN p_price ELSE NULL END;
$$;

CREATE OR REPLACE FUNCTION public.drink_has_orderable_price(p_drink_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.drink_serving_options so
    WHERE so.drink_id = p_drink_id
      AND so.is_active = true
      AND so.price > 0
  );
$$;

CREATE OR REPLACE FUNCTION public.drink_is_orderable(p_drink_id uuid, p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.drinks d
    WHERE d.id = p_drink_id
      AND d.tenant_id = p_tenant_id
      AND d.enabled = true
      AND d.public_status NOT IN ('sold_out', 'coming_soon')
      AND public.drink_has_orderable_price(d.id)
  );
$$;

REVOKE ALL ON FUNCTION public.drink_has_orderable_price(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.drink_is_orderable(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.drink_has_orderable_price(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.drink_is_orderable(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4) order_items: server-side orderable enforcement
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_order_item_orderable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.drink_id IS NOT DISTINCT FROM OLD.drink_id
     AND NEW.tenant_id IS NOT DISTINCT FROM OLD.tenant_id
     AND NEW.quantity_cup IS NOT DISTINCT FROM OLD.quantity_cup
     AND NEW.quantity_bottle IS NOT DISTINCT FROM OLD.quantity_bottle THEN
    RETURN NEW;
  END IF;

  -- Only enforce when adding cups/bottles (or changing drink).
  IF coalesce(NEW.quantity_cup, 0) <= 0 AND coalesce(NEW.quantity_bottle, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  IF NOT public.drink_is_orderable(NEW.drink_id, NEW.tenant_id) THEN
    RAISE EXCEPTION '该商品当前不可点单';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_order_item_orderable ON public.order_items;
CREATE TRIGGER trg_enforce_order_item_orderable
  BEFORE INSERT OR UPDATE ON public.order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_order_item_orderable();

-- ---------------------------------------------------------------------------
-- 5) get_tenant_publish_readiness: price required only when mode = show
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
  v_mode text;
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

  v_mode := coalesce(v_tenant.public_price_mode, 'hide');

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

  IF v_mode = 'show' THEN
    SELECT count(*) INTO v_unpriced
    FROM public.drinks d
    WHERE d.tenant_id = p_tenant_id
      AND d.enabled = true
      AND d.is_public_visible = true
      AND NOT public.drink_has_orderable_price(d.id);

    IF v_unpriced > 0 THEN
      v_errors := v_errors || jsonb_build_array(
        format('门店设置为公开显示价格：%s 个公开酒款缺少有效价格规格', v_unpriced));
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', jsonb_array_length(v_errors) = 0,
    'errors', v_errors,
    'public_drink_count', v_public_count,
    'has_owner', v_has_owner,
    'public_price_mode', v_mode
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_tenant_publish_readiness(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6) upsert_taplist_drink: no longer force disable/unpublish when unpriced
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

    -- Catalog-available by default; listing flags come from the request.
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
      coalesce(
        nullif((p_drink->>'public_sort_order')::integer, 0),
        (SELECT max(public_sort_order) FROM public.drinks WHERE tenant_id = p_tenant_id AND public_sort_order IS NOT NULL),
        0
      ) + 1
    )
    RETURNING id INTO v_drink_id;
  ELSE
    UPDATE public.drinks
    SET
      brand_name = nullif(trim(p_drink->>'brand_name'), ''),
      name = v_name,
      image_url = nullif(trim(p_drink->>'image_url'), ''),
      public_status = v_status,
      is_public_visible = v_is_public,
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

  -- Sync legacy drinks.price from servings (compatibility only; not orderable source of truth).
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
  SET
    price = coalesce(v_sync_price, 0),
    enabled = true,
    is_public_visible = v_is_public
  WHERE id = v_drink_id AND tenant_id = p_tenant_id;

  UPDATE public.tenants SET last_menu_updated_at = now() WHERE id = p_tenant_id;

  RETURN jsonb_build_object(
    'ok', true,
    'drink_id', v_drink_id,
    'created', v_is_new,
    'pos_orderable', v_sync_price IS NOT NULL,
    'missing_price_warning', v_sync_price IS NULL,
    'public_cleared', false
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_taplist_drink(uuid, jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7) Public RPCs: null price when public_price_mode = hide
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_public_taplist_drinks(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ok boolean;
  v_mode text;
BEGIN
  SELECT (t.status = 'active' AND t.is_public_visible), coalesce(t.public_price_mode, 'hide')
  INTO v_ok, v_mode
  FROM public.tenants t
  WHERE t.id = p_tenant_id;

  IF v_ok IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END IF;

  IF NOT v_ok THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_public');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'public_price_mode', v_mode,
    'drinks', coalesce(
      (
        SELECT jsonb_agg(drink_obj ORDER BY sold_rank, public_sort, name_sort)
        FROM (
          SELECT
            jsonb_build_object(
              'id', d.id,
              'category_id', d.category_id,
              'brand_name', d.brand_name,
              'name', CASE
                WHEN d.product_id IS NULL THEN d.name
                ELSE coalesce(nullif(trim(d.display_name), ''), dp.name, d.name)
              END,
              'image_url', CASE
                WHEN d.product_id IS NULL THEN d.image_url
                ELSE coalesce(nullif(trim(d.image_url), ''), dp.image_url)
              END,
              'public_status', public.taplist_public_status_zh(d.public_status),
              'public_sort_order', d.public_sort_order,
              'product_id', d.product_id,
              'beer', (
                SELECT CASE
                  WHEN sub.brewery IS NULL
                    AND sub.beer_style IS NULL
                    AND sub.abv IS NULL
                    AND sub.ibu IS NULL
                    AND sub.country IS NULL
                    AND sub.description IS NULL
                  THEN NULL
                  ELSE jsonb_build_object(
                    'brewery', sub.brewery,
                    'beer_style', sub.beer_style,
                    'abv', sub.abv,
                    'ibu', sub.ibu,
                    'country', sub.country,
                    'description', sub.description
                  )
                END
                FROM (
                  SELECT
                    coalesce(dp.brewery, dp.brand_name, p.brewery, d.brand_name) AS brewery,
                    coalesce(dp.beer_style, p.beer_style) AS beer_style,
                    coalesce(dp.abv, p.abv) AS abv,
                    coalesce(dp.ibu, p.ibu) AS ibu,
                    coalesce(dp.country, p.country) AS country,
                    CASE
                      WHEN d.product_id IS NULL THEN p.description
                      ELSE coalesce(
                        nullif(trim(d.display_description), ''),
                        dp.tasting_note,
                        dp.description,
                        p.description
                      )
                    END AS description
                ) sub
              ),
              'serving_options', (
                SELECT coalesce(
                  jsonb_agg(
                    jsonb_build_object(
                      'id', so.id,
                      'serving_type', so.serving_type,
                      'label', so.label,
                      'volume_ml', so.volume_ml,
                      'price', public.taplist_public_price(v_mode, so.price),
                      'is_default', so.is_default,
                      'is_active', so.is_active,
                      'public_sort_order', so.public_sort_order
                    )
                    ORDER BY so.public_sort_order, so.label
                  ),
                  '[]'::jsonb
                )
                FROM public.drink_serving_options so
                WHERE so.drink_id = d.id AND so.is_active = true
              )
            ) AS drink_obj,
            CASE WHEN d.public_status = 'sold_out' THEN 1 ELSE 0 END AS sold_rank,
            d.public_sort_order AS public_sort,
            lower(d.name) AS name_sort
          FROM public.drinks d
          INNER JOIN public.categories c
            ON c.id = d.category_id AND c.tenant_id = d.tenant_id
          LEFT JOIN public.drink_beer_profiles p ON p.drink_id = d.id
          LEFT JOIN public.drink_products dp
            ON dp.id = d.product_id AND dp.status = 'active'
          WHERE d.tenant_id = p_tenant_id
            AND d.enabled = true
            AND d.is_public_visible = true
            AND c.enabled = true
            AND c.is_public_visible = true
        ) x
      ),
      '[]'::jsonb
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_taplist_drinks(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_taplist_drinks(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.search_public_taplist(
  p_city text DEFAULT NULL,
  p_query text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_city text := coalesce(nullif(trim(p_city), ''), 'Shanghai');
  v_q text := trim(p_query);
  v_pattern text;
BEGIN
  IF v_q = '' THEN
    RETURN jsonb_build_object('ok', true, 'results', '[]'::jsonb);
  END IF;

  v_pattern := '%' || v_q || '%';

  RETURN jsonb_build_object(
    'ok', true,
    'results', coalesce(
      (
        SELECT jsonb_agg(row_obj ORDER BY name_sort)
        FROM (
          SELECT
            jsonb_build_object(
              'drink_id', d.id,
              'name', CASE
                WHEN d.product_id IS NULL THEN d.name
                ELSE coalesce(nullif(trim(d.display_name), ''), dp.name, d.name)
              END,
              'brand_name', d.brand_name,
              'image_url', CASE
                WHEN d.product_id IS NULL THEN d.image_url
                ELSE coalesce(nullif(trim(d.image_url), ''), dp.image_url)
              END,
              'public_status', public.taplist_public_status_zh(d.public_status),
              'product_id', d.product_id,
              'default_serving', (
                SELECT jsonb_build_object(
                  'label', so.label,
                  'volume_ml', so.volume_ml,
                  'price', public.taplist_public_price(coalesce(t.public_price_mode, 'hide'), so.price)
                )
                FROM public.drink_serving_options so
                WHERE so.drink_id = d.id
                  AND so.is_active = true
                ORDER BY
                  CASE WHEN coalesce(t.public_price_mode, 'hide') = 'show' THEN (so.price > 0) ELSE true END DESC,
                  so.is_default DESC,
                  so.public_sort_order,
                  so.label
                LIMIT 1
              ),
              'tenant_id', t.id,
              'tenant_slug', t.slug,
              'tenant_display_name', coalesce(nullif(trim(t.display_name), ''), t.name),
              'tenant_district', t.district,
              'tenant_address', t.address,
              'brewery', coalesce(dp.brewery, dp.brand_name, p.brewery, d.brand_name),
              'beer_style', coalesce(dp.beer_style, p.beer_style),
              'abv', coalesce(dp.abv, p.abv)
            ) AS row_obj,
            lower(d.name) AS name_sort
          FROM public.drinks d
          INNER JOIN public.tenants t ON t.id = d.tenant_id
          INNER JOIN public.categories c
            ON c.id = d.category_id AND c.tenant_id = d.tenant_id
          LEFT JOIN public.drink_beer_profiles p ON p.drink_id = d.id
          LEFT JOIN public.drink_products dp
            ON dp.id = d.product_id AND dp.status = 'active'
          WHERE t.status = 'active'
            AND t.is_public_visible = true
            AND lower(trim(t.city)) = lower(trim(v_city))
            AND d.enabled = true
            AND d.is_public_visible = true
            AND c.enabled = true
            AND c.is_public_visible = true
            AND (
              d.name ILIKE v_pattern
              OR coalesce(d.brand_name, '') ILIKE v_pattern
              OR coalesce(p.brewery, '') ILIKE v_pattern
              OR coalesce(p.beer_style, '') ILIKE v_pattern
              OR coalesce(dp.name, '') ILIKE v_pattern
              OR coalesce(dp.name_en, '') ILIKE v_pattern
              OR coalesce(dp.brand_name, '') ILIKE v_pattern
              OR coalesce(dp.brewery, '') ILIKE v_pattern
              OR coalesce(dp.beer_style, '') ILIKE v_pattern
              OR EXISTS (
                SELECT 1
                FROM unnest(dp.aliases) AS alias_item
                WHERE alias_item ILIKE v_pattern
              )
              OR coalesce(t.name, '') ILIKE v_pattern
              OR coalesce(t.display_name, '') ILIKE v_pattern
              OR coalesce(t.district, '') ILIKE v_pattern
              OR coalesce(t.address, '') ILIKE v_pattern
            )
          LIMIT 50
        ) sub
      ),
      '[]'::jsonb
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_public_taplist(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.search_public_taplist(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_public_taplist_new_drinks(p_city text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_city text := coalesce(nullif(trim(p_city), ''), 'Shanghai');
BEGIN
  RETURN jsonb_build_object(
    'ok', true,
    'results', coalesce(
      (
        WITH ranked AS (
          SELECT
            jsonb_build_object(
              'drink_id', d.id,
              'name', CASE
                WHEN d.product_id IS NULL THEN d.name
                ELSE coalesce(nullif(trim(d.display_name), ''), dp.name, d.name)
              END,
              'brand_name', d.brand_name,
              'image_url', CASE
                WHEN d.product_id IS NULL THEN d.image_url
                ELSE coalesce(nullif(trim(d.image_url), ''), dp.image_url)
              END,
              'public_status', public.taplist_public_status_zh(d.public_status),
              'product_id', d.product_id,
              'default_serving', (
                SELECT jsonb_build_object(
                  'label', so.label,
                  'volume_ml', so.volume_ml,
                  'price', public.taplist_public_price(coalesce(t.public_price_mode, 'hide'), so.price)
                )
                FROM public.drink_serving_options so
                WHERE so.drink_id = d.id
                  AND so.is_active = true
                ORDER BY
                  CASE WHEN coalesce(t.public_price_mode, 'hide') = 'show' THEN (so.price > 0) ELSE true END DESC,
                  so.is_default DESC,
                  so.public_sort_order,
                  so.label
                LIMIT 1
              ),
              'tenant_id', t.id,
              'tenant_slug', t.slug,
              'tenant_display_name', coalesce(nullif(trim(t.display_name), ''), t.name),
              'tenant_district', t.district,
              'tenant_address', t.address,
              'brewery', coalesce(dp.brewery, dp.brand_name, p.brewery, d.brand_name),
              'beer_style', coalesce(dp.beer_style, p.beer_style),
              'abv', coalesce(dp.abv, p.abv)
            ) AS row_obj,
            d.public_status_changed_at AS status_changed_at,
            d.public_sort_order AS public_sort,
            lower(d.name) AS name_sort,
            row_number() OVER (
              PARTITION BY t.id
              ORDER BY d.public_status_changed_at DESC NULLS LAST, d.public_sort_order, lower(d.name)
            ) AS tenant_rank
          FROM public.drinks d
          INNER JOIN public.tenants t ON t.id = d.tenant_id
          INNER JOIN public.categories c
            ON c.id = d.category_id AND c.tenant_id = d.tenant_id
          LEFT JOIN public.drink_beer_profiles p ON p.drink_id = d.id
          LEFT JOIN public.drink_products dp
            ON dp.id = d.product_id AND dp.status = 'active'
          WHERE t.status = 'active'
            AND t.is_public_visible = true
            AND lower(trim(t.city)) = lower(trim(v_city))
            AND d.enabled = true
            AND d.is_public_visible = true
            AND d.public_status = 'new'
            AND d.public_status_changed_at >= now() - interval '14 days'
            AND c.enabled = true
            AND c.is_public_visible = true
        )
        SELECT jsonb_agg(row_obj ORDER BY status_changed_at DESC NULLS LAST, public_sort, name_sort)
        FROM (
          SELECT row_obj, status_changed_at, public_sort, name_sort
          FROM ranked
          WHERE tenant_rank <= 2
          ORDER BY status_changed_at DESC NULLS LAST, public_sort, name_sort
          LIMIT 10
        ) sub
      ),
      '[]'::jsonb
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_taplist_new_drinks(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_taplist_new_drinks(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 8) assign_drink_tap_number: unassigned = NULL (not 0)
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

  SELECT d.id
  INTO v_other_id
  FROM public.drinks d
  WHERE d.tenant_id = v_tenant_id
    AND d.id <> p_drink_id
    AND d.public_sort_order = p_tap_number
  ORDER BY d.created_at
  LIMIT 1;

  IF v_other_id IS NOT NULL THEN
    -- Swap: other takes this drink's previous slot (NULL stays unassigned).
    UPDATE public.drinks
    SET public_sort_order = NULLIF(v_from, 0)
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
        'tap_number', NULLIF(v_from, 0)
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

GRANT EXECUTE ON FUNCTION public.assign_drink_tap_number(uuid, integer) TO authenticated;

