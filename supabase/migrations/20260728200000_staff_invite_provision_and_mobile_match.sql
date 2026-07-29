-- Complete staff invite loop for POS phone+password accounts:
-- 1) Resolve invite mobile from phone / user_metadata / owners.nomenu.app email
-- 2) Provision staff auth user when owner creates a mobile staff invite
-- 3) Accept invite matches the same resolved mobile key

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public._hash_invite_token(p_token text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions
AS $$
  SELECT encode(digest(p_token, 'sha256'), 'hex');
$$;

CREATE OR REPLACE FUNCTION public._new_invite_token()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = public, extensions
AS $$
  SELECT upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 10));
$$;

CREATE OR REPLACE FUNCTION public._auth_user_mobile_key(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_phone text;
  v_email text;
  v_meta jsonb;
  v_key text;
  v_local text;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT u.phone, u.email, u.raw_user_meta_data
  INTO v_phone, v_email, v_meta
  FROM auth.users u
  WHERE u.id = p_user_id;

  v_key := public._normalize_invite_mobile(v_phone);
  IF v_key IS NOT NULL THEN
    RETURN v_key;
  END IF;

  v_key := public._normalize_invite_mobile(coalesce(v_meta->>'mobile', ''));
  IF v_key IS NOT NULL THEN
    RETURN v_key;
  END IF;

  v_key := public._normalize_invite_mobile(coalesce(v_meta->>'national_mobile', ''));
  IF v_key IS NOT NULL THEN
    RETURN v_key;
  END IF;

  IF v_email IS NOT NULL AND lower(v_email) LIKE '%@owners.nomenu.app' THEN
    v_local := split_part(lower(v_email), '@', 1);
    v_key := public._normalize_invite_mobile(v_local);
    IF v_key IS NOT NULL THEN
      RETURN v_key;
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public._provision_owner_login_user(
  p_mobile_key text,
  p_password text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_national text;
  v_login_email text;
  v_user_id uuid;
  v_created boolean := false;
  v_temp_password text;
  v_phone_e164 text;
BEGIN
  IF p_mobile_key IS NULL OR p_mobile_key !~ '^86[1][3-9]\d{9}$' THEN
    RAISE EXCEPTION 'Invalid China mobile number';
  END IF;

  v_national := substr(p_mobile_key, 3);
  v_login_email := lower(v_national || '@owners.nomenu.app');
  v_phone_e164 := '+' || p_mobile_key;

  SELECT u.id INTO v_user_id
  FROM auth.users u
  WHERE lower(u.email) = v_login_email
  LIMIT 1;

  IF v_user_id IS NULL THEN
    v_temp_password := coalesce(
      nullif(p_password, ''),
      upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8))
    );
    v_user_id := gen_random_uuid();
    v_created := true;

    BEGIN
      INSERT INTO auth.users (
        instance_id,
        id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at,
        confirmation_token,
        recovery_token,
        email_change_token_new,
        email_change,
        phone,
        phone_change,
        phone_change_token,
        email_change_token_current,
        reauthentication_token,
        is_sso_user,
        is_anonymous
      ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        v_user_id,
        'authenticated',
        'authenticated',
        v_login_email,
        crypt(v_temp_password, gen_salt('bf')),
        now(),
        jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
        jsonb_build_object(
          'mobile', p_mobile_key,
          'national_mobile', v_national,
          'must_change_password', true
        ),
        now(),
        now(),
        '',
        '',
        '',
        '',
        v_phone_e164,
        '',
        '',
        '',
        '',
        false,
        false
      );
    EXCEPTION WHEN unique_violation THEN
      -- phone already claimed by another auth row; keep metadata-only identity
      INSERT INTO auth.users (
        instance_id,
        id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at,
        confirmation_token,
        recovery_token,
        email_change_token_new,
        email_change,
        phone,
        phone_change,
        phone_change_token,
        email_change_token_current,
        reauthentication_token,
        is_sso_user,
        is_anonymous
      ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        v_user_id,
        'authenticated',
        'authenticated',
        v_login_email,
        crypt(v_temp_password, gen_salt('bf')),
        now(),
        jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
        jsonb_build_object(
          'mobile', p_mobile_key,
          'national_mobile', v_national,
          'must_change_password', true
        ),
        now(),
        now(),
        '',
        '',
        '',
        '',
        NULL,
        '',
        '',
        '',
        '',
        false,
        false
      );
    END;

    INSERT INTO auth.identities (
      id,
      user_id,
      identity_data,
      provider,
      provider_id,
      last_sign_in_at,
      created_at,
      updated_at
    ) VALUES (
      gen_random_uuid(),
      v_user_id,
      jsonb_build_object(
        'sub', v_user_id::text,
        'email', v_login_email,
        'email_verified', true,
        'phone_verified', false
      ),
      'email',
      v_user_id::text,
      now(),
      now(),
      now()
    );
  ELSE
    -- Backfill metadata so mobile invites can match existing concierge accounts.
    UPDATE auth.users
    SET
      raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
        'mobile', p_mobile_key,
        'national_mobile', v_national
      ),
      updated_at = now()
    WHERE id = v_user_id;

    BEGIN
      UPDATE auth.users
      SET phone = v_phone_e164
      WHERE id = v_user_id
        AND (phone IS NULL OR phone = '');
    EXCEPTION WHEN unique_violation THEN
      NULL;
    END;
  END IF;

  INSERT INTO public.user_profiles (user_id, email, mobile, display_name)
  VALUES (
    v_user_id,
    v_login_email,
    p_mobile_key,
    v_national
  )
  ON CONFLICT (user_id) DO UPDATE SET
    email = coalesce(excluded.email, public.user_profiles.email),
    mobile = coalesce(excluded.mobile, public.user_profiles.mobile),
    updated_at = now();

  RETURN jsonb_build_object(
    'ok', true,
    'created', v_created,
    'user_id', v_user_id,
    'mobile', v_national,
    'mobile_key', p_mobile_key,
    'login_email', v_login_email,
    'temporary_password', v_temp_password
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_user_profile()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_mobile_key text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT public._normalize_invite_email(u.email)
  INTO v_email
  FROM auth.users u WHERE u.id = v_uid;

  v_mobile_key := public._auth_user_mobile_key(v_uid);

  INSERT INTO public.user_profiles (user_id, email, mobile, display_name)
  VALUES (
    v_uid,
    v_email,
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
SET search_path = public, auth, extensions
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
  v_provision jsonb := NULL;
  v_national text;
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

  -- Staff mobile invite: ensure POS login account exists (phone → @owners.nomenu.app).
  IF p_role = 'staff' AND p_contact_type = 'mobile' THEN
    v_provision := public._provision_owner_login_user(v_mobile, NULL);
    v_national := v_provision->>'mobile';
  END IF;

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
      'role', p_role,
      'account_created', coalesce((v_provision->>'created')::boolean, false)
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
    'mobile', coalesce(v_national, v_mobile),
    'account_created', coalesce((v_provision->>'created')::boolean, false),
    'temporary_password', v_provision->>'temporary_password',
    'login_email', v_provision->>'login_email'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_tenant_invite(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
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

  SELECT public._normalize_invite_email(u.email)
  INTO v_email
  FROM auth.users u WHERE u.id = v_uid;

  v_mobile_key := public._auth_user_mobile_key(v_uid);

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

REVOKE ALL ON FUNCTION public._auth_user_mobile_key(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._provision_owner_login_user(text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.ensure_user_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_tenant_invite(uuid, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_tenant_invite(text) TO authenticated;
