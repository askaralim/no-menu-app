-- Register the permanent venue QR code for 漾菘 in Changchun.
-- The code is immutable and must never be reassigned.

DO $$
DECLARE
  v_existing public.tenant_qr_links%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.tenants t
    WHERE t.id = '3e036295-a0d2-42aa-8656-564c7c238049'::uuid
      AND t.slug = 'cc-yang-song'
      AND t.status = 'active'
      AND t.is_public_visible
  ) THEN
    RAISE EXCEPTION 'public active tenant cc-yang-song was not found with the expected id';
  END IF;

  SELECT *
  INTO v_existing
  FROM public.tenant_qr_links q
  WHERE q.qr_code = '7KZ3OH3D'
     OR (q.tenant_id = '3e036295-a0d2-42aa-8656-564c7c238049'::uuid
         AND q.placement = 'venue'
         AND q.enabled)
  LIMIT 1;

  IF FOUND THEN
    IF v_existing.qr_code = '7KZ3OH3D'
       AND v_existing.tenant_id = '3e036295-a0d2-42aa-8656-564c7c238049'::uuid
       AND v_existing.tenant_slug = 'cc-yang-song'
       AND v_existing.placement = 'venue'
       AND v_existing.version = 1
       AND v_existing.image_path = '3e036295-a0d2-42aa-8656-564c7c238049/qr/no-menu-qr-cc-yang-song-7KZ3OH3D.png'
       AND v_existing.enabled THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'tenant cc-yang-song QR registration conflicts with an existing permanent code';
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
    '7KZ3OH3D',
    '3e036295-a0d2-42aa-8656-564c7c238049'::uuid,
    'cc-yang-song',
    'venue',
    1,
    true,
    '漾菘',
    '3e036295-a0d2-42aa-8656-564c7c238049/qr/no-menu-qr-cc-yang-song-7KZ3OH3D.png'
  );
END;
$$;
