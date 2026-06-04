-- =====================================================================
-- Much Beer incremental seed: add four beers
-- Tenant: 3d6cb427-a8c3-4583-a7c4-5a3ad9f5f787
--
-- Sizes: L = 400ml, M = 330ml, S = 200ml
--
-- Beers:
--   1  Dr.Lab | DR 凉茶 | 超深烘超苦黑拉格 | 5.0 | L: 42
--   2  大师杯 | 拾伍 | 摩登西海岸 IPA | 7.0 | L: 58, M: 50
--   5  Alus | 泡泡浴 | 日式柚子拉格 | 5.1 | L: 42
--   7  洄游 | 幽澜 | 龙眼莲雾白玉兰西打 / Wax Apple Cider | 5.5 | L: 48
--
-- Notes:
-- - Safe to re-run (idempotent by brewery + beer name).
-- - sort_order / public_sort_order use source # column.
-- - drinks.price = default L pour when present.
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
menu_rows AS (
  SELECT *
  FROM (
    VALUES
      (1, 'Dr.Lab'::text, 'DR 凉茶'::text, '超深烘超苦黑拉格'::text, 5.0::numeric, 42::numeric, NULL::numeric),
      (2, '大师杯'::text, '拾伍'::text, '摩登西海岸 IPA'::text, 7.0::numeric, 58::numeric, 50::numeric),
      (5, 'Alus'::text, '泡泡浴'::text, '日式柚子拉格'::text, 5.1::numeric, 42::numeric, NULL::numeric),
      (7, '洄游'::text, '幽澜'::text, '龙眼莲雾白玉兰西打 / Wax Apple Cider'::text, 5.5::numeric, 48::numeric, NULL::numeric)
  ) AS v(row_no, brewery, beer_name, beer_style, abv, price_l, price_m)
),
rows_to_insert AS (
  SELECT m.*
  FROM menu_rows m
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.drinks d
    WHERE d.tenant_id = '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f787'
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
    '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f787',
    rc.id,
    r.brewery,
    r.beer_name,
    r.price_l,
    '杯',
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
    '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f787',
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
  '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f787',
  td.id,
  s.serving_type,
  s.label,
  s.volume_ml,
  s.price,
  s.is_default,
  true,
  s.public_sort_order
FROM inserted_drinks td
JOIN menu_rows m
  ON m.brewery = td.brand_name
 AND m.beer_name = td.name
CROSS JOIN LATERAL (
  SELECT *
  FROM (
    VALUES
      ('draft'::text, 'L'::text, 400::integer, m.price_l, true, 0)
  ) AS l(serving_type, label, volume_ml, price, is_default, public_sort_order)
  WHERE m.price_l IS NOT NULL

  UNION ALL

  SELECT
    'draft'::text,
    'M'::text,
    330::integer,
    m.price_m,
    false,
    1
  WHERE m.price_m IS NOT NULL
) s;

UPDATE public.tenants
SET last_menu_updated_at = now()
WHERE id = '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f787';

COMMIT;

-- Verify:
-- SELECT d.sort_order, d.brand_name, d.name, p.beer_style, p.abv, d.price
-- FROM public.drinks d
-- LEFT JOIN public.drink_beer_profiles p ON p.drink_id = d.id
-- WHERE d.tenant_id = '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f787'
--   AND d.name IN ('DR 凉茶', '拾伍', '泡泡浴', '幽澜')
-- ORDER BY d.sort_order;
--
-- SELECT d.name, so.label, so.volume_ml, so.price, so.is_default
-- FROM public.drinks d
-- JOIN public.drink_serving_options so ON so.drink_id = d.id
-- WHERE d.tenant_id = '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f787'
--   AND d.name IN ('DR 凉茶', '拾伍', '泡泡浴', '幽澜')
-- ORDER BY d.sort_order, so.public_sort_order;
