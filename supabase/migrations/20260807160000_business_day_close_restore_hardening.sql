-- Harden business-day close / restore:
-- 1) ever_closed_at: irreversible lock for restoring settled orders (survives reopen)
-- 2) get_or_create_open_business_day: never silently clear closed_at
-- 3) close_business_day: refuse when active orders remain
-- 4) reopen_todays_business_day: explicit reopen for new orders only

BEGIN;

ALTER TABLE public.business_days
  ADD COLUMN IF NOT EXISTS ever_closed_at timestamptz;

UPDATE public.business_days
SET ever_closed_at = closed_at
WHERE closed_at IS NOT NULL
  AND ever_closed_at IS NULL;

-- ---------------------------------------------------------------------------
-- Restore guard: lock once the day has ever been closed
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_order_restore_from_closed_business_day()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_lock_at timestamptz;
BEGIN
  IF OLD.status IN ('checked_out', 'finished') AND NEW.status = 'active' THEN
    IF OLD.business_day_id IS NOT NULL THEN
      SELECT COALESCE(bd.ever_closed_at, bd.closed_at)
      INTO v_lock_at
      FROM public.business_days bd
      WHERE bd.id = OLD.business_day_id;

      IF v_lock_at IS NOT NULL THEN
        RAISE EXCEPTION 'ORDER_RESTORE_CLOSED_BUSINESS_DAY';
      END IF;
    END IF;

    NEW.checked_out_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_order_restore_from_closed_business_day ON public.orders;

CREATE TRIGGER trg_guard_order_restore_from_closed_business_day
  BEFORE UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_order_restore_from_closed_business_day();

-- ---------------------------------------------------------------------------
-- get_or_create: open day only; do not reopen closed rows
-- ---------------------------------------------------------------------------
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
  today_closed_id uuid;
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

  IF business_day_id IS NOT NULL THEN
    RETURN business_day_id;
  END IF;

  SELECT id INTO today_closed_id
  FROM public.business_days
  WHERE business_date = today_date
    AND tenant_id = current_tenant_id
    AND closed_at IS NOT NULL
  ORDER BY opened_at DESC
  LIMIT 1;

  IF today_closed_id IS NOT NULL THEN
    RAISE EXCEPTION 'BUSINESS_DAY_CLOSED'
      USING HINT = 'Call reopen_todays_business_day() to start taking new orders again.';
  END IF;

  INSERT INTO public.business_days (business_date, opened_at, tenant_id)
  VALUES (today_date, now(), current_tenant_id)
  RETURNING id INTO business_day_id;

  RETURN business_day_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- close: block when active orders exist; stamp ever_closed_at
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.close_business_day(business_day_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_tenant_id uuid;
  active_count integer;
BEGIN
  current_tenant_id := public.get_auth_tenant_id();

  IF current_tenant_id IS NULL THEN
    RAISE EXCEPTION 'No active bar membership';
  END IF;

  SELECT count(*)::integer INTO active_count
  FROM public.orders o
  WHERE o.business_day_id = close_business_day.business_day_id
    AND o.tenant_id = current_tenant_id
    AND o.status = 'active';

  IF active_count > 0 THEN
    RAISE EXCEPTION 'BUSINESS_DAY_HAS_ACTIVE_ORDERS'
      USING HINT = format('%s active order(s) must be checked out first', active_count);
  END IF;

  UPDATE public.business_days
  SET
    closed_at = now(),
    ever_closed_at = COALESCE(ever_closed_at, now())
  WHERE id = close_business_day.business_day_id
    AND closed_at IS NULL
    AND tenant_id = current_tenant_id;

  RETURN found;
END;
$$;

-- ---------------------------------------------------------------------------
-- Explicit reopen for today (clears closed_at only; keeps ever_closed_at)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reopen_todays_business_day()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  business_day_id uuid;
  today_date date;
  current_tenant_id uuid;
  open_id uuid;
BEGIN
  current_tenant_id := public.get_auth_tenant_id();

  IF current_tenant_id IS NULL THEN
    RAISE EXCEPTION 'No active bar membership';
  END IF;

  today_date := (now() AT TIME ZONE 'Asia/Shanghai')::date;

  SELECT id INTO open_id
  FROM public.business_days
  WHERE closed_at IS NULL
    AND tenant_id = current_tenant_id
  ORDER BY opened_at DESC
  LIMIT 1;

  IF open_id IS NOT NULL THEN
    RETURN open_id;
  END IF;

  SELECT id INTO business_day_id
  FROM public.business_days
  WHERE business_date = today_date
    AND tenant_id = current_tenant_id
    AND closed_at IS NOT NULL
  ORDER BY opened_at DESC
  LIMIT 1;

  IF business_day_id IS NULL THEN
    INSERT INTO public.business_days (business_date, opened_at, tenant_id)
    VALUES (today_date, now(), current_tenant_id)
    RETURNING id INTO business_day_id;
    RETURN business_day_id;
  END IF;

  UPDATE public.business_days
  SET closed_at = NULL
  WHERE id = business_day_id
    AND tenant_id = current_tenant_id;

  RETURN business_day_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_or_create_open_business_day() TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_business_day(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reopen_todays_business_day() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_open_business_day() TO authenticated;

-- Ops audit (run manually in SQL editor; do not auto-checkout):
-- SELECT t.name, bd.business_date, bd.closed_at, o.id, o.customer_name, o.status, o.total_amount
-- FROM orders o
-- JOIN business_days bd ON bd.id = o.business_day_id
-- JOIN tenants t ON t.id = o.tenant_id
-- WHERE bd.closed_at IS NOT NULL AND o.status = 'active'
-- ORDER BY bd.business_date DESC;

COMMIT;
