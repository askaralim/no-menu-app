-- ========================================================
-- Grant EXECUTE on SaaS RPCs to authenticated (and anon where needed)
-- Run once in Supabase SQL Editor if /admin/platform returns empty and
-- browser network tab shows RPC errors like "permission denied for function"
--
-- PostgREST only exposes RPCs the database role may execute.
-- ========================================================

GRANT EXECUTE ON FUNCTION public.register_bar(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_staff_member(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_staff_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_staff() TO authenticated;

GRANT EXECUTE ON FUNCTION public.admin_list_tenants() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_tenant_status(uuid, text) TO authenticated;
