-- =====================================================================
-- Tap List UI demo seed: 4 public bars in Shanghai, 5 craft beers each.
-- Safe to re-run (upserts by slug / fixed drink ids).
--
-- Run: ./scripts/seed_taplist_demo.sh
--   or paste into Supabase SQL Editor after install_all_in_one / taplist patch.
-- =====================================================================

BEGIN;

-- Remove previous demo rows (same slugs) so re-run stays predictable
DELETE FROM public.drink_serving_options
WHERE tenant_id IN (
  SELECT id FROM public.tenants WHERE slug LIKE 'taplist-demo-%'
);
DELETE FROM public.drink_beer_profiles
WHERE tenant_id IN (
  SELECT id FROM public.tenants WHERE slug LIKE 'taplist-demo-%'
);
DELETE FROM public.drinks
WHERE tenant_id IN (
  SELECT id FROM public.tenants WHERE slug LIKE 'taplist-demo-%'
);
DELETE FROM public.categories
WHERE tenant_id IN (
  SELECT id FROM public.tenants WHERE slug LIKE 'taplist-demo-%'
);
DELETE FROM public.tenants WHERE slug LIKE 'taplist-demo-%';

-- --- 4 tenants ---
INSERT INTO public.tenants (
  id, name, slug, status, city, country, district, address, opening_hour, display_name,
  cover_image_url, is_public_visible, last_menu_updated_at
) VALUES
  (
    'b1000001-0001-4001-8001-000000000001',
    '愚园路精酿 Tap',
    'taplist-demo-1',
    'active',
    'Shanghai',
    'China',
    '长宁 · 愚园路',
    '上海市长宁区愚园路 1088 号',
    '{"open":"17:00","close":"02:00"}'::jsonb,
    '愚园路精酿',
    'https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&w=1200&q=80',
    true,
    now()
  ),
  (
    'b1000001-0001-4001-8001-000000000002',
    '巨鹿路啤酒馆',
    'taplist-demo-2',
    'active',
    'Shanghai',
    'China',
    '静安 · 巨鹿路',
    '上海市静安区巨鹿路 758 号',
    '{"open":"16:00","close":"03:00"}'::jsonb,
    '巨鹿路啤酒馆',
    'https://images.unsplash.com/photo-1575444758702-4a6b9222336e?auto=format&fit=crop&w=1200&q=80',
    true,
    now()
  ),
  (
    'b1000001-0001-4001-8001-000000000003',
    '安福路 Tap Room',
    'taplist-demo-3',
    'active',
    'Shanghai',
    'China',
    '徐汇 · 安福路',
    '上海市徐汇区安福路 201 号',
    '{"open":"17:30","close":"01:00"}'::jsonb,
    '安福路 Tap Room',
    'https://images.unsplash.com/photo-1543007630-9710e4a00a20?auto=format&fit=crop&w=1200&q=80',
    true,
    now()
  ),
  (
    'b1000001-0001-4001-8001-000000000004',
    '武康路生啤吧',
    'taplist-demo-4',
    'active',
    'Shanghai',
    'China',
    '徐汇 · 武康路',
    '上海市徐汇区武康路 376 号',
    '{"open":"18:00","close":"02:30"}'::jsonb,
    '武康路生啤吧',
    'https://images.unsplash.com/photo-1551218808-94e220e084d2?auto=format&fit=crop&w=1200&q=80',
    true,
    now()
  );

-- --- 1 category per tenant (生啤) ---
INSERT INTO public.categories (id, tenant_id, name, sort_order, enabled, is_public_visible) VALUES
  ('c1000001-0001-4001-8001-000000000001', 'b1000001-0001-4001-8001-000000000001', '生啤', 1, true, true),
  ('c1000001-0001-4001-8001-000000000002', 'b1000001-0001-4001-8001-000000000002', '生啤', 1, true, true),
  ('c1000001-0001-4001-8001-000000000003', 'b1000001-0001-4001-8001-000000000003', '生啤', 1, true, true),
  ('c1000001-0001-4001-8001-000000000004', 'b1000001-0001-4001-8001-000000000004', '生啤', 1, true, true);

-- --- 5 drinks per tenant (enabled + public for Tap List RPCs) ---
-- Drink ids: d{tenant#}01 .. d{tenant#}05
INSERT INTO public.drinks (
  id, tenant_id, category_id, brand_name, name, price, price_unit, sort_order,
  enabled, is_public_visible, public_status, public_sort_order, image_url
) VALUES
  -- Bar 1
  ('d1000001-0001-4001-8001-000000000101', 'b1000001-0001-4001-8001-000000000001', 'c1000001-0001-4001-8001-000000000001', 'Stone Brewing', '西海岸 IPA', 58, '杯', 1, true, true, 'new', 1, 'https://images.unsplash.com/photo-1600788886242-5c96aabe3757?auto=format&fit=crop&w=900&q=80'),
  ('d1000001-0001-4001-8001-000000000102', 'b1000001-0001-4001-8001-000000000001', 'c1000001-0001-4001-8001-000000000001', 'Other Half', '浑浊 IPA', 62, '杯', 2, true, true, 'available', 2, 'https://images.unsplash.com/photo-1571613316887-6f8d5cbf7ef7?auto=format&fit=crop&w=900&q=80'),
  ('d1000001-0001-4001-8001-000000000103', 'b1000001-0001-4001-8001-000000000001', 'c1000001-0001-4001-8001-000000000001', 'Guinness', '世涛', 55, '杯', 3, true, true, 'low', 3, 'https://images.unsplash.com/photo-1618885472179-5e474019f2a9?auto=format&fit=crop&w=900&q=80'),
  ('d1000001-0001-4001-8001-000000000104', 'b1000001-0001-4001-8001-000000000001', 'c1000001-0001-4001-8001-000000000001', 'Hoegaarden', '比利时小麦', 48, '杯', 4, true, true, 'sold_out', 4, 'https://images.unsplash.com/photo-1535958636474-b021ee887b13?auto=format&fit=crop&w=900&q=80'),
  ('d1000001-0001-4001-8001-000000000105', 'b1000001-0001-4001-8001-000000000001', 'c1000001-0001-4001-8001-000000000001', 'Cascade', '古斯酸啤', 68, '杯', 5, true, true, 'coming_soon', 5, 'https://images.unsplash.com/photo-1618184880380-8199e8b4eaa8?auto=format&fit=crop&w=900&q=80'),
  -- Bar 2
  ('d1000001-0001-4001-8001-000000000201', 'b1000001-0001-4001-8001-000000000002', 'c1000001-0001-4001-8001-000000000002', 'Sierra Nevada', 'Pale Ale', 52, '杯', 1, true, true, 'new', 1, 'https://images.unsplash.com/photo-1600788886242-5c96aabe3757?auto=format&fit=crop&w=900&q=80'),
  ('d1000001-0001-4001-8001-000000000202', 'b1000001-0001-4001-8001-000000000002', 'c1000001-0001-4001-8001-000000000002', 'Tree House', '双倍浑浊', 72, '杯', 2, true, true, 'available', 2, 'https://images.unsplash.com/photo-1571613316887-6f8d5cbf7ef7?auto=format&fit=crop&w=900&q=80'),
  ('d1000001-0001-4001-8001-000000000203', 'b1000001-0001-4001-8001-000000000002', 'c1000001-0001-4001-8001-000000000002', 'Left Hand', '牛奶世涛', 56, '杯', 3, true, true, 'low', 3, 'https://images.unsplash.com/photo-1618885472179-5e474019f2a9?auto=format&fit=crop&w=900&q=80'),
  ('d1000001-0001-4001-8001-000000000204', 'b1000001-0001-4001-8001-000000000002', 'c1000001-0001-4001-8001-000000000002', 'Allagash', 'Saison', 54, '杯', 4, true, true, 'available', 4, 'https://images.unsplash.com/photo-1535958636474-b021ee887b13?auto=format&fit=crop&w=900&q=80'),
  ('d1000001-0001-4001-8001-000000000205', 'b1000001-0001-4001-8001-000000000002', 'c1000001-0001-4001-8001-000000000002', 'The Bruery', '水果酸啤', 65, '杯', 5, true, true, 'coming_soon', 5, 'https://images.unsplash.com/photo-1618184880380-8199e8b4eaa8?auto=format&fit=crop&w=900&q=80'),
  -- Bar 3
  ('d1000001-0001-4001-8001-000000000301', 'b1000001-0001-4001-8001-000000000003', 'c1000001-0001-4001-8001-000000000003', 'Bell''s', 'Two Hearted IPA', 60, '杯', 1, true, true, 'available', 1, 'https://images.unsplash.com/photo-1600788886242-5c96aabe3757?auto=format&fit=crop&w=900&q=80'),
  ('d1000001-0001-4001-8001-000000000302', 'b1000001-0001-4001-8001-000000000003', 'c1000001-0001-4001-8001-000000000003', 'Trillium', '新英格兰 IPA', 66, '杯', 2, true, true, 'new', 2, 'https://images.unsplash.com/photo-1571613316887-6f8d5cbf7ef7?auto=format&fit=crop&w=900&q=80'),
  ('d1000001-0001-4001-8001-000000000303', 'b1000001-0001-4001-8001-000000000003', 'c1000001-0001-4001-8001-000000000003', 'Founders', '波特', 54, '杯', 3, true, true, 'low', 3, 'https://images.unsplash.com/photo-1618885472179-5e474019f2a9?auto=format&fit=crop&w=900&q=80'),
  ('d1000001-0001-4001-8001-000000000304', 'b1000001-0001-4001-8001-000000000003', 'c1000001-0001-4001-8001-000000000003', 'Weihenstephan', '德式小麦', 46, '杯', 4, true, true, 'sold_out', 4, 'https://images.unsplash.com/photo-1535958636474-b021ee887b13?auto=format&fit=crop&w=900&q=80'),
  ('d1000001-0001-4001-8001-000000000305', 'b1000001-0001-4001-8001-000000000003', 'c1000001-0001-4001-8001-000000000003', 'Cantillon', '兰比克', 88, '杯', 5, true, true, 'coming_soon', 5, 'https://images.unsplash.com/photo-1618184880380-8199e8b4eaa8?auto=format&fit=crop&w=900&q=80'),
  -- Bar 4
  ('d1000001-0001-4001-8001-000000000401', 'b1000001-0001-4001-8001-000000000004', 'c1000001-0001-4001-8001-000000000004', 'Firestone Walker', '805 Blonde', 50, '杯', 1, true, true, 'available', 1, 'https://images.unsplash.com/photo-1600788886242-5c96aabe3757?auto=format&fit=crop&w=900&q=80'),
  ('d1000001-0001-4001-8001-000000000402', 'b1000001-0001-4001-8001-000000000004', 'c1000001-0001-4001-8001-000000000004', 'Monkish', 'DIPA', 70, '杯', 2, true, true, 'new', 2, 'https://images.unsplash.com/photo-1571613316887-6f8d5cbf7ef7?auto=format&fit=crop&w=900&q=80'),
  ('d1000001-0001-4001-8001-000000000403', 'b1000001-0001-4001-8001-000000000004', 'c1000001-0001-4001-8001-000000000004', 'Oskar Blues', 'Dale''s Pale Ale', 52, '杯', 3, true, true, 'low', 3, 'https://images.unsplash.com/photo-1618885472179-5e474019f2a9?auto=format&fit=crop&w=900&q=80'),
  ('d1000001-0001-4001-8001-000000000404', 'b1000001-0001-4001-8001-000000000004', 'c1000001-0001-4001-8001-000000000004', 'Chimay', '修道院三料', 78, '杯', 4, true, true, 'available', 4, 'https://images.unsplash.com/photo-1535958636474-b021ee887b13?auto=format&fit=crop&w=900&q=80'),
  ('d1000001-0001-4001-8001-000000000405', 'b1000001-0001-4001-8001-000000000004', 'c1000001-0001-4001-8001-000000000004', 'Jester King', '农舍艾尔', 62, '杯', 5, true, true, 'sold_out', 5, 'https://images.unsplash.com/photo-1618184880380-8199e8b4eaa8?auto=format&fit=crop&w=900&q=80');

-- --- Beer profiles ---
INSERT INTO public.drink_beer_profiles (tenant_id, drink_id, brewery, beer_style, abv, ibu, country) VALUES
  ('b1000001-0001-4001-8001-000000000001', 'd1000001-0001-4001-8001-000000000101', 'Stone Brewing', 'West Coast IPA', 6.90, 77, 'USA'),
  ('b1000001-0001-4001-8001-000000000001', 'd1000001-0001-4001-8001-000000000102', 'Other Half', 'Hazy IPA', 7.20, 45, 'USA'),
  ('b1000001-0001-4001-8001-000000000001', 'd1000001-0001-4001-8001-000000000103', 'Guinness', 'Stout', 4.20, 35, 'Ireland'),
  ('b1000001-0001-4001-8001-000000000001', 'd1000001-0001-4001-8001-000000000104', 'Hoegaarden', 'Witbier', 4.90, 15, 'Belgium'),
  ('b1000001-0001-4001-8001-000000000001', 'd1000001-0001-4001-8001-000000000105', 'Cascade', 'Gose', 4.80, 12, 'USA'),
  ('b1000001-0001-4001-8001-000000000002', 'd1000001-0001-4001-8001-000000000201', 'Sierra Nevada', 'Pale Ale', 5.60, 38, 'USA'),
  ('b1000001-0001-4001-8001-000000000002', 'd1000001-0001-4001-8001-000000000202', 'Tree House', 'Double IPA', 8.00, 55, 'USA'),
  ('b1000001-0001-4001-8001-000000000002', 'd1000001-0001-4001-8001-000000000203', 'Left Hand', 'Milk Stout', 6.00, 25, 'USA'),
  ('b1000001-0001-4001-8001-000000000002', 'd1000001-0001-4001-8001-000000000204', 'Allagash', 'Saison', 6.10, 20, 'USA'),
  ('b1000001-0001-4001-8001-000000000002', 'd1000001-0001-4001-8001-000000000205', 'The Bruery', 'Fruited Sour', 5.50, 8, 'USA'),
  ('b1000001-0001-4001-8001-000000000003', 'd1000001-0001-4001-8001-000000000301', 'Bell''s', 'American IPA', 7.00, 70, 'USA'),
  ('b1000001-0001-4001-8001-000000000003', 'd1000001-0001-4001-8001-000000000302', 'Trillium', 'NEIPA', 6.80, 42, 'USA'),
  ('b1000001-0001-4001-8001-000000000003', 'd1000001-0001-4001-8001-000000000303', 'Founders', 'Porter', 6.50, 45, 'USA'),
  ('b1000001-0001-4001-8001-000000000003', 'd1000001-0001-4001-8001-000000000304', 'Weihenstephan', 'Hefeweizen', 5.40, 14, 'Germany'),
  ('b1000001-0001-4001-8001-000000000003', 'd1000001-0001-4001-8001-000000000305', 'Cantillon', 'Lambic', 5.00, 10, 'Belgium'),
  ('b1000001-0001-4001-8001-000000000004', 'd1000001-0001-4001-8001-000000000401', 'Firestone Walker', 'Blonde Ale', 4.70, 18, 'USA'),
  ('b1000001-0001-4001-8001-000000000004', 'd1000001-0001-4001-8001-000000000402', 'Monkish', 'DIPA', 8.20, 60, 'USA'),
  ('b1000001-0001-4001-8001-000000000004', 'd1000001-0001-4001-8001-000000000403', 'Oskar Blues', 'Pale Ale', 6.50, 65, 'USA'),
  ('b1000001-0001-4001-8001-000000000004', 'd1000001-0001-4001-8001-000000000404', 'Chimay', 'Belgian Tripel', 8.00, 22, 'Belgium'),
  ('b1000001-0001-4001-8001-000000000004', 'd1000001-0001-4001-8001-000000000405', 'Jester King', 'Farmhouse Ale', 5.80, 28, 'USA');

-- --- Serving options: draft pint + optional can per drink ---
INSERT INTO public.drink_serving_options (
  tenant_id, drink_id, serving_type, label, volume_ml, price, is_default, is_active, public_sort_order
)
SELECT
  d.tenant_id,
  d.id,
  'draft',
  '品脱',
  473,
  d.price,
  true,
  true,
  0
FROM public.drinks d
WHERE d.tenant_id IN (
  SELECT id FROM public.tenants WHERE slug LIKE 'taplist-demo-%'
);

INSERT INTO public.drink_serving_options (
  tenant_id, drink_id, serving_type, label, volume_ml, price, is_default, is_active, public_sort_order
)
SELECT
  d.tenant_id,
  d.id,
  'can',
  '罐装',
  330,
  round(d.price * 0.85, 2),
  false,
  true,
  1
FROM public.drinks d
WHERE d.tenant_id IN (
  SELECT id FROM public.tenants WHERE slug LIKE 'taplist-demo-%'
)
  AND d.public_sort_order IN (1, 3, 5);

COMMIT;

-- Quick verify (optional):
-- SELECT slug, display_name FROM tenants WHERE slug LIKE 'taplist-demo-%';
-- SELECT count(*) FROM drinks WHERE tenant_id IN (SELECT id FROM tenants WHERE slug LIKE 'taplist-demo-%');
