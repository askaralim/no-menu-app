-- Beer Route v1 UI no longer displays per-beer new tap names.
-- Keep qualifyingNewTapCount for internal route ranking, but do not return newTapNames.

CREATE OR REPLACE FUNCTION public.get_beer_roadmap_eligible_tenants()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH eligible AS (
    SELECT t.id
    FROM public.tenants t
    WHERE t.status = 'active'
      AND t.is_public_visible = true
      AND lower(trim(t.city)) = 'shanghai'
      AND t.roadmap_enabled = true
      AND t.roadmap_coordinates_verified_at IS NOT NULL
      AND t.roadmap_longitude IS NOT NULL
      AND t.roadmap_latitude IS NOT NULL
      AND public.tenant_has_valid_structured_hours(t.id)
      AND public.tenant_is_open_now(t.id)
      AND t.taplist_verified_at >= now() - interval '72 hours'
      AND EXISTS (
        SELECT 1
        FROM public.drinks d
        INNER JOIN public.categories c
          ON c.id = d.category_id AND c.tenant_id = d.tenant_id
        WHERE d.tenant_id = t.id
          AND d.enabled = true
          AND d.is_public_visible = true
          AND c.enabled = true
          AND c.is_public_visible = true
          AND d.public_status <> 'sold_out'
      )
  ),
  new_tap_agg AS (
    SELECT
      d.tenant_id,
      count(*)::int AS qualifying_new_tap_count
    FROM public.drinks d
    INNER JOIN public.categories c
      ON c.id = d.category_id AND c.tenant_id = d.tenant_id
    WHERE d.enabled = true
      AND d.is_public_visible = true
      AND c.enabled = true
      AND c.is_public_visible = true
      AND d.public_status = 'new'
      AND d.public_status_changed_at IS NOT NULL
      AND d.public_status_changed_at >= now() - interval '14 days'
    GROUP BY d.tenant_id
  )
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'tenantId', t.id,
        'tenantSlug', t.slug,
        'displayName', coalesce(nullif(trim(t.display_name), ''), t.name),
        'district', t.district,
        'address', t.address,
        'latitude', t.roadmap_latitude,
        'longitude', t.roadmap_longitude,
        'taplistVerifiedAt', t.taplist_verified_at,
        'qualifyingNewTapCount', coalesce(nta.qualifying_new_tap_count, 0)
      )
      ORDER BY t.id
    ),
    '[]'::jsonb
  )
  FROM eligible e
  INNER JOIN public.tenants t ON t.id = e.id
  LEFT JOIN new_tap_agg nta ON nta.tenant_id = t.id;
$$;

REVOKE ALL ON FUNCTION public.get_beer_roadmap_eligible_tenants() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_beer_roadmap_eligible_tenants() TO service_role;
