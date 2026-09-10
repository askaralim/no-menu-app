CREATE OR REPLACE FUNCTION public.admin_set_tenant_cover_image(
  p_tenant_id uuid,
  p_image_url text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_image_url text := nullif(trim(p_image_url), '');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Unauthorized: super_admin role required';
  END IF;

  IF v_image_url IS NULL OR v_image_url !~ (
    '^https://img\.nomenuapp\.com/prod/tenants/' ||
    p_tenant_id::text ||
    '/covers/[A-Za-z0-9_-][A-Za-z0-9._-]{0,119}$'
  ) THEN
    RAISE EXCEPTION 'Invalid tenant cover URL';
  END IF;

  UPDATE public.tenants SET cover_image_url = v_image_url WHERE id = p_tenant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tenant not found'; END IF;

  RETURN jsonb_build_object('ok', true, 'tenant_id', p_tenant_id, 'cover_image_url', v_image_url);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_tenant_cover_image(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_tenant_cover_image(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_set_tenant_cover_image(uuid, text) TO authenticated;
