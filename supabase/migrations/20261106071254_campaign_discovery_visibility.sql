-- Direct-link rehearsals are accessible by code and excluded from discovery.
ALTER TABLE public.campaign_events ADD COLUMN is_listed boolean NOT NULL DEFAULT true;

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

CREATE OR REPLACE FUNCTION public.get_active_campaign_badges(
  p_tenant_id uuid,
  p_drink_ids uuid[] DEFAULT '{}'::uuid[]
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'ok', true,
    'results', coalesce(jsonb_agg(jsonb_build_object(
      'campaign_id', c.id,
      'campaign_slug', c.slug,
      'stop_id', s.id,
      'drink_id', s.drink_id,
      'label', c.badge_label
    ) ORDER BY c.sort_order, s.sort_order), '[]'::jsonb)
  )
  FROM public.campaign_stops s
  JOIN public.campaign_events c ON c.id = s.campaign_id
  WHERE s.tenant_id = p_tenant_id
    AND s.drink_id = ANY(coalesce(p_drink_ids, '{}'::uuid[]))
    AND c.is_public_visible
    AND c.is_listed
    AND c.status = 'scheduled'
    AND c.start_at <= now()
    AND c.end_at >= now();
$$;
