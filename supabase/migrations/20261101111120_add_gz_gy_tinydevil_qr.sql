-- Register the permanent venue QR and release mini-program code for Tiny Devil.
DO $$
DECLARE v_existing public.tenant_qr_links%ROWTYPE;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id='41926752-ad00-447e-8dd4-d72b1b47e3b4'::uuid AND t.slug='gz-gy-tinydevil') THEN
    RAISE EXCEPTION 'tenant gz-gy-tinydevil was not found with the expected id';
  END IF;
  SELECT * INTO v_existing FROM public.tenant_qr_links q
  WHERE q.qr_code='KSRBHRDR' OR (q.tenant_id='41926752-ad00-447e-8dd4-d72b1b47e3b4'::uuid AND q.placement='venue' AND q.enabled) LIMIT 1;
  IF FOUND THEN
    IF v_existing.qr_code='KSRBHRDR'
       AND v_existing.tenant_id='41926752-ad00-447e-8dd4-d72b1b47e3b4'::uuid
       AND v_existing.tenant_slug='gz-gy-tinydevil' AND v_existing.placement='venue' AND v_existing.version=1
       AND v_existing.image_path='41926752-ad00-447e-8dd4-d72b1b47e3b4/qr/no-menu-qr-gz-gy-tinydevil-KSRBHRDR.png'
       AND v_existing.image_url='https://img.nomenuapp.com/prod/tenants/41926752-ad00-447e-8dd4-d72b1b47e3b4/qr/no-menu-qr-gz-gy-tinydevil-KSRBHRDR.png'
       AND v_existing.mini_program_code_url='https://img.nomenuapp.com/prod/tenants/41926752-ad00-447e-8dd4-d72b1b47e3b4/qr/weapp/release/no-menu-weapp-v1-KSRBHRDR.jpg'
       AND v_existing.enabled THEN RETURN; END IF;
    RAISE EXCEPTION 'tenant gz-gy-tinydevil QR registration conflicts with an existing permanent code';
  END IF;
  INSERT INTO public.tenant_qr_links (qr_code,tenant_id,tenant_slug,placement,version,enabled,label,image_path,image_url,mini_program_code_url)
  VALUES ('KSRBHRDR','41926752-ad00-447e-8dd4-d72b1b47e3b4'::uuid,'gz-gy-tinydevil','venue',1,true,'Tiny Devil',
  '41926752-ad00-447e-8dd4-d72b1b47e3b4/qr/no-menu-qr-gz-gy-tinydevil-KSRBHRDR.png',
  'https://img.nomenuapp.com/prod/tenants/41926752-ad00-447e-8dd4-d72b1b47e3b4/qr/no-menu-qr-gz-gy-tinydevil-KSRBHRDR.png',
  'https://img.nomenuapp.com/prod/tenants/41926752-ad00-447e-8dd4-d72b1b47e3b4/qr/weapp/release/no-menu-weapp-v1-KSRBHRDR.jpg');
END;
$$;
