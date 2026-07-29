-- Enable mobile invite matching against verified auth.users.phone.
-- Phone OTP login/signup is handled by Supabase Auth (see config.toml [auth.sms]).

CREATE OR REPLACE FUNCTION public._normalize_invite_mobile(p_mobile text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  d text;
BEGIN
  d := regexp_replace(coalesce(p_mobile, ''), '\D', '', 'g');
  IF d = '' THEN
    RETURN NULL;
  END IF;

  IF d ~ '^86[1][3-9]\d{9}$' THEN
    RETURN d; -- 8613xxxxxxxxx
  END IF;

  IF d ~ '^086[1][3-9]\d{9}$' THEN
    RETURN substr(d, 2);
  END IF;

  IF d ~ '^0[1][3-9]\d{9}$' THEN
    RETURN '86' || substr(d, 2);
  END IF;

  IF d ~ '^[1][3-9]\d{9}$' THEN
    RETURN '86' || d;
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_user_profile()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_phone text;
  v_mobile_key text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT u.email, u.phone INTO v_email, v_phone
  FROM auth.users u WHERE u.id = v_uid;

  v_mobile_key := public._normalize_invite_mobile(v_phone);

  INSERT INTO public.user_profiles (user_id, email, mobile, display_name)
  VALUES (
    v_uid,
    public._normalize_invite_email(v_email),
    v_mobile_key,
    coalesce(
      nullif(v_mobile_key, ''),
      split_part(coalesce(v_email, ''), '@', 1),
      'user'
    )
  )
  ON CONFLICT (user_id) DO UPDATE SET
    email = coalesce(excluded.email, public.user_profiles.email),
    mobile = coalesce(excluded.mobile, public.user_profiles.mobile),
    updated_at = now();

  RETURN (
    SELECT to_jsonb(p) FROM public.user_profiles p WHERE p.user_id = v_uid
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_tenant_invite(
  p_tenant_id uuid,
  p_contact_type text,
  p_email text,
  p_mobile text,
  p_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_mobile text;
  v_token text;
  v_hash text;
  v_id uuid;
  v_is_super boolean;
  v_is_owner boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant id is required';
  END IF;

  IF p_role NOT IN ('owner', 'staff') THEN
    RAISE EXCEPTION 'Role must be owner or staff';
  END IF;

  IF p_contact_type NOT IN ('email', 'mobile') THEN
    RAISE EXCEPTION 'Invalid contact_type';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = v_uid AND ur.role = 'super_admin'
  ) INTO v_is_super;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = v_uid AND ur.tenant_id = p_tenant_id AND ur.role = 'owner'
  ) INTO v_is_owner;

  IF p_role = 'owner' AND NOT v_is_super THEN
    RAISE EXCEPTION 'Only super_admin can create owner invites';
  END IF;

  IF p_role = 'staff' AND NOT (v_is_owner OR v_is_super) THEN
    RAISE EXCEPTION 'Only owner can create staff invites';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = p_tenant_id) THEN
    RAISE EXCEPTION 'Tenant not found';
  END IF;

  v_email := NULL;
  v_mobile := NULL;
  IF p_contact_type = 'email' THEN
    v_email := public._normalize_invite_email(p_email);
    IF v_email IS NULL THEN
      RAISE EXCEPTION 'Email is required';
    END IF;
  ELSE
    v_mobile := public._normalize_invite_mobile(p_mobile);
    IF v_mobile IS NULL THEN
      RAISE EXCEPTION 'Invalid China mobile number';
    END IF;
  END IF;

  UPDATE public.tenant_invites
  SET revoked_at = now()
  WHERE tenant_id = p_tenant_id
    AND role = p_role
    AND revoked_at IS NULL
    AND accepted_at IS NULL
    AND (
      (p_contact_type = 'email' AND lower(email) = v_email)
      OR (p_contact_type = 'mobile' AND mobile = v_mobile)
    );

  v_token := public._new_invite_token();
  v_hash := public._hash_invite_token(v_token);

  INSERT INTO public.tenant_invites (
    tenant_id, contact_type, email, mobile, role, token_hash, invited_by, expires_at
  ) VALUES (
    p_tenant_id, p_contact_type, v_email, v_mobile, p_role, v_hash, v_uid, now() + interval '7 days'
  )
  RETURNING id INTO v_id;

  IF p_role = 'owner' THEN
    UPDATE public.tenants
    SET onboarding_status = CASE
      WHEN onboarding_status IN ('public_live', 'setup_in_progress', 'ready_for_review')
        THEN onboarding_status
      ELSE 'pending_owner_claim'
    END
    WHERE id = p_tenant_id;
  END IF;

  PERFORM public._audit_log(
    p_tenant_id,
    CASE WHEN p_role = 'owner' THEN 'owner_invite_created' ELSE 'staff_invite_created' END,
    'tenant_invite',
    v_id,
    NULL,
    jsonb_build_object(
      'contact_type', p_contact_type,
      'email', v_email,
      'mobile', v_mobile,
      'role', p_role
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'invite_id', v_id,
    'raw_token', v_token,
    'expires_at', (now() + interval '7 days'),
    'role', p_role,
    'contact_type', p_contact_type,
    'email', v_email,
    'mobile', v_mobile
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_tenant_invite(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_phone text;
  v_mobile_key text;
  v_hash text;
  v_inv public.tenant_invites%ROWTYPE;
  v_tenant public.tenants%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF nullif(trim(p_token), '') IS NULL THEN
    RAISE EXCEPTION 'Invite code is required';
  END IF;

  PERFORM public.ensure_user_profile();

  SELECT
    public._normalize_invite_email(u.email),
    u.phone
  INTO v_email, v_phone
  FROM auth.users u WHERE u.id = v_uid;

  v_mobile_key := public._normalize_invite_mobile(v_phone);

  v_hash := public._hash_invite_token(upper(trim(p_token)));

  SELECT * INTO v_inv
  FROM public.tenant_invites
  WHERE token_hash = v_hash
  LIMIT 1;

  IF v_inv.id IS NULL THEN
    v_hash := public._hash_invite_token(trim(p_token));
    SELECT * INTO v_inv FROM public.tenant_invites WHERE token_hash = v_hash LIMIT 1;
  END IF;

  IF v_inv.id IS NULL THEN
    RAISE EXCEPTION 'Invalid invite code';
  END IF;

  IF v_inv.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'Invite has been revoked';
  END IF;

  IF v_inv.accepted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Invite already used';
  END IF;

  IF v_inv.expires_at < now() THEN
    RAISE EXCEPTION 'Invite has expired';
  END IF;

  IF v_inv.contact_type = 'email' THEN
    IF v_email IS NULL OR v_email <> v_inv.email THEN
      RAISE EXCEPTION 'Invite email does not match your account';
    END IF;
  ELSIF v_inv.contact_type = 'mobile' THEN
    IF v_mobile_key IS NULL OR v_mobile_key <> v_inv.mobile THEN
      RAISE EXCEPTION 'Invite mobile does not match your account';
    END IF;
  ELSE
    RAISE EXCEPTION 'Invalid invite contact type';
  END IF;

  SELECT * INTO v_tenant FROM public.tenants WHERE id = v_inv.tenant_id;
  IF v_tenant.id IS NULL THEN
    RAISE EXCEPTION 'Tenant not found';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = v_uid AND ur.tenant_id = v_inv.tenant_id
  ) THEN
    UPDATE public.tenant_invites
    SET accepted_at = now(), accepted_by = v_uid
    WHERE id = v_inv.id AND accepted_at IS NULL;
  ELSE
    IF v_inv.role = 'owner' AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.tenant_id = v_inv.tenant_id AND ur.role = 'owner'
    ) THEN
      RAISE EXCEPTION 'This bar already has an owner';
    END IF;

    INSERT INTO public.user_roles (user_id, tenant_id, role)
    VALUES (v_uid, v_inv.tenant_id, v_inv.role);

    UPDATE public.tenant_invites
    SET accepted_at = now(), accepted_by = v_uid
    WHERE id = v_inv.id;
  END IF;

  IF v_inv.role = 'owner' THEN
    UPDATE public.tenants
    SET
      owner_claimed_at = coalesce(owner_claimed_at, now()),
      onboarding_status = CASE
        WHEN onboarding_status = 'public_live' THEN 'public_live'
        ELSE 'setup_in_progress'
      END
    WHERE id = v_inv.tenant_id;
  END IF;

  PERFORM public._audit_log(
    v_inv.tenant_id,
    'invite_accepted',
    'tenant_invite',
    v_inv.id,
    NULL,
    jsonb_build_object('role', v_inv.role, 'user_id', v_uid)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'tenant_id', v_inv.tenant_id,
    'role', v_inv.role,
    'tenant_name', coalesce(v_tenant.display_name, v_tenant.name)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public._normalize_invite_mobile(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_user_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_tenant_invite(uuid, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_tenant_invite(text) TO authenticated;
