-- =====================================================================
-- Incremental seed: add eight beers for one tenant
-- Tenant: 494bcf1f-8346-480f-a396-204b104c9313
--
-- Notes:
-- - Safe to re-run (idempotent by brewery + beer name).
-- - No tenant-wide deletes.
-- - No drink_serving_options; drinks.price = 0 (schema placeholder).
-- - IBU omitted when source says 未显示; ABV uses numeric value (≥ stored as minimum).
-- =====================================================================

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.tenants t
    WHERE t.id = '494bcf1f-8346-480f-a396-204b104c9313'
  ) THEN
    RAISE EXCEPTION 'Tenant not found: %', '494bcf1f-8346-480f-a396-204b104c9313';
  END IF;
END $$;

WITH existing_category AS (
  SELECT c.id
  FROM public.categories c
  WHERE c.tenant_id = '494bcf1f-8346-480f-a396-204b104c9313'
    AND c.name = '生啤'
  ORDER BY c.sort_order, c.created_at, c.id
  LIMIT 1
),
inserted_category AS (
  INSERT INTO public.categories (tenant_id, name, sort_order, enabled, is_public_visible)
  SELECT
    '494bcf1f-8346-480f-a396-204b104c9313',
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
  WHERE d.tenant_id = '494bcf1f-8346-480f-a396-204b104c9313'
),
menu_rows AS (
  SELECT *
  FROM (
    VALUES
      (1, 'Derive Brewery', 'LIMA', 'DDH Double Hazy IPA', 7.5::numeric, NULL::integer, '标签底部有 Phaseolus lunatus Lima'::text),
      (2, 'FEVER', '搜魂者', '红色酸艾尔', 7.2::numeric, 9::integer, NULL::text),
      (3, 'Waldhaus', '黑森林金牌皮尔森啤酒', '皮尔森', 4.9::numeric, NULL::integer, '德国酒厂，始于 1833 年；遵循 1516 纯净法；使用天然完整啤酒花原花'::text),
      (4, 'Waldhaus', '黑森林古法窖藏啤酒', '窖藏啤酒', 5.6::numeric, NULL::integer, '无过滤风格；保留活性酵母；德国酒厂，始于 1833 年'::text),
      (5, '彼岸酿造', '月光宝盒', '水晶小麦', 4.6::numeric, 12::integer, '过滤型德式小麦，强调清澈酒体、香蕉和丁香香气'::text),
      (6, '彼岸酿造', '望梅止渴', '图林根烟熏酸', 3.6::numeric, 5::integer, '德国图林根州古老烟熏酸艾尔；青梅露增味'::text),
      (7, 'ISM Brewing', 'Chepedelic', 'West Coast IPA', 6.2::numeric, NULL::integer, '16 fl oz；标签侧边写有 Citra / Mosaic / Simcoe / Lupomax Citra 等字样'::text),
      (8, '裂变酿造', 'Nebula Nectar', 'DDH India Pale Ale', 6.8::numeric, NULL::integer, 'Dry hop with Galaxy Citra；银河、Citra 干投'::text)
  ) AS v(row_no, brewery, beer_name, beer_style, abv, ibu, description)
),
rows_to_insert AS (
  SELECT
    m.row_no,
    m.brewery,
    m.beer_name,
    m.beer_style,
    m.abv,
    m.ibu,
    m.description,
    ROW_NUMBER() OVER (ORDER BY m.row_no) AS rn
  FROM menu_rows m
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.drinks d
    WHERE d.tenant_id = '494bcf1f-8346-480f-a396-204b104c9313'
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
    '494bcf1f-8346-480f-a396-204b104c9313',
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
INSERT INTO public.drink_beer_profiles (tenant_id, drink_id, brewery, beer_style, abv, ibu, description)
SELECT
  '494bcf1f-8346-480f-a396-204b104c9313',
  td.id,
  m.brewery,
  m.beer_style,
  m.abv,
  m.ibu,
  m.description
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
WHERE id = '494bcf1f-8346-480f-a396-204b104c9313';

COMMIT;

-- Verify:
-- SELECT d.sort_order, d.brand_name, d.name, p.beer_style, p.abv, p.ibu, p.description, d.price
-- FROM public.drinks d
-- LEFT JOIN public.drink_beer_profiles p ON p.drink_id = d.id
-- WHERE d.tenant_id = '494bcf1f-8346-480f-a396-204b104c9313'
-- ORDER BY d.sort_order;
