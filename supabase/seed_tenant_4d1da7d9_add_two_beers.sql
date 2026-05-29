-- =====================================================================
-- Incremental seed: add two beers for one tenant
-- Tenant: 4d1da7d9-8b21-4706-b535-355b9ff79388
--
-- Source rows:
-- 1) 疯熊工业 | 像风 | 雅基玛皮尔森 | 4.8
-- 2) Fever    | 另一个吻·香草 | 桶陈野菌艾尔 | 5.1
--
-- Notes:
-- - Safe to re-run (idempotent by brewery + beer name).
-- - No tenant-wide deletes.
-- - Because no price/serving was provided, this script uses price=0 and
--   does not insert drink_serving_options.
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
      (1, '疯熊工业'::text, '像风'::text, '雅基玛皮尔森'::text, 4.8::numeric),
      (2, 'Fever'::text, '另一个吻·香草'::text, '桶陈野菌艾尔'::text, 5.1::numeric)
  ) AS v(row_no, brewery, beer_name, beer_style, abv)
),
rows_to_insert AS (
  SELECT
    m.row_no,
    m.brewery,
    m.beer_name,
    m.beer_style,
    m.abv,
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
),
target_drinks AS (
  SELECT d.id, d.brand_name, d.name
  FROM public.drinks d
  JOIN menu_rows m
    ON m.brewery = d.brand_name
   AND m.beer_name = d.name
  WHERE d.tenant_id = '4d1da7d9-8b21-4706-b535-355b9ff79388'
)
INSERT INTO public.drink_beer_profiles (tenant_id, drink_id, brewery, beer_style, abv)
SELECT
  '4d1da7d9-8b21-4706-b535-355b9ff79388',
  td.id,
  m.brewery,
  m.beer_style,
  m.abv
FROM target_drinks td
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
-- SELECT d.sort_order, d.brand_name, d.name, p.beer_style, p.abv, d.price
-- FROM public.drinks d
-- LEFT JOIN public.drink_beer_profiles p ON p.drink_id = d.id
-- WHERE d.tenant_id = '4d1da7d9-8b21-4706-b535-355b9ff79388'
--   AND (d.brand_name, d.name) IN (
--     ('疯熊工业', '像风'),
--     ('Fever', '另一个吻·香草')
--   )
-- ORDER BY d.sort_order;
