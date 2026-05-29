-- =====================================================================
-- Much Beer — initial tap menu (8 beers, L/M/S pour sizes)
-- Tenant: Much Beer  id = 3d6cb427-a8c3-4583-a7c4-5a3ad9f5f787
--
-- Sizes: L = 400 ml, M = 330 ml, S = 200 ml
--
-- Run in Supabase SQL Editor (as super_admin / service role).
-- Safe to re-run: removes fixed seed IDs then re-inserts.
-- =====================================================================

BEGIN;

-- Fixed seed IDs (do not change without updating DELETE list)
-- category: 3d6cb427-a8c3-4583-a7c4-5a3ad9f5f001
-- drinks:   3d6cb427-a8c3-4583-a7c4-5a3ad9f501 .. 508

DELETE FROM public.drink_serving_options
WHERE drink_id IN (
  '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f501',
  '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f502',
  '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f503',
  '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f504',
  '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f505',
  '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f506',
  '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f507',
  '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f508'
);

DELETE FROM public.drink_beer_profiles
WHERE drink_id IN (
  '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f501',
  '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f502',
  '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f503',
  '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f504',
  '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f505',
  '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f506',
  '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f507',
  '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f508'
);

DELETE FROM public.drinks
WHERE id IN (
  '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f501',
  '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f502',
  '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f503',
  '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f504',
  '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f505',
  '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f506',
  '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f507',
  '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f508'
);

DELETE FROM public.categories
WHERE id = '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f001';

-- --- category ---
INSERT INTO public.categories (id, tenant_id, name, sort_order, enabled, is_public_visible)
VALUES (
  '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f001',
  '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f787',
  '生啤',
  1,
  true,
  true
);

-- --- drinks (POS price = default pour; Tap List uses serving options) ---
INSERT INTO public.drinks (
  id, tenant_id, category_id, brand_name, name, price, price_unit, sort_order,
  enabled, is_public_visible, public_status, public_sort_order
) VALUES
  ('3d6cb427-a8c3-4583-a7c4-5a3ad9f5f501', '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f787', '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f001', 'Beerhead', '艾斯高巴', 42, '杯', 1, true, true, 'available', 1),
  ('3d6cb427-a8c3-4583-a7c4-5a3ad9f5f502', '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f787', '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f001', 'Dr.Lab', '一路发达4周年', 68, '杯', 2, true, true, 'available', 2),
  ('3d6cb427-a8c3-4583-a7c4-5a3ad9f5f503', '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f787', '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f001', '彼岸', '老城琥珀', 48, '杯', 3, true, true, 'available', 3),
  ('3d6cb427-a8c3-4583-a7c4-5a3ad9f5f504', '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f787', '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f001', '虽吴', '凤尾果香', 58, '杯', 4, true, true, 'available', 4),
  ('3d6cb427-a8c3-4583-a7c4-5a3ad9f5f505', '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f787', '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f001', '虽吴', '小花冠', 42, '杯', 5, true, true, 'available', 5),
  ('3d6cb427-a8c3-4583-a7c4-5a3ad9f5f506', '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f787', '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f001', '僧侣', 'Kid Casino', 108, '杯', 6, true, true, 'available', 6),
  ('3d6cb427-a8c3-4583-a7c4-5a3ad9f5f507', '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f787', '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f001', 'Dr.Lab', 'Fredrick''s Violin V26', 52, '杯', 7, true, true, 'available', 7),
  ('3d6cb427-a8c3-4583-a7c4-5a3ad9f5f508', '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f787', '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f001', '勿幕', '暗椰', 108, '杯', 8, true, true, 'available', 8);

-- --- beer profiles (Tap List detail) ---
INSERT INTO public.drink_beer_profiles (tenant_id, drink_id, brewery, beer_style, abv) VALUES
  ('3d6cb427-a8c3-4583-a7c4-5a3ad9f5f787', '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f501', 'Beerhead', '意大利皮尔斯', 5.8),
  ('3d6cb427-a8c3-4583-a7c4-5a3ad9f5f787', '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f502', 'Dr.Lab', '三倍干头三倍浑浊', 8.8),
  ('3d6cb427-a8c3-4583-a7c4-5a3ad9f5f787', '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f503', '彼岸', '杜塞尔多夫老啤酒', 5.0),
  ('3d6cb427-a8c3-4583-a7c4-5a3ad9f5f787', '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f504', '虽吴', '三倍干投摩登西海岸', 7.2),
  ('3d6cb427-a8c3-4583-a7c4-5a3ad9f5f787', '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f505', '虽吴', '墨西哥拉格', 4.2),
  ('3d6cb427-a8c3-4583-a7c4-5a3ad9f5f787', '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f506', '僧侣', 'DDH Hazy DIPA', 8.6),
  ('3d6cb427-a8c3-4583-a7c4-5a3ad9f5f787', '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f507', 'Dr.Lab', '西打', 6.8),
  ('3d6cb427-a8c3-4583-a7c4-5a3ad9f5f787', '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f508', '勿幕', '波本帝国世涛', 12.5);

-- --- serving options: L=400ml, M=330ml, S=200ml ---
INSERT INTO public.drink_serving_options (
  tenant_id, drink_id, serving_type, label, volume_ml, price, is_default, is_active, public_sort_order
) VALUES
  -- 1 艾斯高巴 — L only
  ('3d6cb427-a8c3-4583-a7c4-5a3ad9f5f787', '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f501', 'draft', 'L', 400, 42, true, true, 0),

  -- 2 一路发达4周年 — L, M
  ('3d6cb427-a8c3-4583-a7c4-5a3ad9f5f787', '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f502', 'draft', 'L', 400, 68, true, true, 0),
  ('3d6cb427-a8c3-4583-a7c4-5a3ad9f5f787', '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f502', 'draft', 'M', 330, 60, false, true, 1),

  -- 3 老城琥珀 — L only
  ('3d6cb427-a8c3-4583-a7c4-5a3ad9f5f787', '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f503', 'draft', 'L', 400, 48, true, true, 0),

  -- 4 凤尾果香 — L, M
  ('3d6cb427-a8c3-4583-a7c4-5a3ad9f5f787', '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f504', 'draft', 'L', 400, 58, true, true, 0),
  ('3d6cb427-a8c3-4583-a7c4-5a3ad9f5f787', '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f504', 'draft', 'M', 330, 50, false, true, 1),

  -- 5 小花冠 — L only
  ('3d6cb427-a8c3-4583-a7c4-5a3ad9f5f787', '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f505', 'draft', 'L', 400, 42, true, true, 0),

  -- 6 Kid Casino — L, M
  ('3d6cb427-a8c3-4583-a7c4-5a3ad9f5f787', '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f506', 'draft', 'L', 400, 108, true, true, 0),
  ('3d6cb427-a8c3-4583-a7c4-5a3ad9f5f787', '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f506', 'draft', 'M', 330, 90, false, true, 1),

  -- 7 Fredrick's Violin V26 — L only
  ('3d6cb427-a8c3-4583-a7c4-5a3ad9f5f787', '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f507', 'draft', 'L', 400, 52, true, true, 0),

  -- 8 暗椰 — M, S (no L on menu)
  ('3d6cb427-a8c3-4583-a7c4-5a3ad9f5f787', '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f508', 'draft', 'M', 330, 108, true, true, 0),
  ('3d6cb427-a8c3-4583-a7c4-5a3ad9f5f787', '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f508', 'draft', 'S', 200, 68, false, true, 1);

-- Touch menu timestamp for Tap List freshness
UPDATE public.tenants
SET last_menu_updated_at = now()
WHERE id = '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f787';

COMMIT;

-- Verify:
-- SELECT d.sort_order, d.brand_name, d.name, so.label, so.volume_ml, so.price
-- FROM drinks d
-- LEFT JOIN drink_serving_options so ON so.drink_id = d.id
-- WHERE d.tenant_id = '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f787'
-- ORDER BY d.sort_order, so.public_sort_order;
