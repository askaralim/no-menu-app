-- Keep image_path for older POS / mini-program clients. Backfill only after byte verification.
BEGIN;
ALTER TABLE public.tenant_qr_links ADD COLUMN IF NOT EXISTS image_url text;
COMMENT ON COLUMN public.tenant_qr_links.image_url IS 'Verified original QR PNG URL on OSS/CDN; null uses legacy Supabase image_path.';

CREATE OR REPLACE FUNCTION public.get_my_tenant_qr(
  p_tenant_id uuid,
  p_placement text DEFAULT 'venue'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_placement text;
  v_row public.tenant_qr_links%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id is required';
  END IF;

  IF NOT public.taplist_can_view_tenant(p_tenant_id) THEN
    RAISE EXCEPTION 'Forbidden: not a member of this tenant';
  END IF;

  v_placement := lower(trim(coalesce(p_placement, 'venue')));
  IF v_placement = '' THEN
    v_placement := 'venue';
  END IF;

  SELECT *
  INTO v_row
  FROM public.tenant_qr_links q
  WHERE q.tenant_id = p_tenant_id
    AND q.placement = v_placement
    AND q.enabled = true
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'qr_code', v_row.qr_code,
    'short_url', 'https://nomenuapp.com/q/' || v_row.qr_code,
    'image_path', v_row.image_path,
    'image_url', v_row.image_url,
    'placement', v_row.placement,
    'version', v_row.version
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_tenant_qr(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_tenant_qr(uuid, text) TO authenticated;

COMMIT;
