-- Beer Route foundation: tenant route fields, structured hours, freshness timestamps, admin RPCs.

-- --- Tenant route columns ---

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS roadmap_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS amap_longitude numeric(9, 6),
  ADD COLUMN IF NOT EXISTS amap_latitude numeric(8, 6),
  ADD COLUMN IF NOT EXISTS amap_poi_id text,
  ADD COLUMN IF NOT EXISTS roadmap_coordinates_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS roadmap_coordinate_version bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS taplist_verified_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tenants_amap_coords_paired_check'
  ) THEN
    ALTER TABLE public.tenants
      ADD CONSTRAINT tenants_amap_coords_paired_check
        CHECK (
          (amap_longitude IS NULL AND amap_latitude IS NULL)
          OR (amap_longitude IS NOT NULL AND amap_latitude IS NOT NULL)
        );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tenants_amap_longitude_range_check'
  ) THEN
    ALTER TABLE public.tenants
      ADD CONSTRAINT tenants_amap_longitude_range_check
        CHECK (amap_longitude IS NULL OR (amap_longitude >= -180 AND amap_longitude <= 180));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tenants_amap_latitude_range_check'
  ) THEN
    ALTER TABLE public.tenants
      ADD CONSTRAINT tenants_amap_latitude_range_check
        CHECK (amap_latitude IS NULL OR (amap_latitude >= -90 AND amap_latitude <= 90));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tenants_amap_shanghai_bbox_check'
  ) THEN
    ALTER TABLE public.tenants
      ADD CONSTRAINT tenants_amap_shanghai_bbox_check
        CHECK (
          amap_longitude IS NULL
          OR (
            amap_longitude BETWEEN 120.800000 AND 122.200000
            AND amap_latitude BETWEEN 30.700000 AND 31.900000
          )
        );
  END IF;
END $$;

ALTER TABLE public.drinks
  ADD COLUMN IF NOT EXISTS public_status_changed_at timestamptz;

-- --- Structured opening periods ---

CREATE TABLE IF NOT EXISTS public.tenant_opening_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  iso_day_of_week smallint NOT NULL CHECK (iso_day_of_week BETWEEN 1 AND 7),
  opens_at time NOT NULL,
  closes_at time NOT NULL,
  closes_next_day boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_opening_periods_duration_check CHECK (
    CASE
      WHEN closes_next_day = false THEN closes_at > opens_at
      WHEN closes_at = time '00:00' AND closes_next_day = true THEN opens_at = time '00:00'
      ELSE closes_at <= opens_at
    END
  )
);

CREATE INDEX IF NOT EXISTS tenant_opening_periods_tenant_id_idx
  ON public.tenant_opening_periods(tenant_id, iso_day_of_week);

ALTER TABLE public.tenant_opening_periods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_opening_periods_owner_read ON public.tenant_opening_periods;
CREATE POLICY tenant_opening_periods_owner_read ON public.tenant_opening_periods
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND (
          ur.role = 'super_admin'
          OR (ur.tenant_id = tenant_opening_periods.tenant_id AND ur.role = 'owner')
        )
    )
  );

-- --- Helpers ---

CREATE OR REPLACE FUNCTION public.normalize_roadmap_coordinate(p_value numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT round(p_value::numeric, 6);
$$;

CREATE OR REPLACE FUNCTION public.taplist_mark_public_projection_changed(
  p_tenant_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.tenants
  SET
    last_menu_updated_at = now(),
    taplist_verified_at = now()
  WHERE id = p_tenant_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.tenant_has_valid_structured_hours(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_opening_periods p
    WHERE p.tenant_id = p_tenant_id
  );
$$;

CREATE OR REPLACE FUNCTION public.opening_period_to_minute_ranges(
  p_day smallint,
  p_opens time,
  p_closes time,
  p_closes_next_day boolean
)
RETURNS TABLE(start_minute int, end_minute int)
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_opens int;
  v_closes int;
  v_day_base int;
BEGIN
  v_opens := (extract(hour from p_opens)::int * 60) + extract(minute from p_opens)::int;
  v_closes := (extract(hour from p_closes)::int * 60) + extract(minute from p_closes)::int;
  v_day_base := (p_day - 1) * 1440;

  IF p_closes_next_day AND p_opens = time '00:00' AND p_closes = time '00:00' THEN
    RETURN QUERY SELECT 0, 10080;
    RETURN;
  END IF;

  IF p_closes_next_day THEN
    RETURN QUERY SELECT v_day_base + v_opens, v_day_base + v_closes + 1440;
  ELSE
    RETURN QUERY SELECT v_day_base + v_opens, v_day_base + v_closes;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_tenant_opening_periods_no_overlap(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_overlap boolean;
BEGIN
  WITH expanded AS (
    SELECT
      p.id,
      r.start_minute + shift AS start_minute,
      r.end_minute + shift AS end_minute
    FROM public.tenant_opening_periods p
    CROSS JOIN LATERAL public.opening_period_to_minute_ranges(
      p.iso_day_of_week,
      p.opens_at,
      p.closes_at,
      p.closes_next_day
    ) r
    CROSS JOIN unnest(ARRAY[-10080, 0, 10080]) AS shift
    WHERE p.tenant_id = p_tenant_id
  ),
  normalized AS (
    SELECT
      id,
      start_minute,
      CASE
        WHEN end_minute <= start_minute THEN end_minute + 10080
        ELSE end_minute
      END AS end_minute
    FROM expanded
    WHERE end_minute > start_minute
  )
  SELECT EXISTS (
    SELECT 1
    FROM normalized a
    JOIN normalized b
      ON a.id < b.id
     AND a.start_minute < b.end_minute
     AND b.start_minute < a.end_minute
  )
  INTO v_overlap;

  IF v_overlap THEN
    RAISE EXCEPTION 'Opening periods overlap for tenant %', p_tenant_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_validate_tenant_opening_periods()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  v_tenant_id := coalesce(NEW.tenant_id, OLD.tenant_id);
  PERFORM public.validate_tenant_opening_periods_no_overlap(v_tenant_id);
  RETURN coalesce(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_tenant_opening_periods ON public.tenant_opening_periods;
CREATE CONSTRAINT TRIGGER trg_validate_tenant_opening_periods
  AFTER INSERT OR UPDATE OR DELETE ON public.tenant_opening_periods
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_validate_tenant_opening_periods();

CREATE OR REPLACE FUNCTION public.trg_invalidate_roadmap_on_coordinate_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF NEW.amap_longitude IS NOT DISTINCT FROM OLD.amap_longitude
     AND NEW.amap_latitude IS NOT DISTINCT FROM OLD.amap_latitude
     AND NEW.amap_poi_id IS NOT DISTINCT FROM OLD.amap_poi_id THEN
    RETURN NEW;
  END IF;

  NEW.roadmap_enabled := false;
  NEW.roadmap_coordinates_verified_at := NULL;
  NEW.roadmap_coordinate_version := coalesce(OLD.roadmap_coordinate_version, 0) + 1;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invalidate_roadmap_on_coordinate_change ON public.tenants;
CREATE TRIGGER trg_invalidate_roadmap_on_coordinate_change
  BEFORE UPDATE OF amap_longitude, amap_latitude, amap_poi_id ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_invalidate_roadmap_on_coordinate_change();

-- --- Timestamp triggers ---

CREATE OR REPLACE FUNCTION public.taplist_touch_tenant_menu_updated()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND TG_TABLE_NAME = 'drinks' THEN
    IF (to_jsonb(NEW) - 'stock') IS NOT DISTINCT FROM (to_jsonb(OLD) - 'stock') THEN
      RETURN NEW;
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_tenant_id := OLD.tenant_id;
  ELSE
    v_tenant_id := NEW.tenant_id;
  END IF;

  PERFORM public.taplist_mark_public_projection_changed(v_tenant_id, TG_TABLE_NAME);

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_drinks_public_status_changed_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.public_status IS DISTINCT FROM OLD.public_status THEN
    NEW.public_status_changed_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_drinks_public_status_changed_at ON public.drinks;
CREATE TRIGGER trg_drinks_public_status_changed_at
  BEFORE UPDATE OF public_status ON public.drinks
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_drinks_public_status_changed_at();

CREATE OR REPLACE FUNCTION public.trg_categories_taplist_touch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_tenant_id := OLD.tenant_id;
  ELSE
    v_tenant_id := NEW.tenant_id;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.enabled IS NOT DISTINCT FROM OLD.enabled
       AND NEW.is_public_visible IS NOT DISTINCT FROM OLD.is_public_visible THEN
      RETURN NEW;
    END IF;
  END IF;

  PERFORM public.taplist_mark_public_projection_changed(v_tenant_id, 'categories');
  RETURN coalesce(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_categories_taplist_touch ON public.categories;
CREATE TRIGGER trg_categories_taplist_touch
  AFTER INSERT OR UPDATE OF enabled, is_public_visible OR DELETE ON public.categories
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_categories_taplist_touch();

CREATE OR REPLACE FUNCTION public.trg_drink_beer_profiles_taplist_touch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  SELECT d.tenant_id INTO v_tenant_id
  FROM public.drinks d
  WHERE d.id = coalesce(NEW.drink_id, OLD.drink_id);

  IF v_tenant_id IS NULL THEN
    RETURN coalesce(NEW, OLD);
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.brewery IS NOT DISTINCT FROM OLD.brewery
       AND NEW.beer_style IS NOT DISTINCT FROM OLD.beer_style
       AND NEW.abv IS NOT DISTINCT FROM OLD.abv
       AND NEW.ibu IS NOT DISTINCT FROM OLD.ibu
       AND NEW.country IS NOT DISTINCT FROM OLD.country
       AND NEW.description IS NOT DISTINCT FROM OLD.description THEN
      RETURN NEW;
    END IF;
  END IF;

  PERFORM public.taplist_mark_public_projection_changed(v_tenant_id, 'drink_beer_profiles');
  RETURN coalesce(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_drink_beer_profiles_taplist_touch ON public.drink_beer_profiles;
CREATE TRIGGER trg_drink_beer_profiles_taplist_touch
  AFTER INSERT OR UPDATE OR DELETE ON public.drink_beer_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_drink_beer_profiles_taplist_touch();

CREATE OR REPLACE FUNCTION public.trg_drink_products_taplist_fanout()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.name IS NOT DISTINCT FROM OLD.name
       AND NEW.brand_name IS NOT DISTINCT FROM OLD.brand_name
       AND NEW.brewery IS NOT DISTINCT FROM OLD.brewery
       AND NEW.beer_style IS NOT DISTINCT FROM OLD.beer_style
       AND NEW.abv IS NOT DISTINCT FROM OLD.abv
       AND NEW.ibu IS NOT DISTINCT FROM OLD.ibu
       AND NEW.country IS NOT DISTINCT FROM OLD.country
       AND NEW.image_url IS NOT DISTINCT FROM OLD.image_url
       AND NEW.description IS NOT DISTINCT FROM OLD.description
       AND NEW.tasting_note IS NOT DISTINCT FROM OLD.tasting_note THEN
      RETURN NEW;
    END IF;
  END IF;

  FOR v_tenant_id IN
    SELECT DISTINCT d.tenant_id
    FROM public.drinks d
    INNER JOIN public.tenants t ON t.id = d.tenant_id
    WHERE d.product_id = coalesce(NEW.id, OLD.id)
      AND d.enabled = true
      AND d.is_public_visible = true
      AND t.status = 'active'
      AND t.is_public_visible = true
  LOOP
    PERFORM public.taplist_mark_public_projection_changed(v_tenant_id, 'drink_products');
  END LOOP;

  RETURN coalesce(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_drink_products_taplist_fanout ON public.drink_products;
CREATE TRIGGER trg_drink_products_taplist_fanout
  AFTER UPDATE ON public.drink_products
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_drink_products_taplist_fanout();

-- --- Storefront RPC: use canonical freshness helper ---

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

  IF p_update_storefront_extras THEN
    v_brewing_type := nullif(trim(p_brewing_type), '');
    IF v_brewing_type IS NOT NULL
       AND v_brewing_type NOT IN ('house_brand', 'on_site_brewery') THEN
      RAISE EXCEPTION 'Invalid brewing_type: %', v_brewing_type;
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
    cover_image_url = nullif(trim(p_cover_image_url), ''),
    city = coalesce(nullif(trim(p_city), ''), 'Shanghai'),
    opening_hour = CASE
      WHEN p_opening_hour IS NULL THEN NULL
      WHEN p_opening_hour = 'null'::jsonb THEN NULL
      ELSE p_opening_hour
    END,
    description = nullif(trim(p_description), ''),
    brewing_type = CASE
      WHEN p_update_storefront_extras THEN v_brewing_type
      ELSE brewing_type
    END
  WHERE id = p_tenant_id;

  PERFORM public.taplist_mark_public_projection_changed(p_tenant_id, 'storefront');

  IF p_update_storefront_extras THEN
    DELETE FROM public.tenant_bar_tags WHERE tenant_id = p_tenant_id;

    INSERT INTO public.tenant_bar_tags (tenant_id, tag_key)
    SELECT DISTINCT p_tenant_id, trim(k)
    FROM unnest(coalesce(p_tag_keys, ARRAY[]::text[])) AS k
    WHERE k IS NOT NULL AND trim(k) <> '';
  END IF;
END;
$$;

-- --- Admin beer upsert: canonical freshness helper ---

CREATE OR REPLACE FUNCTION public.admin_upsert_beers(
  p_tenant_id uuid,
  p_rows jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_category_id uuid;
  v_max_sort integer;
  v_max_public_sort integer;
  v_row jsonb;
  v_brewery text;
  v_name text;
  v_beer_style text;
  v_country text;
  v_abv numeric;
  v_sort_order integer;
  v_public_sort_order integer;
  v_public_status text;
  v_drink_id uuid;
  v_inserted integer := 0;
  v_skipped integer := 0;
  v_results jsonb := '[]'::jsonb;
  v_default_price numeric;
  v_default_volume integer;
  v_servings jsonb;
  v_serving jsonb;
  v_sort_idx integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = 'super_admin'
  ) THEN
    RAISE EXCEPTION 'Unauthorized: super_admin role required';
  END IF;

  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant id is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tenants t
    WHERE t.id = p_tenant_id
  ) THEN
    RAISE EXCEPTION 'Tenant not found: %', p_tenant_id;
  END IF;

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'p_rows must be a JSON array';
  END IF;

  SELECT c.id
  INTO v_category_id
  FROM public.categories c
  WHERE c.tenant_id = p_tenant_id
    AND c.name = '生啤'
  ORDER BY c.sort_order, c.created_at, c.id
  LIMIT 1;

  IF v_category_id IS NULL THEN
    INSERT INTO public.categories (tenant_id, name, sort_order, enabled, is_public_visible)
    VALUES (p_tenant_id, '生啤', 1, true, true)
    RETURNING id INTO v_category_id;
  END IF;

  SELECT
    COALESCE(MAX(d.sort_order), 0),
    COALESCE(MAX(d.public_sort_order), 0)
  INTO v_max_sort, v_max_public_sort
  FROM public.drinks d
  WHERE d.tenant_id = p_tenant_id;

  FOR v_row IN
    SELECT value
    FROM jsonb_array_elements(p_rows)
  LOOP
    v_brewery := trim(coalesce(v_row->>'brewery', ''));
    v_name := trim(coalesce(v_row->>'name', ''));
    v_beer_style := trim(coalesce(v_row->>'beer_style', ''));

    IF v_brewery = '' OR v_name = '' OR v_beer_style = '' THEN
      v_results := v_results || jsonb_build_array(
        jsonb_build_object(
          'brewery', v_brewery,
          'name', v_name,
          'status', 'error',
          'message', 'brewery, name, and beer_style are required'
        )
      );
      CONTINUE;
    END IF;

    SELECT d.id
    INTO v_drink_id
    FROM public.drinks d
    WHERE d.tenant_id = p_tenant_id
      AND d.brand_name = v_brewery
      AND d.name = v_name
    ORDER BY d.created_at DESC, d.id DESC
    LIMIT 1;

    IF v_drink_id IS NOT NULL THEN
      v_skipped := v_skipped + 1;
      v_results := v_results || jsonb_build_array(
        jsonb_build_object(
          'brewery', v_brewery,
          'name', v_name,
          'status', 'skipped',
          'drink_id', v_drink_id
        )
      );
      CONTINUE;
    END IF;

    v_country := nullif(trim(coalesce(v_row->>'country', '')), '');
    IF v_country IN ('-', '—', '–') THEN
      v_country := NULL;
    END IF;

    IF nullif(trim(coalesce(v_row->>'abv', '')), '') IS NULL
       OR trim(coalesce(v_row->>'abv', '')) IN ('-', '—', '–') THEN
      v_abv := NULL;
    ELSE
      v_abv := (regexp_replace(trim(v_row->>'abv'), '[^0-9.]+', '', 'g'))::numeric;
    END IF;

    v_max_sort := v_max_sort + 1;
    v_max_public_sort := v_max_public_sort + 1;

    IF nullif(trim(coalesce(v_row->>'sort_order', '')), '') IS NOT NULL THEN
      v_sort_order := (v_row->>'sort_order')::integer;
      v_public_sort_order := v_sort_order;
      v_max_sort := GREATEST(v_max_sort, v_sort_order);
      v_max_public_sort := GREATEST(v_max_public_sort, v_public_sort_order);
    ELSE
      v_sort_order := v_max_sort;
      v_public_sort_order := v_max_public_sort;
    END IF;

    v_public_status := coalesce(nullif(trim(v_row->>'public_status'), ''), 'available');

    v_servings := v_row->'servings';
    v_default_price := 0;
    v_default_volume := NULL;

    IF v_servings IS NOT NULL AND jsonb_typeof(v_servings) = 'array' AND jsonb_array_length(v_servings) > 0 THEN
      SELECT
        (elem->>'price')::numeric,
        nullif(trim(coalesce(elem->>'volume_ml', '')), '')::integer
      INTO v_default_price, v_default_volume
      FROM jsonb_array_elements(v_servings) AS elem
      WHERE coalesce((elem->>'is_default')::boolean, false)
      ORDER BY coalesce((elem->>'public_sort_order')::integer, 0) DESC
      LIMIT 1;

      IF v_default_price IS NULL THEN
        SELECT
          (elem->>'price')::numeric,
          nullif(trim(coalesce(elem->>'volume_ml', '')), '')::integer
        INTO v_default_price, v_default_volume
        FROM jsonb_array_elements(v_servings) AS elem
        ORDER BY coalesce((elem->>'volume_ml')::integer, 0) DESC
        LIMIT 1;
      END IF;

      v_default_price := coalesce(v_default_price, 0);
    END IF;

    INSERT INTO public.drinks (
      tenant_id,
      category_id,
      brand_name,
      name,
      price,
      price_unit,
      volume_ml,
      sort_order,
      enabled,
      is_public_visible,
      public_status,
      public_sort_order
    )
    VALUES (
      p_tenant_id,
      v_category_id,
      v_brewery,
      v_name,
      v_default_price,
      '杯',
      v_default_volume,
      v_sort_order,
      true,
      true,
      v_public_status,
      v_public_sort_order
    )
    RETURNING id INTO v_drink_id;

    INSERT INTO public.drink_beer_profiles (
      tenant_id,
      drink_id,
      brewery,
      beer_style,
      abv,
      country
    )
    VALUES (
      p_tenant_id,
      v_drink_id,
      v_brewery,
      v_beer_style,
      v_abv,
      v_country
    );

    IF v_servings IS NOT NULL AND jsonb_typeof(v_servings) = 'array' THEN
      v_sort_idx := 0;
      FOR v_serving IN
        SELECT value
        FROM jsonb_array_elements(v_servings)
      LOOP
        INSERT INTO public.drink_serving_options (
          tenant_id,
          drink_id,
          serving_type,
          label,
          volume_ml,
          price,
          is_default,
          is_active,
          public_sort_order
        )
        VALUES (
          p_tenant_id,
          v_drink_id,
          coalesce(nullif(trim(v_serving->>'serving_type'), ''), 'draft'),
          coalesce(nullif(trim(v_serving->>'label'), ''), '杯'),
          nullif(trim(coalesce(v_serving->>'volume_ml', '')), '')::integer,
          coalesce((v_serving->>'price')::numeric, 0),
          coalesce((v_serving->>'is_default')::boolean, false),
          coalesce((v_serving->>'is_active')::boolean, true),
          coalesce((v_serving->>'public_sort_order')::integer, v_sort_idx)
        );
        v_sort_idx := v_sort_idx + 1;
      END LOOP;
    END IF;

    v_inserted := v_inserted + 1;
    v_results := v_results || jsonb_build_array(
      jsonb_build_object(
        'brewery', v_brewery,
        'name', v_name,
        'status', 'inserted',
        'drink_id', v_drink_id
      )
    );
  END LOOP;

  IF v_inserted > 0 THEN
    PERFORM public.taplist_mark_public_projection_changed(p_tenant_id, 'admin_upsert_beers');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'inserted', v_inserted,
    'skipped', v_skipped,
    'results', v_results
  );
END;
$$;

-- --- Beer Route admin RPCs ---

CREATE OR REPLACE FUNCTION public.verify_tenant_taplist(p_tenant_id uuid)
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
  SET taplist_verified_at = now()
  WHERE id = p_tenant_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_tenant_roadmap_coordinates(p_tenant_id uuid)
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

  IF NOT EXISTS (
    SELECT 1
    FROM public.tenants t
    WHERE t.id = p_tenant_id
      AND t.amap_longitude IS NOT NULL
      AND t.amap_latitude IS NOT NULL
      AND nullif(trim(t.address), '') IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Coordinates and address are required before verification';
  END IF;

  IF NOT public.tenant_has_valid_structured_hours(p_tenant_id) THEN
    RAISE EXCEPTION 'Structured opening periods are required before verification';
  END IF;

  UPDATE public.tenants
  SET roadmap_coordinates_verified_at = now()
  WHERE id = p_tenant_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_tenant_beer_roadmap_config(
  p_tenant_id uuid,
  p_longitude numeric,
  p_latitude numeric,
  p_poi_id text,
  p_roadmap_enabled boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_longitude numeric;
  v_latitude numeric;
  v_poi_id text;
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

  v_longitude := CASE
    WHEN p_longitude IS NULL THEN NULL
    ELSE public.normalize_roadmap_coordinate(p_longitude)
  END;
  v_latitude := CASE
    WHEN p_latitude IS NULL THEN NULL
    ELSE public.normalize_roadmap_coordinate(p_latitude)
  END;
  v_poi_id := nullif(trim(p_poi_id), '');

  IF (v_longitude IS NULL) <> (v_latitude IS NULL) THEN
    RAISE EXCEPTION 'Longitude and latitude must be provided together';
  END IF;

  IF p_roadmap_enabled THEN
    IF v_longitude IS NULL OR v_latitude IS NULL THEN
      RAISE EXCEPTION 'Verified coordinates are required to enable Beer Route';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.tenants t
      WHERE t.id = p_tenant_id
        AND t.roadmap_coordinates_verified_at IS NOT NULL
        AND nullif(trim(t.address), '') IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'Coordinate verification and address are required to enable Beer Route';
    END IF;

    IF NOT public.tenant_has_valid_structured_hours(p_tenant_id) THEN
      RAISE EXCEPTION 'Structured opening periods are required to enable Beer Route';
    END IF;
  END IF;

  UPDATE public.tenants
  SET
    amap_longitude = v_longitude,
    amap_latitude = v_latitude,
    amap_poi_id = v_poi_id,
    roadmap_enabled = coalesce(p_roadmap_enabled, false)
  WHERE id = p_tenant_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_tenant_taplist(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_tenant_roadmap_coordinates(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_tenant_beer_roadmap_config(uuid, numeric, numeric, text, boolean) TO authenticated;
