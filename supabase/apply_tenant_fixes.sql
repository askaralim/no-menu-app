-- ========================================================
-- TENANT ISOLATION FIXES
-- Run this in the Supabase SQL Editor to apply all fixes
-- from the multi-tenant RLS hardening session
-- ========================================================

-- --------------------------------------------------------
-- 1. Fix business_date UNIQUE constraint for multi-tenant
--    Idempotent: safe if multi_tenant_migration.sql already created
--    business_days_business_date_tenant_key
-- --------------------------------------------------------
ALTER TABLE public.business_days DROP CONSTRAINT IF EXISTS business_days_business_date_key;
ALTER TABLE public.business_days DROP CONSTRAINT IF EXISTS business_days_business_date_tenant_key;
ALTER TABLE public.business_days ADD CONSTRAINT business_days_business_date_tenant_key
  UNIQUE (business_date, tenant_id);

-- --------------------------------------------------------
-- 2. Drop old non-tenant-scoped business_days policies
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Allow public read access" ON public.business_days;
DROP POLICY IF EXISTS "Allow authenticated insert access" ON public.business_days;
DROP POLICY IF EXISTS "Allow authenticated update access" ON public.business_days;
DROP POLICY IF EXISTS "Allow authenticated delete access" ON public.business_days;

-- --------------------------------------------------------
-- 3. Ensure tenant-scoped business_days policies
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Business days viewable by tenant" ON public.business_days;
DROP POLICY IF EXISTS "Business days editable by tenant staff" ON public.business_days;
CREATE POLICY "Business days viewable by tenant" ON public.business_days
  FOR SELECT USING (tenant_id = public.get_auth_tenant_id());
CREATE POLICY "Business days editable by tenant staff" ON public.business_days
  FOR ALL USING (tenant_id = public.get_auth_tenant_id());

-- --------------------------------------------------------
-- 4. Fix orders INSERT policy (enforce tenant_id)
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Orders insertable by everyone" ON public.orders;
DROP POLICY IF EXISTS "Orders insertable by tenant staff" ON public.orders;
CREATE POLICY "Orders insertable by tenant staff" ON public.orders
  FOR INSERT WITH CHECK (tenant_id = public.get_auth_tenant_id());

-- --------------------------------------------------------
-- 5. Fix order_items INSERT policy (enforce tenant_id)
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Order items insertable by everyone" ON public.order_items;
DROP POLICY IF EXISTS "Order items insertable by tenant staff" ON public.order_items;
CREATE POLICY "Order items insertable by tenant staff" ON public.order_items
  FOR INSERT WITH CHECK (tenant_id = public.get_auth_tenant_id());

-- --------------------------------------------------------
-- 6. Add DELETE policies for orders and order_items
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Orders deletable by tenant staff" ON public.orders;
CREATE POLICY "Orders deletable by tenant staff" ON public.orders
  FOR DELETE USING (tenant_id = public.get_auth_tenant_id());

DROP POLICY IF EXISTS "Order items deletable by tenant staff" ON public.order_items;
CREATE POLICY "Order items deletable by tenant staff" ON public.order_items
  FOR DELETE USING (tenant_id = public.get_auth_tenant_id());

-- --------------------------------------------------------
-- 7. Allow public slug lookup on tenants (for display page)
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Tenants are viewable by their users" ON public.tenants;
CREATE POLICY "Tenants are viewable by their users" ON public.tenants
  FOR SELECT USING (true);

-- --------------------------------------------------------
-- 8. Update business day RPCs to be tenant-aware
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION get_or_create_open_business_day()
RETURNS uuid
SECURITY DEFINER
AS $$
DECLARE
  business_day_id uuid;
  today_date date;
  current_tenant_id uuid;
BEGIN
  SELECT tenant_id INTO current_tenant_id
  FROM public.user_roles
  WHERE user_id = auth.uid()
  LIMIT 1;

  today_date := (now() AT TIME ZONE 'Asia/Shanghai')::date;

  SELECT id INTO business_day_id
  FROM business_days
  WHERE closed_at IS NULL
    AND tenant_id = current_tenant_id
  ORDER BY opened_at DESC
  LIMIT 1;

  IF business_day_id IS NULL THEN
    INSERT INTO business_days (business_date, opened_at, tenant_id)
    VALUES (today_date, now(), current_tenant_id)
    RETURNING id INTO business_day_id;
  END IF;

  RETURN business_day_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_current_open_business_day()
RETURNS uuid
SECURITY DEFINER
AS $$
DECLARE
  business_day_id uuid;
  current_tenant_id uuid;
BEGIN
  SELECT tenant_id INTO current_tenant_id
  FROM public.user_roles
  WHERE user_id = auth.uid()
  LIMIT 1;

  SELECT id INTO business_day_id
  FROM business_days
  WHERE closed_at IS NULL
    AND tenant_id = current_tenant_id
  ORDER BY opened_at DESC
  LIMIT 1;

  RETURN business_day_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION close_business_day(business_day_id uuid)
RETURNS boolean
SECURITY DEFINER
AS $$
DECLARE
  current_tenant_id uuid;
BEGIN
  SELECT tenant_id INTO current_tenant_id
  FROM public.user_roles
  WHERE user_id = auth.uid()
  LIMIT 1;

  UPDATE business_days
  SET closed_at = now()
  WHERE id = business_day_id
    AND closed_at IS NULL
    AND tenant_id = current_tenant_id;

  RETURN found;
END;
$$ LANGUAGE plpgsql;
