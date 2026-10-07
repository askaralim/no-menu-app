-- Store the official WeChat mini-program code separately from the permanent web QR.
-- Public callers must provide the complete, valid permanent QR attribution tuple.

ALTER TABLE public.tenant_qr_links
  ADD COLUMN IF NOT EXISTS mini_program_code_url text;

COMMENT ON COLUMN public.tenant_qr_links.mini_program_code_url IS
  'Official release mini-program code on OSS/CDN. The encoded scene is the permanent qr_code.';

ALTER TABLE public.tenant_qr_links
  ADD CONSTRAINT tenant_qr_links_mini_program_code_url_format
  CHECK (
    mini_program_code_url IS NULL
    OR mini_program_code_url ~ '^https://img\.nomenuapp\.com/prod/tenants/[0-9a-f-]{36}/qr/weapp/release/no-menu-weapp-v[1-9][0-9]*-[A-Z2-7]{8}\.(png|jpg|jpeg)$'
  );

CREATE OR REPLACE FUNCTION public.get_public_qr_miniprogram_code(
  p_tenant_id uuid,
  p_tenant_slug text,
  p_qr_code text,
  p_placement text DEFAULT 'venue',
  p_version integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(
    (
      SELECT jsonb_build_object(
        'ok', true,
        'valid', true,
        'image_url', q.mini_program_code_url
      )
      FROM public.tenant_qr_links q
      INNER JOIN public.tenants t ON t.id = q.tenant_id
      WHERE q.enabled = true
        AND q.tenant_id = p_tenant_id
        AND q.tenant_slug = trim(p_tenant_slug)
        AND t.slug = trim(p_tenant_slug)
        AND t.status = 'active'
        AND t.is_public_visible = true
        AND q.qr_code = upper(trim(p_qr_code))
        AND q.placement = lower(trim(p_placement))
        AND q.version = p_version
      LIMIT 1
    ),
    jsonb_build_object('ok', true, 'valid', false, 'image_url', null)
  );
$$;

REVOKE ALL ON FUNCTION public.get_public_qr_miniprogram_code(uuid, text, text, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_public_qr_miniprogram_code(uuid, text, text, text, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_qr_miniprogram_code(uuid, text, text, text, integer)
  TO anon, authenticated;

COMMENT ON FUNCTION public.get_public_qr_miniprogram_code(uuid, text, text, text, integer) IS
  'Returns a public mini-program code URL only when the complete permanent venue QR attribution is valid.';
