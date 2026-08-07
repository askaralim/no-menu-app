-- POS profile save was passing p_cover_image_url / p_brewing_type as null, which
-- cleared cover_image_url (and brewing_type when extras=true). Treat SQL NULL as
-- "leave unchanged"; empty string still clears. Admin clears cover via ''.

CREATE OR REPLACE FUNCTION public.set_tenant_taplist_storefront(
  p_tenant_id uuid,
  p_display_name text,
  p_district text,
  p_address text,
  p_cover_image_url text,
  p_city text,
  p_opening_hour jsonb DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_tag_keys text[] DEFAULT NULL,
  p_brewing_type text DEFAULT NULL,
  p_update_storefront_extras boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tag_key text;
  v_brewing_type text;
  v_city text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.taplist_can_view_tenant(p_tenant_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  v_city := public.taplist_canonical_city_key(coalesce(nullif(trim(p_city), ''), 'Shanghai'));

  IF p_update_storefront_extras THEN
    IF p_brewing_type IS NOT NULL THEN
      v_brewing_type := nullif(trim(p_brewing_type), '');
      IF v_brewing_type IS NOT NULL
         AND v_brewing_type NOT IN ('house_brand', 'on_site_brewery') THEN
        RAISE EXCEPTION 'Invalid brewing_type: %', v_brewing_type;
      END IF;
    END IF;

    IF p_tag_keys IS NOT NULL THEN
      FOREACH v_tag_key IN ARRAY p_tag_keys LOOP
        IF v_tag_key IS NULL OR trim(v_tag_key) = '' THEN
          CONTINUE;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM public.bar_tag_definitions d WHERE d.key = trim(v_tag_key)
        ) THEN
          RAISE EXCEPTION 'Unknown tag key: %', v_tag_key;
        END IF;
      END LOOP;
    END IF;
  END IF;

  UPDATE public.tenants
  SET
    display_name = nullif(trim(p_display_name), ''),
    district = nullif(trim(p_district), ''),
    address = nullif(trim(p_address), ''),
    cover_image_url = CASE
      WHEN p_cover_image_url IS NULL THEN cover_image_url
      ELSE nullif(trim(p_cover_image_url), '')
    END,
    city = v_city,
    opening_hour = CASE
      WHEN p_opening_hour IS NULL THEN NULL
      WHEN p_opening_hour = 'null'::jsonb THEN NULL
      ELSE p_opening_hour
    END,
    description = nullif(trim(p_description), ''),
    brewing_type = CASE
      WHEN NOT p_update_storefront_extras THEN brewing_type
      WHEN p_brewing_type IS NULL THEN brewing_type
      ELSE v_brewing_type
    END
  WHERE id = p_tenant_id;

  PERFORM public.taplist_mark_public_projection_changed(p_tenant_id, 'storefront');

  IF p_update_storefront_extras THEN
    DELETE FROM public.tenant_bar_tags WHERE tenant_id = p_tenant_id;

    INSERT INTO public.tenant_bar_tags (tenant_id, tag_key)
    SELECT DISTINCT p_tenant_id, trim(k)
    FROM unnest(coalesce(p_tag_keys, ARRAY[]::text[])) AS k
    WHERE k IS NOT NULL AND trim(k) <> '';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_tenant_taplist_storefront(
  uuid, text, text, text, text, text, jsonb, text, text[], text, boolean
) TO authenticated;
