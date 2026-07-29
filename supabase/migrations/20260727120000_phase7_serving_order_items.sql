-- Phase 7: serving-based order_items (hard cut — pilot only, wipe existing lines)

BEGIN;

-- Wipe pilot order lines (no historical migration needed).
DELETE FROM public.order_items;

ALTER TABLE public.order_items
  DROP COLUMN IF EXISTS quantity_cup,
  DROP COLUMN IF EXISTS quantity_bottle,
  DROP COLUMN IF EXISTS unit_price_cup,
  DROP COLUMN IF EXISTS unit_price_bottle;

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS serving_option_id uuid,
  ADD COLUMN IF NOT EXISTS quantity integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS unit_price numeric(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS label_snapshot text;

-- Empty table → safe to tighten constraints.
ALTER TABLE public.order_items
  ALTER COLUMN serving_option_id SET NOT NULL,
  ALTER COLUMN unit_price DROP DEFAULT,
  ALTER COLUMN quantity DROP DEFAULT;

ALTER TABLE public.order_items
  DROP CONSTRAINT IF EXISTS order_items_quantity_check;

ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_quantity_check CHECK (quantity > 0);

ALTER TABLE public.order_items
  DROP CONSTRAINT IF EXISTS order_items_serving_option_id_fkey;

ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_serving_option_id_fkey
  FOREIGN KEY (serving_option_id) REFERENCES public.drink_serving_options(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS order_items_order_serving_unique
  ON public.order_items (order_id, serving_option_id);

CREATE INDEX IF NOT EXISTS idx_order_items_serving_option
  ON public.order_items (serving_option_id);

-- Totals from serving lines
CREATE OR REPLACE FUNCTION public.calculate_order_total(order_uuid uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  total numeric;
BEGIN
  SELECT coalesce(sum(quantity * unit_price), 0)
  INTO total
  FROM public.order_items
  WHERE order_id = order_uuid;
  RETURN total;
END;
$$;

-- Orderable + serving consistency
CREATE OR REPLACE FUNCTION public.enforce_order_item_orderable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_so public.drink_serving_options%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.drink_id IS NOT DISTINCT FROM OLD.drink_id
     AND NEW.tenant_id IS NOT DISTINCT FROM OLD.tenant_id
     AND NEW.serving_option_id IS NOT DISTINCT FROM OLD.serving_option_id
     AND NEW.quantity IS NOT DISTINCT FROM OLD.quantity
     AND NEW.unit_price IS NOT DISTINCT FROM OLD.unit_price THEN
    RETURN NEW;
  END IF;

  IF coalesce(NEW.quantity, 0) <= 0 THEN
    RAISE EXCEPTION '数量必须大于 0';
  END IF;

  SELECT * INTO v_so
  FROM public.drink_serving_options
  WHERE id = NEW.serving_option_id;

  IF v_so.id IS NULL THEN
    RAISE EXCEPTION '规格不存在';
  END IF;

  IF v_so.drink_id IS DISTINCT FROM NEW.drink_id THEN
    RAISE EXCEPTION '规格与酒款不匹配';
  END IF;

  IF NEW.tenant_id IS NOT NULL AND v_so.tenant_id IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION '规格门店不匹配';
  END IF;

  IF NOT coalesce(v_so.is_active, false) OR coalesce(v_so.price, 0) <= 0 THEN
    RAISE EXCEPTION '该规格当前不可点单';
  END IF;

  IF NOT public.drink_is_orderable(NEW.drink_id, NEW.tenant_id) THEN
    RAISE EXCEPTION '该商品当前不可点单';
  END IF;

  -- Snapshot price if client omitted / mismatched lightly — trust client snapshot but require > 0
  IF coalesce(NEW.unit_price, 0) <= 0 THEN
    NEW.unit_price := v_so.price;
  END IF;

  IF NEW.label_snapshot IS NULL OR trim(NEW.label_snapshot) = '' THEN
    NEW.label_snapshot := coalesce(nullif(trim(v_so.label), ''), '规格')
      || CASE WHEN v_so.volume_ml IS NOT NULL THEN ' · ' || v_so.volume_ml::text || 'ml' ELSE '' END;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_order_item_orderable ON public.order_items;
CREATE TRIGGER trg_enforce_order_item_orderable
  BEFORE INSERT OR UPDATE ON public.order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_order_item_orderable();

COMMIT;
