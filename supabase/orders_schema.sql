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

