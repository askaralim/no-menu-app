-- Register the permanent venue QR code for WE CHEERS.
-- The code is immutable and must never be reassigned.

DO $$
DECLARE
  v_existing public.tenant_qr_links%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.tenants t
    WHERE t.id = '777ca3a8-279c-4f36-9ea6-efceda376995'::uuid
      AND t.slug = 'we-cheers'
  ) THEN
    RAISE EXCEPTION 'tenant we-cheers was not found with the expected id';
  END IF;

  SELECT *
  INTO v_existing
  FROM public.tenant_qr_links q
  WHERE q.qr_code = 'GEEG7VAV'
     OR (q.tenant_id = '777ca3a8-279c-4f36-9ea6-efceda376995'::uuid
         AND q.placement = 'venue'
         AND q.enabled)
  LIMIT 1;

  IF FOUND THEN
    IF v_existing.qr_code = 'GEEG7VAV'
       AND v_existing.tenant_id = '777ca3a8-279c-4f36-9ea6-efceda376995'::uuid
       AND v_existing.placement = 'venue'
       AND v_existing.image_path = '777ca3a8-279c-4f36-9ea6-efceda376995/qr/no-menu-qr-we-cheers-GEEG7VAV.png'
       AND v_existing.enabled THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'tenant we-cheers QR registration conflicts with an existing permanent code';
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
    'GEEG7VAV',
    '777ca3a8-279c-4f36-9ea6-efceda376995'::uuid,
    'we-cheers',
    'venue',
    1,
    true,
    'WE CHEERS',
    '777ca3a8-279c-4f36-9ea6-efceda376995/qr/no-menu-qr-we-cheers-GEEG7VAV.png'
  );
END;
$$;
