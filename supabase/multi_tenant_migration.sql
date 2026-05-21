-- ========================================================
-- MULTI-TENANT MIGRATION SCRIPT
-- Run this in your Supabase SQL Editor
-- ========================================================

-- 1. Create Tenants Table
CREATE TABLE public.tenants (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

-- Insert a default tenant to map existing data
INSERT INTO public.tenants (id, name, slug) 
VALUES ('00000000-0000-0000-0000-000000000001', '226', '226')
ON CONFLICT DO NOTHING;

-- 2. Create User Roles Table
-- Maps Supabase Auth users to a specific tenant
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'staff')),
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(user_id, tenant_id)
);

-- 3. Add tenant_id to all existing tables
-- Categories
ALTER TABLE public.categories 
ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000001';

-- Drinks
ALTER TABLE public.drinks 
ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000001';

-- Settings
ALTER TABLE public.settings 
ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000001';

-- Business Days
ALTER TABLE public.business_days 
ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000001';

-- Orders
ALTER TABLE public.orders 
ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000001';

-- Order Items
ALTER TABLE public.order_items 
ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000001';

-- Fix business_days unique constraint: allow each tenant to have its own business day per date
ALTER TABLE public.business_days DROP CONSTRAINT IF EXISTS business_days_business_date_key;
ALTER TABLE public.business_days ADD CONSTRAINT business_days_business_date_tenant_key UNIQUE (business_date, tenant_id);

-- Remove default constraints so future rows require explicit tenant_id (optional but recommended)
ALTER TABLE public.categories ALTER COLUMN tenant_id DROP DEFAULT;
ALTER TABLE public.drinks ALTER COLUMN tenant_id DROP DEFAULT;
ALTER TABLE public.settings ALTER COLUMN tenant_id DROP DEFAULT;
ALTER TABLE public.business_days ALTER COLUMN tenant_id DROP DEFAULT;
ALTER TABLE public.orders ALTER COLUMN tenant_id DROP DEFAULT;
ALTER TABLE public.order_items ALTER COLUMN tenant_id DROP DEFAULT;

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drinks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- 5. Helper Function to get current user's tenant_id
CREATE OR REPLACE FUNCTION public.get_auth_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT tenant_id FROM public.user_roles 
  WHERE user_id = auth.uid() 
  LIMIT 1;
$$;

-- 6. RLS Policies
-- Tenants: readable by their own users; slug lookup allowed for display page
CREATE POLICY "Tenants are viewable by their users" ON public.tenants
  FOR SELECT USING (true);

-- User Roles: Users can see their own roles
CREATE POLICY "Users can view their own roles" ON public.user_roles
  FOR SELECT USING (user_id = auth.uid());

-- Categories: public SELECT needed for unauthenticated display page (app/display/page.tsx)
CREATE POLICY "Categories are viewable by everyone" ON public.categories FOR SELECT USING (true);
CREATE POLICY "Categories editable by tenant staff" ON public.categories FOR ALL USING (tenant_id = public.get_auth_tenant_id());

-- Drinks: public SELECT needed for unauthenticated display page (app/display/page.tsx)
CREATE POLICY "Drinks are viewable by everyone" ON public.drinks FOR SELECT USING (true);
CREATE POLICY "Drinks editable by tenant staff" ON public.drinks FOR ALL USING (tenant_id = public.get_auth_tenant_id());

-- Settings: public SELECT needed for unauthenticated display page (app/display/page.tsx)
CREATE POLICY "Settings are viewable by everyone" ON public.settings FOR SELECT USING (true);
CREATE POLICY "Settings editable by tenant staff" ON public.settings FOR ALL USING (tenant_id = public.get_auth_tenant_id());

-- Business Days: drop old non-tenant-scoped policies from business_days_schema.sql
DROP POLICY IF EXISTS "Allow public read access" ON public.business_days;
DROP POLICY IF EXISTS "Allow authenticated insert access" ON public.business_days;
DROP POLICY IF EXISTS "Allow authenticated update access" ON public.business_days;
DROP POLICY IF EXISTS "Allow authenticated delete access" ON public.business_days;

-- Business Days: tenant-scoped SELECT, writes by tenant staff
CREATE POLICY "Business days viewable by tenant" ON public.business_days FOR SELECT USING (tenant_id = public.get_auth_tenant_id());
CREATE POLICY "Business days editable by tenant staff" ON public.business_days FOR ALL USING (tenant_id = public.get_auth_tenant_id());

-- Orders: fully tenant-scoped (SELECT, INSERT, UPDATE, DELETE)
CREATE POLICY "Orders viewable by tenant staff" ON public.orders FOR SELECT USING (tenant_id = public.get_auth_tenant_id());
CREATE POLICY "Orders insertable by tenant staff" ON public.orders FOR INSERT WITH CHECK (tenant_id = public.get_auth_tenant_id());
CREATE POLICY "Orders editable by tenant staff" ON public.orders FOR UPDATE USING (tenant_id = public.get_auth_tenant_id());
CREATE POLICY "Orders deletable by tenant staff" ON public.orders FOR DELETE USING (tenant_id = public.get_auth_tenant_id());

-- Order Items: fully tenant-scoped (SELECT, INSERT, UPDATE, DELETE)
CREATE POLICY "Order items viewable by tenant staff" ON public.order_items FOR SELECT USING (tenant_id = public.get_auth_tenant_id());
CREATE POLICY "Order items insertable by tenant staff" ON public.order_items FOR INSERT WITH CHECK (tenant_id = public.get_auth_tenant_id());
CREATE POLICY "Order items editable by tenant staff" ON public.order_items FOR UPDATE USING (tenant_id = public.get_auth_tenant_id());
CREATE POLICY "Order items deletable by tenant staff" ON public.order_items FOR DELETE USING (tenant_id = public.get_auth_tenant_id());
