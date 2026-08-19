-- Register the permanent venue QR code for 造啤师 in Shanghai.
-- The code is immutable and must never be reassigned.

DO $$
DECLARE
  v_existing public.tenant_qr_links%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.tenants t
    WHERE t.id = 'af37e235-ff22-4d12-bf7d-65dd5d64bfa7'::uuid
      AND t.slug = 'sh-zaopishi'
      AND t.status = 'active'
      AND t.is_public_visible
  ) THEN
    RAISE EXCEPTION 'public active tenant sh-zaopishi was not found with the expected id';
  END IF;

  SELECT *
  INTO v_existing
  FROM public.tenant_qr_links q
  WHERE q.qr_code = 'WDRGVUZN'
     OR (q.tenant_id = 'af37e235-ff22-4d12-bf7d-65dd5d64bfa7'::uuid
         AND q.placement = 'venue'
         AND q.enabled)
  LIMIT 1;

  IF FOUND THEN
    IF v_existing.qr_code = 'WDRGVUZN'
       AND v_existing.tenant_id = 'af37e235-ff22-4d12-bf7d-65dd5d64bfa7'::uuid
       AND v_existing.tenant_slug = 'sh-zaopishi'
       AND v_existing.placement = 'venue'
       AND v_existing.version = 1
       AND v_existing.image_path = 'af37e235-ff22-4d12-bf7d-65dd5d64bfa7/qr/no-menu-qr-sh-zaopishi-WDRGVUZN.png'
       AND v_existing.enabled THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'tenant sh-zaopishi QR registration conflicts with an existing permanent code';
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
    'WDRGVUZN',
    'af37e235-ff22-4d12-bf7d-65dd5d64bfa7'::uuid,
    'sh-zaopishi',
    'venue',
    1,
    true,
    '造啤师',
    'af37e235-ff22-4d12-bf7d-65dd5d64bfa7/qr/no-menu-qr-sh-zaopishi-WDRGVUZN.png'
  );
END;
$$;
