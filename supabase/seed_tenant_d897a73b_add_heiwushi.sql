-- =====================================================================
-- Incremental seed: add one beer
-- Tenant: d897a73b-37fb-4c57-af0f-79d8759173cb
--
-- Beer:
--   西安 | 玄水屋 | 黑武士 | 莓果布朗尼酸艾尔 | 4.2
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
    WHERE t.id = 'd897a73b-37fb-4c57-af0f-79d8759173cb'
  ) THEN
    RAISE EXCEPTION 'Tenant not found: %', 'd897a73b-37fb-4c57-af0f-79d8759173cb';
  END IF;
END $$;

WITH existing_category AS (
  SELECT c.id
  FROM public.categories c
  WHERE c.tenant_id = 'd897a73b-37fb-4c57-af0f-79d8759173cb'
    AND c.name = '生啤'
  ORDER BY c.sort_order, c.created_at, c.id
  LIMIT 1
),
inserted_category AS (
  INSERT INTO public.categories (tenant_id, name, sort_order, enabled, is_public_visible)
  SELECT
    'd897a73b-37fb-4c57-af0f-79d8759173cb',
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
  WHERE d.tenant_id = 'd897a73b-37fb-4c57-af0f-79d8759173cb'
),
existing_drink AS (
  SELECT d.id
  FROM public.drinks d
  WHERE d.tenant_id = 'd897a73b-37fb-4c57-af0f-79d8759173cb'
    AND d.brand_name = '玄水屋'
    AND d.name = '黑武士'
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
    'd897a73b-37fb-4c57-af0f-79d8759173cb',
    rc.id,
    '玄水屋',
    '黑武士',
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
  'd897a73b-37fb-4c57-af0f-79d8759173cb',
  rd.id,
  '玄水屋',
  '莓果布朗尼酸艾尔',
  4.2,
  '西安'
FROM resolved_drink rd
WHERE NOT EXISTS (
  SELECT 1
  FROM public.drink_beer_profiles p
  WHERE p.drink_id = rd.id
);

UPDATE public.tenants
SET last_menu_updated_at = now()
WHERE id = 'd897a73b-37fb-4c57-af0f-79d8759173cb';

COMMIT;

-- Verify:
-- SELECT d.sort_order, d.brand_name, d.name, p.country, p.beer_style, p.abv, d.price
-- FROM public.drinks d
-- LEFT JOIN public.drink_beer_profiles p ON p.drink_id = d.id
-- WHERE d.tenant_id = 'd897a73b-37fb-4c57-af0f-79d8759173cb'
--   AND d.brand_name = '玄水屋'
--   AND d.name = '黑武士';
