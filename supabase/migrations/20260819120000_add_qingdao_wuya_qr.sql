-- Register the permanent venue QR code for 雾鸦 in Qingdao.
-- The code is immutable and must never be reassigned.

DO $$
DECLARE
  v_existing public.tenant_qr_links%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.tenants t
    WHERE t.id = '349c2cfd-b0e7-4429-9ba3-3790bd3ebb3e'::uuid
      AND t.slug = 'qingdao-wuya'
      AND t.status = 'active'
      AND t.is_public_visible
  ) THEN
    RAISE EXCEPTION 'public active tenant qingdao-wuya was not found with the expected id';
  END IF;

  SELECT *
  INTO v_existing
  FROM public.tenant_qr_links q
  WHERE q.qr_code = 'T6OIAXI7'
     OR (q.tenant_id = '349c2cfd-b0e7-4429-9ba3-3790bd3ebb3e'::uuid
         AND q.placement = 'venue'
         AND q.enabled)
  LIMIT 1;

  IF FOUND THEN
    IF v_existing.qr_code = 'T6OIAXI7'
       AND v_existing.tenant_id = '349c2cfd-b0e7-4429-9ba3-3790bd3ebb3e'::uuid
       AND v_existing.tenant_slug = 'qingdao-wuya'
       AND v_existing.placement = 'venue'
       AND v_existing.version = 1
       AND v_existing.image_path = '349c2cfd-b0e7-4429-9ba3-3790bd3ebb3e/qr/no-menu-qr-qingdao-wuya-T6OIAXI7.png'
       AND v_existing.enabled THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'tenant qingdao-wuya QR registration conflicts with an existing permanent code';
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
    'T6OIAXI7',
    '349c2cfd-b0e7-4429-9ba3-3790bd3ebb3e'::uuid,
    'qingdao-wuya',
    'venue',
    1,
    true,
    '雾鸦',
    '349c2cfd-b0e7-4429-9ba3-3790bd3ebb3e/qr/no-menu-qr-qingdao-wuya-T6OIAXI7.png'
  );
END;
$$;
