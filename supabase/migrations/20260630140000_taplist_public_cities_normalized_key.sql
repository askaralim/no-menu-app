-- Normalize taplist_public_cities keys: one row per city regardless of case/spacing.

CREATE OR REPLACE FUNCTION public.taplist_canonical_city_key(p_city text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(trim(p_city))
    WHEN 'shanghai' THEN 'Shanghai'
    WHEN 'beijing' THEN 'Beijing'
    WHEN 'guangzhou' THEN 'Guangzhou'
    WHEN 'shenzhen' THEN 'Shenzhen'
    WHEN 'chengdu' THEN 'Chengdu'
    WHEN 'hangzhou' THEN 'Hangzhou'
    WHEN 'nanjing' THEN 'Nanjing'
    WHEN 'suzhou' THEN 'Suzhou'
    WHEN 'wuhan' THEN 'Wuhan'
    WHEN 'xian' THEN 'Xi''an'
    WHEN 'xi''an' THEN 'Xi''an'
    WHEN 'chongqing' THEN 'Chongqing'
    ELSE initcap(trim(p_city))
  END;
$$;

-- Collapse duplicate catalog rows that differ only by case/spacing.
WITH ranked AS (
  SELECT
    city,
    row_number() OVER (
      PARTITION BY lower(trim(city))
      ORDER BY sort_order, length(city), city
    ) AS rn
  FROM public.taplist_public_cities
)
DELETE FROM public.taplist_public_cities c
USING ranked r
WHERE c.city = r.city
  AND r.rn > 1;

UPDATE public.taplist_public_cities c
SET
  city = public.taplist_canonical_city_key(c.city),
  updated_at = now()
WHERE c.city <> public.taplist_canonical_city_key(c.city);

CREATE UNIQUE INDEX IF NOT EXISTS taplist_public_cities_city_norm_uidx
  ON public.taplist_public_cities (lower(trim(city)));

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

  INSERT INTO public.taplist_public_cities (city, label, country, sort_order, is_enabled)
  VALUES (v_city, v_label, v_country, v_sort_order, coalesce(p_is_enabled, true))
  ON CONFLICT (city) DO UPDATE
  SET
    label = EXCLUDED.label,
    country = EXCLUDED.country,
    sort_order = EXCLUDED.sort_order,
    is_enabled = EXCLUDED.is_enabled,
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
      true AS is_enabled
    FROM public.tenants t
    WHERE t.status = 'active'
      AND nullif(trim(t.city), '') IS NOT NULL
    ORDER BY lower(trim(t.city)), trim(t.city)
  ),
  inserted AS (
    INSERT INTO public.taplist_public_cities (city, label, country, sort_order, is_enabled)
    SELECT city, label, country, sort_order, is_enabled
    FROM candidates
    ON CONFLICT (city) DO NOTHING
    RETURNING city
  )
  SELECT count(*)::int INTO v_inserted FROM inserted;

  RETURN jsonb_build_object('ok', true, 'inserted', v_inserted);
END;
$$;
