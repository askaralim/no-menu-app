-- Business Days (Bar Days) Schema
-- A business day starts when staff opens orders and ends when staff manually closes it
-- Orders after midnight still belong to the same bar day

-- Business Days Table
create table if not exists public.business_days (
  id uuid primary key default uuid_generate_v4(),
  business_date date not null unique, -- The date identifier for this business day
  opened_at timestamp with time zone not null default now(), -- When staff opened this day
  closed_at timestamp with time zone, -- When staff manually closed this day (null = still open)
  notes text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create index idx_business_days_date on business_days(business_date desc);
create index idx_business_days_opened on business_days(opened_at desc);
create index idx_business_days_closed on business_days(closed_at) where closed_at is not null;

-- Function to get or create an open business day
-- If there's an open business day (even from yesterday), use it
-- Otherwise, create a new one for today
-- This allows business days to span across midnight
-- Uses China timezone (UTC+8 / Asia/Shanghai) for date calculations
create or replace function get_or_create_open_business_day()
returns uuid as $$
declare
  business_day_id uuid;
  today_date date;
begin
  -- Get today's date in China timezone (UTC+8 / Asia/Shanghai)
  -- now() returns timestamp with time zone (UTC)
  -- AT TIME ZONE 'Asia/Shanghai' converts it to timestamp without time zone in Shanghai time
  -- Then we cast to date to get the date in China timezone
  today_date := (now() AT TIME ZONE 'Asia/Shanghai')::date;
  
  -- First, try to find any open business day (regardless of date)
  -- This allows orders after midnight to belong to the same bar day
  select id into business_day_id
  from business_days
  where closed_at is null
  order by opened_at desc
  limit 1;

  -- If no open business day exists, create one for today (China timezone)
  if business_day_id is null then
    insert into business_days (business_date, opened_at)
    values (today_date, now())
    returning id into business_day_id;
  end if;

  return business_day_id;
end;
$$ language plpgsql;

-- Function to get the current open business day (returns null if none)
create or replace function get_current_open_business_day()
returns uuid as $$
declare
  business_day_id uuid;
begin
  select id into business_day_id
  from business_days
  where closed_at is null
  order by opened_at desc
  limit 1;

  return business_day_id;
end;
$$ language plpgsql;

-- Update orders table to include business_day_id
alter table public.orders 
  add column if not exists business_day_id uuid references business_days(id) on delete restrict;

create index if not exists idx_orders_business_day on orders(business_day_id);

-- Auto-update updated_at for business_days
create trigger update_business_days_updated_at before update on business_days
  for each row execute function update_updated_at_column();

-- RLS Policies for business_days
alter table public.business_days enable row level security;
create policy "Allow public read access" on public.business_days for select using (true);
create policy "Allow authenticated insert access" on public.business_days for insert with check (auth.role() = 'authenticated');
create policy "Allow authenticated update access" on public.business_days for update using (auth.role() = 'authenticated');
create policy "Allow authenticated delete access" on public.business_days for delete using (auth.role() = 'authenticated');

