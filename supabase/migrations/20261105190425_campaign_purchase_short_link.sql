-- Optional purchase destination; QR-only campaigns remain valid.
ALTER TABLE public.campaign_events ADD COLUMN purchase_short_link text;
ALTER TABLE public.campaign_events ADD CONSTRAINT campaign_purchase_short_link_check
  CHECK (purchase_short_link IS NULL OR purchase_short_link ~ '^#小程序://[^/[:space:]]+/[^[:space:]]+$');

CREATE OR REPLACE FUNCTION public.get_public_campaign(p_id_or_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_campaign public.campaign_events%ROWTYPE;
  v_stops jsonb;
BEGIN
  SELECT * INTO v_campaign
  FROM public.campaign_events c
  WHERE c.is_public_visible
    AND c.status = 'scheduled'
    AND (c.id::text = p_id_or_slug OR c.slug = p_id_or_slug OR c.qr_code = p_id_or_slug)
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_PUBLIC');
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id,
    'sort_order', s.sort_order,
    'tenant_id', t.id,
    'tenant_slug', t.slug,
    'tenant_name', coalesce(nullif(trim(t.display_name), ''), t.name),
    'tenant_address', t.address,
    'tenant_district', t.district,
    'latitude', t.roadmap_latitude,
    'longitude', t.roadmap_longitude,
    'brewery_label', s.brewery_label,
    'drink_id', d.id,
    'drink_name', coalesce(nullif(trim(d.display_name), ''), d.name),
    'drink_image_url', d.image_url,
    'beer_style', p.beer_style,
    'abv', p.abv,
    'public_status', d.public_status,
    'is_available', d.enabled AND d.is_public_visible AND d.public_status IN ('new', 'available', 'low')
  ) ORDER BY s.sort_order), '[]'::jsonb)
  INTO v_stops
  FROM public.campaign_stops s
  JOIN public.tenants t ON t.id = s.tenant_id
  JOIN public.drinks d ON d.id = s.drink_id
  LEFT JOIN public.drink_beer_profiles p ON p.drink_id = d.id AND p.tenant_id = d.tenant_id
  WHERE s.campaign_id = v_campaign.id;

  RETURN jsonb_build_object(
    'ok', true,
    'campaign', jsonb_build_object(
      'id', v_campaign.id,
      'slug', v_campaign.slug,
      'qr_code', v_campaign.qr_code,
      'title', v_campaign.title,
      'subtitle', v_campaign.subtitle,
      'description', v_campaign.description,
      'city', v_campaign.city,
      'badge_label', v_campaign.badge_label,
      'card_image_url', v_campaign.card_image_url,
      'detail_image_urls', v_campaign.detail_image_urls,
      'purchase_qr_url', v_campaign.purchase_qr_url,
      'purchase_short_link', v_campaign.purchase_short_link,
      'mini_program_code_url', v_campaign.mini_program_code_url,
      'start_at', v_campaign.start_at,
      'end_at', v_campaign.end_at,
      'has_started', v_campaign.start_at <= now(),
      'has_ended', v_campaign.end_at < now(),
      'stops', v_stops
    )
  );
END;
$$;
