-- Pilot bar tags + brewing highlights (idempotent).
-- Adjust tenant IDs / selections with owner input before running in production.

BEGIN;

-- 远山啤酒 — house brand with own-label beers on tap
UPDATE public.tenants
SET brewing_type = 'house_brand'
WHERE id = 'd897a73b-37fb-4c57-af0f-79d8759173cb';

INSERT INTO public.tenant_bar_tags (tenant_id, tag_key) VALUES
  ('d897a73b-37fb-4c57-af0f-79d8759173cb', 'seats_medium'),
  ('d897a73b-37fb-4c57-af0f-79d8759173cb', 'pet_friendly')
ON CONFLICT (tenant_id, tag_key) DO NOTHING;

-- Midnight Swim / Nippori partner tenant — on-site brewing highlight
UPDATE public.tenants
SET brewing_type = 'on_site_brewery'
WHERE id = '4d1da7d9-8b21-4706-b535-355b9ff79388';

INSERT INTO public.tenant_bar_tags (tenant_id, tag_key) VALUES
  ('4d1da7d9-8b21-4706-b535-355b9ff79388', 'seats_small'),
  ('4d1da7d9-8b21-4706-b535-355b9ff79388', 'late_night')
ON CONFLICT (tenant_id, tag_key) DO NOTHING;

-- Third pilot — amenity tags only (no brewing highlight)
INSERT INTO public.tenant_bar_tags (tenant_id, tag_key) VALUES
  ('831db2a1-ee47-4d88-9c0b-3e19a5668d6d', 'outdoor_seating'),
  ('831db2a1-ee47-4d88-9c0b-3e19a5668d6d', 'card_payment')
ON CONFLICT (tenant_id, tag_key) DO NOTHING;

COMMIT;
