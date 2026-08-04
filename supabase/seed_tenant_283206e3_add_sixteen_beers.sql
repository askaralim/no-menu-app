-- =====================================================================
-- Incremental seed: add sixteen beers
-- Tenant: 283206e3-22d9-4a54-b8a5-70694b1ec062
--
-- Serving sizes vary by row (220/330, 330/475, 330/470, 495/980, 495/1000, etc.).
-- Larger size is default when two sizes are listed.
--
-- Notes:
-- - Safe to re-run (idempotent by brewery + beer name).
-- - sort_order 1–16 in table order.
-- =====================================================================

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.tenants t
    WHERE t.id = '283206e3-22d9-4a54-b8a5-70694b1ec062'
  ) THEN
    RAISE EXCEPTION 'Tenant not found: %', '283206e3-22d9-4a54-b8a5-70694b1ec062';
  END IF;
END $$;

WITH existing_category AS (
  SELECT c.id
  FROM public.categories c
  WHERE c.tenant_id = '283206e3-22d9-4a54-b8a5-70694b1ec062'
    AND c.name = '生啤'
  ORDER BY c.sort_order, c.created_at, c.id
  LIMIT 1
),
inserted_category AS (
  INSERT INTO public.categories (tenant_id, name, sort_order, enabled, is_public_visible)
  SELECT
    '283206e3-22d9-4a54-b8a5-70694b1ec062',
    '生啤',
    1,
    true,
    true
  WHERE NOT EXISTS (SELECT 1 FROM existing_category)
  RETURNING id
),
resolved_category AS (
  SELECT id FROM existing_category
  UNION ALL
  SELECT id FROM inserted_category
  LIMIT 1
),
menu_rows AS (
  SELECT *
  FROM (
    VALUES
      (1, '果味满满'::text, '回头客'::text, '美国'::text, '水果酸艾尔'::text, 5.0::numeric, 220::integer, 59::integer, 330::integer, 89::integer),
      (2, '粉红色的夏天'::text, 'SMOOJ'::text, '美国'::text, '水果酸艾尔'::text, 5.0::numeric, 220::integer, 69::integer, 330::integer, 99::integer),
      (3, '历史学会'::text, '本末·特伦'::text, '美国'::text, '柏林酸小麦'::text, 5.0::numeric, 220::integer, 69::integer, 330::integer, 99::integer),
      (4, '业劫'::text, '本末·特伦'::text, '美国'::text, '酸双倍冷 IPA'::text, 8.0::numeric, 220::integer, 82::integer, 330::integer, 129::integer),
      (5, '健力士 Guinness'::text, 'Guinness'::text, NULL::text, '氮气世涛'::text, NULL::numeric, NULL::integer, NULL::integer, 475::integer, 55::integer),
      (6, '三重未知'::text, '修订'::text, '美国'::text, '三倍西海岸 IPA'::text, 11.2::numeric, 330::integer, 69::integer, 475::integer, 85::integer),
      (7, '米兰日落'::text, '艾尔复兴'::text, '美国'::text, '新英格兰 IPA'::text, 7.9::numeric, 330::integer, 99::integer, 475::integer, 129::integer),
      (8, '瑞瓦卡酒花'::text, '艾尔复兴'::text, '美国'::text, '新英格兰帝国 IPA'::text, 8.5::numeric, 330::integer, 99::integer, 475::integer, 129::integer),
      (9, '本劫'::text, '本末特伦'::text, '美国'::text, '三倍浑浊 IPA'::text, 10.0::numeric, 330::integer, 139::integer, 470::integer, 199::integer),
      (10, '僵尸猎鸭人'::text, '酒花僵尸'::text, '美国'::text, '西海岸 IPA'::text, 6.6::numeric, 330::integer, 65::integer, 475::integer, 79::integer),
      (11, '流动'::text, '疯熊酿造'::text, '广州'::text, 'DDH 浑浊 IPA'::text, 7.5::numeric, 330::integer, 59::integer, 475::integer, 75::integer),
      (12, '元素的艺术'::text, '费登斯'::text, '美国'::text, '新英格兰三倍 IPA'::text, 10.5::numeric, 330::integer, 159::integer, 475::integer, 233::integer),
      (13, '锈钉 2024'::text, '佛里蒙'::text, '美国'::text, '帝国世涛'::text, 14.0::numeric, 330::integer, 99::integer, 475::integer, 118::integer),
      (14, '立方'::text, '蔓延'::text, '武汉'::text, '酵母悬浮型小麦'::text, 4.5::numeric, 495::integer, 59::integer, 980::integer, 109::integer),
      (15, '智美银帽'::text, '智美'::text, '比利时'::text, '比利时金色艾尔'::text, 6.5::numeric, 495::integer, 69::integer, 980::integer, 129::integer),
      (16, '波兰皮尔森'::text, '第三阶段'::text, '美国'::text, '皮尔森'::text, 5.5::numeric, 495::integer, 69::integer, 1000::integer, 129::integer)
  ) AS v(
    row_no,
    beer_name,
    brewery,
    country,
    beer_style,
    abv,
    vol_small,
    price_small,
    vol_large,
    price_large
  )
),
rows_to_insert AS (
  SELECT m.*
  FROM menu_rows m
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.drinks d
    WHERE d.tenant_id = '283206e3-22d9-4a54-b8a5-70694b1ec062'
      AND d.brand_name = m.brewery
      AND d.name = m.beer_name
  )
),
inserted_drinks AS (
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
  SELECT
    '283206e3-22d9-4a54-b8a5-70694b1ec062',
    rc.id,
    r.brewery,
    r.beer_name,
    r.price_large,
    '杯',
    r.vol_large,
    r.row_no,
    true,
    true,
    'available',
    r.row_no
  FROM rows_to_insert r
  CROSS JOIN resolved_category rc
  RETURNING id, brand_name, name
),
inserted_profiles AS (
  INSERT INTO public.drink_beer_profiles (tenant_id, drink_id, brewery, beer_style, abv, country)
  SELECT
    '283206e3-22d9-4a54-b8a5-70694b1ec062',
    td.id,
    m.brewery,
    m.beer_style,
    m.abv,
    m.country
  FROM inserted_drinks td
  JOIN menu_rows m
    ON m.brewery = td.brand_name
   AND m.beer_name = td.name
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.drink_beer_profiles p
    WHERE p.drink_id = td.id
  )
  RETURNING drink_id
)
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
SELECT
  '283206e3-22d9-4a54-b8a5-70694b1ec062',
  td.id,
  s.serving_type,
  s.label,
  s.volume_ml,
  s.price,
  s.is_default,
  true,
  s.public_sort_order
FROM inserted_drinks td
JOIN menu_rows m
  ON m.brewery = td.brand_name
 AND m.beer_name = td.name
CROSS JOIN LATERAL (
  SELECT *
  FROM (
    VALUES
      ('draft'::text, (m.vol_small::text || 'ml'), m.vol_small, m.price_small, false, 0),
      ('draft'::text, (m.vol_large::text || 'ml'), m.vol_large, m.price_large, true, 1)
  ) AS dual(serving_type, label, volume_ml, price, is_default, public_sort_order)
  WHERE m.price_small IS NOT NULL
    AND m.vol_small IS NOT NULL
    AND m.price_large IS NOT NULL
    AND m.vol_large IS NOT NULL

  UNION ALL

  SELECT
    'draft'::text,
    (m.vol_large::text || 'ml'),
    m.vol_large,
    m.price_large,
    true,
    0
  WHERE (m.price_small IS NULL OR m.vol_small IS NULL)
    AND m.price_large IS NOT NULL
    AND m.vol_large IS NOT NULL
) s;

UPDATE public.tenants
SET last_menu_updated_at = now()
WHERE id = '283206e3-22d9-4a54-b8a5-70694b1ec062';

COMMIT;

-- Verify:
-- SELECT d.sort_order, d.brand_name, d.name, p.country, p.beer_style, p.abv, d.price, d.volume_ml
-- FROM public.drinks d
-- LEFT JOIN public.drink_beer_profiles p ON p.drink_id = d.id
-- WHERE d.tenant_id = '283206e3-22d9-4a54-b8a5-70694b1ec062'
-- ORDER BY d.sort_order;
--
-- SELECT d.name, so.label, so.volume_ml, so.price, so.is_default
-- FROM public.drinks d
-- JOIN public.drink_serving_options so ON so.drink_id = d.id
-- WHERE d.tenant_id = '283206e3-22d9-4a54-b8a5-70694b1ec062'
-- ORDER BY d.sort_order, so.public_sort_order;
