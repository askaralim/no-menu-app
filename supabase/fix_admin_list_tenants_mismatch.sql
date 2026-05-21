-- ========================================================
-- Fix: "structure of query does not match function result type"
-- when calling admin_list_tenants from /admin/platform
--
-- Run once in Supabase SQL Editor. Re-applies GRANTs after DROP.
-- ========================================================

DROP FUNCTION IF EXISTS public.admin_list_tenants();

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
SET search_path = public
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
    s.tenant_id,
    s.tenant_name,
    s.tenant_slug,
    s.tenant_status,
    s.tenant_created_at,
    s.owner_email,
    s.staff_count
  FROM (
    SELECT
      t.id AS tenant_id,
      t.name::text AS tenant_name,
      t.slug::text AS tenant_slug,
      COALESCE(t.status, 'active'::text)::text AS tenant_status,
      t.created_at::timestamptz AS tenant_created_at,
      (
        SELECT u.email::text
        FROM auth.users u
        JOIN public.user_roles ur ON ur.user_id = u.id
        WHERE ur.tenant_id = t.id AND ur.role = 'owner'
        LIMIT 1
      ) AS owner_email,
      (SELECT count(*)::bigint FROM public.user_roles ur WHERE ur.tenant_id = t.id) AS staff_count
    FROM public.tenants t
    ORDER BY t.created_at DESC NULLS LAST
  ) AS s;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.admin_list_tenants() TO authenticated;
