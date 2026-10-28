-- Register the permanent venue QR and release mini-program code for TAPSTAR 阿云朵仓店.
DO $$
DECLARE
  v_existing public.tenant_qr_links%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.tenants t
    WHERE t.id = '7cf38b2e-b0e6-415e-9429-86a8e8b520c3'::uuid
      AND t.slug = 'gz-gy-tapstar2'
  ) THEN
    RAISE EXCEPTION 'tenant gz-gy-tapstar2 was not found with the expected id';
  END IF;

  SELECT * INTO v_existing
  FROM public.tenant_qr_links q
  WHERE q.qr_code = '6DTTL2V3'
     OR (
       q.tenant_id = '7cf38b2e-b0e6-415e-9429-86a8e8b520c3'::uuid
       AND q.placement = 'venue'
       AND q.enabled
     )
  LIMIT 1;

  IF FOUND THEN
    IF v_existing.qr_code = '6DTTL2V3'
       AND v_existing.tenant_id = '7cf38b2e-b0e6-415e-9429-86a8e8b520c3'::uuid
       AND v_existing.tenant_slug = 'gz-gy-tapstar2'
       AND v_existing.placement = 'venue'
       AND v_existing.version = 1
       AND v_existing.image_path = '7cf38b2e-b0e6-415e-9429-86a8e8b520c3/qr/no-menu-qr-gz-gy-tapstar2-6DTTL2V3.png'
       AND v_existing.image_url = 'https://img.nomenuapp.com/prod/tenants/7cf38b2e-b0e6-415e-9429-86a8e8b520c3/qr/no-menu-qr-gz-gy-tapstar2-6DTTL2V3.png'
       AND v_existing.mini_program_code_url = 'https://img.nomenuapp.com/prod/tenants/7cf38b2e-b0e6-415e-9429-86a8e8b520c3/qr/weapp/release/no-menu-weapp-v1-6DTTL2V3.jpg'
       AND v_existing.enabled THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'tenant gz-gy-tapstar2 QR registration conflicts with an existing permanent code';
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
    '6DTTL2V3',
    '7cf38b2e-b0e6-415e-9429-86a8e8b520c3'::uuid,
    'gz-gy-tapstar2',
    'venue',
    1,
    true,
    'TAPSTAR TAPROOM【阿云朵仓店】',
    '7cf38b2e-b0e6-415e-9429-86a8e8b520c3/qr/no-menu-qr-gz-gy-tapstar2-6DTTL2V3.png',
    'https://img.nomenuapp.com/prod/tenants/7cf38b2e-b0e6-415e-9429-86a8e8b520c3/qr/no-menu-qr-gz-gy-tapstar2-6DTTL2V3.png',
    'https://img.nomenuapp.com/prod/tenants/7cf38b2e-b0e6-415e-9429-86a8e8b520c3/qr/weapp/release/no-menu-weapp-v1-6DTTL2V3.jpg'
  );
END;
$$;
