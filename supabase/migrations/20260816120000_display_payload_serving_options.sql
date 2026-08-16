-- In-bar /display menu board: return active drink_serving_options instead of
-- relying on deprecated drinks.price / price_bottle columns.
-- Scope unchanged: all enabled categories + enabled catalog drinks (not tonight taplist).

CREATE OR REPLACE FUNCTION public.get_public_display_payload(p_slug text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_name text;
  v_status text;
  v_settings jsonb;
  v_categories jsonb;
  legacy_id uuid := '00000000-0000-0000-0000-000000000001';
BEGIN
  IF p_slug IS NULL OR trim(p_slug) = '' THEN
    SELECT t.id, t.name, t.status
    INTO v_tenant_id, v_name, v_status
    FROM public.tenants t
    WHERE t.id = legacy_id;
  ELSE
    SELECT t.id, t.name, t.status
    INTO v_tenant_id, v_name, v_status
    FROM public.tenants t
    WHERE t.slug = trim(p_slug);
  END IF;

  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END IF;

  IF v_status = 'suspended' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'suspended', 'name', v_name);
  END IF;

  SELECT to_jsonb(s) INTO v_settings
  FROM public.settings s
  WHERE s.tenant_id = v_tenant_id
  LIMIT 1;

  SELECT COALESCE(jsonb_agg(sub.cat_obj ORDER BY sub.sort_order), '[]'::jsonb)
  INTO v_categories
  FROM (
    SELECT
      c.sort_order,
      jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'sort_order', c.sort_order,
        'enabled', c.enabled,
        'created_at', c.created_at,
        'drinks', (
          SELECT COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'id', d.id,
                'brand_name', d.brand_name,
                'name', d.name,
                'volume_ml', d.volume_ml,
                'price', d.price,
                'price_unit', d.price_unit,
                'price_bottle', d.price_bottle,
                'price_unit_bottle', d.price_unit_bottle,
                'enabled', d.enabled,
                'sort_order', d.sort_order,
                'created_at', d.created_at,
                'category_id', c.id,
                'drink_serving_options', (
                  SELECT COALESCE(
                    jsonb_agg(
                      jsonb_build_object(
                        'id', so.id,
                        'serving_type', so.serving_type,
                        'label', so.label,
                        'volume_ml', so.volume_ml,
                        'price', so.price,
                        'is_default', so.is_default,
                        'is_active', so.is_active,
                        'public_sort_order', so.public_sort_order
                      )
                      ORDER BY so.public_sort_order, so.is_default DESC, so.label
                    ),
                    '[]'::jsonb
                  )
                  FROM public.drink_serving_options so
                  WHERE so.drink_id = d.id
                    AND so.tenant_id = v_tenant_id
                    AND so.is_active = true
                )
              )
              ORDER BY d.sort_order
            ),
            '[]'::jsonb
          )
          FROM public.drinks d
          WHERE d.category_id = c.id
            AND d.tenant_id = v_tenant_id
            AND d.enabled = true
        )
      ) AS cat_obj
    FROM public.categories c
    WHERE c.tenant_id = v_tenant_id
      AND c.enabled = true
  ) sub;

  RETURN jsonb_build_object(
    'ok', true,
    'tenant', jsonb_build_object('id', v_tenant_id, 'name', v_name),
    'settings', v_settings,
    'categories', COALESCE(v_categories, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_display_payload(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_display_payload(text) TO authenticated;
