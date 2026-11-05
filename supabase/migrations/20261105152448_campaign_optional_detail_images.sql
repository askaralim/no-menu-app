-- One main image is sufficient; additional detail artwork is optional.
CREATE OR REPLACE FUNCTION public.validate_campaign_for_publication(p_campaign_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campaign public.campaign_events%ROWTYPE;
  v_stop_count integer;
  v_valid_stop_count integer;
BEGIN
  SELECT * INTO v_campaign FROM public.campaign_events WHERE id = p_campaign_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  END IF;
  IF v_campaign.status <> 'scheduled' OR v_campaign.end_at <= v_campaign.start_at THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_SCHEDULE');
  END IF;
  IF nullif(trim(v_campaign.card_image_url), '') IS NULL
    OR nullif(trim(v_campaign.purchase_qr_url), '') IS NULL
    OR nullif(trim(v_campaign.mini_program_code_url), '') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'MISSING_MEDIA');
  END IF;
  SELECT count(*), count(*) FILTER (
    WHERE t.status = 'active'
      AND t.is_public_visible
      AND t.roadmap_latitude IS NOT NULL
      AND t.roadmap_longitude IS NOT NULL
      AND d.tenant_id = s.tenant_id
  )
  INTO v_stop_count, v_valid_stop_count
  FROM public.campaign_stops s
  JOIN public.tenants t ON t.id = s.tenant_id
  JOIN public.drinks d ON d.id = s.drink_id
  WHERE s.campaign_id = p_campaign_id;
  IF v_stop_count <> 6 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'REQUIRES_SIX_STOPS');
  END IF;
  IF v_valid_stop_count <> 6 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_STOP_CONFIGURATION');
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;
