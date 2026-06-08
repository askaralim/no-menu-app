-- Allow TONIGHT EVENTS images in the existing public Tap List media bucket.

CREATE OR REPLACE FUNCTION public.taplist_media_path_allowed(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, storage
AS $$
  SELECT
    (storage.foldername(p_name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND (storage.foldername(p_name))[2] IN ('cover', 'drinks', 'events');
$$;
