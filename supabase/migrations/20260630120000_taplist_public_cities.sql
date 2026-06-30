-- Public city catalog for multi-city consumer Tap List.
--
-- App Store 1.2.x backward compatibility:
-- - Adds get_public_taplist_cities() only; existing clients do not call it.
-- - Does NOT change get_public_taplist_bars/events/new_drinks/search payloads or behavior.
-- - get_beer_roadmap_eligible_tenants(p_city DEFAULT NULL) keeps no-arg calls working;
--   null/empty p_city still resolves to Shanghai (same as pre-migration hardcoded filter).
-- Safe to apply on production before shipping multi-city app builds.

CREATE TABLE IF NOT EXISTS public.taplist_public_cities (
  city text PRIMARY KEY,
  label text NOT NULL,
  country text NOT NULL DEFAULT 'China',
  sort_order integer NOT NULL DEFAULT 100,
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.taplist_public_cities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS taplist_public_cities_read_enabled ON public.taplist_public_cities;
CREATE POLICY taplist_public_cities_read_enabled
  ON public.taplist_public_cities
  FOR SELECT
  USING (is_enabled = true);

CREATE OR REPLACE FUNCTION public.taplist_default_city_label(p_city text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(trim(p_city))
    WHEN 'shanghai' THEN '上海'
    WHEN 'beijing' THEN '北京'
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
    ELSE trim(p_city)
  END;
$$;

INSERT INTO public.taplist_public_cities (city, label, country, sort_order, is_enabled)
VALUES ('Shanghai', '上海', 'China', 10, true)
ON CONFLICT (city) DO UPDATE
SET
  label = EXCLUDED.label,
  country = EXCLUDED.country,
  sort_order = EXCLUDED.sort_order,
  is_enabled = EXCLUDED.is_enabled,
  updated_at = now();

INSERT INTO public.taplist_public_cities (city, label, country, sort_order, is_enabled)
SELECT DISTINCT
  trim(t.city) AS city,
  public.taplist_default_city_label(trim(t.city)) AS label,
  coalesce(nullif(trim(t.country), ''), 'China') AS country,
  100 AS sort_order,
  true AS is_enabled
FROM public.tenants t
WHERE t.status = 'active'
  AND t.is_public_visible = true
  AND nullif(trim(t.city), '') IS NOT NULL
ON CONFLICT (city) DO NOTHING;

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
          GROUP BY c.city, c.label, c.country, c.sort_order
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

DROP FUNCTION IF EXISTS public.get_beer_roadmap_eligible_tenants();

CREATE OR REPLACE FUNCTION public.get_beer_roadmap_eligible_tenants(p_city text DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH selected_city AS (
    SELECT coalesce(nullif(trim(p_city), ''), 'Shanghai') AS city
  ),
  eligible AS (
    SELECT t.id
    FROM public.tenants t
    CROSS JOIN selected_city sc
    WHERE t.status = 'active'
      AND t.is_public_visible = true
      AND lower(trim(t.city)) = lower(trim(sc.city))
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
  new_tap_agg AS (
    SELECT
      d.tenant_id,
      count(*)::int AS qualifying_new_tap_count
    FROM public.drinks d
    INNER JOIN public.categories c
      ON c.id = d.category_id AND c.tenant_id = d.tenant_id
    WHERE d.enabled = true
      AND d.is_public_visible = true
      AND c.enabled = true
      AND c.is_public_visible = true
      AND d.public_status = 'new'
      AND d.public_status_changed_at IS NOT NULL
      AND d.public_status_changed_at >= now() - interval '14 days'
    GROUP BY d.tenant_id
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
        'qualifyingNewTapCount', coalesce(nta.qualifying_new_tap_count, 0)
      )
      ORDER BY t.id
    ),
    '[]'::jsonb
  )
  FROM eligible e
  INNER JOIN public.tenants t ON t.id = e.id
  LEFT JOIN new_tap_agg nta ON nta.tenant_id = t.id;
$$;

REVOKE ALL ON FUNCTION public.get_beer_roadmap_eligible_tenants(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_beer_roadmap_eligible_tenants(text) TO service_role;
