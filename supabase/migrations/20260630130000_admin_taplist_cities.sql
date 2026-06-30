-- super_admin RPCs for consumer Tap List city catalog management.
--
-- Admin-only. No impact on App Store 1.2.x consumer RPCs or Edge Functions.

CREATE OR REPLACE FUNCTION public.admin_list_taplist_cities()
RETURNS jsonb
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
    WHERE ur.user_id = auth.uid() AND ur.role = 'super_admin'
  ) THEN
    RAISE EXCEPTION 'Unauthorized: super_admin role required';
  END IF;

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
              'is_enabled', c.is_enabled,
              'updated_at', c.updated_at,
              'active_bar_count', count(t.id) FILTER (WHERE t.status = 'active'),
              'public_bar_count', count(t.id) FILTER (
                WHERE t.status = 'active' AND t.is_public_visible = true
              )
            ) AS row_obj,
            c.sort_order,
            c.label,
            c.city
          FROM public.taplist_public_cities c
          LEFT JOIN public.tenants t
            ON lower(trim(t.city)) = lower(trim(c.city))
          GROUP BY c.city, c.label, c.country, c.sort_order, c.is_enabled, c.updated_at
        ) sub
      ),
      '[]'::jsonb
    )
  );
END;
$$;

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
  v_city text := trim(p_city);
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

  IF v_city = '' THEN
    RAISE EXCEPTION 'City key is required';
  END IF;

  IF v_label = '' THEN
    v_label := public.taplist_default_city_label(v_city);
  END IF;

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

  WITH inserted AS (
    INSERT INTO public.taplist_public_cities (city, label, country, sort_order, is_enabled)
    SELECT DISTINCT
      trim(t.city) AS city,
      public.taplist_default_city_label(trim(t.city)) AS label,
      coalesce(nullif(trim(t.country), ''), 'China') AS country,
      100 AS sort_order,
      true AS is_enabled
    FROM public.tenants t
    WHERE t.status = 'active'
      AND nullif(trim(t.city), '') IS NOT NULL
    ON CONFLICT (city) DO NOTHING
    RETURNING city
  )
  SELECT count(*)::int INTO v_inserted FROM inserted;

  RETURN jsonb_build_object('ok', true, 'inserted', v_inserted);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_taplist_cities() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_upsert_taplist_city(text, text, text, integer, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_sync_taplist_cities_from_tenants() TO authenticated;
