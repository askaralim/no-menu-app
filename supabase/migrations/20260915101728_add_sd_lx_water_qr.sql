-- Register the permanent venue QR code for Water in Linxi.
-- The code is immutable and must never be reassigned.

DO $$
DECLARE
  v_existing public.tenant_qr_links%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.tenants t
    WHERE t.id = '5953cf41-88df-4bca-8475-47a7f6e029c0'::uuid
      AND t.slug = 'sd-lx-water'
      AND t.status = 'active'
      AND t.is_public_visible
  ) THEN
    RAISE EXCEPTION 'public active tenant sd-lx-water was not found with the expected id';
  END IF;

  SELECT *
  INTO v_existing
  FROM public.tenant_qr_links q
  WHERE q.qr_code = 'VFQCOPG3'
     OR (q.tenant_id = '5953cf41-88df-4bca-8475-47a7f6e029c0'::uuid
         AND q.placement = 'venue'
         AND q.enabled)
  LIMIT 1;

  IF FOUND THEN
    IF v_existing.qr_code = 'VFQCOPG3'
       AND v_existing.tenant_id = '5953cf41-88df-4bca-8475-47a7f6e029c0'::uuid
       AND v_existing.tenant_slug = 'sd-lx-water'
       AND v_existing.placement = 'venue'
       AND v_existing.version = 1
       AND v_existing.image_path = '5953cf41-88df-4bca-8475-47a7f6e029c0/qr/no-menu-qr-sd-lx-water-VFQCOPG3.png'
       AND v_existing.enabled THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'tenant sd-lx-water QR registration conflicts with an existing permanent code';
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
    'VFQCOPG3',
    '5953cf41-88df-4bca-8475-47a7f6e029c0'::uuid,
    'sd-lx-water',
    'venue',
    1,
    true,
    'Water',
    '5953cf41-88df-4bca-8475-47a7f6e029c0/qr/no-menu-qr-sd-lx-water-VFQCOPG3.png'
  );
END;
$$;
