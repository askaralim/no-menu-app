-- Supabase default function privileges can grant anon explicitly. Keep the
-- super-admin maintenance endpoints completely unavailable to anonymous users.

REVOKE ALL ON FUNCTION public.admin_set_drink_company_i18n(uuid, text, text)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_taplist_city_i18n(text, text, text, text, text)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_set_drink_company_i18n(uuid, text, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_taplist_city_i18n(text, text, text, text, text)
  TO authenticated;
