-- Register the permanent venue QR code for 椿木 in Binzhou.
-- The code is immutable and must never be reassigned.

DO $$
DECLARE
  v_existing public.tenant_qr_links%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.tenants t
    WHERE t.id = 'c953fa59-932b-45a9-99de-6148433d7c9f'::uuid
      AND t.slug = 'binzhou-chunmu'
      AND t.status = 'active'
      AND t.is_public_visible
  ) THEN
    RAISE EXCEPTION 'public active tenant binzhou-chunmu was not found with the expected id';
  END IF;

  SELECT *
  INTO v_existing
  FROM public.tenant_qr_links q
  WHERE q.qr_code = 'OXSA4ZCW'
     OR (q.tenant_id = 'c953fa59-932b-45a9-99de-6148433d7c9f'::uuid
         AND q.placement = 'venue'
         AND q.enabled)
  LIMIT 1;

  IF FOUND THEN
    IF v_existing.qr_code = 'OXSA4ZCW'
       AND v_existing.tenant_id = 'c953fa59-932b-45a9-99de-6148433d7c9f'::uuid
       AND v_existing.tenant_slug = 'binzhou-chunmu'
       AND v_existing.placement = 'venue'
       AND v_existing.version = 1
       AND v_existing.image_path = 'c953fa59-932b-45a9-99de-6148433d7c9f/qr/no-menu-qr-binzhou-chunmu-OXSA4ZCW.png'
       AND v_existing.enabled THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'tenant binzhou-chunmu QR registration conflicts with an existing permanent code';
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
    'OXSA4ZCW',
    'c953fa59-932b-45a9-99de-6148433d7c9f'::uuid,
    'binzhou-chunmu',
    'venue',
    1,
    true,
    '椿木',
    'c953fa59-932b-45a9-99de-6148433d7c9f/qr/no-menu-qr-binzhou-chunmu-OXSA4ZCW.png'
  );
END;
$$;
