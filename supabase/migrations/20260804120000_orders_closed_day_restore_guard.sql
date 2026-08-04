-- Prevent settled orders from being restored after their business day closes.
-- Restoring an order in an open business day also clears the prior checkout time.

BEGIN;

CREATE OR REPLACE FUNCTION public.guard_order_restore_from_closed_business_day()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_closed_at timestamptz;
BEGIN
  IF OLD.status IN ('checked_out', 'finished') AND NEW.status = 'active' THEN
    IF OLD.business_day_id IS NOT NULL THEN
      SELECT bd.closed_at
      INTO v_closed_at
      FROM public.business_days bd
      WHERE bd.id = OLD.business_day_id;

      IF v_closed_at IS NOT NULL THEN
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

COMMIT;
