-- Validate public QR attribution without exposing tenant_qr_links rows.
-- Invalid or unavailable attribution must never block the public tap list itself.

CREATE OR REPLACE FUNCTION public.validate_public_qr_attribution(
  p_tenant_id uuid,
  p_tenant_slug text,
  p_qr_code text,
  p_placement text DEFAULT 'venue',
  p_version integer DEFAULT 1
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_qr_links q
    JOIN public.tenants t ON t.id = q.tenant_id
    WHERE q.enabled = true
      AND q.tenant_id = p_tenant_id
      AND q.tenant_slug = trim(p_tenant_slug)
      AND t.slug = trim(p_tenant_slug)
      AND q.qr_code = upper(trim(p_qr_code))
      AND q.placement = lower(trim(p_placement))
      AND q.version = p_version
  );
$$;

REVOKE ALL ON FUNCTION public.validate_public_qr_attribution(uuid, text, text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_public_qr_attribution(uuid, text, text, text, integer)
  TO anon, authenticated;
