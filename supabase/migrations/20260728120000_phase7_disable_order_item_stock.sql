-- Phase 7 follow-up: disable cup/bottle stock deduction on order_items.
-- Inventory / keg lifecycle is deferred; keep trigger hook as a no-op for later.

BEGIN;

CREATE OR REPLACE FUNCTION public.handle_order_item_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Intentionally no-op: serving-based orders no longer use quantity_cup/bottle.
  -- Future keg inventory will reimplement deduction from serving_option_id + quantity.
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- Ensure trigger still exists (hook point for future stock work).
DROP TRIGGER IF EXISTS order_item_stock_on_change ON public.order_items;
CREATE TRIGGER order_item_stock_on_change
  BEFORE INSERT OR UPDATE OR DELETE ON public.order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_order_item_stock();

COMMIT;
