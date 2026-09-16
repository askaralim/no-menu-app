-- Additive consumer city-picker hotfix: return province metadata from
-- get_public_taplist_cities() so live clients can group by region without
-- a new App Store binary or per-city JS map.
--
-- Released grouping UI already prefers city.region_label, then falls back.
-- Old 1.3.2 clients ignore unknown JSON keys.

ALTER TABLE public.taplist_public_cities
  ADD COLUMN IF NOT EXISTS region_code text,
  ADD COLUMN IF NOT EXISTS region_label text;

CREATE OR REPLACE FUNCTION public.taplist_default_city_region_code(p_city text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(trim(p_city))
    WHEN 'qingdao' THEN 'shandong'
    WHEN '青岛' THEN 'shandong'
    WHEN 'binzhou' THEN 'shandong'
    WHEN '滨州' THEN 'shandong'
    WHEN 'linyi' THEN 'shandong'
    WHEN '临沂' THEN 'shandong'
    WHEN 'changchun' THEN 'jilin'
    WHEN '长春' THEN 'jilin'
    WHEN 'shenyang' THEN 'liaoning'
    WHEN '沈阳' THEN 'liaoning'
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.taplist_default_city_region_label(p_city text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE public.taplist_default_city_region_code(p_city)
    WHEN 'shandong' THEN '山东'
    WHEN 'jilin' THEN '吉林'
    WHEN 'liaoning' THEN '辽宁'
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.taplist_default_city_label(p_city text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(trim(p_city))
    WHEN 'shanghai' THEN '上海'
    WHEN 'beijing' THEN '北京'
    WHEN 'tianjin' THEN '天津'
    WHEN '天津' THEN '天津'
    WHEN 'guangzhou' THEN '广州'
    WHEN 'shenzhen' THEN '深圳'
    WHEN 'chengdu' THEN '成都'
    WHEN 'hangzhou' THEN '杭州'
    WHEN 'nanjing' THEN '南京'
    WHEN 'suzhou' THEN '苏州'
    WHEN 'wuhan' THEN '武汉'
    WHEN 'xian' THEN '西安'
    WHEN 'xi''an' THEN '西安'
    WHEN 'chongqing' THEN '重庆'
    WHEN 'qingdao' THEN '青岛'
    WHEN '青岛' THEN '青岛'
    WHEN 'binzhou' THEN '滨州'
    WHEN '滨州' THEN '滨州'
    WHEN 'linyi' THEN '临沂'
    WHEN '临沂' THEN '临沂'
    WHEN 'changchun' THEN '长春'
    WHEN '长春' THEN '长春'
    WHEN 'shenyang' THEN '沈阳'
    WHEN '沈阳' THEN '沈阳'
    ELSE trim(p_city)
  END;
$$;

UPDATE public.taplist_public_cities c
SET
  region_code = coalesce(nullif(trim(c.region_code), ''), public.taplist_default_city_region_code(c.city)),
  region_label = coalesce(nullif(trim(c.region_label), ''), public.taplist_default_city_region_label(c.city)),
  updated_at = now()
WHERE public.taplist_default_city_region_label(c.city) IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_public_taplist_cities()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN jsonb_build_object(
    'ok', true,
    'cities', coalesce(
      (
        SELECT jsonb_agg(row_obj ORDER BY sort_order, lower(label), lower(city))
        FROM (
          SELECT
            jsonb_build_object(
              'city', c.city,
              'label', c.label,
              'country', c.country,
              'region_code', coalesce(
                nullif(trim(c.region_code), ''),
                public.taplist_default_city_region_code(c.city)
              ),
              'region_label', coalesce(
                nullif(trim(c.region_label), ''),
                public.taplist_default_city_region_label(c.city)
              ),
              'sort_order', c.sort_order,
              'bar_count', count(t.id)::int
            ) AS row_obj,
            c.sort_order,
            c.label,
            c.city
          FROM public.taplist_public_cities c
          INNER JOIN public.tenants t
            ON lower(trim(t.city)) = lower(trim(c.city))
           AND t.status = 'active'
           AND t.is_public_visible = true
          WHERE c.is_enabled = true
          GROUP BY c.city, c.label, c.country, c.region_code, c.region_label, c.sort_order
          HAVING count(t.id) > 0
        ) sub
      ),
      '[]'::jsonb
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_taplist_cities() TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_taplist_cities() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_upsert_taplist_city(
  p_city text,
  p_label text,
  p_country text DEFAULT 'China',
  p_sort_order integer DEFAULT 100,
  p_is_enabled boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_city text := public.taplist_canonical_city_key(p_city);
  v_label text := trim(p_label);
  v_country text := coalesce(nullif(trim(p_country), ''), 'China');
  v_sort_order integer := coalesce(p_sort_order, 100);
  v_region_code text := public.taplist_default_city_region_code(v_city);
  v_region_label text := public.taplist_default_city_region_label(v_city);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role = 'super_admin'
  ) THEN
    RAISE EXCEPTION 'Unauthorized: super_admin role required';
  END IF;

  IF nullif(trim(p_city), '') IS NULL THEN
    RAISE EXCEPTION 'City key is required';
  END IF;

  IF v_label = '' THEN
    v_label := public.taplist_default_city_label(v_city);
  END IF;

  DELETE FROM public.taplist_public_cities c
  WHERE lower(trim(c.city)) = lower(trim(v_city))
    AND c.city <> v_city;

  INSERT INTO public.taplist_public_cities (
    city,
    label,
    country,
    sort_order,
    is_enabled,
    region_code,
    region_label
  )
  VALUES (
    v_city,
    v_label,
    v_country,
    v_sort_order,
    coalesce(p_is_enabled, true),
    v_region_code,
    v_region_label
  )
  ON CONFLICT (city) DO UPDATE
  SET
    label = EXCLUDED.label,
    country = EXCLUDED.country,
    sort_order = EXCLUDED.sort_order,
    is_enabled = EXCLUDED.is_enabled,
    region_code = coalesce(public.taplist_public_cities.region_code, EXCLUDED.region_code),
    region_label = coalesce(public.taplist_public_cities.region_label, EXCLUDED.region_label),
    updated_at = now();

  RETURN jsonb_build_object('ok', true, 'city', v_city);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_sync_taplist_cities_from_tenants()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role = 'super_admin'
  ) THEN
    RAISE EXCEPTION 'Unauthorized: super_admin role required';
  END IF;

  WITH candidates AS (
    SELECT DISTINCT ON (lower(trim(t.city)))
      public.taplist_canonical_city_key(trim(t.city)) AS city,
      public.taplist_default_city_label(trim(t.city)) AS label,
      coalesce(nullif(trim(t.country), ''), 'China') AS country,
      100 AS sort_order,
      true AS is_enabled,
      public.taplist_default_city_region_code(trim(t.city)) AS region_code,
      public.taplist_default_city_region_label(trim(t.city)) AS region_label
    FROM public.tenants t
    WHERE t.status = 'active'
      AND nullif(trim(t.city), '') IS NOT NULL
    ORDER BY lower(trim(t.city)), trim(t.city)
  ),
  inserted AS (
    INSERT INTO public.taplist_public_cities (
      city,
      label,
      country,
      sort_order,
      is_enabled,
      region_code,
      region_label
    )
    SELECT city, label, country, sort_order, is_enabled, region_code, region_label
    FROM candidates
    ON CONFLICT (city) DO NOTHING
    RETURNING city
  )
  SELECT count(*)::int INTO v_inserted FROM inserted;

  RETURN jsonb_build_object('ok', true, 'inserted', v_inserted);
END;
$$;
