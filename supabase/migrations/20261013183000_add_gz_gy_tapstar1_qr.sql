-- Register the permanent venue QR and official WeChat mini-program code for Tapstar 文昌北路.
-- The code is immutable and must never be reassigned.

DO $$
DECLARE
  v_existing public.tenant_qr_links%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.tenants t
    WHERE t.id = '842921bb-af0c-463e-9cf9-e4b16496d88d'::uuid
      AND t.slug = 'gz-gy-tapstar1'
  ) THEN
    RAISE EXCEPTION 'tenant gz-gy-tapstar1 was not found with the expected id';
  END IF;

  SELECT *
  INTO v_existing
  FROM public.tenant_qr_links q
  WHERE q.qr_code = 'VNCD2N3P'
     OR (q.tenant_id = '842921bb-af0c-463e-9cf9-e4b16496d88d'::uuid
         AND q.placement = 'venue'
         AND q.enabled)
  LIMIT 1;

  IF FOUND THEN
    IF v_existing.qr_code = 'VNCD2N3P'
       AND v_existing.tenant_id = '842921bb-af0c-463e-9cf9-e4b16496d88d'::uuid
       AND v_existing.tenant_slug = 'gz-gy-tapstar1'
       AND v_existing.placement = 'venue'
       AND v_existing.version = 1
       AND v_existing.image_path = '842921bb-af0c-463e-9cf9-e4b16496d88d/qr/no-menu-qr-gz-gy-tapstar1-VNCD2N3P.png'
       AND v_existing.image_url = 'https://img.nomenuapp.com/prod/tenants/842921bb-af0c-463e-9cf9-e4b16496d88d/qr/no-menu-qr-gz-gy-tapstar1-VNCD2N3P.png'
       AND v_existing.mini_program_code_url = 'https://img.nomenuapp.com/prod/tenants/842921bb-af0c-463e-9cf9-e4b16496d88d/qr/weapp/release/no-menu-weapp-v1-VNCD2N3P.jpg'
       AND v_existing.enabled THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'tenant gz-gy-tapstar1 QR registration conflicts with an existing permanent code';
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
    image_url,
    mini_program_code_url
  ) VALUES (
    'VNCD2N3P',
    '842921bb-af0c-463e-9cf9-e4b16496d88d'::uuid,
    'gz-gy-tapstar1',
    'venue',
    1,
    true,
    'Tapstar 文昌北路',
    '842921bb-af0c-463e-9cf9-e4b16496d88d/qr/no-menu-qr-gz-gy-tapstar1-VNCD2N3P.png',
    'https://img.nomenuapp.com/prod/tenants/842921bb-af0c-463e-9cf9-e4b16496d88d/qr/no-menu-qr-gz-gy-tapstar1-VNCD2N3P.png',
    'https://img.nomenuapp.com/prod/tenants/842921bb-af0c-463e-9cf9-e4b16496d88d/qr/weapp/release/no-menu-weapp-v1-VNCD2N3P.jpg'
  );
END;
$$;
