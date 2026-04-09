-- =====================================================================
-- INSTALL ALL IN ONE (no-menu-app)
--
-- Use case: brand-new Supabase project or empty public schema.
-- Do NOT run on a database that already applied these migrations
-- (duplicate CREATE TABLE / conflicting policies).
--
-- Your current production DB: already up to date — keep this file for
-- onboarding new envs or disaster recovery; prefer pg_dump --schema-only
-- to clone exact production.
--
-- Order: core schema → business_days shell → multi-tenant → fixes → SaaS →
-- admin_list_tenants fix → production hardening → grants.
-- Optional seeds: run seed.sql / seed_platform_super_admin.sql separately.
--
-- This file is the canonical schema; older per-step .sql files were removed from
-- the repo. Section markers (-- --- 01 schema.sql ---) name legacy sources only.
-- =====================================================================

-- --- 01 schema.sql ---
-- 开启 UUID 扩展（如果还没开）
create extension if not exists "uuid-ossp";

-- 分类表：categories
create table public.categories (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  sort_order int default 0,
  enabled boolean default true,
  created_at timestamp with time zone default now()
);

create index idx_categories_sort on categories(sort_order);

-- 酒品表：drinks
create table public.drinks (
  id uuid primary key default uuid_generate_v4(),
  category_id uuid references categories(id) on delete cascade,
  name text not null,
  price numeric(10,2) not null,
  price_unit text default '杯',
  price_bottle numeric(10,2),
  price_unit_bottle text default '瓶',
  sort_order int default 0,
  enabled boolean default true,
  created_at timestamp with time zone default now()
);

create index idx_drinks_category on drinks(category_id);
create index idx_drinks_sort on drinks(sort_order);

-- 系统设置表：settings（单行表）
create table public.settings (
  id uuid primary key default uuid_generate_v4(),
  theme text default 'dark',
  auto_refresh boolean default true,
  refresh_interval int default 3600,
  updated_at timestamp with time zone default now()
);

-- 插入默认设置
insert into settings (theme, auto_refresh, refresh_interval)
values ('dark', true, 3600);

-- 启用 Realtime（需要在 Supabase Dashboard 中配置）
-- 1. 进入 Supabase Dashboard
-- 2. 选择 Database > Replication
-- 3. 为 categories, drinks, settings 表启用 Realtime


-- --- 02 orders_schema.sql ---
-- 订单系统数据库结构
-- 执行此文件来创建订单相关的表

-- 订单表：orders
create table if not exists public.orders (
  id uuid primary key default uuid_generate_v4(),
  customer_name text not null,
  status text not null default 'active' check (status in ('active', 'checked_out', 'finished')),
  order_date date not null default current_date,
  total_amount numeric(10,2) default 0,
  notes text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  checked_out_at timestamp with time zone
);

create index idx_orders_date on orders(order_date);
create index idx_orders_status on orders(status);
create index idx_orders_created on orders(created_at desc);

-- 订单项表：order_items
create table if not exists public.order_items (
  id uuid primary key default uuid_generate_v4(),
  order_id uuid not null references orders(id) on delete cascade,
  drink_id uuid not null references drinks(id) on delete restrict,
  quantity_cup int not null default 0 check (quantity_cup >= 0),
  quantity_bottle int not null default 0 check (quantity_bottle >= 0),
  unit_price_cup numeric(10,2) not null,
  unit_price_bottle numeric(10,2),
  created_at timestamp with time zone default now()
);

create index idx_order_items_order on order_items(order_id);
create index idx_order_items_drink on order_items(drink_id);

-- 自动更新订单的 updated_at 时间戳
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger update_orders_updated_at before update on orders
  for each row execute function update_updated_at_column();

-- 自动计算订单总金额的函数
create or replace function calculate_order_total(order_uuid uuid)
returns numeric as $$
declare
  total numeric;
begin
  select coalesce(sum(
    (quantity_cup * unit_price_cup) + 
    (coalesce(quantity_bottle, 0) * coalesce(unit_price_bottle, 0))
  ), 0)
  into total
  from order_items
  where order_id = order_uuid;
  
  return total;
end;
$$ language plpgsql;

-- 自动更新订单总金额的触发器
create or replace function update_order_total()
returns trigger as $$
begin
  update orders
  set total_amount = calculate_order_total(coalesce(new.order_id, old.order_id))
  where id = coalesce(new.order_id, old.order_id);
  return coalesce(new, old);
end;
$$ language plpgsql;

create trigger update_order_total_on_items
  after insert or update or delete on order_items
  for each row execute function update_order_total();

-- 启用 Realtime（需要在 Supabase Dashboard 中配置）
-- 为 orders 和 order_items 表启用 Realtime


-- --- 03 business_days (table + orders FK + trigger only; was _fragment_business_days_before_multi_tenant.sql) ---
-- Business days: table + link to orders + updated_at trigger only.
-- RPCs and RLS are applied later (apply_tenant_fixes.sql, production_hardening.sql).

CREATE TABLE IF NOT EXISTS public.business_days (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_date date NOT NULL,
  opened_at timestamp with time zone NOT NULL DEFAULT now(),
  closed_at timestamp with time zone,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT business_days_business_date_key UNIQUE (business_date)
);

CREATE INDEX IF NOT EXISTS idx_business_days_date ON public.business_days(business_date DESC);
CREATE INDEX IF NOT EXISTS idx_business_days_opened ON public.business_days(opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_business_days_closed ON public.business_days(closed_at) WHERE closed_at IS NOT NULL;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS business_day_id uuid REFERENCES public.business_days(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_orders_business_day ON public.orders(business_day_id);

DROP TRIGGER IF EXISTS update_business_days_updated_at ON public.business_days;
CREATE TRIGGER update_business_days_updated_at
  BEFORE UPDATE ON public.business_days
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- --- 04 multi_tenant_migration.sql ---
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

-- --- 05 apply_tenant_fixes.sql ---
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

-- --- 06 add_stock_column.sql ---
-- Add stock tracking column to drinks table
-- NULL means stock is not tracked for this drink
-- A numeric value tracks remaining quantity
ALTER TABLE public.drinks ADD COLUMN IF NOT EXISTS stock integer DEFAULT NULL;

-- --- 07 saas_migration.sql ---
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
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'super_admin'
  ) THEN
    RAISE EXCEPTION 'Unauthorized: super_admin role required';
  END IF;

  -- Subquery + explicit casts: avoids "structure of query does not match function result type"
  -- (timestamp vs timestamptz, varchar email, PL/pgSQL OUT-param shadowing).
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

-- --------------------------------------------------------
-- 7. Allow PostgREST / Supabase clients to call RPCs (authenticated JWT)
-- --------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.register_bar(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_staff_member(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_staff_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_tenants() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_tenant_status(uuid, text) TO authenticated;

-- --- 08 fix_admin_list_tenants_mismatch.sql ---
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

-- --- 09 production_hardening.sql (includes SECURITY DEFINER get_auth_tenant_id) ---
-- ========================================================
-- PRODUCTION HARDENING (multi-tenant)
-- Run ONCE in Supabase SQL Editor AFTER:
--   multi_tenant_migration.sql, apply_tenant_fixes.sql, saas_migration.sql
-- Idempotent where possible (CREATE OR REPLACE, DROP POLICY IF EXISTS).
-- Older repo scripts remain historical; this file is the security baseline.
-- ========================================================

-- --------------------------------------------------------
-- 1. Active bar context for RLS (owner/staff only, not super_admin)
-- SECURITY DEFINER: must bypass RLS while reading tenants/user_roles.
-- Otherwise tenants SELECT policy (id = get_auth_tenant_id()) re-enters
-- this function during the JOIN and causes "stack depth limit exceeded".
-- auth.uid() is still the invoking session user.
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_auth_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ur.tenant_id
  FROM public.user_roles ur
  INNER JOIN public.tenants t ON t.id = ur.tenant_id AND t.status = 'active'
  WHERE ur.user_id = auth.uid()
    AND ur.role IN ('owner', 'staff')
  ORDER BY (ur.role = 'owner') DESC, ur.created_at ASC
  LIMIT 1;
$$;

-- --------------------------------------------------------
-- 2. Public display payload (anon-safe, single tenant only)
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_public_display_payload(p_slug text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_name text;
  v_status text;
  v_settings jsonb;
  v_categories jsonb;
  legacy_id uuid := '00000000-0000-0000-0000-000000000001';
BEGIN
  IF p_slug IS NULL OR trim(p_slug) = '' THEN
    SELECT t.id, t.name, t.status
    INTO v_tenant_id, v_name, v_status
    FROM public.tenants t
    WHERE t.id = legacy_id;
  ELSE
    SELECT t.id, t.name, t.status
    INTO v_tenant_id, v_name, v_status
    FROM public.tenants t
    WHERE t.slug = trim(p_slug);
  END IF;

  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END IF;

  IF v_status = 'suspended' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'suspended', 'name', v_name);
  END IF;

  SELECT to_jsonb(s) INTO v_settings
  FROM public.settings s
  WHERE s.tenant_id = v_tenant_id
  LIMIT 1;

  SELECT COALESCE(jsonb_agg(sub.cat_obj ORDER BY sub.sort_order), '[]'::jsonb)
  INTO v_categories
  FROM (
    SELECT
      c.sort_order,
      jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'sort_order', c.sort_order,
        'enabled', c.enabled,
        'created_at', c.created_at,
        'drinks', (
          SELECT COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'id', d.id,
                'name', d.name,
                'price', d.price,
                'price_unit', d.price_unit,
                'price_bottle', d.price_bottle,
                'price_unit_bottle', d.price_unit_bottle,
                'enabled', d.enabled,
                'sort_order', d.sort_order,
                'created_at', d.created_at,
                'category_id', c.id
              )
              ORDER BY d.sort_order
            ),
            '[]'::jsonb
          )
          FROM public.drinks d
          WHERE d.category_id = c.id
            AND d.tenant_id = v_tenant_id
            AND d.enabled = true
        )
      ) AS cat_obj
    FROM public.categories c
    WHERE c.tenant_id = v_tenant_id
      AND c.enabled = true
  ) sub;

  RETURN jsonb_build_object(
    'ok', true,
    'tenant', jsonb_build_object('id', v_tenant_id, 'name', v_name),
    'settings', v_settings,
    'categories', COALESCE(v_categories, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_display_payload(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_display_payload(text) TO authenticated;

-- --------------------------------------------------------
-- 3. RLS: tenants (authenticated members only)
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Tenants are viewable by their users" ON public.tenants;
CREATE POLICY "Tenants readable by authenticated tenant members" ON public.tenants
  FOR SELECT TO authenticated
  USING (id = public.get_auth_tenant_id());

-- --------------------------------------------------------
-- 4. RLS: drop public read on menu tables
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Categories are viewable by everyone" ON public.categories;
DROP POLICY IF EXISTS "Drinks are viewable by everyone" ON public.drinks;
DROP POLICY IF EXISTS "Settings are viewable by everyone" ON public.settings;

-- Staff policies using get_auth_tenant_id() must already exist from prior migrations.

-- --------------------------------------------------------
-- 5. SaaS RPCs: search_path + owner-only staff + list_staff uses get_auth_tenant_id
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.register_bar(
  bar_name text,
  bar_slug text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
$$;

CREATE OR REPLACE FUNCTION public.add_staff_member(staff_email text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_tenant_id uuid;
  target_user_id uuid;
BEGIN
  current_tenant_id := public.get_auth_tenant_id();

  IF current_tenant_id IS NULL THEN
    RAISE EXCEPTION 'No active bar membership';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND tenant_id = current_tenant_id
      AND role = 'owner'
  ) THEN
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
$$;

CREATE OR REPLACE FUNCTION public.remove_staff_member(staff_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_tenant_id uuid;
BEGIN
  current_tenant_id := public.get_auth_tenant_id();

  IF current_tenant_id IS NULL THEN
    RAISE EXCEPTION 'No active bar membership';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND tenant_id = current_tenant_id
      AND role = 'owner'
  ) THEN
    RAISE EXCEPTION 'Only owners can remove staff';
  END IF;

  DELETE FROM public.user_roles
  WHERE user_id = staff_user_id
    AND tenant_id = current_tenant_id
    AND role = 'staff';

  RETURN found;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_staff()
RETURNS TABLE (
  user_id uuid,
  email text,
  role text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_tenant_id uuid;
BEGIN
  current_tenant_id := public.get_auth_tenant_id();

  IF current_tenant_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    ur.user_id,
    u.email::text,
    ur.role::text,
    ur.created_at
  FROM public.user_roles ur
  JOIN auth.users u ON u.id = ur.user_id
  WHERE ur.tenant_id = current_tenant_id
  ORDER BY ur.created_at ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_tenant_status(
  target_tenant_id uuid,
  new_status text
)
RETURNS boolean
LANGUAGE plpgsql
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

  IF new_status NOT IN ('active', 'suspended') THEN
    RAISE EXCEPTION 'Invalid status. Use active or suspended.';
  END IF;

  UPDATE public.tenants
  SET status = new_status
  WHERE id = target_tenant_id;

  RETURN found;
END;
$$;

-- --------------------------------------------------------
-- 6. Business day RPCs: use get_auth_tenant_id()
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_or_create_open_business_day()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  business_day_id uuid;
  today_date date;
  current_tenant_id uuid;
BEGIN
  current_tenant_id := public.get_auth_tenant_id();

  IF current_tenant_id IS NULL THEN
    RAISE EXCEPTION 'No active bar membership';
  END IF;

  today_date := (now() AT TIME ZONE 'Asia/Shanghai')::date;

  SELECT id INTO business_day_id
  FROM public.business_days
  WHERE closed_at IS NULL
    AND tenant_id = current_tenant_id
  ORDER BY opened_at DESC
  LIMIT 1;

  IF business_day_id IS NULL THEN
    INSERT INTO public.business_days (business_date, opened_at, tenant_id)
    VALUES (today_date, now(), current_tenant_id)
    RETURNING id INTO business_day_id;
  END IF;

  RETURN business_day_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_current_open_business_day()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  business_day_id uuid;
  current_tenant_id uuid;
BEGIN
  current_tenant_id := public.get_auth_tenant_id();

  IF current_tenant_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT id INTO business_day_id
  FROM public.business_days
  WHERE closed_at IS NULL
    AND tenant_id = current_tenant_id
  ORDER BY opened_at DESC
  LIMIT 1;

  RETURN business_day_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.close_business_day(business_day_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_tenant_id uuid;
BEGIN
  current_tenant_id := public.get_auth_tenant_id();

  IF current_tenant_id IS NULL THEN
    RAISE EXCEPTION 'No active bar membership';
  END IF;

  UPDATE public.business_days
  SET closed_at = now()
  WHERE id = business_day_id
    AND closed_at IS NULL
    AND tenant_id = current_tenant_id;

  RETURN found;
END;
$$;

-- --- 10 grant_saas_rpc_execute.sql ---
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

GRANT EXECUTE ON FUNCTION public.get_public_display_payload(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_display_payload(text) TO authenticated;

-- --- END (optional: seed.sql, seed_platform_super_admin.sql after auth user exists) ---
