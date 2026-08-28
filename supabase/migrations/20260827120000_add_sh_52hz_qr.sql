-- Register the permanent venue QR code for 52Hz in Shanghai.
-- The code is immutable and must never be reassigned.

DO $$
DECLARE
  v_existing public.tenant_qr_links%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.tenants t
    WHERE t.id = 'fa4b4a67-1147-48e1-8577-b06045728e45'::uuid
      AND t.slug = 'sh-52hz'
      AND t.status = 'active'
      AND t.is_public_visible
  ) THEN
    RAISE EXCEPTION 'public active tenant sh-52hz was not found with the expected id';
  END IF;

  SELECT *
  INTO v_existing
  FROM public.tenant_qr_links q
  WHERE q.qr_code = 'JUMNTYYA'
     OR (q.tenant_id = 'fa4b4a67-1147-48e1-8577-b06045728e45'::uuid
         AND q.placement = 'venue'
         AND q.enabled)
  LIMIT 1;

  IF FOUND THEN
    IF v_existing.qr_code = 'JUMNTYYA'
       AND v_existing.tenant_id = 'fa4b4a67-1147-48e1-8577-b06045728e45'::uuid
       AND v_existing.tenant_slug = 'sh-52hz'
       AND v_existing.placement = 'venue'
       AND v_existing.version = 1
       AND v_existing.image_path = 'fa4b4a67-1147-48e1-8577-b06045728e45/qr/no-menu-qr-sh-52hz-JUMNTYYA.png'
       AND v_existing.enabled THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'tenant sh-52hz QR registration conflicts with an existing permanent code';
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
    'JUMNTYYA',
    'fa4b4a67-1147-48e1-8577-b06045728e45'::uuid,
    'sh-52hz',
    'venue',
    1,
    true,
    '52Hz',
    'fa4b4a67-1147-48e1-8577-b06045728e45/qr/no-menu-qr-sh-52hz-JUMNTYYA.png'
  );
END;
$$;
