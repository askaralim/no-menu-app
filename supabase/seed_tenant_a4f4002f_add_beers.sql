-- =====================================================================
-- Incremental seed: add fifteen beers for one tenant
-- Tenant: a4f4002f-fccd-41dd-bbc5-153d30fc5385
--
-- Notes:
-- - Safe to re-run (idempotent by brand + beer name).
-- - Member price and Date columns ignored.
-- - Size/Price: 330ml/500ml public prices; single-size rows are 330ml only.
-- - Row 15 (精益求精): sold_out, no serving options (price obscured).
-- =====================================================================

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.tenants t
    WHERE t.id = 'a4f4002f-fccd-41dd-bbc5-153d30fc5385'
  ) THEN
    RAISE EXCEPTION 'Tenant not found: %', 'a4f4002f-fccd-41dd-bbc5-153d30fc5385';
  END IF;
END $$;

WITH existing_category AS (
  SELECT c.id
  FROM public.categories c
  WHERE c.tenant_id = 'a4f4002f-fccd-41dd-bbc5-153d30fc5385'
    AND c.name = '生啤'
  ORDER BY c.sort_order, c.created_at, c.id
  LIMIT 1
),
inserted_category AS (
  INSERT INTO public.categories (tenant_id, name, sort_order, enabled, is_public_visible)
  SELECT
    'a4f4002f-fccd-41dd-bbc5-153d30fc5385',
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
  WHERE d.tenant_id = 'a4f4002f-fccd-41dd-bbc5-153d30fc5385'
),
menu_rows AS (
  SELECT *
  FROM (
    VALUES
      (1, '头脑风暴', '闪电萨拉玛', '芬兰', '拉格', 5.0::numeric, 35::integer, 59::numeric, 85::numeric, 'available'::text),
      (2, '幻境拉拉', '闪电萨拉玛', '芬兰', '美式淡色艾尔', 5.2::numeric, NULL::integer, 69::numeric, 99::numeric, 'available'::text),
      (3, '芭比之殇', '闪电萨拉玛', '芬兰', '西海岸IPA', 7.0::numeric, NULL::integer, 79::numeric, 115::numeric, 'available'::text),
      (4, '低档狂飙', '闪电萨拉玛', '芬兰', '新英格兰IPA', 7.0::numeric, NULL::integer, 79::numeric, 115::numeric, 'available'::text),
      (5, '万志', '三得利', '日本', '拉格', 5.5::numeric, NULL::integer, 65::numeric, 95::numeric, 'available'::text),
      (6, '童年回忆', '英雄啤酒', '香港', '双倍干投酒花酸IPA', 5.5::numeric, NULL::integer, 75::numeric, 109::numeric, 'available'::text),
      (7, '东分影', '疯熊工业', '广州', '三倍西海岸IPA', 10.2::numeric, NULL::integer, 85::numeric, 125::numeric, 'available'::text),
      (8, '配瑟芬', '凡人', '美国', '新英格兰IPA', 8.0::numeric, 40::integer, 129::numeric, 189::numeric, 'available'::text),
      (9, '和平奏鸣曲', '头脑冷静', '芬兰', '双倍干投酒花IPA', 8.0::numeric, NULL::integer, 129::numeric, 189::numeric, 'available'::text),
      (10, '飞雁', '凡人', '美国', '新英格兰四倍IPA', 12.0::numeric, 40::integer, 129::numeric, 189::numeric, 'available'::text),
      (11, '路特斯运行原理', '蚁变', '美国', '帝国奶昔酸IPA', 8.0::numeric, 30::integer, 99::numeric, 145::numeric, 'available'::text),
      (12, '无序冰壶', '艾尔复兴', '美国', '水果酸艾尔', 5.0::numeric, 5::integer, 129::numeric, 189::numeric, 'available'::text),
      (13, '豪华赛松', '塞拉多艾尔', '美国', '农舍艾尔', 9.0::numeric, NULL::integer, 129::numeric, NULL::numeric, 'available'::text),
      (14, '分形', '幻果实验', '瑞典', '帝国世涛', 12.0::numeric, NULL::integer, 169::numeric, NULL::numeric, 'available'::text),
      (15, '精益求精', '费登斯', '美国', '新英格兰帝国IPA', 8.0::numeric, NULL::integer, NULL::numeric, NULL::numeric, 'sold_out'::text)
  ) AS v(
    row_no,
    beer_name,
    brewery,
    country,
    beer_style,
    abv,
    ibu,
    price_330,
    price_500,
    public_status
  )
),
rows_to_insert AS (
  SELECT
    m.*,
    ROW_NUMBER() OVER (ORDER BY m.row_no) AS rn
  FROM menu_rows m
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.drinks d
    WHERE d.tenant_id = 'a4f4002f-fccd-41dd-bbc5-153d30fc5385'
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
    'a4f4002f-fccd-41dd-bbc5-153d30fc5385',
    rc.id,
    r.brewery,
    r.beer_name,
    COALESCE(r.price_500, r.price_330, 0),
    '杯',
    CASE
      WHEN r.price_500 IS NOT NULL THEN 500
      WHEN r.price_330 IS NOT NULL THEN 330
      ELSE NULL
    END,
    ns.max_sort_order + r.rn,
    true,
    true,
    r.public_status,
    ns.max_public_sort_order + r.rn
  FROM rows_to_insert r
  CROSS JOIN resolved_category rc
  CROSS JOIN next_sort ns
  RETURNING id, brand_name, name
),
inserted_profiles AS (
  INSERT INTO public.drink_beer_profiles (tenant_id, drink_id, brewery, beer_style, abv, ibu, country)
  SELECT
    'a4f4002f-fccd-41dd-bbc5-153d30fc5385',
    td.id,
    m.brewery,
    m.beer_style,
    m.abv,
    m.ibu,
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
  'a4f4002f-fccd-41dd-bbc5-153d30fc5385',
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
      ('draft'::text, '330ml'::text, 330::integer, m.price_330, false, 0),
      ('draft'::text, '500ml'::text, 500::integer, m.price_500, true, 1)
  ) AS dual(serving_type, label, volume_ml, price, is_default, public_sort_order)
  WHERE m.price_500 IS NOT NULL
    AND m.price_330 IS NOT NULL

  UNION ALL

  SELECT
    'draft'::text,
    '330ml'::text,
    330::integer,
    m.price_330,
    true,
    0
  WHERE m.price_500 IS NULL
    AND m.price_330 IS NOT NULL
) s;

UPDATE public.tenants
SET last_menu_updated_at = now()
WHERE id = 'a4f4002f-fccd-41dd-bbc5-153d30fc5385';

COMMIT;

-- Verify:
-- SELECT d.sort_order, d.brand_name, d.name, d.public_status, p.country, p.beer_style, p.abv, p.ibu, d.price
-- FROM public.drinks d
-- LEFT JOIN public.drink_beer_profiles p ON p.drink_id = d.id
-- WHERE d.tenant_id = 'a4f4002f-fccd-41dd-bbc5-153d30fc5385'
-- ORDER BY d.sort_order;
--
-- SELECT d.name, so.label, so.volume_ml, so.price, so.is_default
-- FROM public.drinks d
-- JOIN public.drink_serving_options so ON so.drink_id = d.id
-- WHERE d.tenant_id = 'a4f4002f-fccd-41dd-bbc5-153d30fc5385'
-- ORDER BY d.sort_order, so.public_sort_order;
