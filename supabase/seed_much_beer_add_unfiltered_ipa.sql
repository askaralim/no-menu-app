-- =====================================================================
-- Much Beer incremental seed: add one beer
-- Tenant: 3d6cb427-a8c3-4583-a7c4-5a3ad9f5f787
--
-- Beer:
--   Brewery: 旺达Wondrous•Raveyard
--   Name:    未过滤IPA•Unfiltered IPA
--   ABV:     6.6
--
-- Serving options:
--   L: 400ml, 98 (default)
--   M: 330ml, 82
--
-- Safe to re-run:
-- - Reuses existing drink if already present.
-- - Avoids duplicate beer profile / serving option rows.
-- =====================================================================

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.tenants t
    WHERE t.id = '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f787'
  ) THEN
    RAISE EXCEPTION 'Tenant not found: %', '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f787';
  END IF;
END $$;

WITH existing_category AS (
  SELECT c.id
  FROM public.categories c
  WHERE c.tenant_id = '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f787'
    AND c.name = '生啤'
  ORDER BY c.sort_order, c.created_at, c.id
  LIMIT 1
),
inserted_category AS (
  INSERT INTO public.categories (tenant_id, name, sort_order, enabled, is_public_visible)
  SELECT
    '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f787',
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
  WHERE d.tenant_id = '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f787'
),
existing_drink AS (
  SELECT d.id
  FROM public.drinks d
  WHERE d.tenant_id = '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f787'
    AND d.brand_name = '旺达Wondrous•Raveyard'
    AND d.name = '未过滤IPA•Unfiltered IPA'
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
    '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f787',
    rc.id,
    '旺达Wondrous•Raveyard',
    '未过滤IPA•Unfiltered IPA',
    98,
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
INSERT INTO public.drink_beer_profiles (tenant_id, drink_id, brewery, beer_style, abv)
SELECT
  '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f787',
  rd.id,
  '旺达Wondrous•Raveyard',
  'Unfiltered IPA',
  6.6
FROM resolved_drink rd
WHERE NOT EXISTS (
  SELECT 1
  FROM public.drink_beer_profiles p
  WHERE p.drink_id = rd.id
);

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
  '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f787',
  rd.id,
  v.serving_type,
  v.label,
  v.volume_ml,
  v.price,
  v.is_default,
  true,
  v.public_sort_order
FROM (
  VALUES
    ('draft'::text, 'L'::text, 400::int, 98::numeric, true, 0),
    ('draft'::text, 'M'::text, 330::int, 82::numeric, false, 1)
) AS v(serving_type, label, volume_ml, price, is_default, public_sort_order)
CROSS JOIN (
  SELECT d.id
  FROM public.drinks d
  WHERE d.tenant_id = '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f787'
    AND d.brand_name = '旺达Wondrous•Raveyard'
    AND d.name = '未过滤IPA•Unfiltered IPA'
  ORDER BY d.created_at DESC, d.id DESC
  LIMIT 1
) rd
WHERE NOT EXISTS (
  SELECT 1
  FROM public.drink_serving_options so
  WHERE so.drink_id = rd.id
    AND so.label = v.label
    AND COALESCE(so.volume_ml, -1) = v.volume_ml
);

UPDATE public.tenants
SET last_menu_updated_at = now()
WHERE id = '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f787';

COMMIT;

-- Verify:
-- SELECT d.sort_order, d.brand_name, d.name, p.beer_style, p.abv, so.label, so.volume_ml, so.price
-- FROM public.drinks d
-- LEFT JOIN public.drink_beer_profiles p ON p.drink_id = d.id
-- LEFT JOIN public.drink_serving_options so ON so.drink_id = d.id
-- WHERE d.tenant_id = '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f787'
--   AND d.brand_name = '旺达Wondrous•Raveyard'
--   AND d.name = '未过滤IPA•Unfiltered IPA'
-- ORDER BY so.public_sort_order;
