-- Register the permanent venue QR and release mini-program code for 蓝啤古 · 浦东.
DO $$
DECLARE v_existing public.tenant_qr_links%ROWTYPE;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id='f2f41177-649b-4554-aa10-b01dce9f5786'::uuid AND t.slug='sh-lanpigu-pudong') THEN
    RAISE EXCEPTION 'tenant sh-lanpigu-pudong was not found with the expected id';
  END IF;
  SELECT * INTO v_existing FROM public.tenant_qr_links q
  WHERE q.qr_code='2TICXWIL' OR (q.tenant_id='f2f41177-649b-4554-aa10-b01dce9f5786'::uuid AND q.placement='venue' AND q.enabled) LIMIT 1;
  IF FOUND THEN
    IF v_existing.qr_code='2TICXWIL' AND v_existing.tenant_id='f2f41177-649b-4554-aa10-b01dce9f5786'::uuid
       AND v_existing.tenant_slug='sh-lanpigu-pudong' AND v_existing.placement='venue' AND v_existing.version=1
       AND v_existing.image_path='f2f41177-649b-4554-aa10-b01dce9f5786/qr/no-menu-qr-sh-lanpigu-pudong-2TICXWIL.png'
       AND v_existing.image_url='https://img.nomenuapp.com/prod/tenants/f2f41177-649b-4554-aa10-b01dce9f5786/qr/no-menu-qr-sh-lanpigu-pudong-2TICXWIL.png'
       AND v_existing.mini_program_code_url='https://img.nomenuapp.com/prod/tenants/f2f41177-649b-4554-aa10-b01dce9f5786/qr/weapp/release/no-menu-weapp-v1-2TICXWIL.jpg'
       AND v_existing.enabled THEN RETURN; END IF;
    RAISE EXCEPTION 'tenant sh-lanpigu-pudong QR registration conflicts with an existing permanent code';
  END IF;
  INSERT INTO public.tenant_qr_links (qr_code,tenant_id,tenant_slug,placement,version,enabled,label,image_path,image_url,mini_program_code_url)
  VALUES ('2TICXWIL','f2f41177-649b-4554-aa10-b01dce9f5786'::uuid,'sh-lanpigu-pudong','venue',1,true,'蓝啤古 · 浦东',
  'f2f41177-649b-4554-aa10-b01dce9f5786/qr/no-menu-qr-sh-lanpigu-pudong-2TICXWIL.png',
  'https://img.nomenuapp.com/prod/tenants/f2f41177-649b-4554-aa10-b01dce9f5786/qr/no-menu-qr-sh-lanpigu-pudong-2TICXWIL.png',
  'https://img.nomenuapp.com/prod/tenants/f2f41177-649b-4554-aa10-b01dce9f5786/qr/weapp/release/no-menu-weapp-v1-2TICXWIL.jpg');
END;
$$;
