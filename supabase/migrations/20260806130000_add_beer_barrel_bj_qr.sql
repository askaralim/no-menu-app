-- Register the permanent venue QR code for Beer Barrel Beijing.
-- The code is immutable and must never be reassigned.

DO $$
DECLARE
  v_existing public.tenant_qr_links%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.tenants t
    WHERE t.id = 'ba7a8470-4079-47ae-b3a0-166b7aeec17e'::uuid
      AND t.slug = 'beer-barrel-bj'
  ) THEN
    RAISE EXCEPTION 'tenant beer-barrel-bj was not found with the expected id';
  END IF;

  SELECT *
  INTO v_existing
  FROM public.tenant_qr_links q
  WHERE q.qr_code = '5DFTODOO'
     OR (q.tenant_id = 'ba7a8470-4079-47ae-b3a0-166b7aeec17e'::uuid
         AND q.placement = 'venue'
         AND q.enabled)
  LIMIT 1;

  IF FOUND THEN
    IF v_existing.qr_code = '5DFTODOO'
       AND v_existing.tenant_id = 'ba7a8470-4079-47ae-b3a0-166b7aeec17e'::uuid
       AND v_existing.placement = 'venue'
       AND v_existing.image_path = 'ba7a8470-4079-47ae-b3a0-166b7aeec17e/qr/no-menu-qr-beer-barrel-bj-5DFTODOO.png'
       AND v_existing.enabled THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'tenant beer-barrel-bj QR registration conflicts with an existing permanent code';
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
    '5DFTODOO',
    'ba7a8470-4079-47ae-b3a0-166b7aeec17e'::uuid,
    'beer-barrel-bj',
    'venue',
    1,
    true,
    'Beer Barrel',
    'ba7a8470-4079-47ae-b3a0-166b7aeec17e/qr/no-menu-qr-beer-barrel-bj-5DFTODOO.png'
  );
END;
$$;
