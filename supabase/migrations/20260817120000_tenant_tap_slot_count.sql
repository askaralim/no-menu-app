-- Persist each venue's physical tap count so empty wall taps remain visible.
-- Existing venues stay NULL until an owner confirms the physical count. During
-- that compatibility window, reads infer a useful count and legacy clients keep
-- their existing 1-99 assignment range. New venues default to 12.

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS tap_slot_count integer;

ALTER TABLE public.tenants
  ALTER COLUMN tap_slot_count SET DEFAULT 12,
  ALTER COLUMN tap_slot_count DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tenants_tap_slot_count_check'
  ) THEN
    ALTER TABLE public.tenants
      ADD CONSTRAINT tenants_tap_slot_count_check
      CHECK (tap_slot_count BETWEEN 1 AND 99);
  END IF;
END $$;

COMMENT ON COLUMN public.tenants.tap_slot_count IS
  'Confirmed physical tap slots shown in No Menu Tonight (1-99); NULL means legacy/unconfirmed.';

CREATE OR REPLACE FUNCTION public.get_tenant_tap_slot_count(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
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

  SELECT coalesce(
    t.tap_slot_count,
    greatest(12, coalesce((
      SELECT max(d.public_sort_order)::integer
      FROM public.drinks d
      WHERE d.tenant_id = t.id
        AND d.public_sort_order IS NOT NULL
        AND d.public_sort_order > 0
    ), 0))
  )
  INTO v_count
  FROM public.tenants t
  WHERE t.id = p_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tenant not found';
  END IF;

  RETURN jsonb_build_object('ok', true, 'tap_slot_count', v_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_tenant_tap_slot_count(
  p_tenant_id uuid,
  p_tap_slot_count integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_highest_assigned integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant id is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND (
        ur.role = 'super_admin'
        OR (ur.tenant_id = p_tenant_id AND ur.role = 'owner')
      )
  ) THEN
    RAISE EXCEPTION 'Only owner can change tap slot count';
  END IF;

  IF p_tap_slot_count IS NULL OR p_tap_slot_count < 1 OR p_tap_slot_count > 99 THEN
    RAISE EXCEPTION 'Invalid tap slot count';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = p_tenant_id) THEN
    RAISE EXCEPTION 'Tenant not found';
  END IF;

  SELECT coalesce(max(d.public_sort_order), 0)::integer
  INTO v_highest_assigned
  FROM public.drinks d
  WHERE d.tenant_id = p_tenant_id
    AND d.public_sort_order IS NOT NULL
    AND d.public_sort_order > 0;

  IF p_tap_slot_count < v_highest_assigned THEN
    RAISE EXCEPTION 'Tap slot count below highest assigned tap (%)', v_highest_assigned;
  END IF;

  UPDATE public.tenants
  SET tap_slot_count = p_tap_slot_count
  WHERE id = p_tenant_id;

  RETURN jsonb_build_object('ok', true, 'tap_slot_count', p_tap_slot_count);
END;
$$;

-- Keep direct/admin writes from bypassing the same lower-bound rule enforced
-- by set_tenant_tap_slot_count.
CREATE OR REPLACE FUNCTION public.enforce_tenant_tap_slot_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_highest_assigned integer;
BEGIN
  IF NEW.tap_slot_count IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT coalesce(max(d.public_sort_order), 0)::integer
  INTO v_highest_assigned
  FROM public.drinks d
  WHERE d.tenant_id = NEW.id
    AND d.public_sort_order IS NOT NULL
    AND d.public_sort_order > 0;

  IF NEW.tap_slot_count < v_highest_assigned THEN
    RAISE EXCEPTION 'Tap slot count below highest assigned tap (%)', v_highest_assigned;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tenants_enforce_tap_slot_count ON public.tenants;
CREATE TRIGGER tenants_enforce_tap_slot_count
  BEFORE INSERT OR UPDATE OF tap_slot_count
  ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_tenant_tap_slot_count();

-- Enforce the venue boundary for every current and future write path, including
-- legacy admin RPCs and direct writes permitted by RLS.
CREATE OR REPLACE FUNCTION public.enforce_drink_tap_slot_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit integer;
BEGIN
  IF NEW.public_sort_order IS NULL THEN
    RETURN NEW;
  END IF;

  -- Tolerate legacy writers that still use 0 for "not on tonight".
  IF NEW.public_sort_order <= 0 THEN
    NEW.public_sort_order := NULL;
    RETURN NEW;
  END IF;

  SELECT t.tap_slot_count
  INTO v_limit
  FROM public.tenants t
  WHERE t.id = NEW.tenant_id;

  IF NEW.public_sort_order > coalesce(v_limit, 99) THEN
    RAISE EXCEPTION 'Tap number exceeds tenant tap slot count (%)', coalesce(v_limit, 99);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS drinks_enforce_tap_slot_count ON public.drinks;
CREATE TRIGGER drinks_enforce_tap_slot_count
  BEFORE INSERT OR UPDATE OF tenant_id, public_sort_order
  ON public.drinks
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_drink_tap_slot_count();

-- Joining an unassigned catalog drink onto an occupied tap is a replacement,
-- not a two-way swap with "no tap". Keep the displaced product in the catalog
-- while clearing its public listing state. Existing tap-to-tap moves still swap.
CREATE OR REPLACE FUNCTION public.set_drink_taplist_listing(
  p_drink_id uuid,
  p_is_public_visible boolean,
  p_public_status text,
  p_public_sort_order integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_errors jsonb := '[]'::jsonb;
  v_tenant_id uuid;
  v_enabled boolean;
  v_from integer;
  v_other_id uuid;
  v_mode text;
  v_status text;
  v_visible boolean;
  v_tap integer;
  v_limit integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT d.tenant_id, d.enabled, d.public_sort_order
  INTO v_tenant_id, v_enabled, v_from
  FROM public.drinks d
  WHERE d.id = p_drink_id;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Drink not found';
  END IF;

  IF NOT public.taplist_can_view_tenant(v_tenant_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF NOT v_enabled THEN
    RETURN jsonb_build_object(
      'ok', false,
      'errors', jsonb_build_array(jsonb_build_object(
        'field', 'enabled', 'message', '已下架商品请先恢复后再加入今晚')));
  END IF;

  v_status := coalesce(nullif(trim(p_public_status), ''), 'available');
  IF v_status NOT IN ('new', 'available', 'low', 'sold_out', 'coming_soon') THEN
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'field', 'public_status', 'message', '无效的状态值'));
  END IF;

  SELECT coalesce(t.public_price_mode, 'hide'), t.tap_slot_count
  INTO v_mode, v_limit
  FROM public.tenants t
  WHERE t.id = v_tenant_id;

  v_tap := p_public_sort_order;
  IF v_tap IS NULL OR v_tap < 1 OR v_tap > coalesce(v_limit, 99) THEN
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'field', 'public_sort_order',
      'message', format('加入今晚必须分配酒头编号（1–%s）', coalesce(v_limit, 99))));
  END IF;

  v_visible := coalesce(p_is_public_visible, false);

  IF v_visible AND v_mode = 'show' AND NOT public.drink_has_orderable_price(p_drink_id) THEN
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'field', 'price',
      'message', '门店设置为公开显示价格：请先设置有效价格规格'));
  END IF;

  IF jsonb_array_length(v_errors) > 0 THEN
    RETURN jsonb_build_object('ok', false, 'errors', v_errors);
  END IF;

  IF v_from IS DISTINCT FROM v_tap THEN
    SELECT d.id INTO v_other_id
    FROM public.drinks d
    WHERE d.tenant_id = v_tenant_id
      AND d.id <> p_drink_id
      AND d.enabled = true
      AND d.public_sort_order = v_tap
    ORDER BY d.created_at
    LIMIT 1;

    UPDATE public.drinks
    SET public_sort_order = NULL
    WHERE id = p_drink_id;

    IF v_other_id IS NOT NULL THEN
      UPDATE public.drinks
      SET
        public_sort_order = NULLIF(v_from, 0),
        is_public_visible = CASE
          WHEN v_from IS NULL OR v_from < 1 THEN false
          ELSE is_public_visible
        END,
        public_status = CASE
          WHEN v_from IS NULL OR v_from < 1 THEN 'available'
          ELSE public_status
        END
      WHERE id = v_other_id;
    END IF;

    UPDATE public.drinks
    SET public_sort_order = v_tap
    WHERE id = p_drink_id;
  END IF;

  UPDATE public.drinks
  SET
    is_public_visible = v_visible,
    public_status = v_status
  WHERE id = p_drink_id AND tenant_id = v_tenant_id;

  UPDATE public.tenants
  SET last_menu_updated_at = now()
  WHERE id = v_tenant_id;

  RETURN jsonb_build_object(
    'ok', true,
    'drink_id', p_drink_id,
    'public_sort_order', v_tap,
    'is_public_visible', v_visible,
    'public_status', v_status,
    'swapped_with', CASE
      WHEN v_other_id IS NULL THEN NULL
      ELSE jsonb_build_object('drink_id', v_other_id, 'tap_number', NULLIF(v_from, 0))
    END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_tenant_tap_slot_count(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_tenant_tap_slot_count(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_tenant_tap_slot_count(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_tenant_tap_slot_count(uuid, integer) TO authenticated;
