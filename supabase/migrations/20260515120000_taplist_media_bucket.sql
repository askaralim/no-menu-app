-- Tap List media bucket + RLS + drink consumer-field RPC (image upload MVP)

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'taplist-media',
  'taplist-media',
  true,
  3145728,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Helper: first path segment must be tenant uuid; second must be cover or drinks
CREATE OR REPLACE FUNCTION public.taplist_media_path_allowed(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, storage
AS $$
  SELECT
    (storage.foldername(p_name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND (storage.foldername(p_name))[2] IN ('cover', 'drinks');
$$;

CREATE OR REPLACE FUNCTION public.taplist_media_tenant_id(p_name text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, storage
AS $$
  SELECT (storage.foldername(p_name))[1]::uuid;
$$;

CREATE OR REPLACE FUNCTION public.taplist_media_user_can_write(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND (
        ur.role = 'super_admin'
        OR (ur.tenant_id = p_tenant_id AND ur.role IN ('owner', 'staff'))
      )
  );
$$;

DROP POLICY IF EXISTS taplist_media_public_read ON storage.objects;
CREATE POLICY taplist_media_public_read
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'taplist-media');

DROP POLICY IF EXISTS taplist_media_authenticated_insert ON storage.objects;
CREATE POLICY taplist_media_authenticated_insert
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'taplist-media'
    AND public.taplist_media_path_allowed(name)
    AND public.taplist_media_user_can_write(public.taplist_media_tenant_id(name))
  );

DROP POLICY IF EXISTS taplist_media_authenticated_update ON storage.objects;
CREATE POLICY taplist_media_authenticated_update
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'taplist-media'
    AND public.taplist_media_user_can_write(public.taplist_media_tenant_id(name))
  )
  WITH CHECK (
    bucket_id = 'taplist-media'
    AND public.taplist_media_path_allowed(name)
    AND public.taplist_media_user_can_write(public.taplist_media_tenant_id(name))
  );

DROP POLICY IF EXISTS taplist_media_authenticated_delete ON storage.objects;
CREATE POLICY taplist_media_authenticated_delete
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'taplist-media'
    AND public.taplist_media_user_can_write(public.taplist_media_tenant_id(name))
  );

-- Drink Tap List consumer fields (image + visibility); bypasses drinks RLS for super_admin
CREATE OR REPLACE FUNCTION public.set_drink_taplist_consumer_fields(
  p_drink_id uuid,
  p_image_url text,
  p_is_public_visible boolean,
  p_public_status text,
  p_public_sort_order integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_enabled boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT d.tenant_id, d.enabled INTO v_tenant_id, v_enabled
  FROM public.drinks d
  WHERE d.id = p_drink_id;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Drink not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND (
        ur.role = 'super_admin'
        OR (ur.tenant_id = v_tenant_id AND ur.role IN ('owner', 'staff'))
      )
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_is_public_visible AND NOT v_enabled THEN
    RAISE EXCEPTION 'Cannot make disabled drink public on Tap List';
  END IF;

  UPDATE public.drinks
  SET
    image_url = nullif(trim(p_image_url), ''),
    is_public_visible = p_is_public_visible,
    public_status = coalesce(nullif(trim(p_public_status), ''), 'available'),
    public_sort_order = coalesce(p_public_sort_order, 0)
  WHERE id = p_drink_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_drink_taplist_consumer_fields(uuid, text, boolean, text, integer) TO authenticated;
