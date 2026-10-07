-- admin_create_bar created the tenant and settings, but no menu category.
-- Drink upsert only inserts 生啤 when the first product is saved and no enabled
-- category exists, so a new store's category list is empty until then.

CREATE OR REPLACE FUNCTION public.admin_create_bar(p_name text, p_slug text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_slug text := lower(trim(p_slug));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role = 'super_admin'
  ) THEN
    RAISE EXCEPTION 'Unauthorized: super_admin role required';
  END IF;

  IF p_name IS NULL OR trim(p_name) = '' THEN
    RAISE EXCEPTION 'Bar name is required';
  END IF;

  IF v_slug IS NULL OR v_slug = '' THEN
    RAISE EXCEPTION 'Slug is required';
  END IF;

  IF v_slug = '__platform__' THEN
    RAISE EXCEPTION 'Reserved slug';
  END IF;

  IF length(v_slug) < 2 OR v_slug !~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$' THEN
    RAISE EXCEPTION 'Slug must be 2+ lowercase letters/numbers/hyphens, no leading/trailing hyphens';
  END IF;

  IF EXISTS (SELECT 1 FROM public.tenants t WHERE t.slug = v_slug) THEN
    RAISE EXCEPTION 'This slug is already taken';
  END IF;

  INSERT INTO public.tenants (name, slug, status, city, country, is_public_visible)
  VALUES (trim(p_name), v_slug, 'active', 'Shanghai', 'China', false)
  RETURNING id INTO v_tenant_id;

  INSERT INTO public.settings (theme, auto_refresh, refresh_interval, tenant_id)
  VALUES ('dark', true, 3600, v_tenant_id);

  INSERT INTO public.categories (tenant_id, name, sort_order, enabled, is_public_visible)
  VALUES (v_tenant_id, '生啤', 1, true, true);

  RETURN v_tenant_id;
END;
$$;

-- Empty stores created before this change, and the reported tenant if it
-- still has no 生啤 category.
INSERT INTO public.categories (tenant_id, name, sort_order, enabled, is_public_visible)
SELECT t.id, '生啤', 1, true, true
FROM public.tenants t
WHERE coalesce(t.slug, '') <> '__platform__'
  AND NOT EXISTS (
    SELECT 1
    FROM public.categories c
    WHERE c.tenant_id = t.id
      AND c.name = '生啤'
  )
  AND (
    t.id = 'b2657ad5-9152-4258-a020-1f853b35fac1'
    OR NOT EXISTS (
      SELECT 1 FROM public.categories c WHERE c.tenant_id = t.id
    )
  );
