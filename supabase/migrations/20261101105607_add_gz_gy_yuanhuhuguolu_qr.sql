-- Register the permanent venue QR and release mini-program code for 圆弧 · 护国路.
DO $$
DECLARE
  v_existing public.tenant_qr_links%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.tenants t
    WHERE t.id = '85a2e821-43b0-43f6-b0de-30523fb6bea4'::uuid
      AND t.slug = 'gz-gy-yuanhuhuguolu'
  ) THEN
    RAISE EXCEPTION 'tenant gz-gy-yuanhuhuguolu was not found with the expected id';
  END IF;

  SELECT * INTO v_existing
  FROM public.tenant_qr_links q
  WHERE q.qr_code = 'EM6F32KB'
     OR (
       q.tenant_id = '85a2e821-43b0-43f6-b0de-30523fb6bea4'::uuid
       AND q.placement = 'venue'
       AND q.enabled
     )
  LIMIT 1;

  IF FOUND THEN
    IF v_existing.qr_code = 'EM6F32KB'
       AND v_existing.tenant_id = '85a2e821-43b0-43f6-b0de-30523fb6bea4'::uuid
       AND v_existing.tenant_slug = 'gz-gy-yuanhuhuguolu'
       AND v_existing.placement = 'venue'
       AND v_existing.version = 1
       AND v_existing.image_path = '85a2e821-43b0-43f6-b0de-30523fb6bea4/qr/no-menu-qr-gz-gy-yuanhuhuguolu-EM6F32KB.png'
       AND v_existing.image_url = 'https://img.nomenuapp.com/prod/tenants/85a2e821-43b0-43f6-b0de-30523fb6bea4/qr/no-menu-qr-gz-gy-yuanhuhuguolu-EM6F32KB.png'
       AND v_existing.mini_program_code_url = 'https://img.nomenuapp.com/prod/tenants/85a2e821-43b0-43f6-b0de-30523fb6bea4/qr/weapp/release/no-menu-weapp-v1-EM6F32KB.jpg'
       AND v_existing.enabled THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'tenant gz-gy-yuanhuhuguolu QR registration conflicts with an existing permanent code';
  END IF;

  INSERT INTO public.tenant_qr_links (
    qr_code, tenant_id, tenant_slug, placement, version, enabled,
    label, image_path, image_url, mini_program_code_url
  ) VALUES (
    'EM6F32KB',
    '85a2e821-43b0-43f6-b0de-30523fb6bea4'::uuid,
    'gz-gy-yuanhuhuguolu',
    'venue',
    1,
    true,
    '圆弧 · 护国路',
    '85a2e821-43b0-43f6-b0de-30523fb6bea4/qr/no-menu-qr-gz-gy-yuanhuhuguolu-EM6F32KB.png',
    'https://img.nomenuapp.com/prod/tenants/85a2e821-43b0-43f6-b0de-30523fb6bea4/qr/no-menu-qr-gz-gy-yuanhuhuguolu-EM6F32KB.png',
    'https://img.nomenuapp.com/prod/tenants/85a2e821-43b0-43f6-b0de-30523fb6bea4/qr/weapp/release/no-menu-weapp-v1-EM6F32KB.jpg'
  );
END;
$$;
