-- 订单系统数据库结构（Phase 7：规格点单）
-- 历史参考；以 migrations 为准。

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

create table if not exists public.order_items (
  id uuid primary key default uuid_generate_v4(),
  order_id uuid not null references orders(id) on delete cascade,
  drink_id uuid not null references drinks(id) on delete restrict,
  serving_option_id uuid not null references drink_serving_options(id) on delete restrict,
  quantity int not null check (quantity > 0),
  unit_price numeric(10,2) not null,
  label_snapshot text,
  created_at timestamp with time zone default now()
);

create index if not exists idx_order_items_order on order_items(order_id);
create index if not exists idx_order_items_drink on order_items(drink_id);
create unique index if not exists order_items_order_serving_unique on order_items(order_id, serving_option_id);
