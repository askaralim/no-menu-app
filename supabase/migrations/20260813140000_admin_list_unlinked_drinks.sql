-- Cross-tenant inbox: drinks not yet linked to drink_products.
-- Extends product-pool stats with unlinked_drinks count.

CREATE OR REPLACE FUNCTION public.admin_list_unlinked_drinks(
  p_query text DEFAULT NULL,
  p_tenant_id uuid DEFAULT NULL,
  p_enabled_only boolean DEFAULT true,
  p_public_only boolean DEFAULT false,
  p_limit integer DEFAULT 200
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_query text := nullif(trim(p_query), '');
  v_limit integer := greatest(1, least(coalesce(p_limit, 200), 500));
  v_total integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Unauthorized: super_admin role required';
  END IF;

  SELECT count(*)::int
  INTO v_total
  FROM public.drinks d
  JOIN public.tenants t ON t.id = d.tenant_id
  LEFT JOIN public.drink_beer_profiles p ON p.drink_id = d.id
  LEFT JOIN public.categories c ON c.id = d.category_id
  WHERE d.product_id IS NULL
    AND (p_tenant_id IS NULL OR d.tenant_id = p_tenant_id)
    AND (NOT coalesce(p_enabled_only, true) OR d.enabled = true)
    AND (NOT coalesce(p_public_only, false) OR d.is_public_visible = true)
    AND (
      v_query IS NULL
      OR d.name ILIKE '%' || v_query || '%'
      OR coalesce(d.brand_name, '') ILIKE '%' || v_query || '%'
      OR coalesce(p.brewery, '') ILIKE '%' || v_query || '%'
      OR coalesce(p.beer_style, '') ILIKE '%' || v_query || '%'
      OR coalesce(t.name, '') ILIKE '%' || v_query || '%'
      OR coalesce(t.display_name, '') ILIKE '%' || v_query || '%'
      OR coalesce(t.slug, '') ILIKE '%' || v_query || '%'
    );

  RETURN jsonb_build_object(
    'ok', true,
    'total', v_total,
    'drinks', coalesce(
      (
        SELECT jsonb_agg(row_obj ORDER BY created_at DESC, name_sort)
        FROM (
          SELECT
            jsonb_build_object(
              'id', d.id,
              'tenant_id', d.tenant_id,
              'tenant_name', t.name,
              'tenant_slug', t.slug,
              'tenant_display_name', t.display_name,
              'category_id', d.category_id,
              'category_name', c.name,
              'name', d.name,
              'brand_name', d.brand_name,
              'image_url', d.image_url,
              'enabled', d.enabled,
              'is_public_visible', d.is_public_visible,
              'public_status', d.public_status,
              'public_sort_order', d.public_sort_order,
              'product_id', d.product_id,
              'display_name', d.display_name,
              'display_description', d.display_description,
              'created_at', d.created_at,
              'brewery', p.brewery,
              'beer_style', p.beer_style,
              'abv', p.abv,
              'ibu', p.ibu,
              'country', p.country,
              'description', p.description,
              'collab_breweries', coalesce(to_jsonb(p.collab_breweries), '[]'::jsonb)
            ) AS row_obj,
            d.created_at,
            lower(d.name) AS name_sort
          FROM public.drinks d
          JOIN public.tenants t ON t.id = d.tenant_id
          LEFT JOIN public.drink_beer_profiles p ON p.drink_id = d.id
          LEFT JOIN public.categories c ON c.id = d.category_id
          WHERE d.product_id IS NULL
            AND (p_tenant_id IS NULL OR d.tenant_id = p_tenant_id)
            AND (NOT coalesce(p_enabled_only, true) OR d.enabled = true)
            AND (NOT coalesce(p_public_only, false) OR d.is_public_visible = true)
            AND (
              v_query IS NULL
              OR d.name ILIKE '%' || v_query || '%'
              OR coalesce(d.brand_name, '') ILIKE '%' || v_query || '%'
              OR coalesce(p.brewery, '') ILIKE '%' || v_query || '%'
              OR coalesce(p.beer_style, '') ILIKE '%' || v_query || '%'
              OR coalesce(t.name, '') ILIKE '%' || v_query || '%'
              OR coalesce(t.display_name, '') ILIKE '%' || v_query || '%'
              OR coalesce(t.slug, '') ILIKE '%' || v_query || '%'
            )
          ORDER BY d.created_at DESC, lower(d.name)
          LIMIT v_limit
        ) sub
      ),
      '[]'::jsonb
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_drink_product_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Unauthorized: super_admin role required';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'stats', jsonb_build_object(
      'total_active', (
        SELECT count(*)::int FROM public.drink_products WHERE status = 'active'
      ),
      'pending_review', (
        SELECT count(*)::int FROM public.drink_products WHERE status = 'active' AND review_status = 'pending'
      ),
      'unlinked_company', (
        SELECT count(*)::int FROM public.drink_products WHERE status = 'active' AND company_id IS NULL
      ),
      'linked_drinks', (
        SELECT count(*)::int FROM public.drinks WHERE product_id IS NOT NULL
      ),
      'unlinked_drinks', (
        SELECT count(*)::int FROM public.drinks WHERE product_id IS NULL AND enabled = true
      )
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_unlinked_drinks(text, uuid, boolean, boolean, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_drink_product_stats() TO authenticated;
