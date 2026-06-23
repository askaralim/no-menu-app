-- Beer Route foundation SQL tests (run locally after migrations as DB superuser).
-- Usage: psql "$DATABASE_URL" -f supabase/tests/beer_roadmap_foundation.sql

BEGIN;

DO $$
DECLARE
  v_tenant_id uuid;
  v_enabled boolean;
  v_verified timestamptz;
  v_version bigint;
BEGIN
  SELECT id INTO v_tenant_id
  FROM public.tenants
  WHERE slug IS NOT NULL AND slug <> '__platform__'
  LIMIT 1;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'No tenant available for tests';
  END IF;

  -- Paired coordinate constraint
  BEGIN
    UPDATE public.tenants
    SET amap_longitude = 121.473701, amap_latitude = NULL
    WHERE id = v_tenant_id;
    RAISE EXCEPTION 'expected paired coordinate constraint failure';
  EXCEPTION
    WHEN check_violation THEN
      NULL;
  END;

  -- Coordinate invalidation trigger
  UPDATE public.tenants
  SET
    amap_longitude = 121.473701,
    amap_latitude = 31.230416,
    roadmap_enabled = true,
    roadmap_coordinates_verified_at = now(),
    roadmap_coordinate_version = 0
  WHERE id = v_tenant_id;

  UPDATE public.tenants
  SET amap_longitude = 121.473800
  WHERE id = v_tenant_id;

  SELECT t.roadmap_enabled, t.roadmap_coordinates_verified_at, t.roadmap_coordinate_version
  INTO v_enabled, v_verified, v_version
  FROM public.tenants t
  WHERE t.id = v_tenant_id;

  IF v_enabled OR v_verified IS NOT NULL OR v_version < 1 THEN
    RAISE EXCEPTION 'coordinate change must disable roadmap, clear verification, and bump version';
  END IF;

  -- Opening period overlap rejection
  DELETE FROM public.tenant_opening_periods WHERE tenant_id = v_tenant_id;
  INSERT INTO public.tenant_opening_periods (tenant_id, iso_day_of_week, opens_at, closes_at, closes_next_day)
  VALUES (v_tenant_id, 1, time '10:00', time '14:00', false);

  BEGIN
    INSERT INTO public.tenant_opening_periods (tenant_id, iso_day_of_week, opens_at, closes_at, closes_next_day)
    VALUES (v_tenant_id, 1, time '12:00', time '16:00', false);
    RAISE EXCEPTION 'expected overlap validation failure';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%overlap%' THEN
        RAISE;
      END IF;
  END;

  RAISE NOTICE 'beer_roadmap_foundation.sql: constraint/trigger checks passed';
END $$;

ROLLBACK;
