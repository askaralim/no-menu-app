-- Resolve permanent public venue QR codes for clients that receive the original
-- https://nomenuapp.com/q/{CODE} URL, without exposing tenant_qr_links directly.

CREATE OR REPLACE FUNCTION public.resolve_public_qr_link(p_qr_code text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN coalesce(trim(p_qr_code), '') !~ '^[A-Za-z2-7]{8}$' THEN
      jsonb_build_object('ok', false, 'code', 'bad_request')
    ELSE coalesce(
      (
        SELECT jsonb_build_object(
          'ok', true,
          'tenant_slug', t.slug,
          'qr_code', q.qr_code,
          'placement', q.placement,
          'version', q.version
        )
        FROM public.tenant_qr_links q
        INNER JOIN public.tenants t ON t.id = q.tenant_id
        WHERE q.qr_code = upper(trim(p_qr_code))
          AND q.enabled = true
          AND q.placement = 'venue'
          AND q.tenant_slug = t.slug
          AND t.status = 'active'
          AND t.is_public_visible = true
        LIMIT 1
      ),
      jsonb_build_object('ok', false, 'code', 'not_found')
    )
  END;
$$;

REVOKE ALL ON FUNCTION public.resolve_public_qr_link(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_public_qr_link(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_public_qr_link(text) TO anon, authenticated;

COMMENT ON FUNCTION public.resolve_public_qr_link(text) IS
  'Public, read-only resolver for enabled venue QR codes; returns only safe routing metadata.';
