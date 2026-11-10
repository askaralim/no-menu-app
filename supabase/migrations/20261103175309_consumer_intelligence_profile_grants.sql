-- Supabase default privileges can grant roles directly, independently of PUBLIC.
-- Profile RPCs are authenticated-only; their auth.uid() guard remains in place.
REVOKE ALL ON FUNCTION public.ci_get_profile_v1() FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.ci_patch_profile_v1(jsonb) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.ci_get_profile_v1() TO authenticated;
GRANT EXECUTE ON FUNCTION public.ci_patch_profile_v1(jsonb) TO authenticated;
