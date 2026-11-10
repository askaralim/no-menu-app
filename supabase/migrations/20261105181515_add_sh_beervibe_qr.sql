-- Register the permanent venue QR and release mini-program code for 啤汽 Beervibe.
DO $$
DECLARE v_existing public.tenant_qr_links%ROWTYPE;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id='3dbaf4ce-90d7-44dc-83ff-5fa3f7f58e2f'::uuid AND t.slug='sh-beervibe') THEN
    RAISE EXCEPTION 'tenant sh-beervibe was not found with the expected id';
  END IF;
  SELECT * INTO v_existing FROM public.tenant_qr_links q
  WHERE q.qr_code='IMXAWVDU' OR (q.tenant_id='3dbaf4ce-90d7-44dc-83ff-5fa3f7f58e2f'::uuid AND q.placement='venue' AND q.enabled) LIMIT 1;
  IF FOUND THEN
    IF v_existing.qr_code='IMXAWVDU' AND v_existing.tenant_id='3dbaf4ce-90d7-44dc-83ff-5fa3f7f58e2f'::uuid
       AND v_existing.tenant_slug='sh-beervibe' AND v_existing.placement='venue' AND v_existing.version=1
       AND v_existing.image_path='3dbaf4ce-90d7-44dc-83ff-5fa3f7f58e2f/qr/no-menu-qr-sh-beervibe-IMXAWVDU.png'
       AND v_existing.image_url='https://img.nomenuapp.com/prod/tenants/3dbaf4ce-90d7-44dc-83ff-5fa3f7f58e2f/qr/no-menu-qr-sh-beervibe-IMXAWVDU.png'
       AND v_existing.mini_program_code_url='https://img.nomenuapp.com/prod/tenants/3dbaf4ce-90d7-44dc-83ff-5fa3f7f58e2f/qr/weapp/release/no-menu-weapp-v1-IMXAWVDU.jpg'
       AND v_existing.enabled THEN RETURN; END IF;
    RAISE EXCEPTION 'tenant sh-beervibe QR registration conflicts with an existing permanent code';
  END IF;
  INSERT INTO public.tenant_qr_links (qr_code,tenant_id,tenant_slug,placement,version,enabled,label,image_path,image_url,mini_program_code_url)
  VALUES ('IMXAWVDU','3dbaf4ce-90d7-44dc-83ff-5fa3f7f58e2f'::uuid,'sh-beervibe','venue',1,true,'啤汽 Beervibe',
  '3dbaf4ce-90d7-44dc-83ff-5fa3f7f58e2f/qr/no-menu-qr-sh-beervibe-IMXAWVDU.png',
  'https://img.nomenuapp.com/prod/tenants/3dbaf4ce-90d7-44dc-83ff-5fa3f7f58e2f/qr/no-menu-qr-sh-beervibe-IMXAWVDU.png',
  'https://img.nomenuapp.com/prod/tenants/3dbaf4ce-90d7-44dc-83ff-5fa3f7f58e2f/qr/weapp/release/no-menu-weapp-v1-IMXAWVDU.jpg');
END;
$$;
