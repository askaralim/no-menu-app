-- =====================================================================
-- Tenant beer init seed (replace current menu)
-- Tenant: c3af90db-9734-4750-927c-38f6b37fb3e0
--
-- Source columns:
--   Beer name | Brewery | Type | ABV
--
-- Notes:
-- - This is an INIT script: it clears this tenant's existing menu rows first.
-- - Only beer metadata provided is imported.
-- - prices are set to 0 and no serving options are inserted.
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

DELETE FROM public.drink_serving_options
WHERE tenant_id = 'c3af90db-9734-4750-927c-38f6b37fb3e0';

DELETE FROM public.drink_beer_profiles
WHERE tenant_id = 'c3af90db-9734-4750-927c-38f6b37fb3e0';

DELETE FROM public.drinks
WHERE tenant_id = 'c3af90db-9734-4750-927c-38f6b37fb3e0';

DELETE FROM public.categories
WHERE tenant_id = 'c3af90db-9734-4750-927c-38f6b37fb3e0';

WITH menu_rows AS (
  SELECT *
  FROM (
    VALUES
      (1, '无序：汪汪惊喜', '艾尔复兴', '果泥/甜点酸艾尔', 5.0::numeric),
      (2, '树莓兰比克', '澎湃家族', '水果兰比克', 5.0::numeric),
      (3, '精明强干', '凯西', '农舍艾尔', 6.0::numeric),
      (4, '史蒂夫之斧', '欧米尼珀罗', '双倍/帝国浑浊IPA', 8.8::numeric),
      (5, '天选之子', '倾斜谷仓', '浑浊/新英格兰IPA', 8.0::numeric),
      (6, '番茄工厂', '另一半', '双倍/帝国浑浊IPA', 8.5::numeric),
      (7, '果味满满19号', '回头客', '水果酸艾尔', 5.1::numeric),
      (8, '分形', '幻果实验室', '帝国世涛', 12.0::numeric)
  ) AS v(sort_order, beer_name, brewery, beer_style, abv)
),
inserted_category AS (
  INSERT INTO public.categories (tenant_id, name, sort_order, enabled, is_public_visible)
  VALUES ('c3af90db-9734-4750-927c-38f6b37fb3e0', '生啤', 1, true, true)
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
    'c3af90db-9734-4750-927c-38f6b37fb3e0',
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
INSERT INTO public.drink_beer_profiles (tenant_id, drink_id, brewery, beer_style, abv)
SELECT
  'c3af90db-9734-4750-927c-38f6b37fb3e0',
  d.id,
  m.brewery,
  m.beer_style,
  m.abv
FROM inserted_drinks d
JOIN menu_rows m ON m.sort_order = d.sort_order;

UPDATE public.tenants
SET last_menu_updated_at = now()
WHERE id = 'c3af90db-9734-4750-927c-38f6b37fb3e0';

COMMIT;

-- Verify:
-- SELECT d.sort_order, d.brand_name, d.name, p.beer_style, p.abv, d.price
-- FROM public.drinks d
-- LEFT JOIN public.drink_beer_profiles p ON p.drink_id = d.id
-- WHERE d.tenant_id = 'c3af90db-9734-4750-927c-38f6b37fb3e0'
-- ORDER BY d.sort_order;
