-- Register the permanent venue QR code for a place... in Shanghai.
-- The code is immutable and must never be reassigned.

DO $$
DECLARE
  v_existing public.tenant_qr_links%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.tenants t
    WHERE t.id = '6c76b014-4deb-4f61-83e2-f53db97e1035'::uuid
      AND t.slug = 'sh-a-place'
      AND t.status = 'active'
      AND t.is_public_visible
  ) THEN
    RAISE EXCEPTION 'public active tenant sh-a-place was not found with the expected id';
  END IF;

  SELECT *
  INTO v_existing
  FROM public.tenant_qr_links q
  WHERE q.qr_code = 'S7PRIQNX'
     OR (q.tenant_id = '6c76b014-4deb-4f61-83e2-f53db97e1035'::uuid
         AND q.placement = 'venue'
         AND q.enabled)
  LIMIT 1;

  IF FOUND THEN
    IF v_existing.qr_code = 'S7PRIQNX'
       AND v_existing.tenant_id = '6c76b014-4deb-4f61-83e2-f53db97e1035'::uuid
       AND v_existing.tenant_slug = 'sh-a-place'
       AND v_existing.placement = 'venue'
       AND v_existing.version = 1
       AND v_existing.image_path = '6c76b014-4deb-4f61-83e2-f53db97e1035/qr/no-menu-qr-sh-a-place-S7PRIQNX.png'
       AND v_existing.enabled THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'tenant sh-a-place QR registration conflicts with an existing permanent code';
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
    'S7PRIQNX',
    '6c76b014-4deb-4f61-83e2-f53db97e1035'::uuid,
    'sh-a-place',
    'venue',
    1,
    true,
    'a place...',
    '6c76b014-4deb-4f61-83e2-f53db97e1035/qr/no-menu-qr-sh-a-place-S7PRIQNX.png'
  );
END;
$$;
