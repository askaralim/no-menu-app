-- Expose localized city label on public bar tenant payload.
-- Source of truth: public.taplist_public_cities.label
-- Consumers (taplist-web, mobile) can stop hardcoding English→Chinese maps.

CREATE OR REPLACE FUNCTION public.get_public_taplist_tenant(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_slug text := trim(p_slug);
  rec record;
  v_hours jsonb;
BEGIN
  IF v_slug = '' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'bad_request');
  END IF;

  SELECT
    t.id, t.slug, t.name,
    coalesce(nullif(trim(t.display_name), ''), t.name) AS display_name,
    t.district, t.address, t.description, t.cover_image_url, t.city, t.country,
    coalesce(
      nullif(trim(city_catalog.label), ''),
      public.taplist_default_city_label(t.city)
    ) AS city_label,
    t.roadmap_latitude AS latitude, t.roadmap_longitude AS longitude,
    t.last_menu_updated_at, t.status, t.is_public_visible, t.brewing_type
  INTO rec
  FROM public.tenants t
  LEFT JOIN public.taplist_public_cities city_catalog
    ON lower(trim(city_catalog.city)) = lower(trim(t.city))
   AND city_catalog.is_enabled = true
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

  v_hours := public.taplist_opening_snapshot(rec.id);

  RETURN jsonb_build_object(
    'ok', true,
    'tenant', jsonb_build_object(
      'id', rec.id,
      'slug', rec.slug,
      'name', rec.name,
      'display_name', rec.display_name,
      'district', rec.district,
      'address', rec.address,
      'opening_hour', v_hours->'opening_hour',
      'opening_hour_source', v_hours->>'source',
      'is_open_now', (v_hours->>'is_open_now')::boolean,
      'description', rec.description,
      'cover_image_url', rec.cover_image_url,
      'city', rec.city,
      'city_label', rec.city_label,
      'country', rec.country,
      'latitude', rec.latitude,
      'longitude', rec.longitude,
      'last_menu_updated_at', rec.last_menu_updated_at,
      'brewing_type', rec.brewing_type,
      'brewing_label', public.taplist_brewing_label(rec.brewing_type),
      'qr_image_url', (
        SELECT q.image_url
        FROM public.tenant_qr_links q
        WHERE q.tenant_id = rec.id
          AND q.enabled = true
          AND q.placement = 'venue'
          AND nullif(trim(q.image_url), '') IS NOT NULL
        ORDER BY q.version DESC, q.created_at DESC
        LIMIT 1
      ),
      'qr_image_path', (
        SELECT q.image_path
        FROM public.tenant_qr_links q
        WHERE q.tenant_id = rec.id
          AND q.enabled = true
          AND q.placement = 'venue'
        ORDER BY q.version DESC, q.created_at DESC
        LIMIT 1
      ),
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

REVOKE ALL ON FUNCTION public.get_public_taplist_tenant(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_taplist_tenant(text) TO anon, authenticated;
