-- Remember which tenant a POS user is currently operating.
-- get_auth_tenant_id() previously picked one membership (owner first,
-- then earliest). In-app store switching needs the client's choice to
-- drive RLS and RPCs that still call get_auth_tenant_id().

CREATE TABLE IF NOT EXISTS public.user_active_tenants (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_active_tenants_tenant_idx
  ON public.user_active_tenants (tenant_id);

ALTER TABLE public.user_active_tenants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_active_tenants_self ON public.user_active_tenants;
CREATE POLICY user_active_tenants_self
  ON public.user_active_tenants
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.set_active_tenant(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_slug text;
  v_status text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant is required';
  END IF;

  SELECT t.slug, t.status
  INTO v_slug, v_status
  FROM public.tenants t
  WHERE t.id = p_tenant_id;

  IF v_slug IS NULL THEN
    RAISE EXCEPTION 'Tenant not found';
  END IF;

  IF coalesce(v_slug, '') = '__platform__' THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF v_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'Tenant is not active';
  END IF;

  IF NOT public.taplist_can_view_tenant(p_tenant_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  INSERT INTO public.user_active_tenants (user_id, tenant_id, updated_at)
  VALUES (v_uid, p_tenant_id, now())
  ON CONFLICT (user_id) DO UPDATE
  SET
    tenant_id = EXCLUDED.tenant_id,
    updated_at = now();

  RETURN jsonb_build_object('ok', true, 'tenant_id', p_tenant_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_active_tenant(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_auth_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT uat.tenant_id
      FROM public.user_active_tenants uat
      JOIN public.tenants t
        ON t.id = uat.tenant_id
       AND t.status = 'active'
       AND coalesce(t.slug, '') <> '__platform__'
      WHERE uat.user_id = auth.uid()
        AND public.taplist_can_view_tenant(uat.tenant_id)
      LIMIT 1
    ),
    (
      SELECT ur.tenant_id
      FROM public.user_roles ur
      INNER JOIN public.tenants t ON t.id = ur.tenant_id AND t.status = 'active'
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('owner', 'staff')
        AND coalesce(t.slug, '') <> '__platform__'
      ORDER BY (ur.role = 'owner') DESC, ur.created_at ASC
      LIMIT 1
    )
  );
$$;
