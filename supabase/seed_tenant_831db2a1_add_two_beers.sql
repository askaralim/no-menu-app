-- =====================================================================
-- Incremental seed: add two beers for one tenant
-- Tenant: 831db2a1-ee47-4d88-9c0b-3e19a5668d6d
--
-- Source rows:
-- 7) 洄游造物 / WayfarerLab | 清涧 | 柚子柠檬仙蒂 / Shandy | 4.2
-- 8) 勿幕酿造 / WUMU Brewery | 冰川 | 窖藏皮尔森 / Aged Pilsner | 5.2
--
-- Notes:
-- - Safe to re-run (idempotent by brewery + beer name).
-- - No tenant-wide deletes.
-- - No drink_serving_options (owner does not show prices/volumes in app).
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
      (1, '洄游造物 / WayfarerLab'::text, '清涧'::text, '柚子柠檬仙蒂 / Shandy'::text, 4.2::numeric),
      (2, '勿幕酿造 / WUMU Brewery'::text, '冰川'::text, '窖藏皮尔森 / Aged Pilsner'::text, 5.2::numeric)
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
INSERT INTO public.drink_beer_profiles (tenant_id, drink_id, brewery, beer_style, abv)
SELECT
  '831db2a1-ee47-4d88-9c0b-3e19a5668d6d',
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
);

UPDATE public.tenants
SET last_menu_updated_at = now()
WHERE id = '831db2a1-ee47-4d88-9c0b-3e19a5668d6d';

COMMIT;

-- Verify:
-- SELECT d.sort_order, d.brand_name, d.name, p.beer_style, p.abv, d.price
-- FROM public.drinks d
-- LEFT JOIN public.drink_beer_profiles p ON p.drink_id = d.id
-- WHERE d.tenant_id = '831db2a1-ee47-4d88-9c0b-3e19a5668d6d'
--   AND (d.brand_name, d.name) IN (
--     ('洄游造物 / WayfarerLab', '清洞'),
--     ('勿幕酿造 / WUMU Brewery', '冰川')
--   )
-- ORDER BY d.sort_order;
--
-- SELECT count(*) AS serving_count
-- FROM public.drink_serving_options
-- WHERE tenant_id = '831db2a1-ee47-4d88-9c0b-3e19a5668d6d'
--   AND drink_id IN (
--     SELECT id FROM public.drinks
--     WHERE tenant_id = '831db2a1-ee47-4d88-9c0b-3e19a5668d6d'
--       AND (brand_name, name) IN (
--         ('洄游造物 / WayfarerLab', '清涧'),
--         ('勿幕酿造 / WUMU Brewery', '冰川')
--       )
--   );
