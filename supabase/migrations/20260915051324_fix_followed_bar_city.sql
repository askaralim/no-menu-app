-- Include a localized city fallback in the private followed-bars response.
-- Bars without a district (for example 牛棚 Bullpen in Shenyang) must not
-- inherit the consumer app's former Shanghai-only fallback.

CREATE OR REPLACE FUNCTION public.get_my_followed_bars()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'results', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'tenant_id', t.id,
        'tenant_slug', t.slug,
        'tenant_display_name', coalesce(nullif(trim(t.display_name), ''), t.name),
        -- Keep released clients correct: they render this field directly and
        -- previously substituted Shanghai when it was null.
        'tenant_district', coalesce(
          nullif(trim(t.district), ''),
          nullif(trim(city_catalog.label), ''),
          nullif(trim(t.city), '')
        ),
        'tenant_city', t.city,
        'tenant_city_label', city_catalog.label,
        'cover_image_url', t.cover_image_url,
        'notify_new_taps', f.notify_new_taps,
        'followed_at', f.created_at
      ) ORDER BY f.created_at DESC)
      FROM public.user_bar_follows f
      JOIN public.tenants t ON t.id = f.tenant_id
      LEFT JOIN public.taplist_public_cities city_catalog
        ON lower(trim(city_catalog.city)) = lower(trim(t.city))
      WHERE f.user_id = auth.uid()
        AND t.status = 'active'
        AND t.is_public_visible = true
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_followed_bars() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_followed_bars() TO authenticated;
