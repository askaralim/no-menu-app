-- The city admin list was replaced additively in the i18n migration. Remove
-- Supabase's explicit anonymous default while preserving authenticated access.

REVOKE ALL ON FUNCTION public.admin_list_taplist_cities()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_taplist_cities()
  TO authenticated;
