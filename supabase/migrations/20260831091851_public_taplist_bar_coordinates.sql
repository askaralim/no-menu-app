-- Add verified venue coordinates to the existing public bar-list payload.
-- This is additive for older clients: parameters, filtering, ordering, and
-- every existing JSON field remain unchanged.

CREATE OR REPLACE FUNCTION public.get_public_taplist_bars(p_city text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_city text := coalesce(nullif(trim(p_city), ''), 'Shanghai');
BEGIN
  RETURN coalesce(
    (
      SELECT jsonb_agg(row_obj ORDER BY lm DESC NULLS LAST)
      FROM (
        SELECT
          jsonb_build_object(
            'id', t.id,
            'slug', t.slug,
            'name', t.name,
            'display_name', coalesce(nullif(trim(t.display_name), ''), t.name),
            'district', t.district,
            'address', t.address,
            'opening_hour', t.opening_hour,
            'description', t.description,
            'cover_image_url', t.cover_image_url,
            'city', t.city,
            'country', t.country,
            'latitude', t.roadmap_latitude,
            'longitude', t.roadmap_longitude,
            'last_menu_updated_at', t.last_menu_updated_at,
            'brewing_type', t.brewing_type,
            'brewing_label', public.taplist_brewing_label(t.brewing_type),
            'status_counts', (
              SELECT jsonb_build_object(
                '上新', count(*) FILTER (WHERE d.public_status = 'new'),
                '在售', count(*) FILTER (WHERE d.public_status = 'available'),
                '少量', count(*) FILTER (WHERE d.public_status = 'low'),
                '售罄', count(*) FILTER (WHERE d.public_status = 'sold_out'),
                '即将上新', count(*) FILTER (WHERE d.public_status = 'coming_soon')
              )
              FROM public.drinks d
              INNER JOIN public.categories c
                ON c.id = d.category_id AND c.tenant_id = d.tenant_id
              WHERE d.tenant_id = t.id
                AND d.enabled = true
                AND d.is_public_visible = true
                AND c.enabled = true
                AND c.is_public_visible = true
            )
          ) AS row_obj,
          t.last_menu_updated_at AS lm
        FROM public.tenants t
        WHERE t.status = 'active'
          AND t.is_public_visible = true
          AND lower(trim(t.city)) = lower(trim(v_city))
      ) sub
    ),
    '[]'::jsonb
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_public_taplist_bars(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_taplist_bars(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_taplist_bars(text) TO authenticated;
