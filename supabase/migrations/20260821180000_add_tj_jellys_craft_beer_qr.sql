-- Register the permanent venue QR code for Jelly's Craft Beer in Tianjin.
-- The code is immutable and must never be reassigned.

DO $$
DECLARE
  v_existing public.tenant_qr_links%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.tenants t
    WHERE t.id = '163e02a6-0939-4927-851e-84798d875389'::uuid
      AND t.slug = 'tj-jellys-craft-beer'
      AND t.status = 'active'
      AND t.is_public_visible
  ) THEN
    RAISE EXCEPTION 'public active tenant tj-jellys-craft-beer was not found with the expected id';
  END IF;

  SELECT *
  INTO v_existing
  FROM public.tenant_qr_links q
  WHERE q.qr_code = 'C3EDOTH3'
     OR (q.tenant_id = '163e02a6-0939-4927-851e-84798d875389'::uuid
         AND q.placement = 'venue'
         AND q.enabled)
  LIMIT 1;

  IF FOUND THEN
    IF v_existing.qr_code = 'C3EDOTH3'
       AND v_existing.tenant_id = '163e02a6-0939-4927-851e-84798d875389'::uuid
       AND v_existing.tenant_slug = 'tj-jellys-craft-beer'
       AND v_existing.placement = 'venue'
       AND v_existing.version = 1
       AND v_existing.image_path = '163e02a6-0939-4927-851e-84798d875389/qr/no-menu-qr-tj-jellys-craft-beer-C3EDOTH3.png'
       AND v_existing.enabled THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'tenant tj-jellys-craft-beer QR registration conflicts with an existing permanent code';
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
    'C3EDOTH3',
    '163e02a6-0939-4927-851e-84798d875389'::uuid,
    'tj-jellys-craft-beer',
    'venue',
    1,
    true,
    'Jelly''s Craft Beer',
    '163e02a6-0939-4927-851e-84798d875389/qr/no-menu-qr-tj-jellys-craft-beer-C3EDOTH3.png'
  );
END;
$$;
