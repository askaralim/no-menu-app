-- =====================================================================
-- Incremental seed: add two beers
-- Tenant: 4d1da7d9-8b21-4706-b535-355b9ff79388
--
-- Beers:
--   1) 上海&石家庄 | 2062&独墨 | Nippori 日暮里 | Red Ale | 5.6
--   2) —           | 蔓延     | 像蔓越莓       | Sour IPA | 7.0
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
    WHERE t.id = '4d1da7d9-8b21-4706-b535-355b9ff79388'
  ) THEN
    RAISE EXCEPTION 'Tenant not found: %', '4d1da7d9-8b21-4706-b535-355b9ff79388';
  END IF;
END $$;

WITH existing_category AS (
  SELECT c.id
  FROM public.categories c
  WHERE c.tenant_id = '4d1da7d9-8b21-4706-b535-355b9ff79388'
    AND c.name = '生啤'
  ORDER BY c.sort_order, c.created_at, c.id
  LIMIT 1
),
inserted_category AS (
  INSERT INTO public.categories (tenant_id, name, sort_order, enabled, is_public_visible)
  SELECT
    '4d1da7d9-8b21-4706-b535-355b9ff79388',
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
  WHERE d.tenant_id = '4d1da7d9-8b21-4706-b535-355b9ff79388'
),
menu_rows AS (
  SELECT *
  FROM (
    VALUES
      (1, '2062&独墨'::text, 'Nippori 日暮里'::text, 'Red Ale'::text, 5.6::numeric, '上海&石家庄'::text),
      (2, '蔓延'::text, '像蔓越莓'::text, 'Sour IPA'::text, 7.0::numeric, NULL::text)
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
    WHERE d.tenant_id = '4d1da7d9-8b21-4706-b535-355b9ff79388'
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
    '4d1da7d9-8b21-4706-b535-355b9ff79388',
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
  '4d1da7d9-8b21-4706-b535-355b9ff79388',
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
WHERE id = '4d1da7d9-8b21-4706-b535-355b9ff79388';

COMMIT;

-- Verify:
-- SELECT d.sort_order, d.brand_name, d.name, p.country, p.beer_style, p.abv, d.price
-- FROM public.drinks d
-- LEFT JOIN public.drink_beer_profiles p ON p.drink_id = d.id
-- WHERE d.tenant_id = '4d1da7d9-8b21-4706-b535-355b9ff79388'
--   AND (d.brand_name, d.name) IN (
--     ('2062&独墨', 'Nippori 日暮里'),
--     ('蔓延', '像蔓越莓')
--   )
-- ORDER BY d.sort_order;
