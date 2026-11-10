-- Register the permanent venue QR and release mini-program code for Fork Road.
DO $$
DECLARE v_existing public.tenant_qr_links%ROWTYPE;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id='facef4d4-9912-4ee7-8905-c109cdbea0ec'::uuid AND t.slug='gz-gy-forkroad') THEN
    RAISE EXCEPTION 'tenant gz-gy-forkroad was not found with the expected id';
  END IF;
  SELECT * INTO v_existing FROM public.tenant_qr_links q
  WHERE q.qr_code='2BBTY6BY' OR (q.tenant_id='facef4d4-9912-4ee7-8905-c109cdbea0ec'::uuid AND q.placement='venue' AND q.enabled) LIMIT 1;
  IF FOUND THEN
    IF v_existing.qr_code='2BBTY6BY' AND v_existing.tenant_id='facef4d4-9912-4ee7-8905-c109cdbea0ec'::uuid
       AND v_existing.tenant_slug='gz-gy-forkroad' AND v_existing.placement='venue' AND v_existing.version=1
       AND v_existing.image_path='facef4d4-9912-4ee7-8905-c109cdbea0ec/qr/no-menu-qr-gz-gy-forkroad-2BBTY6BY.png'
       AND v_existing.image_url='https://img.nomenuapp.com/prod/tenants/facef4d4-9912-4ee7-8905-c109cdbea0ec/qr/no-menu-qr-gz-gy-forkroad-2BBTY6BY.png'
       AND v_existing.mini_program_code_url='https://img.nomenuapp.com/prod/tenants/facef4d4-9912-4ee7-8905-c109cdbea0ec/qr/weapp/release/no-menu-weapp-v1-2BBTY6BY.jpg'
       AND v_existing.enabled THEN RETURN; END IF;
    RAISE EXCEPTION 'tenant gz-gy-forkroad QR registration conflicts with an existing permanent code';
  END IF;
  INSERT INTO public.tenant_qr_links (qr_code,tenant_id,tenant_slug,placement,version,enabled,label,image_path,image_url,mini_program_code_url)
  VALUES ('2BBTY6BY','facef4d4-9912-4ee7-8905-c109cdbea0ec'::uuid,'gz-gy-forkroad','venue',1,true,'Fork Road',
  'facef4d4-9912-4ee7-8905-c109cdbea0ec/qr/no-menu-qr-gz-gy-forkroad-2BBTY6BY.png',
  'https://img.nomenuapp.com/prod/tenants/facef4d4-9912-4ee7-8905-c109cdbea0ec/qr/no-menu-qr-gz-gy-forkroad-2BBTY6BY.png',
  'https://img.nomenuapp.com/prod/tenants/facef4d4-9912-4ee7-8905-c109cdbea0ec/qr/weapp/release/no-menu-weapp-v1-2BBTY6BY.jpg');
END;
$$;
