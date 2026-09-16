-- Register the permanent venue QR code for 普通公司 · 酸啤精选店 in Shenyang.
-- The code is immutable and must never be reassigned.

DO $$
DECLARE
  v_existing public.tenant_qr_links%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.tenants t
    WHERE t.id = 'e8369bd1-250e-494d-93da-06d2fce04fa2'::uuid
      AND t.slug = 'sy-pu-tong'
      AND t.status = 'active'
      AND t.is_public_visible
  ) THEN
    RAISE EXCEPTION 'public active tenant sy-pu-tong was not found with the expected id';
  END IF;

  SELECT *
  INTO v_existing
  FROM public.tenant_qr_links q
  WHERE q.qr_code = 'RT3TBFLE'
     OR (q.tenant_id = 'e8369bd1-250e-494d-93da-06d2fce04fa2'::uuid
         AND q.placement = 'venue'
         AND q.enabled)
  LIMIT 1;

  IF FOUND THEN
    IF v_existing.qr_code = 'RT3TBFLE'
       AND v_existing.tenant_id = 'e8369bd1-250e-494d-93da-06d2fce04fa2'::uuid
       AND v_existing.tenant_slug = 'sy-pu-tong'
       AND v_existing.placement = 'venue'
       AND v_existing.version = 1
       AND v_existing.image_path = 'e8369bd1-250e-494d-93da-06d2fce04fa2/qr/no-menu-qr-sy-pu-tong-RT3TBFLE.png'
       AND v_existing.enabled THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'tenant sy-pu-tong QR registration conflicts with an existing permanent code';
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
    'RT3TBFLE',
    'e8369bd1-250e-494d-93da-06d2fce04fa2'::uuid,
    'sy-pu-tong',
    'venue',
    1,
    true,
    '普通公司 · 酸啤精选店',
    'e8369bd1-250e-494d-93da-06d2fce04fa2/qr/no-menu-qr-sy-pu-tong-RT3TBFLE.png'
  );
END;
$$;
