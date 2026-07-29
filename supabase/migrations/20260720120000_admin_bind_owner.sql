-- Concierge owner bind: super_admin attaches an existing auth user as bar owner.
-- Auth user create/password is done via Admin API (Next.js /api/admin/bind-owner).

CREATE OR REPLACE FUNCTION public.admin_bind_owner_to_tenant(
  p_tenant_id uuid,
  p_user_id uuid,
  p_mobile text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_mobile text;
  v_email text;
  v_prev_owner uuid;
  v_tenant_name text;
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

  IF p_tenant_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id and user_id are required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = p_tenant_id) THEN
    RAISE EXCEPTION 'Tenant not found';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p_user_id) THEN
    RAISE EXCEPTION 'Auth user not found';
  END IF;

  v_mobile := public._normalize_invite_mobile(p_mobile);
  IF v_mobile IS NULL THEN
    RAISE EXCEPTION 'Invalid China mobile number';
  END IF;

  SELECT u.email INTO v_email FROM auth.users u WHERE u.id = p_user_id;

  SELECT t.name INTO v_tenant_name FROM public.tenants t WHERE t.id = p_tenant_id;

  SELECT ur.user_id INTO v_prev_owner
  FROM public.user_roles ur
  WHERE ur.tenant_id = p_tenant_id AND ur.role = 'owner'
  LIMIT 1;

  IF v_prev_owner IS NOT NULL AND v_prev_owner <> p_user_id THEN
    DELETE FROM public.user_roles
    WHERE tenant_id = p_tenant_id AND user_id = v_prev_owner AND role = 'owner';
  END IF;

  -- mobile is UNIQUE on user_profiles; free it from any other account first
  UPDATE public.user_profiles
  SET mobile = NULL, updated_at = now()
  WHERE mobile = v_mobile AND user_id <> p_user_id;

  INSERT INTO public.user_roles (user_id, tenant_id, role)
  VALUES (p_user_id, p_tenant_id, 'owner')
  ON CONFLICT (user_id, tenant_id) DO UPDATE
  SET role = 'owner';

  INSERT INTO public.user_profiles (user_id, email, mobile, display_name)
  VALUES (
    p_user_id,
    nullif(v_email, ''),
    v_mobile,
    coalesce(nullif(v_mobile, ''), nullif(v_email, ''))
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    email = coalesce(excluded.email, public.user_profiles.email),
    mobile = excluded.mobile,
    updated_at = now();

  UPDATE public.tenants
  SET
    owner_claimed_at = coalesce(owner_claimed_at, now()),
    onboarding_status = CASE
      WHEN onboarding_status IN ('public_live', 'ready_for_review', 'setup_in_progress')
        THEN onboarding_status
      ELSE 'setup_in_progress'
    END
  WHERE id = p_tenant_id;

  PERFORM public._audit_log(
    p_tenant_id,
    'owner_bound',
    'tenant',
    p_tenant_id,
    jsonb_build_object('previous_owner_user_id', v_prev_owner),
    jsonb_build_object(
      'owner_user_id', p_user_id,
      'mobile', v_mobile,
      'email', v_email
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'tenant_id', p_tenant_id,
    'tenant_name', v_tenant_name,
    'user_id', p_user_id,
    'mobile', v_mobile,
    'email', v_email,
    'replaced_owner_user_id', v_prev_owner
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_bind_owner_to_tenant(uuid, uuid, text) TO authenticated;
