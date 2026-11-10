-- Register the permanent venue QR and release mini-program code for 水泥公园.
DO $$
DECLARE
  v_existing public.tenant_qr_links%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.tenants t
    WHERE t.id = 'ed33ddee-e586-41e1-856a-79a1741f0e21'::uuid
      AND t.slug = 'gz-gy-shuini'
  ) THEN
    RAISE EXCEPTION 'tenant gz-gy-shuini was not found with the expected id';
  END IF;

  SELECT * INTO v_existing
  FROM public.tenant_qr_links q
  WHERE q.qr_code = '3WGVONBR'
     OR (
       q.tenant_id = 'ed33ddee-e586-41e1-856a-79a1741f0e21'::uuid
       AND q.placement = 'venue'
       AND q.enabled
     )
  LIMIT 1;

  IF FOUND THEN
    IF v_existing.qr_code = '3WGVONBR'
       AND v_existing.tenant_id = 'ed33ddee-e586-41e1-856a-79a1741f0e21'::uuid
       AND v_existing.tenant_slug = 'gz-gy-shuini'
       AND v_existing.placement = 'venue'
       AND v_existing.version = 1
       AND v_existing.image_path = 'ed33ddee-e586-41e1-856a-79a1741f0e21/qr/no-menu-qr-gz-gy-shuini-3WGVONBR.png'
       AND v_existing.image_url = 'https://img.nomenuapp.com/prod/tenants/ed33ddee-e586-41e1-856a-79a1741f0e21/qr/no-menu-qr-gz-gy-shuini-3WGVONBR.png'
       AND v_existing.mini_program_code_url = 'https://img.nomenuapp.com/prod/tenants/ed33ddee-e586-41e1-856a-79a1741f0e21/qr/weapp/release/no-menu-weapp-v1-3WGVONBR.jpg'
       AND v_existing.enabled THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'tenant gz-gy-shuini QR registration conflicts with an existing permanent code';
  END IF;

  INSERT INTO public.tenant_qr_links (
    qr_code, tenant_id, tenant_slug, placement, version, enabled,
    label, image_path, image_url, mini_program_code_url
  ) VALUES (
    '3WGVONBR',
    'ed33ddee-e586-41e1-856a-79a1741f0e21'::uuid,
    'gz-gy-shuini',
    'venue',
    1,
    true,
    '水泥公园',
    'ed33ddee-e586-41e1-856a-79a1741f0e21/qr/no-menu-qr-gz-gy-shuini-3WGVONBR.png',
    'https://img.nomenuapp.com/prod/tenants/ed33ddee-e586-41e1-856a-79a1741f0e21/qr/no-menu-qr-gz-gy-shuini-3WGVONBR.png',
    'https://img.nomenuapp.com/prod/tenants/ed33ddee-e586-41e1-856a-79a1741f0e21/qr/weapp/release/no-menu-weapp-v1-3WGVONBR.jpg'
  );
END;
$$;
