-- Super-admin password reset for an existing bar owner.
-- Does not create an account, change who owns the bar, or touch other roles.
-- The owner must change this temporary password on the next POS login.

CREATE OR REPLACE FUNCTION public.admin_reset_owner_password(
  p_tenant_id uuid,
  p_password text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_user_id uuid;
  v_email text;
  v_mobile text;
  v_national text;
  v_tenant_name text;
  v_other_bars jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = v_uid AND ur.role = 'super_admin'
  ) THEN
    RAISE EXCEPTION 'Unauthorized: super_admin role required';
  END IF;

  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id is required';
  END IF;

  IF p_password IS NULL OR length(p_password) < 6 THEN
    RAISE EXCEPTION 'Password must be at least 6 characters';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = p_tenant_id) THEN
    RAISE EXCEPTION 'Tenant not found';
  END IF;

  SELECT t.name INTO v_tenant_name
  FROM public.tenants t
  WHERE t.id = p_tenant_id;

  SELECT ur.user_id INTO v_user_id
  FROM public.user_roles ur
  WHERE ur.tenant_id = p_tenant_id
    AND ur.role = 'owner'
  ORDER BY ur.user_id
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION '这家店还没有店主';
  END IF;

  SELECT
    u.email,
    nullif(trim(u.raw_user_meta_data->>'national_mobile'), '')
  INTO v_email, v_national
  FROM auth.users u
  WHERE u.id = v_user_id;

  IF v_national IS NULL AND v_email IS NOT NULL AND split_part(v_email, '@', 1) ~ '^1[3-9][0-9]{9}$' THEN
    v_national := split_part(v_email, '@', 1);
  END IF;

  v_mobile := public._normalize_invite_mobile(v_national);

  UPDATE auth.users
  SET
    encrypted_password = crypt(p_password, gen_salt('bf')),
    email_confirmed_at = coalesce(email_confirmed_at, now()),
    raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
      'must_change_password', true
    ),
    updated_at = now()
  WHERE id = v_user_id;

  SELECT coalesce(jsonb_agg(t.name ORDER BY t.name), '[]'::jsonb)
  INTO v_other_bars
  FROM public.user_roles ur
  JOIN public.tenants t ON t.id = ur.tenant_id
  WHERE ur.user_id = v_user_id
    AND ur.role = 'owner'
    AND ur.tenant_id <> p_tenant_id;

  PERFORM public._audit_log(
    p_tenant_id,
    'owner_password_reset',
    'tenant',
    p_tenant_id,
    NULL,
    jsonb_build_object(
      'owner_user_id', v_user_id,
      'mobile', v_mobile,
      'must_change_password', true
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'tenant_id', p_tenant_id,
    'tenant_name', v_tenant_name,
    'mobile', v_national,
    'login_email', v_email,
    'temporary_password', p_password,
    'must_change_password', true,
    'other_tenant_names', v_other_bars
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_reset_owner_password(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_reset_owner_password(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_reset_owner_password(uuid, text) TO authenticated;
