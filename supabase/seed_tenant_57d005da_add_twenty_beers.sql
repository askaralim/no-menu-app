-- =====================================================================
-- Incremental seed: add twenty beers
-- Tenant: 57d005da-1193-4bd2-955a-ef6b9653516d
--
-- Sizes: S=200ml, M=330ml, L=415ml, XL=1000ml
--
-- Notes:
-- - Safe to re-run (idempotent by brewery + beer name).
-- - sort_order / public_sort_order use source # column.
-- - Largest listed size is default serving.
-- =====================================================================

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.tenants t
    WHERE t.id = '57d005da-1193-4bd2-955a-ef6b9653516d'
  ) THEN
    RAISE EXCEPTION 'Tenant not found: %', '57d005da-1193-4bd2-955a-ef6b9653516d';
  END IF;
END $$;

WITH existing_category AS (
  SELECT c.id
  FROM public.categories c
  WHERE c.tenant_id = '57d005da-1193-4bd2-955a-ef6b9653516d'
    AND c.name = '生啤'
  ORDER BY c.sort_order, c.created_at, c.id
  LIMIT 1
),
inserted_category AS (
  INSERT INTO public.categories (tenant_id, name, sort_order, enabled, is_public_visible)
  SELECT
    '57d005da-1193-4bd2-955a-ef6b9653516d',
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
      (1, '业劫'::text, '本末特伦'::text, '美国'::text, '酸 IPA'::text, 8.0::numeric, 76::integer, 125::integer, NULL::integer, NULL::integer),
      (2, '阿尔科莱'::text, '洛莱'::text, '美国'::text, '双倍干投浑浊 IPA'::text, 8.5::numeric, NULL::integer, 105::integer, 151::integer, NULL::integer),
      (3, '梦想'::text, '郡区'::text, '美国'::text, '咖啡世涛'::text, 6.8::numeric, NULL::integer, 78::integer, 107::integer, NULL::integer),
      (4, '双板滑雪'::text, '艾尔复兴'::text, '美国'::text, '水果酸艾尔'::text, 5.0::numeric, NULL::integer, 101::integer, 140::integer, NULL::integer),
      (6, '粉红夏日'::text, '斯莫吉'::text, '美国'::text, '水果硬苏打'::text, 5.1::numeric, 72::integer, 112::integer, NULL::integer, NULL::integer),
      (8, '杂散光'::text, '哈德逊河谷'::text, '美国'::text, '酸 IPA'::text, 7.0::numeric, NULL::integer, 92::integer, 127::integer, NULL::integer),
      (9, '单板滑雪'::text, '艾尔复兴'::text, '美国'::text, '水果酸艾尔'::text, 5.0::numeric, NULL::integer, 101::integer, 140::integer, NULL::integer),
      (10, '本劫'::text, '本末特伦'::text, '美国'::text, '三倍浑浊 IPA'::text, 10.0::numeric, 88::integer, 144::integer, NULL::integer, NULL::integer),
      (11, '爸爸 papa'::text, '退界'::text, '中国'::text, '意大利皮尔森'::text, 4.8::numeric, NULL::integer, NULL::integer, 65::integer, 114::integer),
      (12, '黄米拉格'::text, '赤耳'::text, '中国'::text, '黄米拉格'::text, 6.2::numeric, NULL::integer, NULL::integer, 48::integer, 90::integer),
      (13, '米贼'::text, '赤屿谷盗'::text, '中国'::text, '大米拉格'::text, 4.5::numeric, NULL::integer, NULL::integer, 61::integer, 115::integer),
      (14, '亚特兰大出口'::text, '矛盾体'::text, '美国'::text, '比利时风格拉格'::text, 5.5::numeric, NULL::integer, 78::integer, 109::integer, NULL::integer),
      (15, '劫尽'::text, '本末特伦'::text, '美国'::text, '日本大米拉格'::text, 5.0::numeric, NULL::integer, 116::integer, 160::integer, NULL::integer),
      (16, '饼干'::text, 'Alus'::text, '中国'::text, '皮尔森'::text, 5.2::numeric, NULL::integer, NULL::integer, 55::integer, 100::integer),
      (18, '基数'::text, '矛盾体'::text, '美国'::text, '皮尔森'::text, 4.8::numeric, NULL::integer, 78::integer, 107::integer, NULL::integer),
      (19, '泡泡浴'::text, 'Alus'::text, '中国'::text, '日本柚子拉格'::text, 5.1::numeric, NULL::integer, NULL::integer, 55::integer, 100::integer),
      (20, '河谷'::text, '哈德逊河谷'::text, '美国'::text, '农舍酸艾尔'::text, 5.0::numeric, 112::integer, 186::integer, NULL::integer, NULL::integer),
      (22, '谷仓金'::text, 'Fever'::text, '美国'::text, '金色窑臧拉格'::text, 6.0::numeric, NULL::integer, NULL::integer, 55::integer, 100::integer),
      (23, '班克斯先生'::text, '班克斯'::text, '澳大利亚'::text, '澳式拉格'::text, 6.0::numeric, NULL::integer, 66::integer, 91::integer, NULL::integer),
      (24, '毒蛇之握'::text, '锅炉'::text, '美国'::text, '黑麦 IPA'::text, 6.6::numeric, NULL::integer, 105::integer, 151::integer, NULL::integer)
  ) AS v(
    row_no,
    beer_name,
    brewery,
    country,
    beer_style,
    abv,
    price_s,
    price_m,
    price_l,
    price_xl
  )
),
rows_to_insert AS (
  SELECT m.*
  FROM menu_rows m
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.drinks d
    WHERE d.tenant_id = '57d005da-1193-4bd2-955a-ef6b9653516d'
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
    '57d005da-1193-4bd2-955a-ef6b9653516d',
    rc.id,
    r.brewery,
    r.beer_name,
    COALESCE(r.price_xl, r.price_l, r.price_m, r.price_s),
    '杯',
    CASE
      WHEN r.price_xl IS NOT NULL THEN 1000
      WHEN r.price_l IS NOT NULL THEN 415
      WHEN r.price_m IS NOT NULL THEN 330
      ELSE 200
    END,
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
    '57d005da-1193-4bd2-955a-ef6b9653516d',
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
  '57d005da-1193-4bd2-955a-ef6b9653516d',
  td.id,
  s.serving_type,
  s.label,
  s.volume_ml,
  s.price,
  s.volume_ml = GREATEST(
    CASE WHEN m.price_s IS NOT NULL THEN 200 ELSE 0 END,
    CASE WHEN m.price_m IS NOT NULL THEN 330 ELSE 0 END,
    CASE WHEN m.price_l IS NOT NULL THEN 415 ELSE 0 END,
    CASE WHEN m.price_xl IS NOT NULL THEN 1000 ELSE 0 END
  ),
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
      ('draft'::text, 'S'::text, 200::integer, m.price_s, 0),
      ('draft'::text, 'M'::text, 330::integer, m.price_m, 1),
      ('draft'::text, 'L'::text, 415::integer, m.price_l, 2),
      ('draft'::text, 'XL'::text, 1000::integer, m.price_xl, 3)
  ) AS v(serving_type, label, volume_ml, price, public_sort_order)
  WHERE v.price IS NOT NULL
) s;

UPDATE public.tenants
SET last_menu_updated_at = now()
WHERE id = '57d005da-1193-4bd2-955a-ef6b9653516d';

COMMIT;

-- Verify:
-- SELECT d.sort_order, d.brand_name, d.name, p.country, p.beer_style, p.abv, d.price, d.volume_ml
-- FROM public.drinks d
-- LEFT JOIN public.drink_beer_profiles p ON p.drink_id = d.id
-- WHERE d.tenant_id = '57d005da-1193-4bd2-955a-ef6b9653516d'
-- ORDER BY d.sort_order;
--
-- SELECT d.sort_order, d.name, so.label, so.volume_ml, so.price, so.is_default
-- FROM public.drinks d
-- JOIN public.drink_serving_options so ON so.drink_id = d.id
-- WHERE d.tenant_id = '57d005da-1193-4bd2-955a-ef6b9653516d'
-- ORDER BY d.sort_order, so.public_sort_order;
