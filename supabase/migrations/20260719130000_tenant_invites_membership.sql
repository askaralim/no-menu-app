-- Phase 1a: user profiles, tenant invites (email bridge), onboarding_status,
-- narrow audit log, and membership RPCs. Account creation is email+password
-- in the app; invite accept requires authenticated email match.

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.user_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  mobile text UNIQUE,
  display_name text,
  avatar_url text,
  email text,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_email
  ON public.user_profiles (lower(email));

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS onboarding_status text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS owner_claimed_at timestamptz NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tenants_onboarding_status_check'
  ) THEN
    ALTER TABLE public.tenants
      ADD CONSTRAINT tenants_onboarding_status_check
      CHECK (onboarding_status IN (
        'draft',
        'pending_owner_claim',
        'setup_in_progress',
        'ready_for_review',
        'public_live',
        'suspended'
      ));
  END IF;
END $$;

-- Existing live bars: treat as setup/public based on visibility.
UPDATE public.tenants
SET onboarding_status = CASE
  WHEN is_public_visible THEN 'public_live'
  WHEN EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.tenant_id = tenants.id AND ur.role = 'owner'
  ) THEN 'setup_in_progress'
  ELSE 'draft'
END
WHERE onboarding_status = 'draft';

CREATE TABLE IF NOT EXISTS public.tenant_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  contact_type text NOT NULL CHECK (contact_type IN ('email', 'mobile')),
  email text NULL,
  mobile text NULL,
  role text NOT NULL CHECK (role IN ('owner', 'manager', 'staff')),
  token_hash text NOT NULL UNIQUE,
  invited_by uuid NULL REFERENCES auth.users(id),
  expires_at timestamptz NOT NULL,
  accepted_by uuid NULL REFERENCES auth.users(id),
  accepted_at timestamptz NULL,
  revoked_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_invites_contact_match CHECK (
    (contact_type = 'email' AND email IS NOT NULL AND mobile IS NULL)
    OR (contact_type = 'mobile' AND mobile IS NOT NULL AND email IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_invites_pending_email
  ON public.tenant_invites (tenant_id, role, lower(email))
  WHERE revoked_at IS NULL AND accepted_at IS NULL AND contact_type = 'email';

CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_invites_pending_mobile
  ON public.tenant_invites (tenant_id, role, mobile)
  WHERE revoked_at IS NULL AND accepted_at IS NULL AND contact_type = 'mobile';

CREATE INDEX IF NOT EXISTS idx_tenant_invites_tenant
  ON public.tenant_invites (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NULL REFERENCES public.tenants(id) ON DELETE SET NULL,
  actor_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  entity_type text NULL,
  entity_id uuid NULL,
  before jsonb NULL,
  after jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_events_tenant_created
  ON public.audit_events (tenant_id, created_at DESC);

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_profiles_self ON public.user_profiles;
CREATE POLICY user_profiles_self ON public.user_profiles
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS user_profiles_super_admin ON public.user_profiles;
CREATE POLICY user_profiles_super_admin ON public.user_profiles
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'super_admin'
    )
  );

-- Invites / audit are RPC-only (no broad client policies).
DROP POLICY IF EXISTS tenant_invites_no_direct ON public.tenant_invites;
CREATE POLICY tenant_invites_no_direct ON public.tenant_invites
  FOR ALL TO authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS audit_events_no_direct ON public.audit_events;
CREATE POLICY audit_events_no_direct ON public.audit_events
  FOR ALL TO authenticated
  USING (false)
  WITH CHECK (false);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._audit_log(
  p_tenant_id uuid,
  p_event_type text,
  p_entity_type text,
  p_entity_id uuid,
  p_before jsonb,
  p_after jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_events (
    tenant_id, actor_user_id, event_type, entity_type, entity_id, before, after
  ) VALUES (
    p_tenant_id, auth.uid(), p_event_type, p_entity_type, p_entity_id, p_before, p_after
  );
END;
$$;

CREATE OR REPLACE FUNCTION public._normalize_invite_email(p_email text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT nullif(lower(trim(p_email)), '');
$$;

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
  -- 10 hex chars, suitable for paste codes.
  -- pgcrypto lives in extensions; callers often SET search_path = public only.
  SELECT upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 10));
$$;

-- ---------------------------------------------------------------------------
-- ensure_user_profile
-- ---------------------------------------------------------------------------

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
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT u.email, u.phone INTO v_email, v_phone
  FROM auth.users u WHERE u.id = v_uid;

  INSERT INTO public.user_profiles (user_id, email, mobile, display_name)
  VALUES (
    v_uid,
    public._normalize_invite_email(v_email),
    nullif(trim(coalesce(v_phone, '')), ''),
    split_part(coalesce(v_email, ''), '@', 1)
  )
  ON CONFLICT (user_id) DO UPDATE SET
    email = coalesce(excluded.email, public.user_profiles.email),
    mobile = coalesce(public.user_profiles.mobile, excluded.mobile),
    updated_at = now();

  RETURN (
    SELECT to_jsonb(p) FROM public.user_profiles p WHERE p.user_id = v_uid
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_user_profile() TO authenticated;

-- ---------------------------------------------------------------------------
-- get_my_tenants
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_my_tenants()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  PERFORM public.ensure_user_profile();

  RETURN coalesce((
    SELECT jsonb_agg(
      jsonb_build_object(
        'tenant_id', t.id,
        'name', t.name,
        'display_name', t.display_name,
        'slug', t.slug,
        'role', ur.role,
        'status', t.status,
        'onboarding_status', t.onboarding_status,
        'is_public_visible', t.is_public_visible
      )
      ORDER BY
        CASE ur.role WHEN 'super_admin' THEN 0 WHEN 'owner' THEN 1 ELSE 2 END,
        t.name
    )
    FROM public.user_roles ur
    JOIN public.tenants t ON t.id = ur.tenant_id
    WHERE ur.user_id = v_uid
      AND ur.role IN ('owner', 'staff', 'super_admin')
      AND coalesce(t.slug, '') <> '__platform__'
  ), '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_tenants() TO authenticated;

-- ---------------------------------------------------------------------------
-- create_tenant_invite
-- Returns raw_token once (never stored in plaintext).
-- ---------------------------------------------------------------------------

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
    v_mobile := nullif(trim(p_mobile), '');
    IF v_mobile IS NULL THEN
      RAISE EXCEPTION 'Mobile is required';
    END IF;
  END IF;

  -- Revoke prior pending invite for same tenant/role/contact.
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

GRANT EXECUTE ON FUNCTION public.create_tenant_invite(uuid, text, text, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- accept_tenant_invite
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.accept_tenant_invite(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
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

  SELECT public._normalize_invite_email(u.email) INTO v_email
  FROM auth.users u WHERE u.id = v_uid;

  v_hash := public._hash_invite_token(upper(trim(p_token)));

  SELECT * INTO v_inv
  FROM public.tenant_invites
  WHERE token_hash = v_hash
  LIMIT 1;

  IF v_inv.id IS NULL THEN
    -- Also try raw (case-sensitive) hash for deep-link tokens.
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
  ELSE
    RAISE EXCEPTION 'Mobile invites are not enabled yet';
  END IF;

  SELECT * INTO v_tenant FROM public.tenants WHERE id = v_inv.tenant_id;
  IF v_tenant.id IS NULL THEN
    RAISE EXCEPTION 'Tenant not found';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = v_uid AND ur.tenant_id = v_inv.tenant_id
  ) THEN
    -- Already a member: mark invite accepted and return.
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

GRANT EXECUTE ON FUNCTION public.accept_tenant_invite(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- revoke / list invites
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.revoke_tenant_invite(p_invite_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv public.tenant_invites%ROWTYPE;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_inv FROM public.tenant_invites WHERE id = p_invite_id;
  IF v_inv.id IS NULL THEN
    RAISE EXCEPTION 'Invite not found';
  END IF;

  IF NOT (
    public.taplist_is_tenant_owner(v_inv.tenant_id)
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = v_uid AND ur.role = 'super_admin'
    )
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF v_inv.role = 'owner' AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = v_uid AND ur.role = 'super_admin'
  ) THEN
    RAISE EXCEPTION 'Only super_admin can revoke owner invites';
  END IF;

  UPDATE public.tenant_invites
  SET revoked_at = now()
  WHERE id = p_invite_id AND revoked_at IS NULL AND accepted_at IS NULL;

  PERFORM public._audit_log(
    v_inv.tenant_id, 'invite_revoked', 'tenant_invite', p_invite_id, NULL, NULL
  );

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.revoke_tenant_invite(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_tenant_invites(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT (
    public.taplist_is_tenant_owner(p_tenant_id)
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = v_uid AND ur.role = 'super_admin'
    )
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  RETURN coalesce((
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', i.id,
        'contact_type', i.contact_type,
        'email', i.email,
        'mobile', i.mobile,
        'role', i.role,
        'expires_at', i.expires_at,
        'accepted_at', i.accepted_at,
        'revoked_at', i.revoked_at,
        'created_at', i.created_at,
        'status', CASE
          WHEN i.accepted_at IS NOT NULL THEN 'accepted'
          WHEN i.revoked_at IS NOT NULL THEN 'revoked'
          WHEN i.expires_at < now() THEN 'expired'
          ELSE 'pending'
        END
      )
      ORDER BY i.created_at DESC
    )
    FROM public.tenant_invites i
    WHERE i.tenant_id = p_tenant_id
  ), '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_tenant_invites(uuid) TO authenticated;

-- Wire publish/unpublish into onboarding_status + audit (extends Phase 0).
CREATE OR REPLACE FUNCTION public.set_tenant_public_visibility(
  p_tenant_id uuid,
  p_visible boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ready jsonb;
  v_before boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.taplist_is_tenant_owner(p_tenant_id) THEN
    RAISE EXCEPTION 'Forbidden: only owner can publish or unpublish the storefront';
  END IF;

  SELECT is_public_visible INTO v_before FROM public.tenants WHERE id = p_tenant_id;

  IF p_visible THEN
    v_ready := public.get_tenant_publish_readiness(p_tenant_id);
    IF NOT coalesce((v_ready->>'ok')::boolean, false) THEN
      RAISE EXCEPTION 'Publish blocked: %', coalesce(v_ready->>'errors', '[]');
    END IF;

    UPDATE public.tenants
    SET
      is_public_visible = true,
      onboarding_status = 'public_live',
      last_menu_updated_at = now()
    WHERE id = p_tenant_id;

    PERFORM public._audit_log(
      p_tenant_id, 'tenant_published', 'tenant', p_tenant_id,
      jsonb_build_object('is_public_visible', v_before),
      jsonb_build_object('is_public_visible', true)
    );
  ELSE
    UPDATE public.tenants
    SET
      is_public_visible = false,
      onboarding_status = CASE
        WHEN onboarding_status = 'public_live' THEN 'setup_in_progress'
        ELSE onboarding_status
      END,
      last_menu_updated_at = now()
    WHERE id = p_tenant_id;

    PERFORM public._audit_log(
      p_tenant_id, 'tenant_unpublished', 'tenant', p_tenant_id,
      jsonb_build_object('is_public_visible', v_before),
      jsonb_build_object('is_public_visible', false)
    );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_tenant_public_visibility(uuid, boolean) TO authenticated;
