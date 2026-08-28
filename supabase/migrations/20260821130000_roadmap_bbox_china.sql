-- Widen Beer Route coordinate guard from Shanghai-only to mainland China.
--
-- Background: the bbox check dates from the Shanghai-only Beer Route launch
-- (20260624130000 / 20260624140000). Beer Route went multi-city in
-- 20260630120000 (get_beer_roadmap_eligible_tenants(p_city)), but the CHECK was
-- never widened, so tenants outside Shanghai (e.g. Qingdao) cannot store
-- coordinates at all.
--
-- The bbox stays intentionally tight enough to still reject swapped
-- longitude/latitude pairs: a swap puts latitude outside 17..54.

ALTER TABLE public.tenants
  DROP CONSTRAINT IF EXISTS tenants_roadmap_shanghai_bbox_check;

ALTER TABLE public.tenants
  DROP CONSTRAINT IF EXISTS tenants_roadmap_china_bbox_check;

ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_roadmap_china_bbox_check
    CHECK (
      roadmap_longitude IS NULL
      OR (
        roadmap_longitude BETWEEN 73.000000 AND 135.500000
        AND roadmap_latitude BETWEEN 17.000000 AND 54.000000
      )
    );
