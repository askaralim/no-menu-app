-- Concierge owner provision for static-export admin (no Next.js API routes).
-- Creates/updates auth user (phone → 1xxxxxxxxxx@owners.nomenu.app) and binds owner role.

CREATE OR REPLACE FUNCTION public.admin_provision_owner(
  p_tenant_id uuid,
  p_mobile text,
  p_password text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_mobile text;
  v_national text;
  v_login_email text;
  v_user_id uuid;
  v_created boolean := false;
  v_bind jsonb;
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

  IF p_password IS NULL OR length(p_password) < 6 THEN
    RAISE EXCEPTION 'Password must be at least 6 characters';
  END IF;

  v_mobile := public._normalize_invite_mobile(p_mobile);
  IF v_mobile IS NULL THEN
    RAISE EXCEPTION 'Invalid China mobile number';
  END IF;

  -- 8613800138000 → 13800138000@owners.nomenu.app
  IF length(v_mobile) = 13 AND left(v_mobile, 2) = '86' THEN
    v_national := substr(v_mobile, 3);
  ELSE
    v_national := right(v_mobile, 11);
  END IF;

  IF v_national !~ '^1[3-9][0-9]{9}$' THEN
    RAISE EXCEPTION 'Invalid China mobile number';
  END IF;

  v_login_email := lower(v_national || '@owners.nomenu.app');

  SELECT u.id INTO v_user_id
  FROM auth.users u
  WHERE lower(u.email) = v_login_email
  LIMIT 1;

  IF v_user_id IS NULL THEN
    v_user_id := gen_random_uuid();
    v_created := true;

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
      crypt(p_password, gen_salt('bf')),
      now(),
      jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
      jsonb_build_object(
        'mobile', v_mobile,
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
    UPDATE auth.users
    SET
      encrypted_password = crypt(p_password, gen_salt('bf')),
      email_confirmed_at = coalesce(email_confirmed_at, now()),
      raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
        'mobile', v_mobile,
        'national_mobile', v_national,
        'must_change_password', true
      ),
      updated_at = now()
    WHERE id = v_user_id;
  END IF;

  v_bind := public.admin_bind_owner_to_tenant(p_tenant_id, v_user_id, p_mobile);

  RETURN jsonb_build_object(
    'ok', true,
    'created', v_created,
    'password_set', true,
    'user_id', v_user_id,
    'mobile', v_national,
    'login_email', v_login_email,
    'temporary_password', p_password,
    'bind', v_bind
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_provision_owner(uuid, text, text) TO authenticated;
