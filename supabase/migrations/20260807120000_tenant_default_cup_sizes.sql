-- Tenant-level「常用杯型」templates: label + volume only (no prices).

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS default_cup_sizes jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.tenants.default_cup_sizes IS
  'POS common cup templates: [{label, volume_ml, sort_order}]. No prices.';

CREATE OR REPLACE FUNCTION public.get_tenant_default_cup_sizes(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_items jsonb;
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

  SELECT coalesce(t.default_cup_sizes, '[]'::jsonb)
  INTO v_items
  FROM public.tenants t
  WHERE t.id = p_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tenant not found';
  END IF;

  RETURN jsonb_build_object('ok', true, 'items', coalesce(v_items, '[]'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION public.set_tenant_default_cup_sizes(
  p_tenant_id uuid,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_raw jsonb;
  v_elem jsonb;
  v_label text;
  v_volume int;
  v_out jsonb := '[]'::jsonb;
  v_count int := 0;
  v_i int := 0;
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

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'items must be a JSON array';
  END IF;

  FOR v_elem IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_label := nullif(trim(coalesce(v_elem->>'label', '')), '');
    BEGIN
      IF v_elem ? 'volume_ml'
         AND v_elem->>'volume_ml' IS NOT NULL
         AND trim(v_elem->>'volume_ml') <> '' THEN
        v_volume := (v_elem->>'volume_ml')::int;
      ELSE
        v_volume := NULL;
      END IF;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION '容量必须是整数毫升';
    END;

    IF v_volume IS NOT NULL AND v_volume <= 0 THEN
      RAISE EXCEPTION '容量必须大于 0';
    END IF;

    -- Both empty: skip (client should not send these; ignore if present)
    IF v_label IS NULL AND v_volume IS NULL THEN
      CONTINUE;
    END IF;

    v_count := v_count + 1;
    IF v_count > 4 THEN
      RAISE EXCEPTION '常用杯型最多 4 个';
    END IF;

    v_out := v_out || jsonb_build_array(
      jsonb_build_object(
        'label', v_label,
        'volume_ml', v_volume,
        'sort_order', v_i
      )
    );
    v_i := v_i + 1;
  END LOOP;

  UPDATE public.tenants
  SET default_cup_sizes = v_out
  WHERE id = p_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tenant not found';
  END IF;

  RETURN jsonb_build_object('ok', true, 'items', v_out);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_tenant_default_cup_sizes(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_tenant_default_cup_sizes(uuid, jsonb) TO authenticated;
