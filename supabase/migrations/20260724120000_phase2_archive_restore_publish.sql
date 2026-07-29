-- Phase 2: archive / restore / publish RPC cleanup
-- - archive_drink: enabled=false, hide, clear tap #
-- - restore_drink: enabled=true; not public, not on tonight
-- - publish_tenant / unpublish_tenant: owner wrappers around set_tenant_public_visibility
-- Forward-only. Production: SELECT-only from earlier tools; this migration is local-first.

-- ---------------------------------------------------------------------------
-- 1) archive_drink
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.archive_drink(p_drink_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT d.tenant_id INTO v_tenant_id
  FROM public.drinks d
  WHERE d.id = p_drink_id;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Drink not found';
  END IF;

  IF NOT public.taplist_can_view_tenant(v_tenant_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  UPDATE public.drinks
  SET
    enabled = false,
    is_public_visible = false,
    public_sort_order = NULL
    -- public_status left unchanged for history context; restore resets to available
  WHERE id = p_drink_id
    AND tenant_id = v_tenant_id;

  UPDATE public.tenants
  SET last_menu_updated_at = now()
  WHERE id = v_tenant_id;

  RETURN jsonb_build_object(
    'ok', true,
    'drink_id', p_drink_id,
    'enabled', false,
    'is_public_visible', false,
    'public_sort_order', null
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.archive_drink(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2) restore_drink
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.restore_drink(p_drink_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT d.tenant_id INTO v_tenant_id
  FROM public.drinks d
  WHERE d.id = p_drink_id;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Drink not found';
  END IF;

  IF NOT public.taplist_can_view_tenant(v_tenant_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  UPDATE public.drinks
  SET
    enabled = true,
    is_public_visible = false,
    public_sort_order = NULL,
    public_status = 'available'
  WHERE id = p_drink_id
    AND tenant_id = v_tenant_id;

  UPDATE public.tenants
  SET last_menu_updated_at = now()
  WHERE id = v_tenant_id;

  RETURN jsonb_build_object(
    'ok', true,
    'drink_id', p_drink_id,
    'enabled', true,
    'is_public_visible', false,
    'public_sort_order', null,
    'public_status', 'available'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.restore_drink(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3) publish_tenant / unpublish_tenant (owner wrappers)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.publish_tenant(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.set_tenant_public_visibility(p_tenant_id, true);
  RETURN jsonb_build_object('ok', true, 'tenant_id', p_tenant_id, 'is_public_visible', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.unpublish_tenant(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.set_tenant_public_visibility(p_tenant_id, false);
  RETURN jsonb_build_object('ok', true, 'tenant_id', p_tenant_id, 'is_public_visible', false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.publish_tenant(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unpublish_tenant(uuid) TO authenticated;
