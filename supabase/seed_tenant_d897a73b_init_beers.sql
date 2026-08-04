-- =====================================================================
-- Tenant beer init seed (replace current menu)
-- Tenant: d897a73b-37fb-4c57-af0f-79d8759173cb
--
-- Source columns:
--   Brewery | Beer name | Type | IBU | ABV | Price
--
-- Serving sizes:
--   Two prices: 330ml @ first price, 473ml @ second price (473ml default)
--   Single price: 330ml only
--
-- Run in Supabase SQL Editor (as super_admin / service role).
-- Safe to re-run: clears this tenant's menu then re-inserts.
-- =====================================================================

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.tenants t
    WHERE t.id = 'd897a73b-37fb-4c57-af0f-79d8759173cb'
  ) THEN
    RAISE EXCEPTION 'Tenant not found: %', 'd897a73b-37fb-4c57-af0f-79d8759173cb';
  END IF;
END $$;

DELETE FROM public.drink_serving_options
WHERE tenant_id = 'd897a73b-37fb-4c57-af0f-79d8759173cb';

DELETE FROM public.drink_beer_profiles
WHERE tenant_id = 'd897a73b-37fb-4c57-af0f-79d8759173cb';

DELETE FROM public.drinks
WHERE tenant_id = 'd897a73b-37fb-4c57-af0f-79d8759173cb';

DELETE FROM public.categories
WHERE tenant_id = 'd897a73b-37fb-4c57-af0f-79d8759173cb';

WITH menu_rows AS (
  SELECT *
  FROM (
    VALUES
      (1, '齿轮精酿', '怒饮酒花儿', '酒花拉格', 28::integer, 5.2::numeric, 25::numeric, 35::numeric),
      (2, '隔壁老李', '琥珀艾尔', '琥珀艾尔', 30::integer, 5.3::numeric, 30::numeric, 40::numeric),
      (3, '撬啤酿造', '内个周五十一点半有个哥们进来就吐两个小时，吐了四次吐得很准非常感谢', '血橙酸 IPA', 20::integer, 6.4::numeric, 40::numeric, 55::numeric),
      (4, '齿轮精酿', '幸运鹅', '德式古斯', 10::integer, 4.3::numeric, 30::numeric, 40::numeric),
      (5, '玄水屋', '白天使', '柠檬磅蛋糕酸艾尔', NULL::integer, 4.2::numeric, 50::numeric, NULL::numeric),
      (6, '斜慕堡', '科慕堡皮尔森', '皮尔森', NULL::integer, 4.8::numeric, 35::numeric, 50::numeric),
      (7, '麻鸭麻', '古厝', '虫草昔啤？', NULL::integer, 6.5::numeric, 35::numeric, 50::numeric),
      (8, '赤峪谷盈', '依帕', '西海岸 IPA', 30::integer, 5.7::numeric, 40::numeric, 55::numeric),
      (9, '航朴精酿', '野指荒希？', '蜂蜜酒', NULL::integer, 7.1::numeric, 45::numeric, 65::numeric),
      (10, '巴伐利亚武僧', '双料小麦博克', '双料小麦博克', 20::integer, 7.9::numeric, 45::numeric, 65::numeric)
  ) AS v(sort_order, brewery, beer_name, beer_style, ibu, abv, price_330, price_473)
),
inserted_category AS (
  INSERT INTO public.categories (tenant_id, name, sort_order, enabled, is_public_visible)
  VALUES ('d897a73b-37fb-4c57-af0f-79d8759173cb', '生啤', 1, true, true)
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
    volume_ml,
    sort_order,
    enabled,
    is_public_visible,
    public_status,
    public_sort_order
  )
  SELECT
    'd897a73b-37fb-4c57-af0f-79d8759173cb',
    c.id,
    m.brewery,
    m.beer_name,
    COALESCE(m.price_473, m.price_330),
    '杯',
    CASE WHEN m.price_473 IS NOT NULL THEN 473 ELSE 330 END,
    m.sort_order,
    true,
    true,
    'available',
    m.sort_order
  FROM menu_rows m
  CROSS JOIN inserted_category c
  RETURNING id, sort_order
),
inserted_profiles AS (
  INSERT INTO public.drink_beer_profiles (tenant_id, drink_id, brewery, beer_style, abv, ibu)
  SELECT
    'd897a73b-37fb-4c57-af0f-79d8759173cb',
    d.id,
    m.brewery,
    m.beer_style,
    m.abv,
    m.ibu
  FROM inserted_drinks d
  JOIN menu_rows m ON m.sort_order = d.sort_order
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
  'd897a73b-37fb-4c57-af0f-79d8759173cb',
  d.id,
  s.serving_type,
  s.label,
  s.volume_ml,
  s.price,
  s.is_default,
  true,
  s.public_sort_order
FROM inserted_drinks d
JOIN menu_rows m ON m.sort_order = d.sort_order
CROSS JOIN LATERAL (
  SELECT *
  FROM (
    VALUES
      ('draft'::text, '330ml'::text, 330::integer, m.price_330, false, 0),
      ('draft'::text, '473ml'::text, 473::integer, m.price_473, true, 1)
  ) AS dual(serving_type, label, volume_ml, price, is_default, public_sort_order)
  WHERE m.price_473 IS NOT NULL

  UNION ALL

  SELECT
    'draft'::text,
    '330ml'::text,
    330::integer,
    m.price_330,
    true,
    0
  WHERE m.price_473 IS NULL
) s;

UPDATE public.tenants
SET last_menu_updated_at = now()
WHERE id = 'd897a73b-37fb-4c57-af0f-79d8759173cb';

COMMIT;

-- Verify:
-- SELECT d.sort_order, d.brand_name, d.name, p.beer_style, p.abv, p.ibu, d.price, d.volume_ml
-- FROM public.drinks d
-- LEFT JOIN public.drink_beer_profiles p ON p.drink_id = d.id
-- WHERE d.tenant_id = 'd897a73b-37fb-4c57-af0f-79d8759173cb'
-- ORDER BY d.sort_order;
--
-- SELECT d.sort_order, d.name, so.label, so.volume_ml, so.price, so.is_default
-- FROM public.drinks d
-- JOIN public.drink_serving_options so ON so.drink_id = d.id
-- WHERE d.tenant_id = 'd897a73b-37fb-4c57-af0f-79d8759173cb'
-- ORDER BY d.sort_order, so.public_sort_order;
--
-- SELECT count(*) AS drink_count FROM public.drinks WHERE tenant_id = 'd897a73b-37fb-4c57-af0f-79d8759173cb';
-- SELECT count(*) AS profile_count FROM public.drink_beer_profiles WHERE tenant_id = 'd897a73b-37fb-4c57-af0f-79d8759173cb';
-- SELECT count(*) AS serving_count FROM public.drink_serving_options WHERE tenant_id = 'd897a73b-37fb-4c57-af0f-79d8759173cb';
