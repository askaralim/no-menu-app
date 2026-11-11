-- Additive, read-only endpoint. No existing function, table, or publication rule changes.
-- Deliberately CREATE (not OR REPLACE): an unexpected name collision must fail.
CREATE FUNCTION public.get_public_campaign_related_drinks_v1(
  p_campaign_id uuid,
  p_stop_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_stop public.campaign_stops%ROWTYPE;
  v_product_id uuid;
  v_company_id uuid;
  v_company_name text;
  v_menu jsonb;
  v_items jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.campaign_events c
    WHERE c.id = p_campaign_id AND c.is_public_visible AND c.status = 'scheduled'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_PUBLIC');
  END IF;

  SELECT * INTO v_stop FROM public.campaign_stops s
  WHERE s.id = p_stop_id AND s.campaign_id = p_campaign_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'STOP_NOT_FOUND');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tenants t
    WHERE t.id = v_stop.tenant_id AND t.status = 'active' AND t.is_public_visible
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_PUBLIC');
  END IF;

  -- The main collaboration may still be unpublished. Its identity, not its
  -- availability or display label, determines the partner brewery.
  SELECT p.id, c.id, coalesce(nullif(trim(c.display_name), ''), c.canonical_name)
  INTO v_product_id, v_company_id, v_company_name
  FROM public.drinks d
  JOIN public.drink_products p ON p.id = d.product_id AND p.status = 'active'
  JOIN public.drink_companies c ON c.id = p.company_id AND c.status = 'active'
  WHERE d.id = v_stop.drink_id AND d.tenant_id = v_stop.tenant_id;

  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'state', 'unconfigured', 'items', '[]'::jsonb);
  END IF;

  -- Keep the existing menu's visibility/category/tap/recently-sold-out rules
  -- and public display serialization. Never widen access to private listings.
  v_menu := public.get_public_taplist_drinks_i18n(v_stop.tenant_id);
  IF coalesce((v_menu->>'ok')::boolean, false) IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'code', 'MENU_UNAVAILABLE');
  END IF;

  WITH buckets AS (
    SELECT * FROM (VALUES ('drinks', 0), ('coming_soon', 1), ('recently_sold_out', 2)) b(key, position)
  ), menu_rows AS (
    SELECT r.item, r.ord, b.position
    FROM buckets b
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(v_menu->b.key) = 'array' THEN v_menu->b.key ELSE '[]'::jsonb END
    ) WITH ORDINALITY r(item, ord)
  ), matched AS (
    SELECT r.*, d.id, d.product_id, d.public_status,
      CASE d.public_status WHEN 'new' THEN 0 WHEN 'available' THEN 0 WHEN 'low' THEN 0
        WHEN 'coming_soon' THEN 1 WHEN 'sold_out' THEN 2 ELSE 3 END AS status_order
    FROM menu_rows r
    JOIN public.drinks d ON d.id::text = r.item->>'id'
      AND d.tenant_id = v_stop.tenant_id AND d.enabled AND d.is_public_visible
    JOIN public.drink_products p ON p.id = d.product_id AND p.status = 'active'
      AND p.company_id = v_company_id
    WHERE d.id <> v_stop.drink_id AND p.id <> v_product_id
  ), ranked AS (
    SELECT m.*, row_number() OVER (
      PARTITION BY product_id ORDER BY status_order, position, ord, id
    ) AS occurrence
    FROM matched m
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'product_id', product_id,
    'name', item->>'name', 'name_en', item->>'name_en',
    'image_url', item->>'image_url',
    'beer_style', item->'beer'->>'beer_style',
    'beer_style_en', item->'beer'->>'beer_style_en',
    'abv', item->'beer'->'abv',
    'public_status', public_status
  ) ORDER BY status_order, position, ord, id), '[]'::jsonb)
  INTO v_items FROM ranked WHERE occurrence = 1;

  RETURN jsonb_build_object('ok', true, 'state', 'ready',
    'brewery', jsonb_build_object('id', v_company_id, 'name', v_company_name),
    'items', v_items);
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_campaign_related_drinks_v1(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_campaign_related_drinks_v1(uuid, uuid) TO anon, authenticated;

COMMENT ON FUNCTION public.get_public_campaign_related_drinks_v1(uuid, uuid) IS
  'Public campaign supplement: same-venue public listings matched by product company ID. Does not grant passport completion.';
