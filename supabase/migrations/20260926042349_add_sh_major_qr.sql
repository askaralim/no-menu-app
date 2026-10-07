-- Register the permanent venue QR code for Major Bar in Shanghai.
-- The code is immutable and must never be reassigned.

DO $$
DECLARE
  v_existing public.tenant_qr_links%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.tenants t
    WHERE t.id = '76f5d12f-0cba-4448-8589-2784eefe078d'::uuid
      AND t.slug = 'sh-major'
      AND t.status = 'active'
      AND t.is_public_visible
  ) THEN
    RAISE EXCEPTION 'public active tenant sh-major was not found with the expected id';
  END IF;

  SELECT *
  INTO v_existing
  FROM public.tenant_qr_links q
  WHERE q.qr_code = 'AGSH3YNG'
     OR (q.tenant_id = '76f5d12f-0cba-4448-8589-2784eefe078d'::uuid
         AND q.placement = 'venue'
         AND q.enabled)
  LIMIT 1;

  IF FOUND THEN
    IF v_existing.qr_code = 'AGSH3YNG'
       AND v_existing.tenant_id = '76f5d12f-0cba-4448-8589-2784eefe078d'::uuid
       AND v_existing.tenant_slug = 'sh-major'
       AND v_existing.placement = 'venue'
       AND v_existing.version = 1
       AND v_existing.image_path = '76f5d12f-0cba-4448-8589-2784eefe078d/qr/no-menu-qr-sh-major-AGSH3YNG.png'
       AND v_existing.enabled THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'tenant sh-major QR registration conflicts with an existing permanent code';
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
    'AGSH3YNG',
    '76f5d12f-0cba-4448-8589-2784eefe078d'::uuid,
    'sh-major',
    'venue',
    1,
    true,
    'Major Bar',
    '76f5d12f-0cba-4448-8589-2784eefe078d/qr/no-menu-qr-sh-major-AGSH3YNG.png'
  );
END;
$$;
