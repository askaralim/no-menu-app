-- =====================================================================
-- Tenant beer init seed (replace current menu)
-- Tenant: 831db2a1-ee47-4d88-9c0b-3e19a5668d6d
--
-- Source columns:
--   Brewery | Beer name | Type | ABV | country
--
-- Notes:
-- - INIT script: clears this tenant's existing menu rows first.
-- - Metadata only; no prices, volumes, or serving options.
-- - drinks.price = 0 is a schema placeholder only.
-- =====================================================================

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.tenants t
    WHERE t.id = '831db2a1-ee47-4d88-9c0b-3e19a5668d6d'
  ) THEN
    RAISE EXCEPTION 'Tenant not found: %', '831db2a1-ee47-4d88-9c0b-3e19a5668d6d';
  END IF;
END $$;

DELETE FROM public.drink_serving_options
WHERE tenant_id = '831db2a1-ee47-4d88-9c0b-3e19a5668d6d';

DELETE FROM public.drink_beer_profiles
WHERE tenant_id = '831db2a1-ee47-4d88-9c0b-3e19a5668d6d';

DELETE FROM public.drinks
WHERE tenant_id = '831db2a1-ee47-4d88-9c0b-3e19a5668d6d';

DELETE FROM public.categories
WHERE tenant_id = '831db2a1-ee47-4d88-9c0b-3e19a5668d6d';

WITH menu_rows AS (
  SELECT *
  FROM (
    VALUES
      (1, '小回酿造 / Turn Right Brewing', '阿努尔夫街52号', '慕尼黑清亮拉格 / Munich Helles', 4.9::numeric, '长春'::text),
      (2, '啤脑酿造 / Beer Head', '银苹果', '科隆 / Kölsch', 4.7::numeric, '广州'::text),
      (3, '虽吾酿造 / SUIWU', '凤尾果香', '三倍干投摩登西海岸IPA / TDH Modern West Coast IPA', 7.2::numeric, '扬州'::text),
      (4, '远山啤酒 / Far Mont Beer', '布里斯班淡影', '超淡色艾尔 / Extra Pale Ale', 5.2::numeric, '北京'::text),
      (5, 'Bissell Brothers Brewing', 'Lux', '美式淡色艾尔 / American Pale Ale', 5.1::numeric, '美国波特兰'::text),
      (6, '野鹅微醺 x 佳卡哈', '无限螺旋', '双倍干投帝国浑浊IPA / DDH Imperial Hazy IPA', 8.2::numeric, '石家庄+深圳'::text),
      (7, '分野酿造 / Quadrant Brewing', '饶了地球', '酒花柠檬拉德勒 / Hoppy Lemon Radler', 4.2::numeric, '北京'::text),
      (8, '疯熊工业 / Crazy Bear Industry', '啤酒实习生2603', '轻硫醇皮尔森 / Thiol Pilsner', 4.8::numeric, '广州'::text),
      (9, '疯熊工业 / Crazy Bear Industry', '东分影', '三倍西海岸IPA / 3x West Coast IPA', 10.2::numeric, '广州'::text),
      (10, '双尾酿造 / Twin Tails', '朦胧之吻', '酸浑浊IPA / Sour Hazy IPA', 5.3::numeric, NULL::text),
      (11, '花雅酿造 / HARMO BREW', '实验款', '柳橙酸艾尔 / Orange Sour Ale', 3.7::numeric, '烟台'::text)
  ) AS v(sort_order, brewery, beer_name, beer_style, abv, country)
),
inserted_category AS (
  INSERT INTO public.categories (tenant_id, name, sort_order, enabled, is_public_visible)
  VALUES ('831db2a1-ee47-4d88-9c0b-3e19a5668d6d', '生啤', 1, true, true)
  RETURNING id
),
inserted_drinks AS (
  INSERT INTO public.drinks (
    tenant_id,
    category_id,
    brand_name,
    name,
    price,
    price_unit,
    sort_order,
    enabled,
    is_public_visible,
    public_status,
    public_sort_order
  )
  SELECT
    '831db2a1-ee47-4d88-9c0b-3e19a5668d6d',
    c.id,
    m.brewery,
    m.beer_name,
    0,
    '杯',
    m.sort_order,
    true,
    true,
    'available',
    m.sort_order
  FROM menu_rows m
  CROSS JOIN inserted_category c
  RETURNING id, sort_order
)
INSERT INTO public.drink_beer_profiles (tenant_id, drink_id, brewery, beer_style, abv, country)
SELECT
  '831db2a1-ee47-4d88-9c0b-3e19a5668d6d',
  d.id,
  m.brewery,
  m.beer_style,
  m.abv,
  m.country
FROM inserted_drinks d
JOIN menu_rows m ON m.sort_order = d.sort_order;

UPDATE public.tenants
SET last_menu_updated_at = now()
WHERE id = '831db2a1-ee47-4d88-9c0b-3e19a5668d6d';

COMMIT;

-- Verify:
-- SELECT d.sort_order, d.brand_name, d.name, p.beer_style, p.abv, p.country, d.price
-- FROM public.drinks d
-- LEFT JOIN public.drink_beer_profiles p ON p.drink_id = d.id
-- WHERE d.tenant_id = '831db2a1-ee47-4d88-9c0b-3e19a5668d6d'
-- ORDER BY d.sort_order;
--
-- SELECT count(*) AS drink_count FROM public.drinks WHERE tenant_id = '831db2a1-ee47-4d88-9c0b-3e19a5668d6d';
-- SELECT count(*) AS profile_count FROM public.drink_beer_profiles WHERE tenant_id = '831db2a1-ee47-4d88-9c0b-3e19a5668d6d';
-- SELECT count(*) AS serving_count FROM public.drink_serving_options WHERE tenant_id = '831db2a1-ee47-4d88-9c0b-3e19a5668d6d';
