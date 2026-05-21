-- =====================================================================
-- Tap List MVP — schema + public RPCs (patch for EXISTING databases)
-- =====================================================================
-- MVP: no tenants.public_review_status — gate on
--       tenants.status = 'active' AND tenants.is_public_visible = true
-- =====================================================================

-- --- tenants ---
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS city text NOT NULL DEFAULT 'Shanghai';

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS country text NOT NULL DEFAULT 'China';

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS district text;

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS address text;

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS opening_hour jsonb;

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS description text;

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS display_name text;

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS cover_image_url text;

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS is_public_visible boolean NOT NULL DEFAULT false;

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS last_menu_updated_at timestamptz;

-- --- categories (opt-out from Tap List per category) ---
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS is_public_visible boolean NOT NULL DEFAULT true;

-- --- drinks (optional hero image for Tap List; safe if already present) ---
ALTER TABLE public.drinks
  ADD COLUMN IF NOT EXISTS image_url text;

ALTER TABLE public.drinks
  ADD COLUMN IF NOT EXISTS is_public_visible boolean NOT NULL DEFAULT false;

ALTER TABLE public.drinks
  ADD COLUMN IF NOT EXISTS public_status text NOT NULL DEFAULT 'available';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'drinks_public_status_check'
  ) THEN
    ALTER TABLE public.drinks
      ADD CONSTRAINT drinks_public_status_check
      CHECK (public_status IN ('new', 'available', 'low', 'sold_out', 'coming_soon'));
  END IF;
END $$;

ALTER TABLE public.drinks
  ADD COLUMN IF NOT EXISTS public_sort_order integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'drinks_enabled_implies_not_public_check'
  ) THEN
    ALTER TABLE public.drinks
      ADD CONSTRAINT drinks_enabled_implies_not_public_check
      CHECK (enabled OR NOT is_public_visible);
  END IF;
END $$;

-- --- drink_beer_profiles ---
CREATE TABLE IF NOT EXISTS public.drink_beer_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  drink_id uuid NOT NULL REFERENCES public.drinks (id) ON DELETE CASCADE,
  brewery text,
  beer_style text,
  abv numeric(4, 2),
  ibu integer,
  country text,
  description text,
  origin_region text,
  fermentation_type text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (drink_id)
);

CREATE INDEX IF NOT EXISTS idx_drink_beer_profiles_tenant
  ON public.drink_beer_profiles (tenant_id);

ALTER TABLE public.drink_beer_profiles
  ADD COLUMN IF NOT EXISTS description text;

-- --- drink_serving_options (MVP: Tap List display only; how it is sold, not what it is) ---
CREATE TABLE IF NOT EXISTS public.drink_serving_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  drink_id uuid NOT NULL REFERENCES public.drinks (id) ON DELETE CASCADE,
  serving_type text NOT NULL,
  label text NOT NULL,
  volume_ml integer,
  price numeric(10, 2) NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  public_sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT drink_serving_options_serving_type_check
    CHECK (serving_type IN ('draft', 'can', 'bottle', 'flight', 'other'))
);

CREATE INDEX IF NOT EXISTS idx_drink_serving_options_drink
  ON public.drink_serving_options (drink_id);

CREATE INDEX IF NOT EXISTS idx_drink_serving_options_tenant
  ON public.drink_serving_options (tenant_id);

-- --- RLS on new tables ---
ALTER TABLE public.drink_beer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drink_serving_options ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS drink_beer_profiles_tenant_rw ON public.drink_beer_profiles;
CREATE POLICY drink_beer_profiles_tenant_rw
  ON public.drink_beer_profiles FOR ALL TO authenticated
  USING (tenant_id = public.get_auth_tenant_id())
  WITH CHECK (tenant_id = public.get_auth_tenant_id());

DROP POLICY IF EXISTS drink_serving_options_tenant_rw ON public.drink_serving_options;
CREATE POLICY drink_serving_options_tenant_rw
  ON public.drink_serving_options FOR ALL TO authenticated
  USING (tenant_id = public.get_auth_tenant_id())
  WITH CHECK (tenant_id = public.get_auth_tenant_id());

-- --- Denormalized tenant_id must match parent drink (RLS correctness) ---
CREATE OR REPLACE FUNCTION public.enforce_drink_extension_tenant_matches_drink()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
BEGIN
  SELECT d.tenant_id INTO v_tenant
  FROM public.drinks d
  WHERE d.id = new.drink_id;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'drink_id not found';
  END IF;

  IF new.tenant_id IS DISTINCT FROM v_tenant THEN
    RAISE EXCEPTION 'tenant_id must match drinks.tenant_id for this drink_id';
  END IF;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS trg_drink_beer_profiles_tenant_matches ON public.drink_beer_profiles;
CREATE TRIGGER trg_drink_beer_profiles_tenant_matches
  BEFORE INSERT OR UPDATE ON public.drink_beer_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_drink_extension_tenant_matches_drink();

DROP TRIGGER IF EXISTS trg_drink_serving_options_tenant_matches ON public.drink_serving_options;
CREATE TRIGGER trg_drink_serving_options_tenant_matches
  BEFORE INSERT OR UPDATE ON public.drink_serving_options
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_drink_extension_tenant_matches_drink();

-- --- Touch tenant timestamp when drinks change ---
CREATE OR REPLACE FUNCTION public.taplist_touch_tenant_menu_updated()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.tenants
  SET last_menu_updated_at = now()
  WHERE id = coalesce(new.tenant_id, old.tenant_id);
  RETURN coalesce(new, old);
END;
$$;

DROP TRIGGER IF EXISTS trg_drinks_taplist_touch_tenant ON public.drinks;
CREATE TRIGGER trg_drinks_taplist_touch_tenant
  AFTER INSERT OR UPDATE OR DELETE ON public.drinks
  FOR EACH ROW
  EXECUTE FUNCTION public.taplist_touch_tenant_menu_updated();

DROP TRIGGER IF EXISTS trg_serving_options_taplist_touch_tenant ON public.drink_serving_options;
CREATE TRIGGER trg_serving_options_taplist_touch_tenant
  AFTER INSERT OR UPDATE OR DELETE ON public.drink_serving_options
  FOR EACH ROW
  EXECUTE FUNCTION public.taplist_touch_tenant_menu_updated();

-- --- Owner / super_admin: tenant Tap List visibility ---
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

  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND (
        ur.role = 'super_admin'
        OR (ur.tenant_id = p_tenant_id AND ur.role = 'owner')
      )
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  UPDATE public.tenants SET is_public_visible = p_visible, last_menu_updated_at = now() WHERE id = p_tenant_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_tenant_public_visibility(uuid, boolean) TO authenticated;

DROP FUNCTION IF EXISTS public.set_tenant_taplist_storefront(uuid, text, text, text, text, text, jsonb);

CREATE OR REPLACE FUNCTION public.set_tenant_taplist_storefront(
  p_tenant_id uuid,
  p_display_name text,
  p_district text,
  p_address text,
  p_cover_image_url text,
  p_city text,
  p_opening_hour jsonb DEFAULT NULL,
  p_description text DEFAULT NULL
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

  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND (
        ur.role = 'super_admin'
        OR (ur.tenant_id = p_tenant_id AND ur.role = 'owner')
      )
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  UPDATE public.tenants
  SET
    display_name = nullif(trim(p_display_name), ''),
    district = nullif(trim(p_district), ''),
    address = nullif(trim(p_address), ''),
    cover_image_url = nullif(trim(p_cover_image_url), ''),
    city = coalesce(nullif(trim(p_city), ''), 'Shanghai'),
    opening_hour = CASE
      WHEN p_opening_hour IS NULL THEN NULL
      WHEN p_opening_hour = 'null'::jsonb THEN NULL
      ELSE p_opening_hour
    END,
    description = nullif(trim(p_description), ''),
    last_menu_updated_at = now()
  WHERE id = p_tenant_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_tenant_taplist_storefront(uuid, text, text, text, text, text, jsonb, text) TO authenticated;

-- --- Tap List media bucket (Storage) + drink consumer fields RPC ---
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'taplist-media',
  'taplist-media',
  true,
  3145728,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE OR REPLACE FUNCTION public.taplist_media_path_allowed(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, storage
AS $$
  SELECT
    (storage.foldername(p_name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND (storage.foldername(p_name))[2] IN ('cover', 'drinks');
$$;

CREATE OR REPLACE FUNCTION public.taplist_media_tenant_id(p_name text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, storage
AS $$
  SELECT (storage.foldername(p_name))[1]::uuid;
$$;

CREATE OR REPLACE FUNCTION public.taplist_media_user_can_write(p_tenant_id uuid)
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

DROP POLICY IF EXISTS taplist_media_public_read ON storage.objects;
CREATE POLICY taplist_media_public_read
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'taplist-media');

DROP POLICY IF EXISTS taplist_media_authenticated_insert ON storage.objects;
CREATE POLICY taplist_media_authenticated_insert
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'taplist-media'
    AND public.taplist_media_path_allowed(name)
    AND public.taplist_media_user_can_write(public.taplist_media_tenant_id(name))
  );

DROP POLICY IF EXISTS taplist_media_authenticated_update ON storage.objects;
CREATE POLICY taplist_media_authenticated_update
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'taplist-media'
    AND public.taplist_media_user_can_write(public.taplist_media_tenant_id(name))
  )
  WITH CHECK (
    bucket_id = 'taplist-media'
    AND public.taplist_media_path_allowed(name)
    AND public.taplist_media_user_can_write(public.taplist_media_tenant_id(name))
  );

DROP POLICY IF EXISTS taplist_media_authenticated_delete ON storage.objects;
CREATE POLICY taplist_media_authenticated_delete
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'taplist-media'
    AND public.taplist_media_user_can_write(public.taplist_media_tenant_id(name))
  );

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

  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND (
        ur.role = 'super_admin'
        OR (ur.tenant_id = v_tenant_id AND ur.role IN ('owner', 'staff'))
      )
  ) THEN
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

-- --- Public Tap List RPCs (anon): no public_review_status ---
CREATE OR REPLACE FUNCTION public.get_public_taplist_bars(p_city text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_city text := coalesce(nullif(trim(p_city), ''), 'Shanghai');
BEGIN
  RETURN coalesce(
    (
      SELECT jsonb_agg(row_obj ORDER BY lm DESC NULLS LAST)
      FROM (
        SELECT
          jsonb_build_object(
            'id', t.id,
            'slug', t.slug,
            'name', t.name,
            'display_name', coalesce(nullif(trim(t.display_name), ''), t.name),
            'district', t.district,
            'address', t.address,
            'opening_hour', t.opening_hour,
            'description', t.description,
            'cover_image_url', t.cover_image_url,
            'city', t.city,
            'country', t.country,
            'last_menu_updated_at', t.last_menu_updated_at,
            'status_counts', (
              SELECT jsonb_build_object(
                '上新', count(*) FILTER (WHERE d.public_status = 'new'),
                '在售', count(*) FILTER (WHERE d.public_status = 'available'),
                '少量', count(*) FILTER (WHERE d.public_status = 'low'),
                '售罄', count(*) FILTER (WHERE d.public_status = 'sold_out'),
                '即将上新', count(*) FILTER (WHERE d.public_status = 'coming_soon')
              )
              FROM public.drinks d
              INNER JOIN public.categories c
                ON c.id = d.category_id AND c.tenant_id = d.tenant_id
              WHERE d.tenant_id = t.id
                AND d.enabled = true
                AND d.is_public_visible = true
                AND c.enabled = true
                AND c.is_public_visible = true
            )
          ) AS row_obj,
          t.last_menu_updated_at AS lm
        FROM public.tenants t
        WHERE t.status = 'active'
          AND t.is_public_visible = true
          AND lower(trim(t.city)) = lower(trim(v_city))
      ) sub
    ),
    '[]'::jsonb
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_public_taplist_tenant(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slug text := trim(p_slug);
  rec record;
BEGIN
  IF v_slug = '' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'bad_request');
  END IF;

  SELECT
    t.id, t.slug, t.name,
    coalesce(nullif(trim(t.display_name), ''), t.name) AS display_name,
    t.district, t.address, t.opening_hour, t.description, t.cover_image_url, t.city, t.country,
    t.last_menu_updated_at, t.status, t.is_public_visible
  INTO rec
  FROM public.tenants t
  WHERE t.slug = v_slug;

  IF rec IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END IF;

  IF rec.status = 'suspended' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'suspended', 'name', rec.name);
  END IF;

  IF NOT rec.is_public_visible THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_public');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'tenant', jsonb_build_object(
      'id', rec.id,
      'slug', rec.slug,
      'name', rec.name,
      'display_name', rec.display_name,
      'district', rec.district,
      'address', rec.address,
      'opening_hour', rec.opening_hour,
      'description', rec.description,
      'cover_image_url', rec.cover_image_url,
      'city', rec.city,
      'country', rec.country,
      'last_menu_updated_at', rec.last_menu_updated_at
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.taplist_public_status_zh(p_status text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE p_status
    WHEN 'new' THEN '上新'
    WHEN 'available' THEN '在售'
    WHEN 'low' THEN '少量'
    WHEN 'sold_out' THEN '售罄'
    WHEN 'coming_soon' THEN '即将上新'
    ELSE coalesce(nullif(trim(p_status), ''), '在售')
  END;
$$;

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
              'name', d.name,
              'image_url', d.image_url,
              'public_status', public.taplist_public_status_zh(d.public_status),
              'public_sort_order', d.public_sort_order,
              'beer', (
                SELECT jsonb_build_object(
                  'brewery', p.brewery,
                  'beer_style', p.beer_style,
                  'abv', p.abv,
                  'ibu', p.ibu,
                  'country', p.country,
                  'description', p.description
                )
                FROM public.drink_beer_profiles p
                WHERE p.drink_id = d.id
                LIMIT 1
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

GRANT EXECUTE ON FUNCTION public.get_public_taplist_bars(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_taplist_bars(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_taplist_tenant(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_taplist_tenant(text) TO authenticated;
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
              'name', d.name,
              'brand_name', d.brand_name,
              'image_url', d.image_url,
              'public_status', public.taplist_public_status_zh(d.public_status),
              'tenant_id', t.id,
              'tenant_slug', t.slug,
              'tenant_display_name', coalesce(nullif(trim(t.display_name), ''), t.name),
              'tenant_district', t.district,
              'tenant_address', t.address,
              'brewery', p.brewery,
              'beer_style', p.beer_style,
              'abv', p.abv
            ) AS row_obj,
            lower(d.name) AS name_sort
          FROM public.drinks d
          INNER JOIN public.tenants t ON t.id = d.tenant_id
          INNER JOIN public.categories c
            ON c.id = d.category_id AND c.tenant_id = d.tenant_id
          LEFT JOIN public.drink_beer_profiles p ON p.drink_id = d.id
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

-- Owner may update Tap List storefront fields on their own tenant (visibility still via set_tenant_public_visibility).
DROP POLICY IF EXISTS tenants_owner_update_taplist_fields ON public.tenants;
CREATE POLICY tenants_owner_update_taplist_fields
  ON public.tenants FOR UPDATE TO authenticated
  USING (
    id = public.get_auth_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.tenant_id = tenants.id
        AND ur.role = 'owner'
    )
  )
  WITH CHECK (id = public.get_auth_tenant_id());

-- Platform super_admin: read/update any tenant (e.g. Tap List storefront on default bar `226`).
-- Owner-only policy above fails when get_auth_tenant_id() resolves to `__platform__` first.
DROP POLICY IF EXISTS tenants_select_super_admin ON public.tenants;
CREATE POLICY tenants_select_super_admin
  ON public.tenants FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'super_admin'
    )
  );

DROP POLICY IF EXISTS tenants_update_super_admin ON public.tenants;
CREATE POLICY tenants_update_super_admin
  ON public.tenants FOR UPDATE TO authenticated
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
