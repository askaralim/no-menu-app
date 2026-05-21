-- POS / staff: scope categories & drinks SELECT to current tenant (drop public read)

DROP POLICY IF EXISTS "Categories are viewable by everyone" ON public.categories;
DROP POLICY IF EXISTS "Drinks are viewable by everyone" ON public.drinks;

DROP POLICY IF EXISTS "Categories viewable by tenant staff" ON public.categories;
CREATE POLICY "Categories viewable by tenant staff" ON public.categories
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_auth_tenant_id());

DROP POLICY IF EXISTS "Drinks viewable by tenant staff" ON public.drinks;
CREATE POLICY "Drinks viewable by tenant staff" ON public.drinks
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_auth_tenant_id());
