-- Lock down invite/auth helper RPCs: only definer functions / service_role should call them.
-- Critical helpers were already revoked in earlier migrations; this makes the full set idempotent
-- and closes _normalize_invite_mobile which was still EXECUTE-able by anon.

REVOKE ALL ON FUNCTION public._new_invite_token() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._hash_invite_token(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._normalize_invite_mobile(text) FROM PUBLIC, anon, authenticated;

-- Current 3-arg overload (staff invite always resets temp password)
REVOKE ALL ON FUNCTION public._provision_owner_login_user(text, text, boolean) FROM PUBLIC, anon, authenticated;

-- Older 2-arg overload if it still exists on some environments
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = '_provision_owner_login_user'
      AND pg_get_function_identity_arguments(p.oid) = 'p_mobile_key text, p_password text'
  ) THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public._provision_owner_login_user(text, text) FROM PUBLIC, anon, authenticated';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = '_auth_user_mobile_key'
      AND pg_get_function_identity_arguments(p.oid) = 'uuid'
  ) THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public._auth_user_mobile_key(uuid) FROM PUBLIC, anon, authenticated';
  END IF;
END
$$;

-- Public invite RPCs stay available to logged-in clients
GRANT EXECUTE ON FUNCTION public.create_tenant_invite(uuid, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_tenant_invite(text) TO authenticated;
