-- Expose verified bar coordinates to the public tenant detail RPC for the
-- iOS Apple Maps handoff. Public visibility checks remain unchanged.

CREATE OR REPLACE FUNCTION public.get_public_taplist_tenant(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slug text := trim(p_slug);
  rec record;
BEGIN
  IF v_slug = '' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'bad_request');
  END IF;

  SELECT
    t.id, t.slug, t.name,
    coalesce(nullif(trim(t.display_name), ''), t.name) AS display_name,
    t.district, t.address, t.opening_hour, t.description, t.cover_image_url, t.city, t.country,
    t.roadmap_latitude AS latitude, t.roadmap_longitude AS longitude,
    t.last_menu_updated_at, t.status, t.is_public_visible, t.brewing_type
  INTO rec
  FROM public.tenants t
  WHERE t.slug = v_slug;

  IF rec IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END IF;

  IF rec.status = 'suspended' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'suspended', 'name', rec.name);
  END IF;

  IF NOT rec.is_public_visible THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_public');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'tenant', jsonb_build_object(
      'id', rec.id,
      'slug', rec.slug,
      'name', rec.name,
      'display_name', rec.display_name,
      'district', rec.district,
      'address', rec.address,
      'opening_hour', rec.opening_hour,
      'description', rec.description,
      'cover_image_url', rec.cover_image_url,
      'city', rec.city,
      'country', rec.country,
      'latitude', rec.latitude,
      'longitude', rec.longitude,
      'last_menu_updated_at', rec.last_menu_updated_at,
      'brewing_type', rec.brewing_type,
      'brewing_label', public.taplist_brewing_label(rec.brewing_type),
      'tags', coalesce(
        (
          SELECT jsonb_agg(
            jsonb_build_object('key', d.key, 'label', d.label_zh)
            ORDER BY d.sort_order, d.key
          )
          FROM public.tenant_bar_tags tbt
          INNER JOIN public.bar_tag_definitions d ON d.key = tbt.tag_key
          WHERE tbt.tenant_id = rec.id
        ),
        '[]'::jsonb
      )
    )
  );
END;
$$;
