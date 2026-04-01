-- ========================================================
-- SAAS MULTI-TENANT MIGRATION
-- Adds: super_admin role, bar registration, staff management,
--        platform admin functions
-- Run this in your Supabase SQL Editor AFTER the existing
-- multi_tenant_migration.sql and apply_tenant_fixes.sql
-- ========================================================

-- --------------------------------------------------------
-- 1. Allow super_admin role in user_roles
-- --------------------------------------------------------
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_role_check;
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_role_check
  CHECK (role IN ('owner', 'staff', 'super_admin'));

-- --------------------------------------------------------
-- 2. Add status column to tenants for suspend/activate
-- --------------------------------------------------------
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended'));

-- --------------------------------------------------------
-- 3. Bar registration RPC
--    Called after supabase.auth.signUp() succeeds
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.register_bar(
  bar_name text,
  bar_slug text
)
RETURNS uuid
SECURITY DEFINER
AS $$
DECLARE
  new_tenant_id uuid;
  current_user_id uuid;
BEGIN
  current_user_id := auth.uid();
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = current_user_id) THEN
    RAISE EXCEPTION 'User already belongs to a bar';
  END IF;

  IF EXISTS (SELECT 1 FROM public.tenants WHERE slug = bar_slug) THEN
    RAISE EXCEPTION 'This slug is already taken';
  END IF;

  IF length(bar_slug) < 2 OR bar_slug !~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$' THEN
    RAISE EXCEPTION 'Slug must be 2+ lowercase letters/numbers/hyphens, no leading/trailing hyphens';
  END IF;

  INSERT INTO public.tenants (name, slug)
  VALUES (bar_name, bar_slug)
  RETURNING id INTO new_tenant_id;

  INSERT INTO public.user_roles (user_id, tenant_id, role)
  VALUES (current_user_id, new_tenant_id, 'owner');

  INSERT INTO public.settings (theme, auto_refresh, refresh_interval, tenant_id)
  VALUES ('dark', true, 3600, new_tenant_id);

  RETURN new_tenant_id;
END;
$$ LANGUAGE plpgsql;

-- --------------------------------------------------------
-- 4. Staff management RPCs (owner only)
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_staff_member(staff_email text)
RETURNS boolean
SECURITY DEFINER
AS $$
DECLARE
  current_tenant_id uuid;
  current_role text;
  target_user_id uuid;
BEGIN
  SELECT ur.tenant_id, ur.role INTO current_tenant_id, current_role
  FROM public.user_roles ur
  WHERE ur.user_id = auth.uid()
  LIMIT 1;

  IF current_role NOT IN ('owner', 'super_admin') THEN
    RAISE EXCEPTION 'Only owners can add staff';
  END IF;

  SELECT id INTO target_user_id
  FROM auth.users
  WHERE email = staff_email;

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'User not found. They must create an account first.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = target_user_id AND tenant_id = current_tenant_id
  ) THEN
    RAISE EXCEPTION 'User is already a member of this bar';
  END IF;

  INSERT INTO public.user_roles (user_id, tenant_id, role)
  VALUES (target_user_id, current_tenant_id, 'staff');

  RETURN true;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.remove_staff_member(staff_user_id uuid)
RETURNS boolean
SECURITY DEFINER
AS $$
DECLARE
  current_tenant_id uuid;
  current_role text;
BEGIN
  SELECT ur.tenant_id, ur.role INTO current_tenant_id, current_role
  FROM public.user_roles ur
  WHERE ur.user_id = auth.uid()
  LIMIT 1;

  IF current_role NOT IN ('owner', 'super_admin') THEN
    RAISE EXCEPTION 'Only owners can remove staff';
  END IF;

  DELETE FROM public.user_roles
  WHERE user_id = staff_user_id
    AND tenant_id = current_tenant_id
    AND role = 'staff';

  RETURN found;
END;
$$ LANGUAGE plpgsql;

-- --------------------------------------------------------
-- 5. List staff for current tenant (owner view)
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_staff()
RETURNS TABLE (
  user_id uuid,
  email text,
  role text,
  created_at timestamptz
)
SECURITY DEFINER
AS $$
DECLARE
  current_tenant_id uuid;
BEGIN
  SELECT ur.tenant_id INTO current_tenant_id
  FROM public.user_roles ur
  WHERE ur.user_id = auth.uid()
  LIMIT 1;

  RETURN QUERY
  SELECT
    ur.user_id,
    u.email,
    ur.role,
    ur.created_at
  FROM public.user_roles ur
  JOIN auth.users u ON u.id = ur.user_id
  WHERE ur.tenant_id = current_tenant_id
  ORDER BY ur.created_at ASC;
END;
$$ LANGUAGE plpgsql;

-- --------------------------------------------------------
-- 6. Platform admin RPCs (super_admin only)
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_list_tenants()
RETURNS TABLE (
  id uuid,
  name text,
  slug text,
  status text,
  created_at timestamptz,
  owner_email text,
  staff_count bigint
)
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'super_admin'
  ) THEN
    RAISE EXCEPTION 'Unauthorized: super_admin role required';
  END IF;

  RETURN QUERY
  SELECT
    t.id,
    t.name,
    t.slug,
    t.status,
    t.created_at,
    (SELECT u.email FROM auth.users u
     JOIN public.user_roles ur ON ur.user_id = u.id
     WHERE ur.tenant_id = t.id AND ur.role = 'owner'
     LIMIT 1) as owner_email,
    (SELECT count(*) FROM public.user_roles ur
     WHERE ur.tenant_id = t.id) as staff_count
  FROM public.tenants t
  ORDER BY t.created_at DESC;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.admin_set_tenant_status(
  target_tenant_id uuid,
  new_status text
)
RETURNS boolean
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'super_admin'
  ) THEN
    RAISE EXCEPTION 'Unauthorized: super_admin role required';
  END IF;

  IF new_status NOT IN ('active', 'suspended') THEN
    RAISE EXCEPTION 'Invalid status. Use active or suspended.';
  END IF;

  UPDATE public.tenants
  SET status = new_status
  WHERE id = target_tenant_id;

  RETURN found;
END;
$$ LANGUAGE plpgsql;
