-- Phase 5: owner toggle for tenants.public_price_mode (show | hide).
-- Public RPCs already honor this column (Phase 0 + hide-omit-servings).

CREATE OR REPLACE FUNCTION public.set_tenant_public_price_mode(
  p_tenant_id uuid,
  p_mode text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_before text;
  v_mode text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.taplist_is_tenant_owner(p_tenant_id) THEN
    RAISE EXCEPTION 'Forbidden: only owner can change public price mode';
  END IF;

  v_mode := lower(trim(coalesce(p_mode, '')));
  IF v_mode NOT IN ('show', 'hide') THEN
    RAISE EXCEPTION 'Invalid public_price_mode';
  END IF;

  SELECT coalesce(t.public_price_mode, 'hide')
  INTO v_before
  FROM public.tenants t
  WHERE t.id = p_tenant_id;

  IF v_before IS NULL THEN
    RAISE EXCEPTION 'Tenant not found';
  END IF;

  UPDATE public.tenants
  SET
    public_price_mode = v_mode,
    last_menu_updated_at = now()
  WHERE id = p_tenant_id;

  PERFORM public._audit_log(
    p_tenant_id,
    'tenant_public_price_mode_changed',
    'tenant',
    p_tenant_id,
    jsonb_build_object('public_price_mode', v_before),
    jsonb_build_object('public_price_mode', v_mode)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'tenant_id', p_tenant_id,
    'public_price_mode', v_mode
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_tenant_public_price_mode(uuid, text) TO authenticated;
