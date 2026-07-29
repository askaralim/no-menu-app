-- Phase 1b: owner payload includes archived (enabled=false) catalog drinks.
-- Tonight UI filters to on-tonight; catalog uses 可用/已下架 tabs.

CREATE OR REPLACE FUNCTION public.get_owner_taplist_payload(p_tenant_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_tenant_id := p_tenant_id;
  IF v_tenant_id IS NULL THEN
    SELECT ur.tenant_id INTO v_tenant_id
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('owner', 'staff')
    ORDER BY ur.created_at
    LIMIT 1;
  END IF;

  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'no_tenant');
  END IF;

  IF NOT public.taplist_can_view_tenant(v_tenant_id) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'is_owner', EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND (
          ur.role = 'super_admin'
          OR (ur.tenant_id = v_tenant_id AND ur.role = 'owner')
        )
    ),
    'tenant', (
      SELECT jsonb_build_object(
        'id', t.id,
        'slug', t.slug,
        'name', t.name,
        'display_name', t.display_name,
        'is_public_visible', t.is_public_visible,
        'last_menu_updated_at', t.last_menu_updated_at,
        'status', t.status,
        'public_price_mode', coalesce(t.public_price_mode, 'hide')
      )
      FROM public.tenants t
      WHERE t.id = v_tenant_id
    ),
    'categories', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'name', c.name,
          'sort_order', c.sort_order,
          'enabled', c.enabled,
          'is_public_visible', c.is_public_visible
        ) ORDER BY c.sort_order, c.name
      )
      FROM public.categories c
      WHERE c.tenant_id = v_tenant_id
    ), '[]'::jsonb),
    'drinks', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', d.id,
          'category_id', d.category_id,
          'brand_name', d.brand_name,
          'name', d.name,
          'enabled', d.enabled,
          'image_url', d.image_url,
          'is_public_visible', d.is_public_visible,
          'public_status', d.public_status,
          'public_sort_order', d.public_sort_order,
          'product_id', d.product_id,
          'display_name', d.display_name,
          'display_description', d.display_description
        ) ORDER BY d.enabled DESC, d.public_sort_order NULLS LAST, lower(d.name)
      )
      FROM public.drinks d
      WHERE d.tenant_id = v_tenant_id
    ), '[]'::jsonb),
    'beer_profiles', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'drink_id', p.drink_id,
          'brewery', p.brewery,
          'beer_style', p.beer_style,
          'abv', p.abv,
          'ibu', p.ibu,
          'country', p.country,
          'description', p.description
        )
      )
      FROM public.drink_beer_profiles p
      JOIN public.drinks d ON d.id = p.drink_id
      WHERE p.tenant_id = v_tenant_id
    ), '[]'::jsonb),
    'serving_options', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', so.id,
          'drink_id', so.drink_id,
          'serving_type', so.serving_type,
          'label', so.label,
          'volume_ml', so.volume_ml,
          'price', so.price,
          'is_default', so.is_default,
          'is_active', so.is_active,
          'public_sort_order', so.public_sort_order
        ) ORDER BY so.public_sort_order
      )
      FROM public.drink_serving_options so
      JOIN public.drinks d ON d.id = so.drink_id
      WHERE so.tenant_id = v_tenant_id
    ), '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_owner_taplist_payload(uuid) TO authenticated;
