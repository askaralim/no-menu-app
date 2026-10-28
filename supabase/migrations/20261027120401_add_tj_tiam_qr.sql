-- Register the permanent venue QR and release mini-program code for Tiam.
DO $$
DECLARE
  v_existing public.tenant_qr_links%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.tenants t
    WHERE t.id = 'b68243aa-54ce-401d-914a-0a5e216456d8'::uuid
      AND t.slug = 'tj-tiam'
  ) THEN
    RAISE EXCEPTION 'tenant tj-tiam was not found with the expected id';
  END IF;

  SELECT * INTO v_existing
  FROM public.tenant_qr_links q
  WHERE q.qr_code = '7VWG4N2V'
     OR (
       q.tenant_id = 'b68243aa-54ce-401d-914a-0a5e216456d8'::uuid
       AND q.placement = 'venue'
       AND q.enabled
     )
  LIMIT 1;

  IF FOUND THEN
    IF v_existing.qr_code = '7VWG4N2V'
       AND v_existing.tenant_id = 'b68243aa-54ce-401d-914a-0a5e216456d8'::uuid
       AND v_existing.tenant_slug = 'tj-tiam'
       AND v_existing.placement = 'venue'
       AND v_existing.version = 1
       AND v_existing.image_path = 'b68243aa-54ce-401d-914a-0a5e216456d8/qr/no-menu-qr-tj-tiam-7VWG4N2V.png'
       AND v_existing.image_url = 'https://img.nomenuapp.com/prod/tenants/b68243aa-54ce-401d-914a-0a5e216456d8/qr/no-menu-qr-tj-tiam-7VWG4N2V.png'
       AND v_existing.mini_program_code_url = 'https://img.nomenuapp.com/prod/tenants/b68243aa-54ce-401d-914a-0a5e216456d8/qr/weapp/release/no-menu-weapp-v1-7VWG4N2V.jpg'
       AND v_existing.enabled THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'tenant tj-tiam QR registration conflicts with an existing permanent code';
  END IF;

  INSERT INTO public.tenant_qr_links (
    qr_code, tenant_id, tenant_slug, placement, version, enabled,
    label, image_path, image_url, mini_program_code_url
  ) VALUES (
    '7VWG4N2V',
    'b68243aa-54ce-401d-914a-0a5e216456d8'::uuid,
    'tj-tiam',
    'venue',
    1,
    true,
    'Tiam',
    'b68243aa-54ce-401d-914a-0a5e216456d8/qr/no-menu-qr-tj-tiam-7VWG4N2V.png',
    'https://img.nomenuapp.com/prod/tenants/b68243aa-54ce-401d-914a-0a5e216456d8/qr/no-menu-qr-tj-tiam-7VWG4N2V.png',
    'https://img.nomenuapp.com/prod/tenants/b68243aa-54ce-401d-914a-0a5e216456d8/qr/weapp/release/no-menu-weapp-v1-7VWG4N2V.jpg'
  );
END;
$$;
