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

