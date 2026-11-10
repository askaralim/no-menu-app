-- Register the permanent venue QR and release mini-program code for 大鱼 BigFish Craftory.
DO $$
DECLARE v_existing public.tenant_qr_links%ROWTYPE;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id='31632118-d79a-431f-aae0-122a160d4604'::uuid AND t.slug='sc-cd-bigfish') THEN
    RAISE EXCEPTION 'tenant sc-cd-bigfish was not found with the expected id';
  END IF;
  SELECT * INTO v_existing FROM public.tenant_qr_links q
  WHERE q.qr_code='UMDLGMY2' OR (q.tenant_id='31632118-d79a-431f-aae0-122a160d4604'::uuid AND q.placement='venue' AND q.enabled) LIMIT 1;
  IF FOUND THEN
    IF v_existing.qr_code='UMDLGMY2' AND v_existing.tenant_id='31632118-d79a-431f-aae0-122a160d4604'::uuid
       AND v_existing.tenant_slug='sc-cd-bigfish' AND v_existing.placement='venue' AND v_existing.version=1
       AND v_existing.image_path='31632118-d79a-431f-aae0-122a160d4604/qr/no-menu-qr-sc-cd-bigfish-UMDLGMY2.png'
       AND v_existing.image_url='https://img.nomenuapp.com/prod/tenants/31632118-d79a-431f-aae0-122a160d4604/qr/no-menu-qr-sc-cd-bigfish-UMDLGMY2.png'
       AND v_existing.mini_program_code_url='https://img.nomenuapp.com/prod/tenants/31632118-d79a-431f-aae0-122a160d4604/qr/weapp/release/no-menu-weapp-v1-UMDLGMY2.jpg'
       AND v_existing.enabled THEN RETURN; END IF;
    RAISE EXCEPTION 'tenant sc-cd-bigfish QR registration conflicts with an existing permanent code';
  END IF;
  INSERT INTO public.tenant_qr_links (qr_code,tenant_id,tenant_slug,placement,version,enabled,label,image_path,image_url,mini_program_code_url)
  VALUES ('UMDLGMY2','31632118-d79a-431f-aae0-122a160d4604'::uuid,'sc-cd-bigfish','venue',1,true,'大鱼 BigFish Craftory',
  '31632118-d79a-431f-aae0-122a160d4604/qr/no-menu-qr-sc-cd-bigfish-UMDLGMY2.png',
  'https://img.nomenuapp.com/prod/tenants/31632118-d79a-431f-aae0-122a160d4604/qr/no-menu-qr-sc-cd-bigfish-UMDLGMY2.png',
  'https://img.nomenuapp.com/prod/tenants/31632118-d79a-431f-aae0-122a160d4604/qr/weapp/release/no-menu-weapp-v1-UMDLGMY2.jpg');
END;
$$;
