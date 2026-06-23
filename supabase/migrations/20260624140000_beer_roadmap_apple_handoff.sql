-- Beer Route Apple Maps handoff v1: rename coords, drop AMap POI, straight-line editorial routing helpers.

-- Drop trigger first: foundation migration binds it to amap_poi_id (blocks column drop).
DROP TRIGGER IF EXISTS trg_invalidate_roadmap_on_coordinate_change ON public.tenants;

-- --- Rename coordinate columns ---

ALTER TABLE public.tenants
  RENAME COLUMN amap_longitude TO roadmap_longitude;

ALTER TABLE public.tenants
  RENAME COLUMN amap_latitude TO roadmap_latitude;

ALTER TABLE public.tenants
  DROP COLUMN IF EXISTS amap_poi_id;

-- --- Recreate constraints with roadmap_* names ---

ALTER TABLE public.tenants
  DROP CONSTRAINT IF EXISTS tenants_amap_coords_paired_check;

ALTER TABLE public.tenants
  DROP CONSTRAINT IF EXISTS tenants_amap_longitude_range_check;

ALTER TABLE public.tenants
  DROP CONSTRAINT IF EXISTS tenants_amap_latitude_range_check;

ALTER TABLE public.tenants
  DROP CONSTRAINT IF EXISTS tenants_amap_shanghai_bbox_check;

ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_roadmap_coords_paired_check
    CHECK (
      (roadmap_longitude IS NULL AND roadmap_latitude IS NULL)
      OR (roadmap_longitude IS NOT NULL AND roadmap_latitude IS NOT NULL)
    );

ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_roadmap_longitude_range_check
    CHECK (roadmap_longitude IS NULL OR (roadmap_longitude >= -180 AND roadmap_longitude <= 180));

ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_roadmap_latitude_range_check
    CHECK (roadmap_latitude IS NULL OR (roadmap_latitude >= -90 AND roadmap_latitude <= 90));

ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_roadmap_shanghai_bbox_check
    CHECK (
      roadmap_longitude IS NULL
      OR (
        roadmap_longitude BETWEEN 120.800000 AND 122.200000
        AND roadmap_latitude BETWEEN 30.700000 AND 31.900000
      )
    );

-- --- Coordinate invalidation trigger (longitude/latitude only) ---

CREATE OR REPLACE FUNCTION public.trg_invalidate_roadmap_on_coordinate_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF NEW.roadmap_longitude IS NOT DISTINCT FROM OLD.roadmap_longitude
     AND NEW.roadmap_latitude IS NOT DISTINCT FROM OLD.roadmap_latitude THEN
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
  BEFORE UPDATE OF roadmap_longitude, roadmap_latitude ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_invalidate_roadmap_on_coordinate_change();

-- --- Opening-hours helper for Edge eligibility ---

CREATE OR REPLACE FUNCTION public.tenant_is_open_now(p_tenant_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now_sh timestamp;
  v_minute int;
  v_open boolean;
BEGIN
  v_now_sh := now() AT TIME ZONE 'Asia/Shanghai';
  v_minute := ((extract(isodow from v_now_sh)::int - 1) * 1440)
    + (extract(hour from v_now_sh)::int * 60)
    + extract(minute from v_now_sh)::int;

  WITH expanded AS (
    SELECT
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
    FROM normalized n
    WHERE (v_minute >= n.start_minute AND v_minute < n.end_minute)
       OR (v_minute + 10080 >= n.start_minute AND v_minute + 10080 < n.end_minute)
       OR (v_minute - 10080 >= n.start_minute AND v_minute - 10080 < n.end_minute)
  )
  INTO v_open;

  RETURN coalesce(v_open, false);
END;
$$;

REVOKE ALL ON FUNCTION public.tenant_is_open_now(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tenant_is_open_now(uuid) TO service_role;

-- --- Eligible tenant snapshot for Edge routing ---

CREATE OR REPLACE FUNCTION public.get_beer_roadmap_eligible_tenants()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH eligible AS (
    SELECT t.id
    FROM public.tenants t
    WHERE t.status = 'active'
      AND t.is_public_visible = true
      AND lower(trim(t.city)) = 'shanghai'
      AND t.roadmap_enabled = true
      AND t.roadmap_coordinates_verified_at IS NOT NULL
      AND t.roadmap_longitude IS NOT NULL
      AND t.roadmap_latitude IS NOT NULL
      AND public.tenant_has_valid_structured_hours(t.id)
      AND public.tenant_is_open_now(t.id)
      AND t.taplist_verified_at >= now() - interval '72 hours'
      AND EXISTS (
        SELECT 1
        FROM public.drinks d
        INNER JOIN public.categories c
          ON c.id = d.category_id AND c.tenant_id = d.tenant_id
        WHERE d.tenant_id = t.id
          AND d.enabled = true
          AND d.is_public_visible = true
          AND c.enabled = true
          AND c.is_public_visible = true
          AND d.public_status <> 'sold_out'
      )
  ),
  new_taps AS (
    SELECT
      d.tenant_id,
      CASE
        WHEN d.product_id IS NULL THEN d.name
        ELSE coalesce(nullif(trim(d.display_name), ''), dp.name, d.name)
      END AS drink_name,
      d.public_sort_order,
      lower(d.name) AS name_sort
    FROM public.drinks d
    INNER JOIN public.categories c
      ON c.id = d.category_id AND c.tenant_id = d.tenant_id
    LEFT JOIN public.drink_products dp ON dp.id = d.product_id
    WHERE d.enabled = true
      AND d.is_public_visible = true
      AND c.enabled = true
      AND c.is_public_visible = true
      AND d.public_status = 'new'
      AND d.public_status_changed_at IS NOT NULL
      AND d.public_status_changed_at >= now() - interval '14 days'
  ),
  new_tap_agg AS (
    SELECT
      nt.tenant_id,
      count(*)::int AS qualifying_new_tap_count,
      coalesce(
        (
          SELECT jsonb_agg(sub.drink_name ORDER BY sub.public_sort_order, sub.name_sort)
          FROM (
            SELECT drink_name, public_sort_order, name_sort
            FROM new_taps nt2
            WHERE nt2.tenant_id = nt.tenant_id
            ORDER BY public_sort_order, name_sort
            LIMIT 2
          ) sub
        ),
        '[]'::jsonb
      ) AS new_tap_names
    FROM new_taps nt
    GROUP BY nt.tenant_id
  )
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'tenantId', t.id,
        'tenantSlug', t.slug,
        'displayName', coalesce(nullif(trim(t.display_name), ''), t.name),
        'district', t.district,
        'address', t.address,
        'latitude', t.roadmap_latitude,
        'longitude', t.roadmap_longitude,
        'taplistVerifiedAt', t.taplist_verified_at,
        'qualifyingNewTapCount', coalesce(nta.qualifying_new_tap_count, 0),
        'newTapNames', coalesce(nta.new_tap_names, '[]'::jsonb)
      )
      ORDER BY t.id
    ),
    '[]'::jsonb
  )
  FROM eligible e
  INNER JOIN public.tenants t ON t.id = e.id
  LEFT JOIN new_tap_agg nta ON nta.tenant_id = t.id;
$$;

REVOKE ALL ON FUNCTION public.get_beer_roadmap_eligible_tenants() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_beer_roadmap_eligible_tenants() TO service_role;

-- --- Admin RPCs (drop POI parameter) ---

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
      AND t.roadmap_longitude IS NOT NULL
      AND t.roadmap_latitude IS NOT NULL
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

REVOKE EXECUTE ON FUNCTION public.set_tenant_beer_roadmap_config(uuid, numeric, numeric, text, boolean) FROM authenticated;

DROP FUNCTION IF EXISTS public.set_tenant_beer_roadmap_config(uuid, numeric, numeric, text, boolean);

CREATE OR REPLACE FUNCTION public.set_tenant_beer_roadmap_config(
  p_tenant_id uuid,
  p_longitude numeric,
  p_latitude numeric,
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
    roadmap_longitude = v_longitude,
    roadmap_latitude = v_latitude,
    roadmap_enabled = coalesce(p_roadmap_enabled, false)
  WHERE id = p_tenant_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_tenant_roadmap_coordinates(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_tenant_beer_roadmap_config(uuid, numeric, numeric, boolean) TO authenticated;
