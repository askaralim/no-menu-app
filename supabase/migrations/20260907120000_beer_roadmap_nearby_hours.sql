-- Beer Route: nearby display (not "open now"), 7-day taplist freshness, today's hours.
--
-- Display gate no longer uses tenant_is_open_now. Hours become per-stop status.
-- Freshness matches Tonight feed: hide "recently updated" after 7 days.

CREATE OR REPLACE FUNCTION public.tenant_roadmap_hours_snapshot(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now_sh timestamp;
  v_dow smallint;
  v_time time;
  v_is_open boolean;
  v_opens time;
  v_closes time;
  v_closes_next boolean;
  v_opens_later boolean := false;
BEGIN
  v_now_sh := now() AT TIME ZONE 'Asia/Shanghai';
  v_dow := extract(isodow from v_now_sh)::smallint;
  v_time := v_now_sh::time;
  v_is_open := public.tenant_is_open_now(p_tenant_id);

  IF v_is_open THEN
    SELECT p.opens_at, p.closes_at, p.closes_next_day
    INTO v_opens, v_closes, v_closes_next
    FROM public.tenant_opening_periods p
    WHERE p.tenant_id = p_tenant_id
      AND p.closes_next_day = true
      AND p.iso_day_of_week = CASE WHEN v_dow = 1 THEN 7 ELSE v_dow - 1 END
      AND (
        (p.opens_at = time '00:00' AND p.closes_at = time '00:00')
        OR (p.closes_at <> time '00:00' AND v_time < p.closes_at)
      )
    ORDER BY p.closes_at DESC
    LIMIT 1;

    IF v_opens IS NULL THEN
      SELECT p.opens_at, p.closes_at, p.closes_next_day
      INTO v_opens, v_closes, v_closes_next
      FROM public.tenant_opening_periods p
      WHERE p.tenant_id = p_tenant_id
        AND p.iso_day_of_week = v_dow
      ORDER BY p.opens_at
      LIMIT 1;
    END IF;
  ELSE
    SELECT p.opens_at, p.closes_at, p.closes_next_day
    INTO v_opens, v_closes, v_closes_next
    FROM public.tenant_opening_periods p
    WHERE p.tenant_id = p_tenant_id
      AND p.iso_day_of_week = v_dow
      AND p.opens_at > v_time
    ORDER BY p.opens_at
    LIMIT 1;

    IF FOUND THEN
      v_opens_later := true;
    ELSE
      SELECT p.opens_at, p.closes_at, p.closes_next_day
      INTO v_opens, v_closes, v_closes_next
      FROM public.tenant_opening_periods p
      WHERE p.tenant_id = p_tenant_id
        AND p.iso_day_of_week = v_dow
      ORDER BY p.opens_at
      LIMIT 1;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'isOpenNow', v_is_open,
    'todayOpensAt', CASE WHEN v_opens IS NULL THEN NULL ELSE to_char(v_opens, 'HH24:MI') END,
    'todayClosesAt', CASE WHEN v_closes IS NULL THEN NULL ELSE to_char(v_closes, 'HH24:MI') END,
    'closesNextDay', coalesce(v_closes_next, false),
    'opensLaterToday', v_opens_later
  );
END;
$$;

REVOKE ALL ON FUNCTION public.tenant_roadmap_hours_snapshot(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tenant_roadmap_hours_snapshot(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.get_beer_roadmap_eligible_tenants(p_city text DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH selected_city AS (
    SELECT coalesce(nullif(trim(p_city), ''), 'Shanghai') AS city
  ),
  eligible AS (
    SELECT t.id
    FROM public.tenants t
    CROSS JOIN selected_city sc
    WHERE t.status = 'active'
      AND t.is_public_visible = true
      AND lower(trim(t.city)) = lower(trim(sc.city))
      AND t.roadmap_enabled = true
      AND t.roadmap_coordinates_verified_at IS NOT NULL
      AND t.roadmap_longitude IS NOT NULL
      AND t.roadmap_latitude IS NOT NULL
      AND public.tenant_has_valid_structured_hours(t.id)
      AND t.taplist_verified_at >= now() - interval '7 days'
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
      (
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
        ) || public.tenant_roadmap_hours_snapshot(t.id)
      )
      ORDER BY t.id
    ),
    '[]'::jsonb
  )
  FROM eligible e
  INNER JOIN public.tenants t ON t.id = e.id
  LEFT JOIN new_tap_agg nta ON nta.tenant_id = t.id;
$$;

REVOKE ALL ON FUNCTION public.get_beer_roadmap_eligible_tenants(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_beer_roadmap_eligible_tenants(text) TO service_role;
