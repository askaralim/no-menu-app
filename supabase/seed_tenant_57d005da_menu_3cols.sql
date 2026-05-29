-- =====================================================================
-- Tenant menu seed (3-column import)
-- Tenant: 57d005da-1193-4bd2-955a-ef6b9653516d
--
-- Source columns:
--   1) Brewery -> drinks.brand_name / drink_beer_profiles.brewery
--   2) Beer name -> drinks.name
--   3) Type -> drink_beer_profiles.beer_style
--
-- Notes:
-- - Re-runnable: removes this tenant's existing categories/drinks/profiles/servings.
-- - Only 3 provided fields are imported; prices use 0 as placeholder.
-- - No serving options are inserted in this script.
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

DELETE FROM public.drink_serving_options
WHERE tenant_id = '57d005da-1193-4bd2-955a-ef6b9653516d';

DELETE FROM public.drink_beer_profiles
WHERE tenant_id = '57d005da-1193-4bd2-955a-ef6b9653516d';

DELETE FROM public.drinks
WHERE tenant_id = '57d005da-1193-4bd2-955a-ef6b9653516d';

DELETE FROM public.categories
WHERE tenant_id = '57d005da-1193-4bd2-955a-ef6b9653516d';

WITH menu_rows AS (
  SELECT *
  FROM (
    VALUES
      (1, '洛莱', '美洲豹', 'UHA'),
      (2, '洛莱', '阿尔克斯', 'UHA'),
      (3, '郡区', '梦想Rêve Coffee Stout', '世涛'),
      (4, 'OOO:', 'Powder Hound无序双板滑雪', '甜点酸艾尔'),
      (5, '长青工匠', '范尼拉符文', '世涛'),
      (6, '斯莫及', '皮纳科达拉', '水果苏打'),
      (7, '洛莱', '鬣狗', 'UHA'),
      (8, '鸭池', '孤注一掷', '古斯'),
      (9, 'OOO:', 'Sweep Broom Peel无序冰壶', '甜点酸艾尔'),
      (10, '善良胡夫', '120美元2号', '三倍IPA'),
      (11, '艾尔复兴', '一起漂浮', '新英格兰三倍IPA'),
      (12, '蔓延', '北地显影', '英式艾尔'),
      (13, '退界', '小夫', '墨西哥拉格'),
      (14, '酒窖师', '久别重逢', '西海岸淡色艾尔'),
      (15, '斯莫及', '芒果', '水果苏打'),
      (16, '酸羽', '机械神明', '英式艾尔'),
      (17, '阿彭策尔', '水晶拉格（第五批）', '水晶拉格'),
      (18, '种子', '起始之日', '西海岸淡色艾尔'),
      (19, '哈德逊河谷', '游隼', '酸农舍艾尔'),
      (20, '哈德逊河谷', '河谷2024', '酸农舍艾尔'),
      (21, '退界', '下快攻', '博克'),
      (22, '风土', '第一个纪念日', '水果酸艾尔'),
      (23, '洛莱', '解药', '新西兰皮尔森'),
      (24, '锅炉', '毒蛇之握', '黑麦IPA')
  ) AS v(sort_order, brewery, beer_name, beer_style)
),
inserted_category AS (
  INSERT INTO public.categories (tenant_id, name, sort_order, enabled, is_public_visible)
  VALUES ('57d005da-1193-4bd2-955a-ef6b9653516d', '生啤', 1, true, true)
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
    '57d005da-1193-4bd2-955a-ef6b9653516d',
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
INSERT INTO public.drink_beer_profiles (tenant_id, drink_id, brewery, beer_style)
SELECT
  '57d005da-1193-4bd2-955a-ef6b9653516d',
  d.id,
  m.brewery,
  m.beer_style
FROM inserted_drinks d
JOIN menu_rows m ON m.sort_order = d.sort_order;

UPDATE public.tenants
SET last_menu_updated_at = now()
WHERE id = '57d005da-1193-4bd2-955a-ef6b9653516d';

COMMIT;

-- Quick check:
-- SELECT d.sort_order, d.brand_name, d.name, p.beer_style
-- FROM public.drinks d
-- LEFT JOIN public.drink_beer_profiles p ON p.drink_id = d.id
-- WHERE d.tenant_id = '57d005da-1193-4bd2-955a-ef6b9653516d'
-- ORDER BY d.sort_order;
