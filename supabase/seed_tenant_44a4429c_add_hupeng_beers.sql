-- =====================================================================
-- Incremental seed: add five beers
-- Tenant: 44a4429c-fb70-47a5-923b-370fce8f167e
--
-- Beers (狐朋酿造 | 佛山):
--   01 海边驿站 | 酒花皮尔森 Pilsner | 5.3 | 58/470ml, 48/330ml
--   02 莓好前程 | 莓果 Cider | 5.0 | 68/470ml, 58/330ml
--   05 酒花英雄 | 双倍西海岸 IPA | 8.0 | 68/470ml, 58/330ml
--   10 鸡有鸡味 | 三倍干投浑浊 IPA | 9.4 | 78/470ml, 68/330ml
--   12 马上有桔 | 桔子辣椒 Cider | 5.0 | 68/470ml, 58/330ml
--
-- Notes:
-- - Safe to re-run (idempotent by brewery + beer name).
-- - sort_order / public_sort_order use source # column.
-- - Serving sizes: 330ml + 470ml (470ml default).
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
menu_rows AS (
  SELECT *
  FROM (
    VALUES
      (1, '海边驿站'::text, '狐朋酿造'::text, '佛山'::text, '酒花皮尔森 Pilsner'::text, 5.3::numeric, 48::integer, 58::integer),
      (2, '莓好前程'::text, '狐朋酿造'::text, '佛山'::text, '莓果 Cider'::text, 5.0::numeric, 58::integer, 68::integer),
      (5, '酒花英雄'::text, '狐朋酿造'::text, '佛山'::text, '双倍西海岸 IPA'::text, 8.0::numeric, 58::integer, 68::integer),
      (10, '鸡有鸡味'::text, '狐朋酿造'::text, '佛山'::text, '三倍干投浑浊 IPA'::text, 9.4::numeric, 68::integer, 78::integer),
      (12, '马上有桔'::text, '狐朋酿造'::text, '佛山'::text, '桔子辣椒 Cider'::text, 5.0::numeric, 58::integer, 68::integer)
  ) AS v(row_no, beer_name, brewery, country, beer_style, abv, price_330, price_470)
),
rows_to_insert AS (
  SELECT m.*
  FROM menu_rows m
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.drinks d
    WHERE d.tenant_id = '44a4429c-fb70-47a5-923b-370fce8f167e'
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
    '44a4429c-fb70-47a5-923b-370fce8f167e',
    rc.id,
    r.brewery,
    r.beer_name,
    r.price_470,
    '杯',
    470,
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
  INSERT INTO public.drink_beer_profiles (tenant_id, drink_id, brewery, beer_style, abv, country)
  SELECT
    '44a4429c-fb70-47a5-923b-370fce8f167e',
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
  '44a4429c-fb70-47a5-923b-370fce8f167e',
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
  VALUES
    ('draft'::text, '330ml'::text, 330::integer, m.price_330, false, 0),
    ('draft'::text, '470ml'::text, 470::integer, m.price_470, true, 1)
) AS s(serving_type, label, volume_ml, price, is_default, public_sort_order);

UPDATE public.tenants
SET last_menu_updated_at = now()
WHERE id = '44a4429c-fb70-47a5-923b-370fce8f167e';

COMMIT;

-- Verify:
-- SELECT d.sort_order, d.brand_name, d.name, p.country, p.beer_style, p.abv, d.price, d.volume_ml
-- FROM public.drinks d
-- LEFT JOIN public.drink_beer_profiles p ON p.drink_id = d.id
-- WHERE d.tenant_id = '44a4429c-fb70-47a5-923b-370fce8f167e'
--   AND d.brand_name = '狐朋酿造'
-- ORDER BY d.sort_order;
--
-- SELECT d.name, so.label, so.volume_ml, so.price, so.is_default
-- FROM public.drinks d
-- JOIN public.drink_serving_options so ON so.drink_id = d.id
-- WHERE d.tenant_id = '44a4429c-fb70-47a5-923b-370fce8f167e'
--   AND d.brand_name = '狐朋酿造'
-- ORDER BY d.sort_order, so.public_sort_order;
