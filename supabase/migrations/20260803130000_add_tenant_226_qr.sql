-- Register the permanent venue QR code for tenant 226.
-- The code is immutable and must never be reassigned.

DO $$
DECLARE
  v_existing public.tenant_qr_links%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.tenants t
    WHERE t.id = '00000000-0000-0000-0000-000000000001'::uuid
      AND t.slug = '226'
  ) THEN
    RAISE EXCEPTION 'tenant 226 was not found with the expected id';
  END IF;

  SELECT *
  INTO v_existing
  FROM public.tenant_qr_links q
  WHERE q.qr_code = 'EH7YJ3QS'
     OR (q.tenant_id = '00000000-0000-0000-0000-000000000001'::uuid
         AND q.placement = 'venue'
         AND q.enabled)
  LIMIT 1;

  IF FOUND THEN
    IF v_existing.qr_code = 'EH7YJ3QS'
       AND v_existing.tenant_id = '00000000-0000-0000-0000-000000000001'::uuid
       AND v_existing.placement = 'venue'
       AND v_existing.image_path = '00000000-0000-0000-0000-000000000001/qr/no-menu-qr-226-EH7YJ3QS.png'
       AND v_existing.enabled THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'tenant 226 QR registration conflicts with an existing permanent code';
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
    'EH7YJ3QS',
    '00000000-0000-0000-0000-000000000001'::uuid,
    '226',
    'venue',
    1,
    true,
    '226',
    '00000000-0000-0000-0000-000000000001/qr/no-menu-qr-226-EH7YJ3QS.png'
  );
END;
$$;
