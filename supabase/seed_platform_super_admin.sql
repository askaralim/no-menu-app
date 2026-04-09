-- ========================================================
-- Platform super admin: admin@nomenuapp.com
-- Prerequisites: install_all_in_one.sql applied (schema + SaaS + hardening)
--
-- 1) askar.aalim@gmail.com stays bar OWNER
--    Do nothing if that row already has role = 'owner'.
--    If you previously set super_admin on that user, revert with:
--
--    UPDATE public.user_roles
--    SET role = 'owner'
--    WHERE user_id = (SELECT id FROM auth.users WHERE email = 'askar.aalim@gmail.com');
--
-- 2) Create the auth user (NOT done in this file — use Dashboard or Admin API)
--    Supabase Dashboard → Authentication → Users → Add user
--      Email:    admin@nomenuapp.com
--      Password: (choose a strong password)
--      Auto Confirm User: ON (or confirm via email)
--
-- 3) Run the SQL below in the SQL Editor AFTER the user exists in auth.users
--
-- 4) If /admin/platform shows RPC permission errors, ensure install_all_in_one.sql
--    was run through the final GRANT section (or re-run those GRANTs from that file).
-- ========================================================

-- Dedicated tenant so platform admins are not tied to a real bar's data
INSERT INTO public.tenants (name, slug)
VALUES ('Platform', '__platform__')
ON CONFLICT (slug) DO NOTHING;

-- Link admin@nomenuapp.com as super_admin on the platform tenant only
INSERT INTO public.user_roles (user_id, tenant_id, role)
SELECT u.id, t.id, 'super_admin'
FROM auth.users u
CROSS JOIN public.tenants t
WHERE u.email = 'admin@nomenuapp.com'
  AND t.slug = '__platform__'
ON CONFLICT (user_id, tenant_id) DO UPDATE
SET role = EXCLUDED.role;

-- Verify (expect one row: super_admin + slug __platform__)
SELECT u.email, ur.role, tn.name AS tenant_name, tn.slug
FROM public.user_roles ur
JOIN auth.users u ON u.id = ur.user_id
JOIN public.tenants tn ON tn.id = ur.tenant_id
WHERE u.email = 'admin@nomenuapp.com';
