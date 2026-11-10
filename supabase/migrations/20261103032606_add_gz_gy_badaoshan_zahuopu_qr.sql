-- Register the permanent venue QR and release mini-program code for 八刀山酒精杂货铺.
DO $$
DECLARE v_existing public.tenant_qr_links%ROWTYPE;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id='d38e6e45-68f9-4d3e-adf7-3b3faad679d4'::uuid AND t.slug='gz-gy-badaoshan-zahuopu') THEN
    RAISE EXCEPTION 'tenant gz-gy-badaoshan-zahuopu was not found with the expected id';
  END IF;
  SELECT * INTO v_existing FROM public.tenant_qr_links q
  WHERE q.qr_code='EJLVKQGY' OR (q.tenant_id='d38e6e45-68f9-4d3e-adf7-3b3faad679d4'::uuid AND q.placement='venue' AND q.enabled) LIMIT 1;
  IF FOUND THEN
    IF v_existing.qr_code='EJLVKQGY' AND v_existing.tenant_id='d38e6e45-68f9-4d3e-adf7-3b3faad679d4'::uuid
       AND v_existing.tenant_slug='gz-gy-badaoshan-zahuopu' AND v_existing.placement='venue' AND v_existing.version=1
       AND v_existing.image_path='d38e6e45-68f9-4d3e-adf7-3b3faad679d4/qr/no-menu-qr-gz-gy-badaoshan-zahuopu-EJLVKQGY.png'
       AND v_existing.image_url='https://img.nomenuapp.com/prod/tenants/d38e6e45-68f9-4d3e-adf7-3b3faad679d4/qr/no-menu-qr-gz-gy-badaoshan-zahuopu-EJLVKQGY.png'
       AND v_existing.mini_program_code_url='https://img.nomenuapp.com/prod/tenants/d38e6e45-68f9-4d3e-adf7-3b3faad679d4/qr/weapp/release/no-menu-weapp-v1-EJLVKQGY.jpg'
       AND v_existing.enabled THEN RETURN; END IF;
    RAISE EXCEPTION 'tenant gz-gy-badaoshan-zahuopu QR registration conflicts with an existing permanent code';
  END IF;
  INSERT INTO public.tenant_qr_links (qr_code,tenant_id,tenant_slug,placement,version,enabled,label,image_path,image_url,mini_program_code_url)
  VALUES ('EJLVKQGY','d38e6e45-68f9-4d3e-adf7-3b3faad679d4'::uuid,'gz-gy-badaoshan-zahuopu','venue',1,true,'八刀山酒精杂货铺',
  'd38e6e45-68f9-4d3e-adf7-3b3faad679d4/qr/no-menu-qr-gz-gy-badaoshan-zahuopu-EJLVKQGY.png',
  'https://img.nomenuapp.com/prod/tenants/d38e6e45-68f9-4d3e-adf7-3b3faad679d4/qr/no-menu-qr-gz-gy-badaoshan-zahuopu-EJLVKQGY.png',
  'https://img.nomenuapp.com/prod/tenants/d38e6e45-68f9-4d3e-adf7-3b3faad679d4/qr/weapp/release/no-menu-weapp-v1-EJLVKQGY.jpg');
END;
$$;
