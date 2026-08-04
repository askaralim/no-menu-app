-- =====================================================================
-- Incremental seed: add eight beers
-- Tenant: c3af90db-9734-4750-927c-38f6b37fb3e0
--
-- Beers:
--   01 另一半12周年 | 另一半 | 美国 | 三倍浑浊IPA | 10.0 | 88/330ml, 128/500ml
--   02 白日梦       | 辉光   | 美国 | 西海岸IPA | 6.9 | 78/330ml, 115/500ml
--   05 维京征服     | 三子   | 美国 | 波罗的海波特 | 9.0 | 78/330ml, 115/500ml
--   06 醉佳         | 辉光   | 美国 | 日式大米拉格 | 5.1 | 68/330ml, 98/500ml
--   07 果味满满     | 回头客 | 美国 | 水果酸艾尔 | 5.1 | 88/220ml, 128/330ml
--   08 奢华冰冻池塘 | 鸭池   | 美国 | 水果古斯 | 9.0 | 68/220ml, 98/330ml
--   11 融雪之前     | 云朵   | 中国 | 波西米亚皮尔森 | 5.0 | 50/500ml, 95/1000ml
--   12 晓夫         | 退界   | 中国 | 墨西哥拉格 | 4.3 | 50/500ml, 95/1000ml
--
-- Notes:
-- - Safe to re-run (idempotent by brewery + beer name).
-- - sort_order / public_sort_order use source # column.
-- - Larger serving is default (public_sort_order 1).
-- =====================================================================

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.tenants t
    WHERE t.id = 'c3af90db-9734-4750-927c-38f6b37fb3e0'
  ) THEN
    RAISE EXCEPTION 'Tenant not found: %', 'c3af90db-9734-4750-927c-38f6b37fb3e0';
  END IF;
END $$;

WITH existing_category AS (
  SELECT c.id
  FROM public.categories c
  WHERE c.tenant_id = 'c3af90db-9734-4750-927c-38f6b37fb3e0'
    AND c.name = '生啤'
  ORDER BY c.sort_order, c.created_at, c.id
  LIMIT 1
),
inserted_category AS (
  INSERT INTO public.categories (tenant_id, name, sort_order, enabled, is_public_visible)
  SELECT
    'c3af90db-9734-4750-927c-38f6b37fb3e0',
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
      (1, '另一半12周年'::text, '另一半'::text, '美国'::text, '三倍浑浊IPA'::text, 10.0::numeric, 330::integer, 88::integer, 500::integer, 128::integer),
      (2, '白日梦'::text, '辉光'::text, '美国'::text, '西海岸IPA'::text, 6.9::numeric, 330::integer, 78::integer, 500::integer, 115::integer),
      (5, '维京征服'::text, '三子'::text, '美国'::text, '波罗的海波特'::text, 9.0::numeric, 330::integer, 78::integer, 500::integer, 115::integer),
      (6, '醉佳'::text, '辉光'::text, '美国'::text, '日式大米拉格'::text, 5.1::numeric, 330::integer, 68::integer, 500::integer, 98::integer),
      (7, '果味满满'::text, '回头客'::text, '美国'::text, '水果酸艾尔'::text, 5.1::numeric, 220::integer, 88::integer, 330::integer, 128::integer),
      (8, '奢华冰冻池塘'::text, '鸭池'::text, '美国'::text, '水果古斯'::text, 9.0::numeric, 220::integer, 68::integer, 330::integer, 98::integer),
      (11, '融雪之前'::text, '云朵'::text, '中国'::text, '波西米亚皮尔森'::text, 5.0::numeric, 500::integer, 50::integer, 1000::integer, 95::integer),
      (12, '晓夫'::text, '退界'::text, '中国'::text, '墨西哥拉格'::text, 4.3::numeric, 500::integer, 50::integer, 1000::integer, 95::integer)
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
    WHERE d.tenant_id = 'c3af90db-9734-4750-927c-38f6b37fb3e0'
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
    'c3af90db-9734-4750-927c-38f6b37fb3e0',
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
    'c3af90db-9734-4750-927c-38f6b37fb3e0',
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
  'c3af90db-9734-4750-927c-38f6b37fb3e0',
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
  VALUES
    ('draft'::text, (m.vol_small::text || 'ml'), m.vol_small, m.price_small, false, 0),
    ('draft'::text, (m.vol_large::text || 'ml'), m.vol_large, m.price_large, true, 1)
) AS s(serving_type, label, volume_ml, price, is_default, public_sort_order);

UPDATE public.tenants
SET last_menu_updated_at = now()
WHERE id = 'c3af90db-9734-4750-927c-38f6b37fb3e0';

COMMIT;

-- Verify:
-- SELECT d.sort_order, d.brand_name, d.name, p.country, p.beer_style, p.abv, d.price, d.volume_ml
-- FROM public.drinks d
-- LEFT JOIN public.drink_beer_profiles p ON p.drink_id = d.id
-- WHERE d.tenant_id = 'c3af90db-9734-4750-927c-38f6b37fb3e0'
--   AND d.name IN (
--     '另一半12周年', '白日梦', '维京征服', '醉佳', '果味满满',
--     '奢华冰冻池塘', '融雪之前', '晓夫'
--   )
-- ORDER BY d.sort_order;
--
-- SELECT d.name, so.label, so.volume_ml, so.price, so.is_default
-- FROM public.drinks d
-- JOIN public.drink_serving_options so ON so.drink_id = d.id
-- WHERE d.tenant_id = 'c3af90db-9734-4750-927c-38f6b37fb3e0'
--   AND d.name IN (
--     '另一半12周年', '白日梦', '维京征服', '醉佳', '果味满满',
--     '奢华冰冻池塘', '融雪之前', '晓夫'
--   )
-- ORDER BY d.sort_order, so.public_sort_order;
