-- Register the permanent venue QR code for NPK · 萬事隨喜 in Chengdu.
-- The code is immutable and must never be reassigned.

DO $$
DECLARE
  v_existing public.tenant_qr_links%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.tenants t
    WHERE t.id = '183db14f-5288-4cd0-bc3f-dae531003faf'::uuid
      AND t.slug = 'sc-cd-pnk'
      AND t.status = 'active'
      AND t.is_public_visible
  ) THEN
    RAISE EXCEPTION 'public active tenant sc-cd-pnk was not found with the expected id';
  END IF;

  SELECT *
  INTO v_existing
  FROM public.tenant_qr_links q
  WHERE q.qr_code = '3MHXLE4C'
     OR (q.tenant_id = '183db14f-5288-4cd0-bc3f-dae531003faf'::uuid
         AND q.placement = 'venue'
         AND q.enabled)
  LIMIT 1;

  IF FOUND THEN
    IF v_existing.qr_code = '3MHXLE4C'
       AND v_existing.tenant_id = '183db14f-5288-4cd0-bc3f-dae531003faf'::uuid
       AND v_existing.tenant_slug = 'sc-cd-pnk'
       AND v_existing.placement = 'venue'
       AND v_existing.version = 1
       AND v_existing.image_path = '183db14f-5288-4cd0-bc3f-dae531003faf/qr/no-menu-qr-sc-cd-pnk-3MHXLE4C.png'
       AND v_existing.enabled THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'tenant sc-cd-pnk QR registration conflicts with an existing permanent code';
  END IF;

  INSERT INTO public.tenant_qr_links (
    qr_code,
    tenant_id,
    tenant_slug,
    placement,
    version,
    enabled,
    label,
    image_path
  )
  VALUES (
    '3MHXLE4C',
    '183db14f-5288-4cd0-bc3f-dae531003faf'::uuid,
    'sc-cd-pnk',
    'venue',
    1,
    true,
    'NPK · 萬事隨喜',
    '183db14f-5288-4cd0-bc3f-dae531003faf/qr/no-menu-qr-sc-cd-pnk-3MHXLE4C.png'
  );
END;
$$;
