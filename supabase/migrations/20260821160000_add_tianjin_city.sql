-- Add Tianjin to the public city catalog and city-name aliases.
-- POS storefront city picker reads taplist_public_cities; consumer city
-- switcher only shows enabled cities that already have a public bar.

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
    ELSE trim(p_city)
  END;
$$;

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
    WHEN 'tianjin' THEN 'Tianjin'
    WHEN '天津' THEN 'Tianjin'
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
    WHEN 'qingdao' THEN 'Qingdao'
    WHEN '青岛' THEN 'Qingdao'
    WHEN 'binzhou' THEN 'Binzhou'
    WHEN '滨州' THEN 'Binzhou'
    ELSE initcap(trim(p_city))
  END;
$$;

INSERT INTO public.taplist_public_cities (city, label, country, sort_order, is_enabled)
VALUES ('Tianjin', '天津', 'China', 25, true)
ON CONFLICT (city) DO UPDATE
SET
  label = EXCLUDED.label,
  country = EXCLUDED.country,
  sort_order = EXCLUDED.sort_order,
  is_enabled = EXCLUDED.is_enabled,
  updated_at = now();
