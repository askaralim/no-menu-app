-- =====================================================================
-- Incremental seed: add one beer
-- Tenant: 44a4429c-fb70-47a5-923b-370fce8f167e
--
-- Beer:
--   所在地 烟台 | 品牌 麳麰 | 酒名 文财神 | 品类 皮尔森 | 酒精度 5.5
--
-- Notes:
-- - Safe to re-run (idempotent by brewery + beer name).
-- - No price provided: drinks.price = 0, no drink_serving_options.
-- =====================================================================

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.tenants t
    WHERE t.id = '44a4429c-fb70-47a5-923b-370fce8f167e'
  ) THEN
    RAISE EXCEPTION 'Tenant not found: %', '44a4429c-fb70-47a5-923b-370fce8f167e';
  END IF;
END $$;

WITH existing_category AS (
  SELECT c.id
  FROM public.categories c
  WHERE c.tenant_id = '44a4429c-fb70-47a5-923b-370fce8f167e'
    AND c.name = '生啤'
  ORDER BY c.sort_order, c.created_at, c.id
  LIMIT 1
),
inserted_category AS (
  INSERT INTO public.categories (tenant_id, name, sort_order, enabled, is_public_visible)
  SELECT
    '44a4429c-fb70-47a5-923b-370fce8f167e',
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
    COALESCE(MAX(d.sort_order), 0) + 1 AS sort_order,
    COALESCE(MAX(d.public_sort_order), 0) + 1 AS public_sort_order
  FROM public.drinks d
  WHERE d.tenant_id = '44a4429c-fb70-47a5-923b-370fce8f167e'
),
existing_drink AS (
  SELECT d.id
  FROM public.drinks d
  WHERE d.tenant_id = '44a4429c-fb70-47a5-923b-370fce8f167e'
    AND d.brand_name = '麳麰'
    AND d.name = '文财神'
  ORDER BY d.created_at DESC, d.id DESC
  LIMIT 1
),
inserted_drink AS (
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
    '44a4429c-fb70-47a5-923b-370fce8f167e',
    rc.id,
    '麳麰',
    '文财神',
    0,
    '杯',
    ns.sort_order,
    true,
    true,
    'available',
    ns.public_sort_order
  FROM resolved_category rc
  CROSS JOIN next_sort ns
  WHERE NOT EXISTS (SELECT 1 FROM existing_drink)
  RETURNING id
),
resolved_drink AS (
  SELECT id FROM existing_drink
  UNION ALL
  SELECT id FROM inserted_drink
  LIMIT 1
)
INSERT INTO public.drink_beer_profiles (tenant_id, drink_id, brewery, beer_style, abv, country)
SELECT
  '44a4429c-fb70-47a5-923b-370fce8f167e',
  rd.id,
  '麳麰',
  '皮尔森',
  5.5,
  '烟台'
FROM resolved_drink rd
WHERE NOT EXISTS (
  SELECT 1
  FROM public.drink_beer_profiles p
  WHERE p.drink_id = rd.id
);

UPDATE public.tenants
SET last_menu_updated_at = now()
WHERE id = '44a4429c-fb70-47a5-923b-370fce8f167e';

COMMIT;

-- Verify:
-- SELECT d.sort_order, d.brand_name, d.name, p.country, p.beer_style, p.abv, d.price
-- FROM public.drinks d
-- LEFT JOIN public.drink_beer_profiles p ON p.drink_id = d.id
-- WHERE d.tenant_id = '44a4429c-fb70-47a5-923b-370fce8f167e'
--   AND d.brand_name = '麳麰'
--   AND d.name = '文财神';
