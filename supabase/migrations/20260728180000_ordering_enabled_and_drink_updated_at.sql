-- Platform: tenants.ordering_enabled (opt-in POS tabs)
-- Catalog: drinks.updated_at for last-edit sorting
-- Forward-only.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) tenants.ordering_enabled — default false (platform must enable)
-- ---------------------------------------------------------------------------

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS ordering_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.tenants.ordering_enabled IS
  'When true, owner/staff apps show 点单/订单 tabs. Platform-controlled only.';

CREATE OR REPLACE FUNCTION public.get_my_tenants()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  PERFORM public.ensure_user_profile();

  RETURN coalesce((
    SELECT jsonb_agg(
      jsonb_build_object(
        'tenant_id', t.id,
        'name', t.name,
        'display_name', t.display_name,
        'slug', t.slug,
        'role', ur.role,
        'status', t.status,
        'onboarding_status', t.onboarding_status,
        'is_public_visible', t.is_public_visible,
        'ordering_enabled', coalesce(t.ordering_enabled, false)
      )
      ORDER BY
        CASE ur.role WHEN 'super_admin' THEN 0 WHEN 'owner' THEN 1 ELSE 2 END,
        t.name
    )
    FROM public.user_roles ur
    JOIN public.tenants t ON t.id = ur.tenant_id
    WHERE ur.user_id = v_uid
      AND ur.role IN ('owner', 'staff', 'super_admin')
      AND coalesce(t.slug, '') <> '__platform__'
  ), '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_tenants() TO authenticated;

DROP FUNCTION IF EXISTS public.admin_list_tenants();

CREATE OR REPLACE FUNCTION public.admin_list_tenants()
RETURNS TABLE (
  id uuid,
  name text,
  slug text,
  status text,
  created_at timestamptz,
  owner_email text,
  staff_count bigint,
  ordering_enabled boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'super_admin'
  ) THEN
    RAISE EXCEPTION 'Unauthorized: super_admin role required';
  END IF;

  RETURN QUERY
  SELECT
    s.tenant_id,
    s.tenant_name,
    s.tenant_slug,
    s.tenant_status,
    s.tenant_created_at,
    s.owner_email,
    s.staff_count,
    s.tenant_ordering_enabled
  FROM (
    SELECT
      t.id AS tenant_id,
      t.name::text AS tenant_name,
      t.slug::text AS tenant_slug,
      COALESCE(t.status, 'active'::text)::text AS tenant_status,
      t.created_at::timestamptz AS tenant_created_at,
      (
        SELECT u.email::text
        FROM auth.users u
        JOIN public.user_roles ur ON ur.user_id = u.id
        WHERE ur.tenant_id = t.id AND ur.role = 'owner'
        LIMIT 1
      ) AS owner_email,
      (SELECT count(*)::bigint FROM public.user_roles ur WHERE ur.tenant_id = t.id) AS staff_count,
      coalesce(t.ordering_enabled, false) AS tenant_ordering_enabled
    FROM public.tenants t
    ORDER BY t.created_at DESC NULLS LAST
  ) AS s;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_tenants() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_tenant_ordering_enabled(
  p_tenant_id uuid,
  p_enabled boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'super_admin'
  ) THEN
    RAISE EXCEPTION 'Unauthorized: super_admin role required';
  END IF;

  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id required';
  END IF;

  UPDATE public.tenants
  SET ordering_enabled = coalesce(p_enabled, false)
  WHERE id = p_tenant_id
    AND coalesce(slug, '') <> '__platform__';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tenant not found';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'tenant_id', p_tenant_id,
    'ordering_enabled', coalesce(p_enabled, false)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_tenant_ordering_enabled(uuid, boolean) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2) drinks.updated_at
-- ---------------------------------------------------------------------------

ALTER TABLE public.drinks
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

UPDATE public.drinks
SET updated_at = coalesce(created_at, now())
WHERE updated_at IS NULL;

ALTER TABLE public.drinks
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET NOT NULL;

CREATE OR REPLACE FUNCTION public.trg_drinks_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_drinks_set_updated_at ON public.drinks;
CREATE TRIGGER trg_drinks_set_updated_at
  BEFORE UPDATE ON public.drinks
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_drinks_set_updated_at();

-- Include updated_at in owner payload (catalog sort).
CREATE OR REPLACE FUNCTION public.get_owner_taplist_payload(p_tenant_id uuid DEFAULT NULL)
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

  v_tenant_id := p_tenant_id;
  IF v_tenant_id IS NULL THEN
    SELECT ur.tenant_id INTO v_tenant_id
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('owner', 'staff')
    ORDER BY ur.created_at
    LIMIT 1;
  END IF;

  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'no_tenant');
  END IF;

  IF NOT public.taplist_can_view_tenant(v_tenant_id) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'is_owner', EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND (
          ur.role = 'super_admin'
          OR (ur.tenant_id = v_tenant_id AND ur.role = 'owner')
        )
    ),
    'tenant', (
      SELECT jsonb_build_object(
        'id', t.id,
        'slug', t.slug,
        'name', t.name,
        'display_name', t.display_name,
        'is_public_visible', t.is_public_visible,
        'last_menu_updated_at', t.last_menu_updated_at,
        'status', t.status,
        'public_price_mode', coalesce(t.public_price_mode, 'hide')
      )
      FROM public.tenants t
      WHERE t.id = v_tenant_id
    ),
    'categories', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'name', c.name,
          'sort_order', c.sort_order,
          'enabled', c.enabled,
          'is_public_visible', c.is_public_visible
        ) ORDER BY c.sort_order, c.name
      )
      FROM public.categories c
      WHERE c.tenant_id = v_tenant_id
    ), '[]'::jsonb),
    'drinks', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', d.id,
          'category_id', d.category_id,
          'brand_name', d.brand_name,
          'name', d.name,
          'enabled', d.enabled,
          'image_url', d.image_url,
          'is_public_visible', d.is_public_visible,
          'public_status', d.public_status,
          'public_sort_order', d.public_sort_order,
          'product_id', d.product_id,
          'display_name', d.display_name,
          'display_description', d.display_description,
          'created_at', d.created_at,
          'updated_at', d.updated_at
        ) ORDER BY d.enabled DESC, d.updated_at DESC NULLS LAST, lower(d.name)
      )
      FROM public.drinks d
      WHERE d.tenant_id = v_tenant_id
    ), '[]'::jsonb),
    'beer_profiles', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'drink_id', p.drink_id,
          'brewery', p.brewery,
          'beer_style', p.beer_style,
          'abv', p.abv,
          'ibu', p.ibu,
          'country', p.country,
          'description', p.description
        )
      )
      FROM public.drink_beer_profiles p
      JOIN public.drinks d ON d.id = p.drink_id
      WHERE p.tenant_id = v_tenant_id
    ), '[]'::jsonb),
    'serving_options', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', so.id,
          'drink_id', so.drink_id,
          'serving_type', so.serving_type,
          'label', so.label,
          'volume_ml', so.volume_ml,
          'price', so.price,
          'is_default', so.is_default,
          'is_active', so.is_active,
          'public_sort_order', so.public_sort_order
        ) ORDER BY so.public_sort_order
      )
      FROM public.drink_serving_options so
      JOIN public.drinks d ON d.id = so.drink_id
      WHERE so.tenant_id = v_tenant_id
    ), '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_owner_taplist_payload(uuid) TO authenticated;

COMMIT;
