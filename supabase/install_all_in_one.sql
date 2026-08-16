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
  brand_name text,
  name text not null,
  volume_ml integer,
  price numeric(10,2) not null,
  price_unit text default '杯',
  price_bottle numeric(10,2),
  price_unit_bottle text default '瓶',
  sort_order int default 0,
  enabled boolean default true,
  -- NULL means this drink does not track inventory.
  stock integer default null,
  -- Owner-defined conversion factors for inventory deduction.
  ml_per_cup integer,
  ml_per_bottle integer,
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
    -- If today's business day was closed, reopen it instead of inserting
    -- another row that would violate UNIQUE (business_date, tenant_id).
    SELECT id INTO business_day_id
    FROM business_days
    WHERE business_date = today_date
      AND tenant_id = current_tenant_id
    ORDER BY opened_at DESC
    LIMIT 1;

    IF business_day_id IS NULL THEN
      INSERT INTO business_days (business_date, opened_at, tenant_id)
      VALUES (today_date, now(), current_tenant_id)
      RETURNING id INTO business_day_id;
    ELSE
      UPDATE business_days
      SET closed_at = NULL
      WHERE id = business_day_id;
    END IF;
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
-- A numeric value tracks remaining quantity in ml
ALTER TABLE public.drinks ADD COLUMN IF NOT EXISTS stock integer DEFAULT NULL;
ALTER TABLE public.drinks ADD COLUMN IF NOT EXISTS ml_per_cup integer;
ALTER TABLE public.drinks ADD COLUMN IF NOT EXISTS ml_per_bottle integer;
ALTER TABLE public.drinks ADD COLUMN IF NOT EXISTS brand_name text;
ALTER TABLE public.drinks ADD COLUMN IF NOT EXISTS volume_ml integer;

CREATE INDEX IF NOT EXISTS idx_drinks_tenant_brand ON public.drinks(tenant_id, brand_name);
CREATE INDEX IF NOT EXISTS idx_drinks_tenant_volume ON public.drinks(tenant_id, volume_ml);

ALTER TABLE public.drinks DROP CONSTRAINT IF EXISTS drinks_stock_non_negative;
ALTER TABLE public.drinks ADD CONSTRAINT drinks_stock_non_negative
  CHECK (stock IS NULL OR stock >= 0);

ALTER TABLE public.drinks DROP CONSTRAINT IF EXISTS drinks_volume_ml_positive;
ALTER TABLE public.drinks ADD CONSTRAINT drinks_volume_ml_positive
  CHECK (volume_ml IS NULL OR volume_ml > 0);

ALTER TABLE public.drinks DROP CONSTRAINT IF EXISTS drinks_ml_per_cup_positive;
ALTER TABLE public.drinks ADD CONSTRAINT drinks_ml_per_cup_positive
  CHECK (ml_per_cup IS NULL OR ml_per_cup > 0);

ALTER TABLE public.drinks DROP CONSTRAINT IF EXISTS drinks_ml_per_bottle_positive;
ALTER TABLE public.drinks ADD CONSTRAINT drinks_ml_per_bottle_positive
  CHECK (ml_per_bottle IS NULL OR ml_per_bottle > 0);

CREATE OR REPLACE FUNCTION public.apply_drink_stock_delta(
  p_drink_id uuid,
  p_delta_cup integer,
  p_delta_bottle integer
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  current_stock integer;
  cup_ml integer;
  bottle_ml integer;
  delta_ml integer;
  next_stock integer;
BEGIN
  SELECT d.stock, d.ml_per_cup, d.ml_per_bottle
  INTO current_stock, cup_ml, bottle_ml
  FROM public.drinks d
  WHERE d.id = p_drink_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Drink not found: %', p_drink_id;
  END IF;

  -- NULL stock means this drink inventory is not tracked.
  IF current_stock IS NULL THEN
    RETURN;
  END IF;

  IF p_delta_cup <> 0 AND cup_ml IS NULL THEN
    RAISE EXCEPTION 'Drink % is stock-tracked but ml_per_cup is not configured', p_drink_id;
  END IF;

  IF p_delta_bottle <> 0 AND bottle_ml IS NULL THEN
    RAISE EXCEPTION 'Drink % is stock-tracked but ml_per_bottle is not configured', p_drink_id;
  END IF;

  delta_ml := (p_delta_cup * COALESCE(cup_ml, 0)) + (p_delta_bottle * COALESCE(bottle_ml, 0));
  next_stock := current_stock - delta_ml;

  IF next_stock < 0 THEN
    RAISE EXCEPTION 'Insufficient stock for drink %, need % ml, have % ml',
      p_drink_id, delta_ml, current_stock;
  END IF;

  UPDATE public.drinks
  SET stock = next_stock
  WHERE id = p_drink_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_order_item_stock()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.apply_drink_stock_delta(NEW.drink_id, NEW.quantity_cup, NEW.quantity_bottle);
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    PERFORM public.apply_drink_stock_delta(OLD.drink_id, -OLD.quantity_cup, -OLD.quantity_bottle);
    RETURN OLD;
  END IF;

  IF NEW.drink_id = OLD.drink_id THEN
    PERFORM public.apply_drink_stock_delta(
      NEW.drink_id,
      NEW.quantity_cup - OLD.quantity_cup,
      NEW.quantity_bottle - OLD.quantity_bottle
    );
  ELSE
    -- Drink changed: restore old stock first, then deduct from the new drink.
    PERFORM public.apply_drink_stock_delta(OLD.drink_id, -OLD.quantity_cup, -OLD.quantity_bottle);
    PERFORM public.apply_drink_stock_delta(NEW.drink_id, NEW.quantity_cup, NEW.quantity_bottle);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS order_item_stock_on_change ON public.order_items;
CREATE TRIGGER order_item_stock_on_change
  BEFORE INSERT OR UPDATE OR DELETE ON public.order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_order_item_stock();

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
                'brand_name', d.brand_name,
                'name', d.name,
                'volume_ml', d.volume_ml,
                'price', d.price,
                'price_unit', d.price_unit,
                'price_bottle', d.price_bottle,
                'price_unit_bottle', d.price_unit_bottle,
                'enabled', d.enabled,
                'sort_order', d.sort_order,
                'created_at', d.created_at,
                'category_id', c.id,
                'drink_serving_options', (
                  SELECT COALESCE(
                    jsonb_agg(
                      jsonb_build_object(
                        'id', so.id,
                        'serving_type', so.serving_type,
                        'label', so.label,
                        'volume_ml', so.volume_ml,
                        'price', so.price,
                        'is_default', so.is_default,
                        'is_active', so.is_active,
                        'public_sort_order', so.public_sort_order
                      )
                      ORDER BY so.public_sort_order, so.is_default DESC, so.label
                    ),
                    '[]'::jsonb
                  )
                  FROM public.drink_serving_options so
                  WHERE so.drink_id = d.id
                    AND so.tenant_id = v_tenant_id
                    AND so.is_active = true
                )
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

DROP POLICY IF EXISTS "Categories viewable by tenant staff" ON public.categories;
CREATE POLICY "Categories viewable by tenant staff" ON public.categories
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_auth_tenant_id());

DROP POLICY IF EXISTS "Drinks viewable by tenant staff" ON public.drinks;
CREATE POLICY "Drinks viewable by tenant staff" ON public.drinks
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_auth_tenant_id());

-- Staff write policies using get_auth_tenant_id() must already exist from prior migrations.

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
    -- If today's business day was closed, reopen it instead of inserting
    -- another row that would violate UNIQUE (business_date, tenant_id).
    SELECT id INTO business_day_id
    FROM public.business_days
    WHERE business_date = today_date
      AND tenant_id = current_tenant_id
    ORDER BY opened_at DESC
    LIMIT 1;

    IF business_day_id IS NULL THEN
      INSERT INTO public.business_days (business_date, opened_at, tenant_id)
      VALUES (today_date, now(), current_tenant_id)
      RETURNING id INTO business_day_id;
    ELSE
      UPDATE public.business_days
      SET closed_at = NULL
      WHERE id = business_day_id;
    END IF;
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

-- --- taplist_mvp_patch (Tap List MVP; mirrored from taplist_mvp_patch.sql) ---
-- =====================================================================
-- Tap List MVP — schema + public RPCs (patch for EXISTING databases)
-- =====================================================================
-- MVP: no tenants.public_review_status — gate on
--       tenants.status = 'active' AND tenants.is_public_visible = true
-- =====================================================================

-- --- tenants ---
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS city text NOT NULL DEFAULT 'Shanghai';

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS country text NOT NULL DEFAULT 'China';

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS district text;

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS address text;

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS opening_hour jsonb;

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS description text;

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS display_name text;

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS cover_image_url text;

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS is_public_visible boolean NOT NULL DEFAULT false;

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS last_menu_updated_at timestamptz;

-- --- categories (opt-out from Tap List per category) ---
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS is_public_visible boolean NOT NULL DEFAULT true;

-- --- drinks (optional hero image for Tap List; safe if already present) ---
ALTER TABLE public.drinks
  ADD COLUMN IF NOT EXISTS image_url text;

ALTER TABLE public.drinks
  ADD COLUMN IF NOT EXISTS is_public_visible boolean NOT NULL DEFAULT false;

ALTER TABLE public.drinks
  ADD COLUMN IF NOT EXISTS public_status text NOT NULL DEFAULT 'available';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'drinks_public_status_check'
  ) THEN
    ALTER TABLE public.drinks
      ADD CONSTRAINT drinks_public_status_check
      CHECK (public_status IN ('new', 'available', 'low', 'sold_out', 'coming_soon'));
  END IF;
END $$;

ALTER TABLE public.drinks
  ADD COLUMN IF NOT EXISTS public_sort_order integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'drinks_enabled_implies_not_public_check'
  ) THEN
    ALTER TABLE public.drinks
      ADD CONSTRAINT drinks_enabled_implies_not_public_check
      CHECK (enabled OR NOT is_public_visible);
  END IF;
END $$;

-- --- drink_beer_profiles ---
CREATE TABLE IF NOT EXISTS public.drink_beer_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  drink_id uuid NOT NULL REFERENCES public.drinks (id) ON DELETE CASCADE,
  brewery text,
  beer_style text,
  abv numeric(4, 2),
  ibu integer,
  country text,
  origin_region text,
  fermentation_type text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (drink_id)
);

CREATE INDEX IF NOT EXISTS idx_drink_beer_profiles_tenant
  ON public.drink_beer_profiles (tenant_id);

ALTER TABLE public.drink_beer_profiles
  ADD COLUMN IF NOT EXISTS description text;

-- --- drink_serving_options (MVP: Tap List display only; how it is sold, not what it is) ---
CREATE TABLE IF NOT EXISTS public.drink_serving_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  drink_id uuid NOT NULL REFERENCES public.drinks (id) ON DELETE CASCADE,
  serving_type text NOT NULL,
  label text NOT NULL,
  volume_ml integer,
  price numeric(10, 2) NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  public_sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT drink_serving_options_serving_type_check
    CHECK (serving_type IN ('draft', 'can', 'bottle', 'flight', 'other'))
);

CREATE INDEX IF NOT EXISTS idx_drink_serving_options_drink
  ON public.drink_serving_options (drink_id);

CREATE INDEX IF NOT EXISTS idx_drink_serving_options_tenant
  ON public.drink_serving_options (tenant_id);

-- --- RLS on new tables ---
ALTER TABLE public.drink_beer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drink_serving_options ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS drink_beer_profiles_tenant_rw ON public.drink_beer_profiles;
CREATE POLICY drink_beer_profiles_tenant_rw
  ON public.drink_beer_profiles FOR ALL TO authenticated
  USING (tenant_id = public.get_auth_tenant_id())
  WITH CHECK (tenant_id = public.get_auth_tenant_id());

DROP POLICY IF EXISTS drink_serving_options_tenant_rw ON public.drink_serving_options;
CREATE POLICY drink_serving_options_tenant_rw
  ON public.drink_serving_options FOR ALL TO authenticated
  USING (tenant_id = public.get_auth_tenant_id())
  WITH CHECK (tenant_id = public.get_auth_tenant_id());

-- --- Denormalized tenant_id must match parent drink (RLS correctness) ---
CREATE OR REPLACE FUNCTION public.enforce_drink_extension_tenant_matches_drink()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
BEGIN
  SELECT d.tenant_id INTO v_tenant
  FROM public.drinks d
  WHERE d.id = new.drink_id;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'drink_id not found';
  END IF;

  IF new.tenant_id IS DISTINCT FROM v_tenant THEN
    RAISE EXCEPTION 'tenant_id must match drinks.tenant_id for this drink_id';
  END IF;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS trg_drink_beer_profiles_tenant_matches ON public.drink_beer_profiles;
CREATE TRIGGER trg_drink_beer_profiles_tenant_matches
  BEFORE INSERT OR UPDATE ON public.drink_beer_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_drink_extension_tenant_matches_drink();

DROP TRIGGER IF EXISTS trg_drink_serving_options_tenant_matches ON public.drink_serving_options;
CREATE TRIGGER trg_drink_serving_options_tenant_matches
  BEFORE INSERT OR UPDATE ON public.drink_serving_options
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_drink_extension_tenant_matches_drink();

-- --- Touch tenant timestamp when drinks change ---
CREATE OR REPLACE FUNCTION public.taplist_touch_tenant_menu_updated()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND TG_TABLE_NAME = 'drinks' THEN
    IF (to_jsonb(NEW) - 'stock') IS NOT DISTINCT FROM (to_jsonb(OLD) - 'stock') THEN
      RETURN NEW;
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_tenant_id := OLD.tenant_id;
  ELSE
    v_tenant_id := NEW.tenant_id;
  END IF;

  UPDATE public.tenants
  SET last_menu_updated_at = now()
  WHERE id = v_tenant_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_drinks_taplist_touch_tenant ON public.drinks;
CREATE TRIGGER trg_drinks_taplist_touch_tenant
  AFTER INSERT OR UPDATE OR DELETE ON public.drinks
  FOR EACH ROW
  EXECUTE FUNCTION public.taplist_touch_tenant_menu_updated();

DROP TRIGGER IF EXISTS trg_serving_options_taplist_touch_tenant ON public.drink_serving_options;
CREATE TRIGGER trg_serving_options_taplist_touch_tenant
  AFTER INSERT OR UPDATE OR DELETE ON public.drink_serving_options
  FOR EACH ROW
  EXECUTE FUNCTION public.taplist_touch_tenant_menu_updated();

-- --- Owner / super_admin: tenant Tap List visibility ---
CREATE OR REPLACE FUNCTION public.set_tenant_public_visibility(
  p_tenant_id uuid,
  p_visible boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND (
        ur.role = 'super_admin'
        OR (ur.tenant_id = p_tenant_id AND ur.role = 'owner')
      )
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  UPDATE public.tenants SET is_public_visible = p_visible, last_menu_updated_at = now() WHERE id = p_tenant_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_tenant_public_visibility(uuid, boolean) TO authenticated;

-- Tap List storefront text fields (bypasses tenants RLS; same auth as set_tenant_public_visibility).
DROP FUNCTION IF EXISTS public.set_tenant_taplist_storefront(uuid, text, text, text, text, text, jsonb);

CREATE OR REPLACE FUNCTION public.set_tenant_taplist_storefront(
  p_tenant_id uuid,
  p_display_name text,
  p_district text,
  p_address text,
  p_cover_image_url text,
  p_city text,
  p_opening_hour jsonb DEFAULT NULL,
  p_description text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND (
        ur.role = 'super_admin'
        OR (ur.tenant_id = p_tenant_id AND ur.role = 'owner')
      )
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  UPDATE public.tenants
  SET
    display_name = nullif(trim(p_display_name), ''),
    district = nullif(trim(p_district), ''),
    address = nullif(trim(p_address), ''),
    cover_image_url = nullif(trim(p_cover_image_url), ''),
    city = coalesce(nullif(trim(p_city), ''), 'Shanghai'),
    opening_hour = CASE
      WHEN p_opening_hour IS NULL THEN NULL
      WHEN p_opening_hour = 'null'::jsonb THEN NULL
      ELSE p_opening_hour
    END,
    description = nullif(trim(p_description), ''),
    last_menu_updated_at = now()
  WHERE id = p_tenant_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_tenant_taplist_storefront(uuid, text, text, text, text, text, jsonb, text) TO authenticated;

-- --- Tap List media bucket (Storage) + drink consumer fields RPC ---
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'taplist-media',
  'taplist-media',
  true,
  3145728,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE OR REPLACE FUNCTION public.taplist_media_path_allowed(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, storage
AS $$
  SELECT
    (storage.foldername(p_name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND (storage.foldername(p_name))[2] IN ('cover', 'drinks');
$$;

CREATE OR REPLACE FUNCTION public.taplist_media_tenant_id(p_name text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, storage
AS $$
  SELECT (storage.foldername(p_name))[1]::uuid;
$$;

CREATE OR REPLACE FUNCTION public.taplist_media_user_can_write(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND (
        ur.role = 'super_admin'
        OR (ur.tenant_id = p_tenant_id AND ur.role IN ('owner', 'staff'))
      )
  );
$$;

DROP POLICY IF EXISTS taplist_media_public_read ON storage.objects;
CREATE POLICY taplist_media_public_read
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'taplist-media');

DROP POLICY IF EXISTS taplist_media_authenticated_insert ON storage.objects;
CREATE POLICY taplist_media_authenticated_insert
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'taplist-media'
    AND public.taplist_media_path_allowed(name)
    AND public.taplist_media_user_can_write(public.taplist_media_tenant_id(name))
  );

DROP POLICY IF EXISTS taplist_media_authenticated_update ON storage.objects;
CREATE POLICY taplist_media_authenticated_update
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'taplist-media'
    AND public.taplist_media_user_can_write(public.taplist_media_tenant_id(name))
  )
  WITH CHECK (
    bucket_id = 'taplist-media'
    AND public.taplist_media_path_allowed(name)
    AND public.taplist_media_user_can_write(public.taplist_media_tenant_id(name))
  );

DROP POLICY IF EXISTS taplist_media_authenticated_delete ON storage.objects;
CREATE POLICY taplist_media_authenticated_delete
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'taplist-media'
    AND public.taplist_media_user_can_write(public.taplist_media_tenant_id(name))
  );

CREATE OR REPLACE FUNCTION public.set_drink_taplist_consumer_fields(
  p_drink_id uuid,
  p_image_url text,
  p_is_public_visible boolean,
  p_public_status text,
  p_public_sort_order integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_enabled boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT d.tenant_id, d.enabled INTO v_tenant_id, v_enabled
  FROM public.drinks d
  WHERE d.id = p_drink_id;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Drink not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND (
        ur.role = 'super_admin'
        OR (ur.tenant_id = v_tenant_id AND ur.role IN ('owner', 'staff'))
      )
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_is_public_visible AND NOT v_enabled THEN
    RAISE EXCEPTION 'Cannot make disabled drink public on Tap List';
  END IF;

  UPDATE public.drinks
  SET
    image_url = nullif(trim(p_image_url), ''),
    is_public_visible = p_is_public_visible,
    public_status = coalesce(nullif(trim(p_public_status), ''), 'available'),
    public_sort_order = coalesce(p_public_sort_order, 0)
  WHERE id = p_drink_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_drink_taplist_consumer_fields(uuid, text, boolean, text, integer) TO authenticated;

-- --- Public Tap List RPCs (anon): no public_review_status ---
CREATE OR REPLACE FUNCTION public.get_public_taplist_bars(p_city text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_city text := coalesce(nullif(trim(p_city), ''), 'Shanghai');
BEGIN
  RETURN coalesce(
    (
      SELECT jsonb_agg(row_obj ORDER BY lm DESC NULLS LAST)
      FROM (
        SELECT
          jsonb_build_object(
            'id', t.id,
            'slug', t.slug,
            'name', t.name,
            'display_name', coalesce(nullif(trim(t.display_name), ''), t.name),
            'district', t.district,
            'address', t.address,
            'opening_hour', t.opening_hour,
            'description', t.description,
            'cover_image_url', t.cover_image_url,
            'city', t.city,
            'country', t.country,
            'last_menu_updated_at', t.last_menu_updated_at,
            'status_counts', (
              SELECT jsonb_build_object(
                '上新', count(*) FILTER (WHERE d.public_status = 'new'),
                '在售', count(*) FILTER (WHERE d.public_status = 'available'),
                '少量', count(*) FILTER (WHERE d.public_status = 'low'),
                '售罄', count(*) FILTER (WHERE d.public_status = 'sold_out'),
                '即将上新', count(*) FILTER (WHERE d.public_status = 'coming_soon')
              )
              FROM public.drinks d
              INNER JOIN public.categories c
                ON c.id = d.category_id AND c.tenant_id = d.tenant_id
              WHERE d.tenant_id = t.id
                AND d.enabled = true
                AND d.is_public_visible = true
                AND c.enabled = true
                AND c.is_public_visible = true
            )
          ) AS row_obj,
          t.last_menu_updated_at AS lm
        FROM public.tenants t
        WHERE t.status = 'active'
          AND t.is_public_visible = true
          AND lower(trim(t.city)) = lower(trim(v_city))
      ) sub
    ),
    '[]'::jsonb
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_public_taplist_tenant(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slug text := trim(p_slug);
  rec record;
BEGIN
  IF v_slug = '' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'bad_request');
  END IF;

  SELECT
    t.id, t.slug, t.name,
    coalesce(nullif(trim(t.display_name), ''), t.name) AS display_name,
    t.district, t.address, t.opening_hour, t.description, t.cover_image_url, t.city, t.country,
    t.last_menu_updated_at, t.status, t.is_public_visible
  INTO rec
  FROM public.tenants t
  WHERE t.slug = v_slug;

  IF rec IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END IF;

  IF rec.status = 'suspended' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'suspended', 'name', rec.name);
  END IF;

  IF NOT rec.is_public_visible THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_public');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'tenant', jsonb_build_object(
      'id', rec.id,
      'slug', rec.slug,
      'name', rec.name,
      'display_name', rec.display_name,
      'district', rec.district,
      'address', rec.address,
      'opening_hour', rec.opening_hour,
      'description', rec.description,
      'cover_image_url', rec.cover_image_url,
      'city', rec.city,
      'country', rec.country,
      'last_menu_updated_at', rec.last_menu_updated_at
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.taplist_public_status_zh(p_status text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE p_status
    WHEN 'new' THEN '上新'
    WHEN 'available' THEN '在售'
    WHEN 'low' THEN '少量'
    WHEN 'sold_out' THEN '售罄'
    WHEN 'coming_soon' THEN '即将上新'
    ELSE coalesce(nullif(trim(p_status), ''), '在售')
  END;
$$;

CREATE OR REPLACE FUNCTION public.get_public_taplist_drinks(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ok boolean;
BEGIN
  SELECT (t.status = 'active' AND t.is_public_visible)
  INTO v_ok
  FROM public.tenants t
  WHERE t.id = p_tenant_id;

  IF v_ok IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END IF;

  IF NOT v_ok THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_public');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'drinks', coalesce(
      (
        SELECT jsonb_agg(drink_obj ORDER BY sold_rank, public_sort, name_sort)
        FROM (
          SELECT
            jsonb_build_object(
              'id', d.id,
              'category_id', d.category_id,
              'brand_name', d.brand_name,
              'name', d.name,
              'image_url', d.image_url,
              'public_status', public.taplist_public_status_zh(d.public_status),
              'public_sort_order', d.public_sort_order,
              'beer', (
                SELECT jsonb_build_object(
                  'brewery', p.brewery,
                  'beer_style', p.beer_style,
                  'abv', p.abv,
                  'ibu', p.ibu,
                  'country', p.country,
                  'description', p.description
                )
                FROM public.drink_beer_profiles p
                WHERE p.drink_id = d.id
                LIMIT 1
              ),
              'serving_options', (
                SELECT coalesce(
                  jsonb_agg(
                    jsonb_build_object(
                      'id', so.id,
                      'serving_type', so.serving_type,
                      'label', so.label,
                      'volume_ml', so.volume_ml,
                      'price', so.price,
                      'is_default', so.is_default,
                      'is_active', so.is_active,
                      'public_sort_order', so.public_sort_order
                    )
                    ORDER BY so.public_sort_order, so.label
                  ),
                  '[]'::jsonb
                )
                FROM public.drink_serving_options so
                WHERE so.drink_id = d.id AND so.is_active = true
              )
            ) AS drink_obj,
            CASE WHEN d.public_status = 'sold_out' THEN 1 ELSE 0 END AS sold_rank,
            d.public_sort_order AS public_sort,
            lower(d.name) AS name_sort
          FROM public.drinks d
          INNER JOIN public.categories c
            ON c.id = d.category_id AND c.tenant_id = d.tenant_id
          WHERE d.tenant_id = p_tenant_id
            AND d.enabled = true
            AND d.is_public_visible = true
            AND c.enabled = true
            AND c.is_public_visible = true
        ) x
      ),
      '[]'::jsonb
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_taplist_bars(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_taplist_bars(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_taplist_tenant(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_taplist_tenant(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_taplist_drinks(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_taplist_drinks(uuid) TO authenticated;

-- ADR-011 MVP: search drinks (name, brand_name, brewery, beer_style)
CREATE OR REPLACE FUNCTION public.search_public_taplist(
  p_city text DEFAULT NULL,
  p_query text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_city text := coalesce(nullif(trim(p_city), ''), 'Shanghai');
  v_q text := trim(p_query);
  v_pattern text;
BEGIN
  IF v_q = '' THEN
    RETURN jsonb_build_object('ok', true, 'results', '[]'::jsonb);
  END IF;

  v_pattern := '%' || v_q || '%';

  RETURN jsonb_build_object(
    'ok', true,
    'results', coalesce(
      (
        SELECT jsonb_agg(row_obj ORDER BY name_sort)
        FROM (
          SELECT
            jsonb_build_object(
              'drink_id', d.id,
              'name', d.name,
              'brand_name', d.brand_name,
              'image_url', d.image_url,
              'public_status', public.taplist_public_status_zh(d.public_status),
              'tenant_id', t.id,
              'tenant_slug', t.slug,
              'tenant_display_name', coalesce(nullif(trim(t.display_name), ''), t.name),
              'tenant_district', t.district,
              'tenant_address', t.address,
              'brewery', p.brewery,
              'beer_style', p.beer_style,
              'abv', p.abv
            ) AS row_obj,
            lower(d.name) AS name_sort
          FROM public.drinks d
          INNER JOIN public.tenants t ON t.id = d.tenant_id
          INNER JOIN public.categories c
            ON c.id = d.category_id AND c.tenant_id = d.tenant_id
          LEFT JOIN public.drink_beer_profiles p ON p.drink_id = d.id
          WHERE t.status = 'active'
            AND t.is_public_visible = true
            AND lower(trim(t.city)) = lower(trim(v_city))
            AND d.enabled = true
            AND d.is_public_visible = true
            AND c.enabled = true
            AND c.is_public_visible = true
            AND (
              d.name ILIKE v_pattern
              OR coalesce(d.brand_name, '') ILIKE v_pattern
              OR coalesce(p.brewery, '') ILIKE v_pattern
              OR coalesce(p.beer_style, '') ILIKE v_pattern
            )
          LIMIT 50
        ) sub
      ),
      '[]'::jsonb
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_public_taplist(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.search_public_taplist(text, text) TO authenticated;

-- Owner may update Tap List storefront fields on their own tenant (visibility still via set_tenant_public_visibility).
DROP POLICY IF EXISTS tenants_owner_update_taplist_fields ON public.tenants;
CREATE POLICY tenants_owner_update_taplist_fields
  ON public.tenants FOR UPDATE TO authenticated
  USING (
    id = public.get_auth_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.tenant_id = tenants.id
        AND ur.role = 'owner'
    )
  )
  WITH CHECK (id = public.get_auth_tenant_id());

-- Platform super_admin: read/update any tenant (RLS + get_auth_tenant_id() can hide bar `226` from super_admin).
DROP POLICY IF EXISTS tenants_select_super_admin ON public.tenants;
CREATE POLICY tenants_select_super_admin
  ON public.tenants FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'super_admin'
    )
  );

DROP POLICY IF EXISTS tenants_update_super_admin ON public.tenants;
CREATE POLICY tenants_update_super_admin
  ON public.tenants FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'super_admin'
    )
  );

-- --- Concierge: super_admin creates bars without owner auth (20260524120000) ---
CREATE OR REPLACE FUNCTION public.admin_create_bar(p_name text, p_slug text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_slug text := lower(trim(p_slug));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role = 'super_admin'
  ) THEN
    RAISE EXCEPTION 'Unauthorized: super_admin role required';
  END IF;
  IF p_name IS NULL OR trim(p_name) = '' THEN
    RAISE EXCEPTION 'Bar name is required';
  END IF;
  IF v_slug IS NULL OR v_slug = '' OR v_slug = '__platform__' THEN
    RAISE EXCEPTION 'Invalid slug';
  END IF;
  IF length(v_slug) < 2 OR v_slug !~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$' THEN
    RAISE EXCEPTION 'Slug must be 2+ lowercase letters/numbers/hyphens';
  END IF;
  IF EXISTS (SELECT 1 FROM public.tenants t WHERE t.slug = v_slug) THEN
    RAISE EXCEPTION 'This slug is already taken';
  END IF;
  INSERT INTO public.tenants (name, slug, status, city, country, is_public_visible)
  VALUES (trim(p_name), v_slug, 'active', 'Shanghai', 'China', false)
  RETURNING id INTO v_tenant_id;
  INSERT INTO public.settings (theme, auto_refresh, refresh_interval, tenant_id)
  VALUES ('dark', true, 3600, v_tenant_id);
  RETURN v_tenant_id;
END;
$$;

DROP POLICY IF EXISTS categories_super_admin ON public.categories;
CREATE POLICY categories_super_admin ON public.categories
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'super_admin'));

DROP POLICY IF EXISTS drinks_super_admin ON public.drinks;
CREATE POLICY drinks_super_admin ON public.drinks
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'super_admin'));

DROP POLICY IF EXISTS drink_beer_profiles_super_admin ON public.drink_beer_profiles;
CREATE POLICY drink_beer_profiles_super_admin ON public.drink_beer_profiles
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'super_admin'));

DROP POLICY IF EXISTS drink_serving_options_super_admin ON public.drink_serving_options;
CREATE POLICY drink_serving_options_super_admin ON public.drink_serving_options
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'super_admin'));

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
GRANT EXECUTE ON FUNCTION public.admin_create_bar(text, text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_public_display_payload(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_display_payload(text) TO authenticated;

-- ========================================================
-- Tonight Control (POS 酒单): full taplist parity (owner + staff), immediate saves
-- Mirror of migrations/20260714120000_owner_taplist_publish.sql
-- ========================================================

CREATE OR REPLACE FUNCTION public.taplist_can_view_tenant(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND (
        ur.role = 'super_admin'
        OR (ur.tenant_id = p_tenant_id AND ur.role IN ('owner', 'staff'))
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.taplist_can_view_tenant(uuid) TO authenticated;

-- Remove the earlier owner-only hardening (staff now have full parity).
DROP TRIGGER IF EXISTS trg_drinks_block_staff_taplist_fields ON public.drinks;
DROP FUNCTION IF EXISTS public.trg_drinks_block_staff_taplist_fields();
DROP TRIGGER IF EXISTS trg_categories_block_staff_public_visible ON public.categories;
DROP FUNCTION IF EXISTS public.trg_categories_block_staff_public_visible();
DROP FUNCTION IF EXISTS public.publish_owner_taplist_snapshot(uuid, jsonb);

DROP POLICY IF EXISTS drink_beer_profiles_owner_write ON public.drink_beer_profiles;
DROP POLICY IF EXISTS drink_beer_profiles_tenant_select ON public.drink_beer_profiles;
DROP POLICY IF EXISTS drink_beer_profiles_tenant_rw ON public.drink_beer_profiles;
CREATE POLICY drink_beer_profiles_tenant_rw
  ON public.drink_beer_profiles FOR ALL TO authenticated
  USING (tenant_id = public.get_auth_tenant_id())
  WITH CHECK (tenant_id = public.get_auth_tenant_id());

DROP POLICY IF EXISTS drink_serving_options_owner_write ON public.drink_serving_options;
DROP POLICY IF EXISTS drink_serving_options_tenant_select ON public.drink_serving_options;
DROP POLICY IF EXISTS drink_serving_options_tenant_rw ON public.drink_serving_options;
CREATE POLICY drink_serving_options_tenant_rw
  ON public.drink_serving_options FOR ALL TO authenticated
  USING (tenant_id = public.get_auth_tenant_id())
  WITH CHECK (tenant_id = public.get_auth_tenant_id());

DROP FUNCTION IF EXISTS public.taplist_is_tenant_owner(uuid);

CREATE OR REPLACE FUNCTION public.set_drink_taplist_consumer_fields(
  p_drink_id uuid,
  p_image_url text,
  p_is_public_visible boolean,
  p_public_status text,
  p_public_sort_order integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_enabled boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT d.tenant_id, d.enabled INTO v_tenant_id, v_enabled
  FROM public.drinks d
  WHERE d.id = p_drink_id;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Drink not found';
  END IF;

  IF NOT public.taplist_can_view_tenant(v_tenant_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_is_public_visible AND NOT v_enabled THEN
    RAISE EXCEPTION 'Cannot make disabled drink public on Tap List';
  END IF;

  UPDATE public.drinks
  SET
    image_url = nullif(trim(p_image_url), ''),
    is_public_visible = p_is_public_visible,
    public_status = coalesce(nullif(trim(p_public_status), ''), 'available'),
    public_sort_order = coalesce(p_public_sort_order, 0)
  WHERE id = p_drink_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_drink_taplist_consumer_fields(uuid, text, boolean, text, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_drink_taplist_status(
  p_drink_id uuid,
  p_is_public_visible boolean,
  p_public_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_enabled boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT d.tenant_id, d.enabled INTO v_tenant_id, v_enabled
  FROM public.drinks d
  WHERE d.id = p_drink_id;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Drink not found';
  END IF;

  IF NOT public.taplist_can_view_tenant(v_tenant_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_is_public_visible AND NOT v_enabled THEN
    RAISE EXCEPTION 'Cannot make disabled drink public on Tap List';
  END IF;

  IF coalesce(nullif(trim(p_public_status), ''), 'available')
     NOT IN ('new', 'available', 'low', 'sold_out', 'coming_soon') THEN
    RAISE EXCEPTION 'Invalid public_status';
  END IF;

  UPDATE public.drinks
  SET
    is_public_visible = p_is_public_visible,
    public_status = coalesce(nullif(trim(p_public_status), ''), 'available')
  WHERE id = p_drink_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_drink_taplist_status(uuid, boolean, text) TO authenticated;

-- Whole-taplist go-live: any tenant member (override earlier owner-only def).
CREATE OR REPLACE FUNCTION public.set_tenant_public_visibility(
  p_tenant_id uuid,
  p_visible boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.taplist_can_view_tenant(p_tenant_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  UPDATE public.tenants
  SET is_public_visible = p_visible, last_menu_updated_at = now()
  WHERE id = p_tenant_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_tenant_public_visibility(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_owner_taplist_payload(p_tenant_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_tenant_id := p_tenant_id;
  IF v_tenant_id IS NULL THEN
    SELECT ur.tenant_id INTO v_tenant_id
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('owner', 'staff')
    ORDER BY ur.created_at
    LIMIT 1;
  END IF;

  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'no_tenant');
  END IF;

  IF NOT public.taplist_can_view_tenant(v_tenant_id) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'is_owner', EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND (
          ur.role = 'super_admin'
          OR (ur.tenant_id = v_tenant_id AND ur.role = 'owner')
        )
    ),
    'tenant', (
      SELECT jsonb_build_object(
        'id', t.id,
        'slug', t.slug,
        'name', t.name,
        'display_name', t.display_name,
        'is_public_visible', t.is_public_visible,
        'last_menu_updated_at', t.last_menu_updated_at,
        'status', t.status
      )
      FROM public.tenants t
      WHERE t.id = v_tenant_id
    ),
    'categories', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'name', c.name,
          'sort_order', c.sort_order,
          'enabled', c.enabled,
          'is_public_visible', c.is_public_visible
        ) ORDER BY c.sort_order, c.name
      )
      FROM public.categories c
      WHERE c.tenant_id = v_tenant_id
    ), '[]'::jsonb),
    'drinks', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', d.id,
          'category_id', d.category_id,
          'brand_name', d.brand_name,
          'name', d.name,
          'enabled', d.enabled,
          'image_url', d.image_url,
          'is_public_visible', d.is_public_visible,
          'public_status', d.public_status,
          'public_sort_order', d.public_sort_order,
          'product_id', d.product_id,
          'display_name', d.display_name,
          'display_description', d.display_description
        ) ORDER BY d.public_sort_order, lower(d.name)
      )
      FROM public.drinks d
      WHERE d.tenant_id = v_tenant_id
        AND d.enabled = true
    ), '[]'::jsonb),
    'beer_profiles', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'drink_id', p.drink_id,
          'brewery', p.brewery,
          'beer_style', p.beer_style,
          'abv', p.abv,
          'ibu', p.ibu,
          'country', p.country,
          'description', p.description
        )
      )
      FROM public.drink_beer_profiles p
      JOIN public.drinks d ON d.id = p.drink_id
      WHERE p.tenant_id = v_tenant_id
        AND d.enabled = true
    ), '[]'::jsonb),
    'serving_options', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', so.id,
          'drink_id', so.drink_id,
          'serving_type', so.serving_type,
          'label', so.label,
          'volume_ml', so.volume_ml,
          'price', so.price,
          'is_default', so.is_default,
          'is_active', so.is_active,
          'public_sort_order', so.public_sort_order
        ) ORDER BY so.public_sort_order
      )
      FROM public.drink_serving_options so
      JOIN public.drinks d ON d.id = so.drink_id
      WHERE so.tenant_id = v_tenant_id
        AND d.enabled = true
    ), '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_owner_taplist_payload(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.upsert_taplist_drink(
  p_tenant_id uuid,
  p_drink jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_errors jsonb := '[]'::jsonb;
  v_drink_id uuid;
  v_category_id uuid;
  v_is_new boolean := false;
  v_name text;
  v_status text;
  v_is_public boolean;
  v_profile jsonb;
  v_servings jsonb;
  v_elem jsonb;
  v_type text;
  v_default_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant id is required';
  END IF;

  IF NOT public.taplist_can_view_tenant(p_tenant_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_drink IS NULL OR jsonb_typeof(p_drink) <> 'object' THEN
    RAISE EXCEPTION 'p_drink must be a JSON object';
  END IF;

  v_drink_id := nullif(p_drink->>'id', '')::uuid;
  v_name := trim(coalesce(p_drink->>'name', ''));
  v_status := coalesce(nullif(trim(p_drink->>'public_status'), ''), 'available');
  v_is_public := coalesce((p_drink->>'is_public_visible')::boolean, false);
  v_profile := p_drink->'profile';
  v_servings := p_drink->'servings';

  IF v_name = '' THEN
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'field', 'name', 'message', '请填写酒款名称'));
  END IF;

  IF v_status NOT IN ('new', 'available', 'low', 'sold_out', 'coming_soon') THEN
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'field', 'public_status', 'message', '无效的状态值'));
  END IF;

  IF jsonb_typeof(v_servings) = 'array' THEN
    FOR v_elem IN SELECT value FROM jsonb_array_elements(v_servings) LOOP
      v_type := coalesce(nullif(trim(v_elem->>'serving_type'), ''), 'draft');
      IF v_type NOT IN ('draft', 'can', 'bottle', 'flight', 'other') THEN
        v_errors := v_errors || jsonb_build_array(jsonb_build_object(
          'field', 'serving_type', 'message', '无效的规格类型'));
      END IF;
    END LOOP;
  END IF;

  IF v_drink_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.drinks d WHERE d.id = v_drink_id AND d.tenant_id = p_tenant_id
    ) THEN
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'field', 'id', 'message', '酒款不属于该门店'));
    ELSIF v_is_public AND NOT EXISTS (
      SELECT 1 FROM public.drinks d WHERE d.id = v_drink_id AND d.enabled = true
    ) THEN
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'field', 'is_public_visible', 'message', '未上架（enabled=false）的酒款不能公开'));
    END IF;
  END IF;

  IF jsonb_array_length(v_errors) > 0 THEN
    RETURN jsonb_build_object('ok', false, 'errors', v_errors);
  END IF;

  v_category_id := nullif(p_drink->>'category_id', '')::uuid;
  IF v_category_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.categories c WHERE c.id = v_category_id AND c.tenant_id = p_tenant_id
     ) THEN
    v_category_id := NULL;
  END IF;

  IF v_drink_id IS NULL THEN
    v_is_new := true;

    IF v_category_id IS NULL THEN
      SELECT c.id INTO v_category_id
      FROM public.categories c
      WHERE c.tenant_id = p_tenant_id
      ORDER BY c.sort_order, c.created_at, c.id
      LIMIT 1;

      IF v_category_id IS NULL THEN
        INSERT INTO public.categories (tenant_id, name, sort_order, enabled, is_public_visible)
        VALUES (p_tenant_id, '生啤', 1, true, true)
        RETURNING id INTO v_category_id;
      END IF;
    END IF;

    INSERT INTO public.drinks (
      tenant_id, category_id, brand_name, name, price, price_unit,
      sort_order, enabled, image_url, is_public_visible, public_status, public_sort_order
    )
    VALUES (
      p_tenant_id, v_category_id,
      nullif(trim(p_drink->>'brand_name'), ''),
      v_name,
      0, '杯',
      coalesce((SELECT max(sort_order) FROM public.drinks WHERE tenant_id = p_tenant_id), 0) + 1,
      true,
      nullif(trim(p_drink->>'image_url'), ''),
      v_is_public, v_status,
      coalesce((SELECT max(public_sort_order) FROM public.drinks WHERE tenant_id = p_tenant_id), 0) + 1
    )
    RETURNING id INTO v_drink_id;
  ELSE
    UPDATE public.drinks
    SET
      brand_name = nullif(trim(p_drink->>'brand_name'), ''),
      name = v_name,
      image_url = nullif(trim(p_drink->>'image_url'), ''),
      is_public_visible = v_is_public,
      public_status = v_status,
      category_id = coalesce(v_category_id, category_id)
    WHERE id = v_drink_id AND tenant_id = p_tenant_id;
  END IF;

  IF v_profile IS NOT NULL AND jsonb_typeof(v_profile) = 'object' THEN
    INSERT INTO public.drink_beer_profiles (
      tenant_id, drink_id, brewery, beer_style, abv, ibu, country, description
    )
    VALUES (
      p_tenant_id, v_drink_id,
      nullif(trim(v_profile->>'brewery'), ''),
      nullif(trim(v_profile->>'beer_style'), ''),
      nullif(trim(v_profile->>'abv'), '')::numeric,
      nullif(trim(v_profile->>'ibu'), '')::integer,
      nullif(trim(v_profile->>'country'), ''),
      nullif(trim(v_profile->>'description'), '')
    )
    ON CONFLICT (drink_id) DO UPDATE SET
      brewery = excluded.brewery,
      beer_style = excluded.beer_style,
      abv = excluded.abv,
      ibu = excluded.ibu,
      country = excluded.country,
      description = excluded.description,
      updated_at = now();
  END IF;

  IF jsonb_typeof(v_servings) = 'array' THEN
    FOR v_elem IN SELECT value FROM jsonb_array_elements(v_servings) LOOP
      IF coalesce((v_elem->>'delete')::boolean, false) THEN
        IF nullif(v_elem->>'id', '') IS NOT NULL THEN
          DELETE FROM public.drink_serving_options
          WHERE id = (v_elem->>'id')::uuid AND tenant_id = p_tenant_id;
        END IF;
        CONTINUE;
      END IF;

      IF nullif(v_elem->>'id', '') IS NOT NULL THEN
        UPDATE public.drink_serving_options
        SET
          serving_type = coalesce(nullif(trim(v_elem->>'serving_type'), ''), 'draft'),
          label = coalesce(nullif(trim(v_elem->>'label'), ''), '杯'),
          volume_ml = nullif(trim(v_elem->>'volume_ml'), '')::integer,
          price = coalesce((v_elem->>'price')::numeric, 0),
          is_default = coalesce((v_elem->>'is_default')::boolean, false),
          is_active = coalesce((v_elem->>'is_active')::boolean, true),
          public_sort_order = coalesce((v_elem->>'public_sort_order')::integer, 0),
          updated_at = now()
        WHERE id = (v_elem->>'id')::uuid AND tenant_id = p_tenant_id;
      ELSE
        INSERT INTO public.drink_serving_options (
          tenant_id, drink_id, serving_type, label, volume_ml, price,
          is_default, is_active, public_sort_order
        )
        VALUES (
          p_tenant_id, v_drink_id,
          coalesce(nullif(trim(v_elem->>'serving_type'), ''), 'draft'),
          coalesce(nullif(trim(v_elem->>'label'), ''), '杯'),
          nullif(trim(v_elem->>'volume_ml'), '')::integer,
          coalesce((v_elem->>'price')::numeric, 0),
          coalesce((v_elem->>'is_default')::boolean, false),
          coalesce((v_elem->>'is_active')::boolean, true),
          coalesce((v_elem->>'public_sort_order')::integer, 0)
        );
      END IF;
    END LOOP;

    SELECT count(*) INTO v_default_count
    FROM public.drink_serving_options
    WHERE drink_id = v_drink_id AND is_default = true;

    IF v_default_count > 1 THEN
      UPDATE public.drink_serving_options so
      SET is_default = false
      WHERE so.drink_id = v_drink_id
        AND so.is_default = true
        AND so.id <> (
          SELECT id FROM public.drink_serving_options
          WHERE drink_id = v_drink_id AND is_default = true
          ORDER BY public_sort_order, created_at
          LIMIT 1
        );
    END IF;
  END IF;

  UPDATE public.tenants SET last_menu_updated_at = now() WHERE id = p_tenant_id;

  RETURN jsonb_build_object('ok', true, 'drink_id', v_drink_id, 'created', v_is_new);
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_taplist_drink(uuid, jsonb) TO authenticated;


-- ========================================================
-- Phase 0 safety: owner-only publish + price sync
-- Mirror of migrations/20260719120000_taplist_publish_safety.sql
-- ========================================================

-- Phase 0 safety: owner-only tenant publish, minimum publish guard,
-- and taplist price sync so POS never shows orderable unset ¥0 beers.
-- Forward-only: does not edit 20260714120000_owner_taplist_publish.sql.

-- ---------------------------------------------------------------------------
-- Owner helper (tenant owner or platform super_admin)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.taplist_is_tenant_owner(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND (
        ur.role = 'super_admin'
        OR (ur.tenant_id = p_tenant_id AND ur.role = 'owner')
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.taplist_is_tenant_owner(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Minimum readiness for making a tenant public
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_tenant_publish_readiness(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant public.tenants%ROWTYPE;
  v_errors jsonb := '[]'::jsonb;
  v_public_count integer := 0;
  v_unpriced integer := 0;
  v_has_owner boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.taplist_can_view_tenant(p_tenant_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT * INTO v_tenant FROM public.tenants WHERE id = p_tenant_id;
  IF v_tenant.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'errors', jsonb_build_array('门店不存在'));
  END IF;

  IF coalesce(v_tenant.status, 'active') <> 'active' THEN
    v_errors := v_errors || jsonb_build_array('门店未处于活跃状态');
  END IF;

  IF nullif(trim(coalesce(v_tenant.display_name, v_tenant.name, '')), '') IS NULL THEN
    v_errors := v_errors || jsonb_build_array('请填写门店名称');
  END IF;

  IF nullif(trim(coalesce(v_tenant.city, '')), '') IS NULL THEN
    v_errors := v_errors || jsonb_build_array('请填写城市');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.tenant_id = p_tenant_id AND ur.role = 'owner'
  ) INTO v_has_owner;

  IF NOT v_has_owner AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role = 'super_admin'
  ) THEN
    v_errors := v_errors || jsonb_build_array('门店尚未认领店主');
  END IF;

  SELECT count(*) INTO v_public_count
  FROM public.drinks d
  WHERE d.tenant_id = p_tenant_id
    AND d.enabled = true
    AND d.is_public_visible = true;

  IF v_public_count < 1 THEN
    v_errors := v_errors || jsonb_build_array('至少需要 1 个公开酒款');
  END IF;

  SELECT count(*) INTO v_unpriced
  FROM public.drinks d
  WHERE d.tenant_id = p_tenant_id
    AND d.enabled = true
    AND d.is_public_visible = true
    AND NOT EXISTS (
      SELECT 1 FROM public.drink_serving_options so
      WHERE so.drink_id = d.id
        AND so.is_active = true
        AND so.price > 0
        AND (
          so.is_default = true
          OR (
            SELECT count(*) FROM public.drink_serving_options so2
            WHERE so2.drink_id = d.id AND so2.is_active = true AND so2.price > 0
          ) = 1
        )
    );

  IF v_unpriced > 0 THEN
    v_errors := v_errors || jsonb_build_array(
      format('%s 个公开酒款缺少有效价格规格', v_unpriced));
  END IF;

  RETURN jsonb_build_object(
    'ok', jsonb_array_length(v_errors) = 0,
    'errors', v_errors,
    'public_drink_count', v_public_count,
    'has_owner', v_has_owner
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_tenant_publish_readiness(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Owner-only publish / unpublish with minimum guard
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_tenant_public_visibility(
  p_tenant_id uuid,
  p_visible boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ready jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.taplist_is_tenant_owner(p_tenant_id) THEN
    RAISE EXCEPTION 'Forbidden: only owner can publish or unpublish the storefront';
  END IF;

  IF p_visible THEN
    v_ready := public.get_tenant_publish_readiness(p_tenant_id);
    IF NOT coalesce((v_ready->>'ok')::boolean, false) THEN
      RAISE EXCEPTION 'Publish blocked: %', coalesce(v_ready->>'errors', '[]');
    END IF;
  END IF;

  UPDATE public.tenants
  SET is_public_visible = p_visible, last_menu_updated_at = now()
  WHERE id = p_tenant_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_tenant_public_visibility(uuid, boolean) TO authenticated;

-- ---------------------------------------------------------------------------
-- upsert_taplist_drink: sync drinks.price from servings; disable POS if unset
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.upsert_taplist_drink(
  p_tenant_id uuid,
  p_drink jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_errors jsonb := '[]'::jsonb;
  v_drink_id uuid;
  v_category_id uuid;
  v_is_new boolean := false;
  v_name text;
  v_status text;
  v_is_public boolean;
  v_profile jsonb;
  v_servings jsonb;
  v_elem jsonb;
  v_type text;
  v_default_count integer;
  v_sync_price numeric;
  v_priced_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant id is required';
  END IF;

  IF NOT public.taplist_can_view_tenant(p_tenant_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_drink IS NULL OR jsonb_typeof(p_drink) <> 'object' THEN
    RAISE EXCEPTION 'p_drink must be a JSON object';
  END IF;

  v_drink_id := nullif(p_drink->>'id', '')::uuid;
  v_name := trim(coalesce(p_drink->>'name', ''));
  v_status := coalesce(nullif(trim(p_drink->>'public_status'), ''), 'available');
  v_is_public := coalesce((p_drink->>'is_public_visible')::boolean, false);
  v_profile := p_drink->'profile';
  v_servings := p_drink->'servings';

  IF v_name = '' THEN
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'field', 'name', 'message', '请填写酒款名称'));
  END IF;

  IF v_status NOT IN ('new', 'available', 'low', 'sold_out', 'coming_soon') THEN
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'field', 'public_status', 'message', '无效的状态值'));
  END IF;

  IF jsonb_typeof(v_servings) = 'array' THEN
    FOR v_elem IN SELECT value FROM jsonb_array_elements(v_servings) LOOP
      v_type := coalesce(nullif(trim(v_elem->>'serving_type'), ''), 'draft');
      IF v_type NOT IN ('draft', 'can', 'bottle', 'flight', 'other') THEN
        v_errors := v_errors || jsonb_build_array(jsonb_build_object(
          'field', 'serving_type', 'message', '无效的规格类型'));
      END IF;
    END LOOP;
  END IF;

  IF v_drink_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.drinks d WHERE d.id = v_drink_id AND d.tenant_id = p_tenant_id
    ) THEN
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'field', 'id', 'message', '酒款不属于该门店'));
    END IF;
  END IF;

  IF jsonb_array_length(v_errors) > 0 THEN
    RETURN jsonb_build_object('ok', false, 'errors', v_errors);
  END IF;

  v_category_id := nullif(p_drink->>'category_id', '')::uuid;
  IF v_category_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.categories c WHERE c.id = v_category_id AND c.tenant_id = p_tenant_id
     ) THEN
    v_category_id := NULL;
  END IF;

  IF v_drink_id IS NULL THEN
    v_is_new := true;

    IF v_category_id IS NULL THEN
      SELECT c.id INTO v_category_id
      FROM public.categories c
      WHERE c.tenant_id = p_tenant_id
      ORDER BY c.sort_order, c.created_at, c.id
      LIMIT 1;

      IF v_category_id IS NULL THEN
        INSERT INTO public.categories (tenant_id, name, sort_order, enabled, is_public_visible)
        VALUES (p_tenant_id, '生啤', 1, true, true)
        RETURNING id INTO v_category_id;
      END IF;
    END IF;

    -- Start not POS-orderable until priced serving sync runs below.
    INSERT INTO public.drinks (
      tenant_id, category_id, brand_name, name, price, price_unit,
      sort_order, enabled, image_url, is_public_visible, public_status, public_sort_order
    )
    VALUES (
      p_tenant_id, v_category_id,
      nullif(trim(p_drink->>'brand_name'), ''),
      v_name,
      0, '杯',
      coalesce((SELECT max(sort_order) FROM public.drinks WHERE tenant_id = p_tenant_id), 0) + 1,
      false,
      nullif(trim(p_drink->>'image_url'), ''),
      false, v_status,
      coalesce((SELECT max(public_sort_order) FROM public.drinks WHERE tenant_id = p_tenant_id), 0) + 1
    )
    RETURNING id INTO v_drink_id;
  ELSE
    UPDATE public.drinks
    SET
      brand_name = nullif(trim(p_drink->>'brand_name'), ''),
      name = v_name,
      image_url = nullif(trim(p_drink->>'image_url'), ''),
      public_status = v_status,
      category_id = coalesce(v_category_id, category_id)
    WHERE id = v_drink_id AND tenant_id = p_tenant_id;
  END IF;

  IF v_profile IS NOT NULL AND jsonb_typeof(v_profile) = 'object' THEN
    INSERT INTO public.drink_beer_profiles (
      tenant_id, drink_id, brewery, beer_style, abv, ibu, country, description
    )
    VALUES (
      p_tenant_id, v_drink_id,
      nullif(trim(v_profile->>'brewery'), ''),
      nullif(trim(v_profile->>'beer_style'), ''),
      nullif(trim(v_profile->>'abv'), '')::numeric,
      nullif(trim(v_profile->>'ibu'), '')::integer,
      nullif(trim(v_profile->>'country'), ''),
      nullif(trim(v_profile->>'description'), '')
    )
    ON CONFLICT (drink_id) DO UPDATE SET
      brewery = excluded.brewery,
      beer_style = excluded.beer_style,
      abv = excluded.abv,
      ibu = excluded.ibu,
      country = excluded.country,
      description = excluded.description,
      updated_at = now();
  END IF;

  IF jsonb_typeof(v_servings) = 'array' THEN
    FOR v_elem IN SELECT value FROM jsonb_array_elements(v_servings) LOOP
      IF coalesce((v_elem->>'delete')::boolean, false) THEN
        IF nullif(v_elem->>'id', '') IS NOT NULL THEN
          DELETE FROM public.drink_serving_options
          WHERE id = (v_elem->>'id')::uuid AND tenant_id = p_tenant_id;
        END IF;
        CONTINUE;
      END IF;

      IF nullif(v_elem->>'id', '') IS NOT NULL THEN
        UPDATE public.drink_serving_options
        SET
          serving_type = coalesce(nullif(trim(v_elem->>'serving_type'), ''), 'draft'),
          label = coalesce(nullif(trim(v_elem->>'label'), ''), '杯'),
          volume_ml = nullif(trim(v_elem->>'volume_ml'), '')::integer,
          price = coalesce((v_elem->>'price')::numeric, 0),
          is_default = coalesce((v_elem->>'is_default')::boolean, false),
          is_active = coalesce((v_elem->>'is_active')::boolean, true),
          public_sort_order = coalesce((v_elem->>'public_sort_order')::integer, 0),
          updated_at = now()
        WHERE id = (v_elem->>'id')::uuid AND tenant_id = p_tenant_id;
      ELSE
        INSERT INTO public.drink_serving_options (
          tenant_id, drink_id, serving_type, label, volume_ml, price,
          is_default, is_active, public_sort_order
        )
        VALUES (
          p_tenant_id, v_drink_id,
          coalesce(nullif(trim(v_elem->>'serving_type'), ''), 'draft'),
          coalesce(nullif(trim(v_elem->>'label'), ''), '杯'),
          nullif(trim(v_elem->>'volume_ml'), '')::integer,
          coalesce((v_elem->>'price')::numeric, 0),
          coalesce((v_elem->>'is_default')::boolean, false),
          coalesce((v_elem->>'is_active')::boolean, true),
          coalesce((v_elem->>'public_sort_order')::integer, 0)
        );
      END IF;
    END LOOP;

    SELECT count(*) INTO v_default_count
    FROM public.drink_serving_options
    WHERE drink_id = v_drink_id AND is_default = true;

    IF v_default_count > 1 THEN
      UPDATE public.drink_serving_options so
      SET is_default = false
      WHERE so.drink_id = v_drink_id
        AND so.is_default = true
        AND so.id <> (
          SELECT id FROM public.drink_serving_options
          WHERE drink_id = v_drink_id AND is_default = true
          ORDER BY public_sort_order, created_at
          LIMIT 1
        );
    END IF;
  END IF;

  -- Sync legacy drinks.price from servings (never invent from cheapest of many).
  SELECT so.price INTO v_sync_price
  FROM public.drink_serving_options so
  WHERE so.drink_id = v_drink_id
    AND so.is_active = true
    AND so.is_default = true
    AND so.price > 0
  ORDER BY so.public_sort_order, so.created_at
  LIMIT 1;

  IF v_sync_price IS NULL THEN
    SELECT count(*) INTO v_priced_count
    FROM public.drink_serving_options so
    WHERE so.drink_id = v_drink_id
      AND so.is_active = true
      AND so.price > 0;

    IF v_priced_count = 1 THEN
      SELECT so.price INTO v_sync_price
      FROM public.drink_serving_options so
      WHERE so.drink_id = v_drink_id
        AND so.is_active = true
        AND so.price > 0
      LIMIT 1;
    END IF;
  END IF;

  IF v_sync_price IS NOT NULL THEN
    UPDATE public.drinks
    SET
      price = v_sync_price,
      enabled = true,
      is_public_visible = v_is_public
    WHERE id = v_drink_id AND tenant_id = p_tenant_id;
  ELSE
    -- No valid priced serving: not POS-orderable; cannot be public.
    UPDATE public.drinks
    SET
      price = 0,
      enabled = false,
      is_public_visible = false
    WHERE id = v_drink_id AND tenant_id = p_tenant_id;
  END IF;

  UPDATE public.tenants SET last_menu_updated_at = now() WHERE id = p_tenant_id;

  RETURN jsonb_build_object(
    'ok', true,
    'drink_id', v_drink_id,
    'created', v_is_new,
    'pos_orderable', v_sync_price IS NOT NULL,
    'public_cleared', v_sync_price IS NULL AND v_is_public
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_taplist_drink(uuid, jsonb) TO authenticated;


-- ========================================================
-- Phase 1a: invites + membership
-- Mirror of migrations/20260719130000_tenant_invites_membership.sql
-- ========================================================

-- Phase 1a: user profiles, tenant invites (email bridge), onboarding_status,
-- narrow audit log, and membership RPCs. Account creation is email+password
-- in the app; invite accept requires authenticated email match.

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.user_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  mobile text UNIQUE,
  display_name text,
  avatar_url text,
  email text,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_email
  ON public.user_profiles (lower(email));

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS onboarding_status text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS owner_claimed_at timestamptz NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tenants_onboarding_status_check'
  ) THEN
    ALTER TABLE public.tenants
      ADD CONSTRAINT tenants_onboarding_status_check
      CHECK (onboarding_status IN (
        'draft',
        'pending_owner_claim',
        'setup_in_progress',
        'ready_for_review',
        'public_live',
        'suspended'
      ));
  END IF;
END $$;

-- Existing live bars: treat as setup/public based on visibility.
UPDATE public.tenants
SET onboarding_status = CASE
  WHEN is_public_visible THEN 'public_live'
  WHEN EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.tenant_id = tenants.id AND ur.role = 'owner'
  ) THEN 'setup_in_progress'
  ELSE 'draft'
END
WHERE onboarding_status = 'draft';

CREATE TABLE IF NOT EXISTS public.tenant_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  contact_type text NOT NULL CHECK (contact_type IN ('email', 'mobile')),
  email text NULL,
  mobile text NULL,
  role text NOT NULL CHECK (role IN ('owner', 'manager', 'staff')),
  token_hash text NOT NULL UNIQUE,
  invited_by uuid NULL REFERENCES auth.users(id),
  expires_at timestamptz NOT NULL,
  accepted_by uuid NULL REFERENCES auth.users(id),
  accepted_at timestamptz NULL,
  revoked_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_invites_contact_match CHECK (
    (contact_type = 'email' AND email IS NOT NULL AND mobile IS NULL)
    OR (contact_type = 'mobile' AND mobile IS NOT NULL AND email IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_invites_pending_email
  ON public.tenant_invites (tenant_id, role, lower(email))
  WHERE revoked_at IS NULL AND accepted_at IS NULL AND contact_type = 'email';

CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_invites_pending_mobile
  ON public.tenant_invites (tenant_id, role, mobile)
  WHERE revoked_at IS NULL AND accepted_at IS NULL AND contact_type = 'mobile';

CREATE INDEX IF NOT EXISTS idx_tenant_invites_tenant
  ON public.tenant_invites (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NULL REFERENCES public.tenants(id) ON DELETE SET NULL,
  actor_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  entity_type text NULL,
  entity_id uuid NULL,
  before jsonb NULL,
  after jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_events_tenant_created
  ON public.audit_events (tenant_id, created_at DESC);

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_profiles_self ON public.user_profiles;
CREATE POLICY user_profiles_self ON public.user_profiles
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS user_profiles_super_admin ON public.user_profiles;
CREATE POLICY user_profiles_super_admin ON public.user_profiles
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'super_admin'
    )
  );

-- Invites / audit are RPC-only (no broad client policies).
DROP POLICY IF EXISTS tenant_invites_no_direct ON public.tenant_invites;
CREATE POLICY tenant_invites_no_direct ON public.tenant_invites
  FOR ALL TO authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS audit_events_no_direct ON public.audit_events;
CREATE POLICY audit_events_no_direct ON public.audit_events
  FOR ALL TO authenticated
  USING (false)
  WITH CHECK (false);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._audit_log(
  p_tenant_id uuid,
  p_event_type text,
  p_entity_type text,
  p_entity_id uuid,
  p_before jsonb,
  p_after jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_events (
    tenant_id, actor_user_id, event_type, entity_type, entity_id, before, after
  ) VALUES (
    p_tenant_id, auth.uid(), p_event_type, p_entity_type, p_entity_id, p_before, p_after
  );
END;
$$;

CREATE OR REPLACE FUNCTION public._normalize_invite_email(p_email text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT nullif(lower(trim(p_email)), '');
$$;

CREATE OR REPLACE FUNCTION public._hash_invite_token(p_token text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions
AS $$
  SELECT encode(digest(p_token, 'sha256'), 'hex');
$$;

CREATE OR REPLACE FUNCTION public._new_invite_token()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = public, extensions
AS $$
  -- 10 hex chars, suitable for paste codes.
  -- pgcrypto lives in extensions; callers often SET search_path = public only.
  SELECT upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 10));
$$;

-- ---------------------------------------------------------------------------
-- ensure_user_profile
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ensure_user_profile()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_phone text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT u.email, u.phone INTO v_email, v_phone
  FROM auth.users u WHERE u.id = v_uid;

  INSERT INTO public.user_profiles (user_id, email, mobile, display_name)
  VALUES (
    v_uid,
    public._normalize_invite_email(v_email),
    nullif(trim(coalesce(v_phone, '')), ''),
    split_part(coalesce(v_email, ''), '@', 1)
  )
  ON CONFLICT (user_id) DO UPDATE SET
    email = coalesce(excluded.email, public.user_profiles.email),
    mobile = coalesce(public.user_profiles.mobile, excluded.mobile),
    updated_at = now();

  RETURN (
    SELECT to_jsonb(p) FROM public.user_profiles p WHERE p.user_id = v_uid
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_user_profile() TO authenticated;

-- ---------------------------------------------------------------------------
-- get_my_tenants
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_my_tenants()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  PERFORM public.ensure_user_profile();

  RETURN coalesce((
    SELECT jsonb_agg(
      jsonb_build_object(
        'tenant_id', t.id,
        'name', t.name,
        'display_name', t.display_name,
        'slug', t.slug,
        'role', ur.role,
        'status', t.status,
        'onboarding_status', t.onboarding_status,
        'is_public_visible', t.is_public_visible
      )
      ORDER BY
        CASE ur.role WHEN 'super_admin' THEN 0 WHEN 'owner' THEN 1 ELSE 2 END,
        t.name
    )
    FROM public.user_roles ur
    JOIN public.tenants t ON t.id = ur.tenant_id
    WHERE ur.user_id = v_uid
      AND ur.role IN ('owner', 'staff', 'super_admin')
      AND coalesce(t.slug, '') <> '__platform__'
  ), '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_tenants() TO authenticated;

-- ---------------------------------------------------------------------------
-- create_tenant_invite
-- Returns raw_token once (never stored in plaintext).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_tenant_invite(
  p_tenant_id uuid,
  p_contact_type text,
  p_email text,
  p_mobile text,
  p_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_mobile text;
  v_token text;
  v_hash text;
  v_id uuid;
  v_is_super boolean;
  v_is_owner boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant id is required';
  END IF;

  IF p_role NOT IN ('owner', 'staff') THEN
    RAISE EXCEPTION 'Role must be owner or staff';
  END IF;

  IF p_contact_type NOT IN ('email', 'mobile') THEN
    RAISE EXCEPTION 'Invalid contact_type';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = v_uid AND ur.role = 'super_admin'
  ) INTO v_is_super;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = v_uid AND ur.tenant_id = p_tenant_id AND ur.role = 'owner'
  ) INTO v_is_owner;

  IF p_role = 'owner' AND NOT v_is_super THEN
    RAISE EXCEPTION 'Only super_admin can create owner invites';
  END IF;

  IF p_role = 'staff' AND NOT (v_is_owner OR v_is_super) THEN
    RAISE EXCEPTION 'Only owner can create staff invites';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = p_tenant_id) THEN
    RAISE EXCEPTION 'Tenant not found';
  END IF;

  v_email := NULL;
  v_mobile := NULL;
  IF p_contact_type = 'email' THEN
    v_email := public._normalize_invite_email(p_email);
    IF v_email IS NULL THEN
      RAISE EXCEPTION 'Email is required';
    END IF;
  ELSE
    v_mobile := nullif(trim(p_mobile), '');
    IF v_mobile IS NULL THEN
      RAISE EXCEPTION 'Mobile is required';
    END IF;
  END IF;

  -- Revoke prior pending invite for same tenant/role/contact.
  UPDATE public.tenant_invites
  SET revoked_at = now()
  WHERE tenant_id = p_tenant_id
    AND role = p_role
    AND revoked_at IS NULL
    AND accepted_at IS NULL
    AND (
      (p_contact_type = 'email' AND lower(email) = v_email)
      OR (p_contact_type = 'mobile' AND mobile = v_mobile)
    );

  v_token := public._new_invite_token();
  v_hash := public._hash_invite_token(v_token);

  INSERT INTO public.tenant_invites (
    tenant_id, contact_type, email, mobile, role, token_hash, invited_by, expires_at
  ) VALUES (
    p_tenant_id, p_contact_type, v_email, v_mobile, p_role, v_hash, v_uid, now() + interval '7 days'
  )
  RETURNING id INTO v_id;

  IF p_role = 'owner' THEN
    UPDATE public.tenants
    SET onboarding_status = CASE
      WHEN onboarding_status IN ('public_live', 'setup_in_progress', 'ready_for_review')
        THEN onboarding_status
      ELSE 'pending_owner_claim'
    END
    WHERE id = p_tenant_id;
  END IF;

  PERFORM public._audit_log(
    p_tenant_id,
    CASE WHEN p_role = 'owner' THEN 'owner_invite_created' ELSE 'staff_invite_created' END,
    'tenant_invite',
    v_id,
    NULL,
    jsonb_build_object(
      'contact_type', p_contact_type,
      'email', v_email,
      'mobile', v_mobile,
      'role', p_role
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'invite_id', v_id,
    'raw_token', v_token,
    'expires_at', (now() + interval '7 days'),
    'role', p_role,
    'contact_type', p_contact_type,
    'email', v_email,
    'mobile', v_mobile
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_tenant_invite(uuid, text, text, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- accept_tenant_invite
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.accept_tenant_invite(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_hash text;
  v_inv public.tenant_invites%ROWTYPE;
  v_tenant public.tenants%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF nullif(trim(p_token), '') IS NULL THEN
    RAISE EXCEPTION 'Invite code is required';
  END IF;

  PERFORM public.ensure_user_profile();

  SELECT public._normalize_invite_email(u.email) INTO v_email
  FROM auth.users u WHERE u.id = v_uid;

  v_hash := public._hash_invite_token(upper(trim(p_token)));

  SELECT * INTO v_inv
  FROM public.tenant_invites
  WHERE token_hash = v_hash
  LIMIT 1;

  IF v_inv.id IS NULL THEN
    -- Also try raw (case-sensitive) hash for deep-link tokens.
    v_hash := public._hash_invite_token(trim(p_token));
    SELECT * INTO v_inv FROM public.tenant_invites WHERE token_hash = v_hash LIMIT 1;
  END IF;

  IF v_inv.id IS NULL THEN
    RAISE EXCEPTION 'Invalid invite code';
  END IF;

  IF v_inv.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'Invite has been revoked';
  END IF;

  IF v_inv.accepted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Invite already used';
  END IF;

  IF v_inv.expires_at < now() THEN
    RAISE EXCEPTION 'Invite has expired';
  END IF;

  IF v_inv.contact_type = 'email' THEN
    IF v_email IS NULL OR v_email <> v_inv.email THEN
      RAISE EXCEPTION 'Invite email does not match your account';
    END IF;
  ELSE
    RAISE EXCEPTION 'Mobile invites are not enabled yet';
  END IF;

  SELECT * INTO v_tenant FROM public.tenants WHERE id = v_inv.tenant_id;
  IF v_tenant.id IS NULL THEN
    RAISE EXCEPTION 'Tenant not found';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = v_uid AND ur.tenant_id = v_inv.tenant_id
  ) THEN
    -- Already a member: mark invite accepted and return.
    UPDATE public.tenant_invites
    SET accepted_at = now(), accepted_by = v_uid
    WHERE id = v_inv.id AND accepted_at IS NULL;
  ELSE
    IF v_inv.role = 'owner' AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.tenant_id = v_inv.tenant_id AND ur.role = 'owner'
    ) THEN
      RAISE EXCEPTION 'This bar already has an owner';
    END IF;

    INSERT INTO public.user_roles (user_id, tenant_id, role)
    VALUES (v_uid, v_inv.tenant_id, v_inv.role);

    UPDATE public.tenant_invites
    SET accepted_at = now(), accepted_by = v_uid
    WHERE id = v_inv.id;
  END IF;

  IF v_inv.role = 'owner' THEN
    UPDATE public.tenants
    SET
      owner_claimed_at = coalesce(owner_claimed_at, now()),
      onboarding_status = CASE
        WHEN onboarding_status = 'public_live' THEN 'public_live'
        ELSE 'setup_in_progress'
      END
    WHERE id = v_inv.tenant_id;
  END IF;

  PERFORM public._audit_log(
    v_inv.tenant_id,
    'invite_accepted',
    'tenant_invite',
    v_inv.id,
    NULL,
    jsonb_build_object('role', v_inv.role, 'user_id', v_uid)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'tenant_id', v_inv.tenant_id,
    'role', v_inv.role,
    'tenant_name', coalesce(v_tenant.display_name, v_tenant.name)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_tenant_invite(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- revoke / list invites
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.revoke_tenant_invite(p_invite_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv public.tenant_invites%ROWTYPE;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_inv FROM public.tenant_invites WHERE id = p_invite_id;
  IF v_inv.id IS NULL THEN
    RAISE EXCEPTION 'Invite not found';
  END IF;

  IF NOT (
    public.taplist_is_tenant_owner(v_inv.tenant_id)
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = v_uid AND ur.role = 'super_admin'
    )
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF v_inv.role = 'owner' AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = v_uid AND ur.role = 'super_admin'
  ) THEN
    RAISE EXCEPTION 'Only super_admin can revoke owner invites';
  END IF;

  UPDATE public.tenant_invites
  SET revoked_at = now()
  WHERE id = p_invite_id AND revoked_at IS NULL AND accepted_at IS NULL;

  PERFORM public._audit_log(
    v_inv.tenant_id, 'invite_revoked', 'tenant_invite', p_invite_id, NULL, NULL
  );

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.revoke_tenant_invite(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_tenant_invites(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT (
    public.taplist_is_tenant_owner(p_tenant_id)
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = v_uid AND ur.role = 'super_admin'
    )
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  RETURN coalesce((
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', i.id,
        'contact_type', i.contact_type,
        'email', i.email,
        'mobile', i.mobile,
        'role', i.role,
        'expires_at', i.expires_at,
        'accepted_at', i.accepted_at,
        'revoked_at', i.revoked_at,
        'created_at', i.created_at,
        'status', CASE
          WHEN i.accepted_at IS NOT NULL THEN 'accepted'
          WHEN i.revoked_at IS NOT NULL THEN 'revoked'
          WHEN i.expires_at < now() THEN 'expired'
          ELSE 'pending'
        END
      )
      ORDER BY i.created_at DESC
    )
    FROM public.tenant_invites i
    WHERE i.tenant_id = p_tenant_id
  ), '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_tenant_invites(uuid) TO authenticated;

-- Wire publish/unpublish into onboarding_status + audit (extends Phase 0).
CREATE OR REPLACE FUNCTION public.set_tenant_public_visibility(
  p_tenant_id uuid,
  p_visible boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ready jsonb;
  v_before boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.taplist_is_tenant_owner(p_tenant_id) THEN
    RAISE EXCEPTION 'Forbidden: only owner can publish or unpublish the storefront';
  END IF;

  SELECT is_public_visible INTO v_before FROM public.tenants WHERE id = p_tenant_id;

  IF p_visible THEN
    v_ready := public.get_tenant_publish_readiness(p_tenant_id);
    IF NOT coalesce((v_ready->>'ok')::boolean, false) THEN
      RAISE EXCEPTION 'Publish blocked: %', coalesce(v_ready->>'errors', '[]');
    END IF;

    UPDATE public.tenants
    SET
      is_public_visible = true,
      onboarding_status = 'public_live',
      last_menu_updated_at = now()
    WHERE id = p_tenant_id;

    PERFORM public._audit_log(
      p_tenant_id, 'tenant_published', 'tenant', p_tenant_id,
      jsonb_build_object('is_public_visible', v_before),
      jsonb_build_object('is_public_visible', true)
    );
  ELSE
    UPDATE public.tenants
    SET
      is_public_visible = false,
      onboarding_status = CASE
        WHEN onboarding_status = 'public_live' THEN 'setup_in_progress'
        ELSE onboarding_status
      END,
      last_menu_updated_at = now()
    WHERE id = p_tenant_id;

    PERFORM public._audit_log(
      p_tenant_id, 'tenant_unpublished', 'tenant', p_tenant_id,
      jsonb_build_object('is_public_visible', v_before),
      jsonb_build_object('is_public_visible', false)
    );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_tenant_public_visibility(uuid, boolean) TO authenticated;


-- ========================================================
-- Mobile invite matching + profile phone
-- Mirror of migrations/20260719140000_invite_mobile_auth.sql
-- ========================================================

-- Enable mobile invite matching against verified auth.users.phone.
-- Phone OTP login/signup is handled by Supabase Auth (see config.toml [auth.sms]).

CREATE OR REPLACE FUNCTION public._normalize_invite_mobile(p_mobile text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  d text;
BEGIN
  d := regexp_replace(coalesce(p_mobile, ''), '\D', '', 'g');
  IF d = '' THEN
    RETURN NULL;
  END IF;

  IF d ~ '^86[1][3-9]\d{9}$' THEN
    RETURN d; -- 8613xxxxxxxxx
  END IF;

  IF d ~ '^086[1][3-9]\d{9}$' THEN
    RETURN substr(d, 2);
  END IF;

  IF d ~ '^0[1][3-9]\d{9}$' THEN
    RETURN '86' || substr(d, 2);
  END IF;

  IF d ~ '^[1][3-9]\d{9}$' THEN
    RETURN '86' || d;
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_user_profile()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_phone text;
  v_mobile_key text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT u.email, u.phone INTO v_email, v_phone
  FROM auth.users u WHERE u.id = v_uid;

  v_mobile_key := public._normalize_invite_mobile(v_phone);

  INSERT INTO public.user_profiles (user_id, email, mobile, display_name)
  VALUES (
    v_uid,
    public._normalize_invite_email(v_email),
    v_mobile_key,
    coalesce(
      nullif(v_mobile_key, ''),
      split_part(coalesce(v_email, ''), '@', 1),
      'user'
    )
  )
  ON CONFLICT (user_id) DO UPDATE SET
    email = coalesce(excluded.email, public.user_profiles.email),
    mobile = coalesce(excluded.mobile, public.user_profiles.mobile),
    updated_at = now();

  RETURN (
    SELECT to_jsonb(p) FROM public.user_profiles p WHERE p.user_id = v_uid
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_tenant_invite(
  p_tenant_id uuid,
  p_contact_type text,
  p_email text,
  p_mobile text,
  p_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_mobile text;
  v_token text;
  v_hash text;
  v_id uuid;
  v_is_super boolean;
  v_is_owner boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant id is required';
  END IF;

  IF p_role NOT IN ('owner', 'staff') THEN
    RAISE EXCEPTION 'Role must be owner or staff';
  END IF;

  IF p_contact_type NOT IN ('email', 'mobile') THEN
    RAISE EXCEPTION 'Invalid contact_type';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = v_uid AND ur.role = 'super_admin'
  ) INTO v_is_super;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = v_uid AND ur.tenant_id = p_tenant_id AND ur.role = 'owner'
  ) INTO v_is_owner;

  IF p_role = 'owner' AND NOT v_is_super THEN
    RAISE EXCEPTION 'Only super_admin can create owner invites';
  END IF;

  IF p_role = 'staff' AND NOT (v_is_owner OR v_is_super) THEN
    RAISE EXCEPTION 'Only owner can create staff invites';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = p_tenant_id) THEN
    RAISE EXCEPTION 'Tenant not found';
  END IF;

  v_email := NULL;
  v_mobile := NULL;
  IF p_contact_type = 'email' THEN
    v_email := public._normalize_invite_email(p_email);
    IF v_email IS NULL THEN
      RAISE EXCEPTION 'Email is required';
    END IF;
  ELSE
    v_mobile := public._normalize_invite_mobile(p_mobile);
    IF v_mobile IS NULL THEN
      RAISE EXCEPTION 'Invalid China mobile number';
    END IF;
  END IF;

  UPDATE public.tenant_invites
  SET revoked_at = now()
  WHERE tenant_id = p_tenant_id
    AND role = p_role
    AND revoked_at IS NULL
    AND accepted_at IS NULL
    AND (
      (p_contact_type = 'email' AND lower(email) = v_email)
      OR (p_contact_type = 'mobile' AND mobile = v_mobile)
    );

  v_token := public._new_invite_token();
  v_hash := public._hash_invite_token(v_token);

  INSERT INTO public.tenant_invites (
    tenant_id, contact_type, email, mobile, role, token_hash, invited_by, expires_at
  ) VALUES (
    p_tenant_id, p_contact_type, v_email, v_mobile, p_role, v_hash, v_uid, now() + interval '7 days'
  )
  RETURNING id INTO v_id;

  IF p_role = 'owner' THEN
    UPDATE public.tenants
    SET onboarding_status = CASE
      WHEN onboarding_status IN ('public_live', 'setup_in_progress', 'ready_for_review')
        THEN onboarding_status
      ELSE 'pending_owner_claim'
    END
    WHERE id = p_tenant_id;
  END IF;

  PERFORM public._audit_log(
    p_tenant_id,
    CASE WHEN p_role = 'owner' THEN 'owner_invite_created' ELSE 'staff_invite_created' END,
    'tenant_invite',
    v_id,
    NULL,
    jsonb_build_object(
      'contact_type', p_contact_type,
      'email', v_email,
      'mobile', v_mobile,
      'role', p_role
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'invite_id', v_id,
    'raw_token', v_token,
    'expires_at', (now() + interval '7 days'),
    'role', p_role,
    'contact_type', p_contact_type,
    'email', v_email,
    'mobile', v_mobile
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_tenant_invite(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_phone text;
  v_mobile_key text;
  v_hash text;
  v_inv public.tenant_invites%ROWTYPE;
  v_tenant public.tenants%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF nullif(trim(p_token), '') IS NULL THEN
    RAISE EXCEPTION 'Invite code is required';
  END IF;

  PERFORM public.ensure_user_profile();

  SELECT
    public._normalize_invite_email(u.email),
    u.phone
  INTO v_email, v_phone
  FROM auth.users u WHERE u.id = v_uid;

  v_mobile_key := public._normalize_invite_mobile(v_phone);

  v_hash := public._hash_invite_token(upper(trim(p_token)));

  SELECT * INTO v_inv
  FROM public.tenant_invites
  WHERE token_hash = v_hash
  LIMIT 1;

  IF v_inv.id IS NULL THEN
    v_hash := public._hash_invite_token(trim(p_token));
    SELECT * INTO v_inv FROM public.tenant_invites WHERE token_hash = v_hash LIMIT 1;
  END IF;

  IF v_inv.id IS NULL THEN
    RAISE EXCEPTION 'Invalid invite code';
  END IF;

  IF v_inv.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'Invite has been revoked';
  END IF;

  IF v_inv.accepted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Invite already used';
  END IF;

  IF v_inv.expires_at < now() THEN
    RAISE EXCEPTION 'Invite has expired';
  END IF;

  IF v_inv.contact_type = 'email' THEN
    IF v_email IS NULL OR v_email <> v_inv.email THEN
      RAISE EXCEPTION 'Invite email does not match your account';
    END IF;
  ELSIF v_inv.contact_type = 'mobile' THEN
    IF v_mobile_key IS NULL OR v_mobile_key <> v_inv.mobile THEN
      RAISE EXCEPTION 'Invite mobile does not match your account';
    END IF;
  ELSE
    RAISE EXCEPTION 'Invalid invite contact type';
  END IF;

  SELECT * INTO v_tenant FROM public.tenants WHERE id = v_inv.tenant_id;
  IF v_tenant.id IS NULL THEN
    RAISE EXCEPTION 'Tenant not found';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = v_uid AND ur.tenant_id = v_inv.tenant_id
  ) THEN
    UPDATE public.tenant_invites
    SET accepted_at = now(), accepted_by = v_uid
    WHERE id = v_inv.id AND accepted_at IS NULL;
  ELSE
    IF v_inv.role = 'owner' AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.tenant_id = v_inv.tenant_id AND ur.role = 'owner'
    ) THEN
      RAISE EXCEPTION 'This bar already has an owner';
    END IF;

    INSERT INTO public.user_roles (user_id, tenant_id, role)
    VALUES (v_uid, v_inv.tenant_id, v_inv.role);

    UPDATE public.tenant_invites
    SET accepted_at = now(), accepted_by = v_uid
    WHERE id = v_inv.id;
  END IF;

  IF v_inv.role = 'owner' THEN
    UPDATE public.tenants
    SET
      owner_claimed_at = coalesce(owner_claimed_at, now()),
      onboarding_status = CASE
        WHEN onboarding_status = 'public_live' THEN 'public_live'
        ELSE 'setup_in_progress'
      END
    WHERE id = v_inv.tenant_id;
  END IF;

  PERFORM public._audit_log(
    v_inv.tenant_id,
    'invite_accepted',
    'tenant_invite',
    v_inv.id,
    NULL,
    jsonb_build_object('role', v_inv.role, 'user_id', v_uid)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'tenant_id', v_inv.tenant_id,
    'role', v_inv.role,
    'tenant_name', coalesce(v_tenant.display_name, v_tenant.name)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public._normalize_invite_mobile(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_user_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_tenant_invite(uuid, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_tenant_invite(text) TO authenticated;

-- --- END (optional: seed.sql, seed_platform_super_admin.sql after auth user exists) ---
