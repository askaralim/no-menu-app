-- =====================================================================
-- Incremental seed: add two beers
-- Tenant: 831db2a1-ee47-4d88-9c0b-3e19a5668d6d
--
-- Beers:
--   1) 上海&石家庄 | 2062&独墨 | 日暮里/Nippori | 红色艾尔 | 5.0
--   2) 西安         | Fever     | 折射           | 美式IPA  | 6.1
--
-- Notes:
-- - Safe to re-run (idempotent by brewery + beer name).
-- - No drink_serving_options; drinks.price = 0.
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

WITH existing_category AS (
  SELECT c.id
  FROM public.categories c
  WHERE c.tenant_id = '831db2a1-ee47-4d88-9c0b-3e19a5668d6d'
    AND c.name = '生啤'
  ORDER BY c.sort_order, c.created_at, c.id
  LIMIT 1
),
inserted_category AS (
  INSERT INTO public.categories (tenant_id, name, sort_order, enabled, is_public_visible)
  SELECT
    '831db2a1-ee47-4d88-9c0b-3e19a5668d6d',
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
next_sort AS (
  SELECT
    COALESCE(MAX(d.sort_order), 0) AS max_sort_order,
    COALESCE(MAX(d.public_sort_order), 0) AS max_public_sort_order
  FROM public.drinks d
  WHERE d.tenant_id = '831db2a1-ee47-4d88-9c0b-3e19a5668d6d'
),
menu_rows AS (
  SELECT *
  FROM (
    VALUES
      (1, '2062&独墨'::text, '日暮里/Nippori'::text, '红色艾尔'::text, 5.0::numeric, '上海&石家庄'::text),
      (2, 'Fever'::text, '折射'::text, '美式IPA'::text, 6.1::numeric, '西安'::text)
  ) AS v(row_no, brewery, beer_name, beer_style, abv, country)
),
rows_to_insert AS (
  SELECT
    m.*,
    ROW_NUMBER() OVER (ORDER BY m.row_no) AS rn
  FROM menu_rows m
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.drinks d
    WHERE d.tenant_id = '831db2a1-ee47-4d88-9c0b-3e19a5668d6d'
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
    sort_order,
    enabled,
    is_public_visible,
    public_status,
    public_sort_order
  )
  SELECT
    '831db2a1-ee47-4d88-9c0b-3e19a5668d6d',
    rc.id,
    r.brewery,
    r.beer_name,
    0,
    '杯',
    ns.max_sort_order + r.rn,
    true,
    true,
    'available',
    ns.max_public_sort_order + r.rn
  FROM rows_to_insert r
  CROSS JOIN resolved_category rc
  CROSS JOIN next_sort ns
  RETURNING id, brand_name, name
)
INSERT INTO public.drink_beer_profiles (tenant_id, drink_id, brewery, beer_style, abv, country)
SELECT
  '831db2a1-ee47-4d88-9c0b-3e19a5668d6d',
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
);

UPDATE public.tenants
SET last_menu_updated_at = now()
WHERE id = '831db2a1-ee47-4d88-9c0b-3e19a5668d6d';

COMMIT;

-- Verify:
-- SELECT d.sort_order, d.brand_name, d.name, p.country, p.beer_style, p.abv, d.price
-- FROM public.drinks d
-- LEFT JOIN public.drink_beer_profiles p ON p.drink_id = d.id
-- WHERE d.tenant_id = '831db2a1-ee47-4d88-9c0b-3e19a5668d6d'
--   AND (d.brand_name, d.name) IN (
--     ('2062&独墨', '日暮里/Nippori'),
--     ('Fever', '折射')
--   )
-- ORDER BY d.sort_order;
