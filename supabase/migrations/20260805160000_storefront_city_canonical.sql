-- Harden storefront city: Chinese aliases → English catalog keys; normalize on save.

CREATE OR REPLACE FUNCTION public.taplist_canonical_city_key(p_city text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(trim(p_city))
    WHEN 'shanghai' THEN 'Shanghai'
    WHEN '上海' THEN 'Shanghai'
    WHEN 'beijing' THEN 'Beijing'
    WHEN '北京' THEN 'Beijing'
    WHEN 'guangzhou' THEN 'Guangzhou'
    WHEN '广州' THEN 'Guangzhou'
    WHEN 'shenzhen' THEN 'Shenzhen'
    WHEN '深圳' THEN 'Shenzhen'
    WHEN 'chengdu' THEN 'Chengdu'
    WHEN '成都' THEN 'Chengdu'
    WHEN 'hangzhou' THEN 'Hangzhou'
    WHEN '杭州' THEN 'Hangzhou'
    WHEN 'nanjing' THEN 'Nanjing'
    WHEN '南京' THEN 'Nanjing'
    WHEN 'suzhou' THEN 'Suzhou'
    WHEN '苏州' THEN 'Suzhou'
    WHEN 'wuhan' THEN 'Wuhan'
    WHEN '武汉' THEN 'Wuhan'
    WHEN 'xian' THEN 'Xi''an'
    WHEN 'xi''an' THEN 'Xi''an'
    WHEN '西安' THEN 'Xi''an'
    WHEN 'chongqing' THEN 'Chongqing'
    WHEN '重庆' THEN 'Chongqing'
    ELSE initcap(trim(p_city))
  END;
$$;

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
    city = v_city,
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
