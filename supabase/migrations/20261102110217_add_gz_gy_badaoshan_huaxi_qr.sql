-- Register the permanent venue QR and release mini-program code for 八刀山 · 花溪店.
DO $$
DECLARE v_existing public.tenant_qr_links%ROWTYPE;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id='afa00b37-bde9-46de-8174-b739dea4331c'::uuid AND t.slug='gz-gy-badaoshan-huaxi') THEN
    RAISE EXCEPTION 'tenant gz-gy-badaoshan-huaxi was not found with the expected id';
  END IF;
  SELECT * INTO v_existing FROM public.tenant_qr_links q
  WHERE q.qr_code='THMKASSW' OR (q.tenant_id='afa00b37-bde9-46de-8174-b739dea4331c'::uuid AND q.placement='venue' AND q.enabled) LIMIT 1;
  IF FOUND THEN
    IF v_existing.qr_code='THMKASSW' AND v_existing.tenant_id='afa00b37-bde9-46de-8174-b739dea4331c'::uuid
       AND v_existing.tenant_slug='gz-gy-badaoshan-huaxi' AND v_existing.placement='venue' AND v_existing.version=1
       AND v_existing.image_path='afa00b37-bde9-46de-8174-b739dea4331c/qr/no-menu-qr-gz-gy-badaoshan-huaxi-THMKASSW.png'
       AND v_existing.image_url='https://img.nomenuapp.com/prod/tenants/afa00b37-bde9-46de-8174-b739dea4331c/qr/no-menu-qr-gz-gy-badaoshan-huaxi-THMKASSW.png'
       AND v_existing.mini_program_code_url='https://img.nomenuapp.com/prod/tenants/afa00b37-bde9-46de-8174-b739dea4331c/qr/weapp/release/no-menu-weapp-v1-THMKASSW.jpg'
       AND v_existing.enabled THEN RETURN; END IF;
    RAISE EXCEPTION 'tenant gz-gy-badaoshan-huaxi QR registration conflicts with an existing permanent code';
  END IF;
  INSERT INTO public.tenant_qr_links (qr_code,tenant_id,tenant_slug,placement,version,enabled,label,image_path,image_url,mini_program_code_url)
  VALUES ('THMKASSW','afa00b37-bde9-46de-8174-b739dea4331c'::uuid,'gz-gy-badaoshan-huaxi','venue',1,true,'八刀山 · 花溪店',
  'afa00b37-bde9-46de-8174-b739dea4331c/qr/no-menu-qr-gz-gy-badaoshan-huaxi-THMKASSW.png',
  'https://img.nomenuapp.com/prod/tenants/afa00b37-bde9-46de-8174-b739dea4331c/qr/no-menu-qr-gz-gy-badaoshan-huaxi-THMKASSW.png',
  'https://img.nomenuapp.com/prod/tenants/afa00b37-bde9-46de-8174-b739dea4331c/qr/weapp/release/no-menu-weapp-v1-THMKASSW.jpg');
END;
$$;
