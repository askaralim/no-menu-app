-- Register the permanent venue QR code for Whale Inn in Shanghai.
-- The code is immutable and must never be reassigned.

DO $$
DECLARE
  v_existing public.tenant_qr_links%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.tenants t
    WHERE t.id = 'b2657ad5-9152-4258-a020-1f853b35fac1'::uuid
      AND t.slug = 'sh-whale-inn'
      AND t.status = 'active'
      AND t.is_public_visible
  ) THEN
    RAISE EXCEPTION 'public active tenant sh-whale-inn was not found with the expected id';
  END IF;

  SELECT *
  INTO v_existing
  FROM public.tenant_qr_links q
  WHERE q.qr_code = 'HRETCZJC'
     OR (q.tenant_id = 'b2657ad5-9152-4258-a020-1f853b35fac1'::uuid
         AND q.placement = 'venue'
         AND q.enabled)
  LIMIT 1;

  IF FOUND THEN
    IF v_existing.qr_code = 'HRETCZJC'
       AND v_existing.tenant_id = 'b2657ad5-9152-4258-a020-1f853b35fac1'::uuid
       AND v_existing.tenant_slug = 'sh-whale-inn'
       AND v_existing.placement = 'venue'
       AND v_existing.version = 1
       AND v_existing.image_path = 'b2657ad5-9152-4258-a020-1f853b35fac1/qr/no-menu-qr-sh-whale-inn-HRETCZJC.png'
       AND v_existing.image_url = 'https://img.nomenuapp.com/prod/tenants/b2657ad5-9152-4258-a020-1f853b35fac1/qr/no-menu-qr-sh-whale-inn-HRETCZJC.png'
       AND v_existing.enabled THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'tenant sh-whale-inn QR registration conflicts with an existing permanent code';
  END IF;

  INSERT INTO public.tenant_qr_links (
    qr_code, tenant_id, tenant_slug, placement, version, enabled, label, image_path, image_url
  ) VALUES (
    'HRETCZJC',
    'b2657ad5-9152-4258-a020-1f853b35fac1'::uuid,
    'sh-whale-inn',
    'venue',
    1,
    true,
    'Whale Inn',
    'b2657ad5-9152-4258-a020-1f853b35fac1/qr/no-menu-qr-sh-whale-inn-HRETCZJC.png',
    'https://img.nomenuapp.com/prod/tenants/b2657ad5-9152-4258-a020-1f853b35fac1/qr/no-menu-qr-sh-whale-inn-HRETCZJC.png'
  );
END;
$$;
