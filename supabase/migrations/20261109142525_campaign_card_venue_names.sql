CREATE OR REPLACE FUNCTION public.list_public_campaigns(p_city text DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'ok', true,
    'results', coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id,
      'slug', c.slug,
      'title', c.title,
      'subtitle', c.subtitle,
      'badge_label', c.badge_label,
      'card_image_url', c.card_image_url,
      'start_at', c.start_at,
      'end_at', c.end_at,
      'stop_count', 6,
      'tenant_display_name', (
        SELECT string_agg(coalesce(nullif(trim(t.display_name), ''), t.name), ' · ' ORDER BY s.sort_order)
        FROM public.campaign_stops s
        JOIN public.tenants t ON t.id = s.tenant_id
        WHERE s.campaign_id = c.id
      ),
      'kind', 'campaign'
    ) ORDER BY c.sort_order, c.start_at, lower(c.title)), '[]'::jsonb)
  )
  FROM public.campaign_events c
  WHERE c.is_public_visible
    AND c.is_listed
    AND c.status = 'scheduled'
    AND c.end_at >= now()
    AND (nullif(trim(p_city), '') IS NULL OR lower(trim(c.city)) = lower(trim(p_city)));
$$;
