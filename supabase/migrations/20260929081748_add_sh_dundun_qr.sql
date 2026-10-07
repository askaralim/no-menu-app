-- Register the permanent venue QR code for DUN DUN in Shanghai.
-- The code is immutable and must never be reassigned.

DO $$
DECLARE
  v_existing public.tenant_qr_links%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.tenants t
    WHERE t.id = '827294c2-0126-46b7-bca1-31f93ead5380'::uuid
      AND t.slug = 'sh-dundun'
      AND t.status = 'active'
      AND t.is_public_visible
  ) THEN
    RAISE EXCEPTION 'public active tenant sh-dundun was not found with the expected id';
  END IF;

  SELECT *
  INTO v_existing
  FROM public.tenant_qr_links q
  WHERE q.qr_code = 'L2M3KZY4'
     OR (q.tenant_id = '827294c2-0126-46b7-bca1-31f93ead5380'::uuid
         AND q.placement = 'venue'
         AND q.enabled)
  LIMIT 1;

  IF FOUND THEN
    IF v_existing.qr_code = 'L2M3KZY4'
       AND v_existing.tenant_id = '827294c2-0126-46b7-bca1-31f93ead5380'::uuid
       AND v_existing.tenant_slug = 'sh-dundun'
       AND v_existing.placement = 'venue'
       AND v_existing.version = 1
       AND v_existing.image_path = '827294c2-0126-46b7-bca1-31f93ead5380/qr/no-menu-qr-sh-dundun-L2M3KZY4.png'
       AND v_existing.image_url = 'https://img.nomenuapp.com/prod/tenants/827294c2-0126-46b7-bca1-31f93ead5380/qr/no-menu-qr-sh-dundun-L2M3KZY4.png'
       AND v_existing.enabled THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'tenant sh-dundun QR registration conflicts with an existing permanent code';
  END IF;

  INSERT INTO public.tenant_qr_links (
    qr_code,
    tenant_id,
    tenant_slug,
    placement,
    version,
    enabled,
    label,
    image_path,
    image_url
  )
  VALUES (
    'L2M3KZY4',
    '827294c2-0126-46b7-bca1-31f93ead5380'::uuid,
    'sh-dundun',
    'venue',
    1,
    true,
    'DUN DUN',
    '827294c2-0126-46b7-bca1-31f93ead5380/qr/no-menu-qr-sh-dundun-L2M3KZY4.png',
    'https://img.nomenuapp.com/prod/tenants/827294c2-0126-46b7-bca1-31f93ead5380/qr/no-menu-qr-sh-dundun-L2M3KZY4.png'
  );
END;
$$;
