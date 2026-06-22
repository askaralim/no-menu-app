-- Product Pool foundation: canonical drink_products, bar-level linking, admin RPCs,
-- and public tap list RPC compatibility (unlinked drinks unchanged).

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.drink_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  name_en text,
  aliases text[] NOT NULL DEFAULT '{}',
  brand_name text,
  brewery text,
  beer_style text,
  abv numeric(4,2),
  ibu integer,
  country text,
  origin_region text,
  image_url text,
  description text,
  tasting_note text,
  status text NOT NULL DEFAULT 'active',
  source text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT drink_products_status_check CHECK (status IN ('active', 'archived'))
);

ALTER TABLE public.drinks
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.drink_products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS display_description text;

CREATE INDEX IF NOT EXISTS idx_drinks_product_id ON public.drinks(product_id);
CREATE INDEX IF NOT EXISTS idx_drink_products_name ON public.drink_products(name);
CREATE INDEX IF NOT EXISTS idx_drink_products_brewery ON public.drink_products(brewery);
CREATE INDEX IF NOT EXISTS idx_drink_products_aliases ON public.drink_products USING gin(aliases);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.drink_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS drink_products_search_authenticated ON public.drink_products;
CREATE POLICY drink_products_search_authenticated ON public.drink_products
  FOR SELECT TO authenticated
  USING (
    status = 'active'
    AND EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('owner', 'staff', 'super_admin')
    )
  );

DROP POLICY IF EXISTS drink_products_super_admin ON public.drink_products;
CREATE POLICY drink_products_super_admin ON public.drink_products
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'super_admin'
    )
  );

-- ---------------------------------------------------------------------------
-- Auth helpers (internal)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = 'super_admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_tenant_drink(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_super_admin()
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.tenant_id = p_tenant_id
        AND ur.role = 'owner'
    );
$$;

-- ---------------------------------------------------------------------------
-- Admin RPCs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.search_drink_products(p_query text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_q text := trim(p_query);
  v_pattern text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('owner', 'staff', 'super_admin')
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

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
              'id', dp.id,
              'name', dp.name,
              'name_en', dp.name_en,
              'brewery', dp.brewery,
              'brand_name', dp.brand_name,
              'beer_style', dp.beer_style,
              'abv', dp.abv,
              'country', dp.country,
              'image_url', dp.image_url
            ) AS row_obj,
            lower(dp.name) AS name_sort
          FROM public.drink_products dp
          WHERE dp.status = 'active'
            AND (
              dp.name ILIKE v_pattern
              OR coalesce(dp.name_en, '') ILIKE v_pattern
              OR coalesce(dp.brand_name, '') ILIKE v_pattern
              OR coalesce(dp.brewery, '') ILIKE v_pattern
              OR coalesce(dp.beer_style, '') ILIKE v_pattern
              OR EXISTS (
                SELECT 1
                FROM unnest(dp.aliases) AS alias_item
                WHERE alias_item ILIKE v_pattern
              )
            )
          LIMIT 50
        ) sub
      ),
      '[]'::jsonb
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_create_drink_product(
  p_name text,
  p_name_en text DEFAULT NULL,
  p_aliases text[] DEFAULT '{}',
  p_brand_name text DEFAULT NULL,
  p_brewery text DEFAULT NULL,
  p_beer_style text DEFAULT NULL,
  p_abv numeric DEFAULT NULL,
  p_ibu integer DEFAULT NULL,
  p_country text DEFAULT NULL,
  p_origin_region text DEFAULT NULL,
  p_image_url text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_tasting_note text DEFAULT NULL,
  p_source text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Unauthorized: super_admin role required';
  END IF;

  IF nullif(trim(p_name), '') IS NULL THEN
    RAISE EXCEPTION 'Product name is required';
  END IF;

  INSERT INTO public.drink_products (
    name,
    name_en,
    aliases,
    brand_name,
    brewery,
    beer_style,
    abv,
    ibu,
    country,
    origin_region,
    image_url,
    description,
    tasting_note,
    source,
    created_by
  )
  VALUES (
    trim(p_name),
    nullif(trim(p_name_en), ''),
    coalesce(p_aliases, '{}'),
    nullif(trim(p_brand_name), ''),
    nullif(trim(p_brewery), ''),
    nullif(trim(p_beer_style), ''),
    p_abv,
    p_ibu,
    nullif(trim(p_country), ''),
    nullif(trim(p_origin_region), ''),
    nullif(trim(p_image_url), ''),
    nullif(trim(p_description), ''),
    nullif(trim(p_tasting_note), ''),
    nullif(trim(p_source), ''),
    auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'product_id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.link_drink_to_product(
  p_drink_id uuid,
  p_product_id uuid,
  p_display_name text DEFAULT NULL,
  p_display_description text DEFAULT NULL
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

  SELECT d.tenant_id
  INTO v_tenant_id
  FROM public.drinks d
  WHERE d.id = p_drink_id;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Drink not found';
  END IF;

  IF NOT public.can_manage_tenant_drink(v_tenant_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.drink_products dp
    WHERE dp.id = p_product_id
      AND dp.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Product not found or not active';
  END IF;

  UPDATE public.drinks
  SET
    product_id = p_product_id,
    display_name = nullif(trim(p_display_name), ''),
    display_description = nullif(trim(p_display_description), '')
  WHERE id = p_drink_id;

  RETURN jsonb_build_object('ok', true, 'drink_id', p_drink_id, 'product_id', p_product_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.unlink_drink_product(p_drink_id uuid)
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

  SELECT d.tenant_id
  INTO v_tenant_id
  FROM public.drinks d
  WHERE d.id = p_drink_id;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Drink not found';
  END IF;

  IF NOT public.can_manage_tenant_drink(v_tenant_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  UPDATE public.drinks
  SET
    product_id = NULL,
    display_name = NULL,
    display_description = NULL
  WHERE id = p_drink_id;

  RETURN jsonb_build_object('ok', true, 'drink_id', p_drink_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_create_drink_product_from_drink(
  p_drink_id uuid,
  p_auto_link boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_drink record;
  v_profile record;
  v_product_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Unauthorized: super_admin role required';
  END IF;

  SELECT d.id, d.name, d.brand_name, d.image_url
  INTO v_drink
  FROM public.drinks d
  WHERE d.id = p_drink_id;

  IF v_drink.id IS NULL THEN
    RAISE EXCEPTION 'Drink not found';
  END IF;

  SELECT p.brewery, p.beer_style, p.abv, p.ibu, p.country, p.description
  INTO v_profile
  FROM public.drink_beer_profiles p
  WHERE p.drink_id = p_drink_id;

  INSERT INTO public.drink_products (
    name,
    brand_name,
    brewery,
    beer_style,
    abv,
    ibu,
    country,
    image_url,
    description,
    tasting_note,
    source,
    created_by
  )
  VALUES (
    v_drink.name,
    nullif(trim(v_drink.brand_name), ''),
    nullif(trim(coalesce(v_profile.brewery, v_drink.brand_name)), ''),
    nullif(trim(v_profile.beer_style), ''),
    v_profile.abv,
    v_profile.ibu,
    nullif(trim(v_profile.country), ''),
    nullif(trim(v_drink.image_url), ''),
    nullif(trim(v_profile.description), ''),
    nullif(trim(v_profile.description), ''),
    'imported_from_drink',
    auth.uid()
  )
  RETURNING id INTO v_product_id;

  IF p_auto_link THEN
    PERFORM public.link_drink_to_product(p_drink_id, v_product_id, NULL, NULL);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'product_id', v_product_id,
    'drink_id', p_drink_id,
    'linked', p_auto_link
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_drink_products(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_drink_product(text, text, text[], text, text, text, numeric, integer, text, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.link_drink_to_product(uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unlink_drink_product(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_drink_product_from_drink(uuid, boolean) TO authenticated;

-- ---------------------------------------------------------------------------
-- Public RPC: get_public_taplist_drinks
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_public_taplist_drinks(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ok boolean;
BEGIN
  SELECT (t.status = 'active' AND t.is_public_visible)
  INTO v_ok
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
                      'price', so.price,
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

-- ---------------------------------------------------------------------------
-- Public RPC: search_public_taplist
-- ---------------------------------------------------------------------------

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
                  'price', so.price
                )
                FROM public.drink_serving_options so
                WHERE so.drink_id = d.id
                  AND so.is_active = true
                  AND so.price > 0
                ORDER BY so.is_default DESC, so.public_sort_order, so.label
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

-- ---------------------------------------------------------------------------
-- Public RPC: get_public_taplist_new_drinks
-- ---------------------------------------------------------------------------

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
        SELECT jsonb_agg(row_obj ORDER BY menu_updated_at DESC NULLS LAST, public_sort, name_sort)
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
                  'price', so.price
                )
                FROM public.drink_serving_options so
                WHERE so.drink_id = d.id
                  AND so.is_active = true
                  AND so.price > 0
                ORDER BY so.is_default DESC, so.public_sort_order, so.label
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
            t.last_menu_updated_at AS menu_updated_at,
            d.public_sort_order AS public_sort,
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
            AND d.public_status = 'new'
            AND c.enabled = true
            AND c.is_public_visible = true
          ORDER BY t.last_menu_updated_at DESC NULLS LAST, d.public_sort_order, lower(d.name)
          LIMIT 10
        ) sub
      ),
      '[]'::jsonb
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_taplist_drinks(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_taplist_drinks(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_public_taplist(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.search_public_taplist(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_taplist_new_drinks(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_taplist_new_drinks(text) TO authenticated;
