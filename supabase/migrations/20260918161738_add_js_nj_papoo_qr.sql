-- Register the permanent venue QR code for PAPOO in Nanjing.
-- The code is immutable and must never be reassigned.

DO $$
DECLARE
  v_existing public.tenant_qr_links%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.tenants t
    WHERE t.id = 'a3b98b53-024d-48b6-8bfd-542b5dcb96e3'::uuid
      AND t.slug = 'js-nj-papoo'
      AND t.status = 'active'
      AND t.is_public_visible
  ) THEN
    RAISE EXCEPTION 'public active tenant js-nj-papoo was not found with the expected id';
  END IF;

  SELECT *
  INTO v_existing
  FROM public.tenant_qr_links q
  WHERE q.qr_code = 'FASIUKLR'
     OR (q.tenant_id = 'a3b98b53-024d-48b6-8bfd-542b5dcb96e3'::uuid
         AND q.placement = 'venue'
         AND q.enabled)
  LIMIT 1;

  IF FOUND THEN
    IF v_existing.qr_code = 'FASIUKLR'
       AND v_existing.tenant_id = 'a3b98b53-024d-48b6-8bfd-542b5dcb96e3'::uuid
       AND v_existing.tenant_slug = 'js-nj-papoo'
       AND v_existing.placement = 'venue'
       AND v_existing.version = 1
       AND v_existing.image_path = 'a3b98b53-024d-48b6-8bfd-542b5dcb96e3/qr/no-menu-qr-js-nj-papoo-FASIUKLR.png'
       AND v_existing.enabled THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'tenant js-nj-papoo QR registration conflicts with an existing permanent code';
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
    'FASIUKLR',
    'a3b98b53-024d-48b6-8bfd-542b5dcb96e3'::uuid,
    'js-nj-papoo',
    'venue',
    1,
    true,
    'PAPOO',
    'a3b98b53-024d-48b6-8bfd-542b5dcb96e3/qr/no-menu-qr-js-nj-papoo-FASIUKLR.png'
  );
END;
$$;
