-- =====================================================================
-- Incremental seed: add nine beers
-- Tenant: 1cff208a-4424-4867-966d-a7839ac59f6f
--
-- Serving: 475ml only (single size per beer).
--
-- Notes:
-- - Safe to re-run (idempotent by brewery + beer name).
-- - sort_order / public_sort_order use source # column.
-- =====================================================================

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.tenants t
    WHERE t.id = '1cff208a-4424-4867-966d-a7839ac59f6f'
  ) THEN
    RAISE EXCEPTION 'Tenant not found: %', '1cff208a-4424-4867-966d-a7839ac59f6f';
  END IF;
END $$;

WITH existing_category AS (
  SELECT c.id
  FROM public.categories c
  WHERE c.tenant_id = '1cff208a-4424-4867-966d-a7839ac59f6f'
    AND c.name = '生啤'
  ORDER BY c.sort_order, c.created_at, c.id
  LIMIT 1
),
inserted_category AS (
  INSERT INTO public.categories (tenant_id, name, sort_order, enabled, is_public_visible)
  SELECT
    '1cff208a-4424-4867-966d-a7839ac59f6f',
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
      (1, 'Come back to 2016'::text, '明日'::text, 'IPA'::text, 6.6::numeric, 50::integer),
      (2, '爆裂引擎'::text, '小回'::text, '超淡色艾尔'::text, 5.7::numeric, 48::integer),
      (3, '博卡'::text, '莫廷'::text, 'DDH 浑浊 IPA'::text, 6.5::numeric, 50::integer),
      (4, '夜曲'::text, '彼岸'::text, '波兰烟熏啤酒'::text, 4.0::numeric, 45::integer),
      (5, '金星的日落'::text, 'Fever'::text, '英式苦啤'::text, 4.6::numeric, 45::integer),
      (7, '岁寒 柏木酒酸'::text, '无毛用'::text, '高温蒸汽拉格'::text, 4.3::numeric, 40::integer),
      (8, '烟熏乌梅'::text, '勿幕'::text, '酸波特'::text, 8.0::numeric, 50::integer),
      (9, '星际物质'::text, '玄水屋'::text, '紫泥酸艾尔'::text, 4.2::numeric, 65::integer),
      (10, '想象中的雨'::text, 'Fever'::text, '农舍艾尔塞松'::text, 4.6::numeric, 50::integer)
  ) AS v(row_no, beer_name, brewery, beer_style, abv, price_475)
),
rows_to_insert AS (
  SELECT m.*
  FROM menu_rows m
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.drinks d
    WHERE d.tenant_id = '1cff208a-4424-4867-966d-a7839ac59f6f'
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
    '1cff208a-4424-4867-966d-a7839ac59f6f',
    rc.id,
    r.brewery,
    r.beer_name,
    r.price_475,
    '杯',
    475,
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
  INSERT INTO public.drink_beer_profiles (tenant_id, drink_id, brewery, beer_style, abv)
  SELECT
    '1cff208a-4424-4867-966d-a7839ac59f6f',
    td.id,
    m.brewery,
    m.beer_style,
    m.abv
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
  '1cff208a-4424-4867-966d-a7839ac59f6f',
  td.id,
  'draft'::text,
  '475ml'::text,
  475::integer,
  m.price_475,
  true,
  true,
  0
FROM inserted_drinks td
JOIN menu_rows m
  ON m.brewery = td.brand_name
 AND m.beer_name = td.name;

UPDATE public.tenants
SET last_menu_updated_at = now()
WHERE id = '1cff208a-4424-4867-966d-a7839ac59f6f';

COMMIT;

-- Verify:
-- SELECT d.sort_order, d.brand_name, d.name, p.beer_style, p.abv, d.price, d.volume_ml
-- FROM public.drinks d
-- LEFT JOIN public.drink_beer_profiles p ON p.drink_id = d.id
-- WHERE d.tenant_id = '1cff208a-4424-4867-966d-a7839ac59f6f'
-- ORDER BY d.sort_order;
--
-- SELECT d.name, so.label, so.volume_ml, so.price, so.is_default
-- FROM public.drinks d
-- JOIN public.drink_serving_options so ON so.drink_id = d.id
-- WHERE d.tenant_id = '1cff208a-4424-4867-966d-a7839ac59f6f'
-- ORDER BY d.sort_order;
