-- Register the permanent venue QR and release mini-program code for 藏拙.
DO $$
DECLARE
  v_existing public.tenant_qr_links%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.tenants t
    WHERE t.id = '1c5eb42c-c7aa-457a-8e6d-93e27cc00ee5'::uuid
      AND t.slug = 'sh-cz'
  ) THEN
    RAISE EXCEPTION 'tenant sh-cz was not found with the expected id';
  END IF;

  SELECT * INTO v_existing
  FROM public.tenant_qr_links q
  WHERE q.qr_code = 'VB2XUIZL'
     OR (
       q.tenant_id = '1c5eb42c-c7aa-457a-8e6d-93e27cc00ee5'::uuid
       AND q.placement = 'venue'
       AND q.enabled
     )
  LIMIT 1;

  IF FOUND THEN
    IF v_existing.qr_code = 'VB2XUIZL'
       AND v_existing.tenant_id = '1c5eb42c-c7aa-457a-8e6d-93e27cc00ee5'::uuid
       AND v_existing.tenant_slug = 'sh-cz'
       AND v_existing.placement = 'venue'
       AND v_existing.version = 1
       AND v_existing.image_path = '1c5eb42c-c7aa-457a-8e6d-93e27cc00ee5/qr/no-menu-qr-sh-cz-VB2XUIZL.png'
       AND v_existing.image_url = 'https://img.nomenuapp.com/prod/tenants/1c5eb42c-c7aa-457a-8e6d-93e27cc00ee5/qr/no-menu-qr-sh-cz-VB2XUIZL.png'
       AND v_existing.mini_program_code_url = 'https://img.nomenuapp.com/prod/tenants/1c5eb42c-c7aa-457a-8e6d-93e27cc00ee5/qr/weapp/release/no-menu-weapp-v1-VB2XUIZL.jpg'
       AND v_existing.enabled THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'tenant sh-cz QR registration conflicts with an existing permanent code';
  END IF;

  INSERT INTO public.tenant_qr_links (
    qr_code,
    tenant_id,
    tenant_slug,
    placement,
    version,
    enabled,
    label,
    image_path,
    image_url,
    mini_program_code_url
  ) VALUES (
    'VB2XUIZL',
    '1c5eb42c-c7aa-457a-8e6d-93e27cc00ee5'::uuid,
    'sh-cz',
    'venue',
    1,
    true,
    '藏拙',
    '1c5eb42c-c7aa-457a-8e6d-93e27cc00ee5/qr/no-menu-qr-sh-cz-VB2XUIZL.png',
    'https://img.nomenuapp.com/prod/tenants/1c5eb42c-c7aa-457a-8e6d-93e27cc00ee5/qr/no-menu-qr-sh-cz-VB2XUIZL.png',
    'https://img.nomenuapp.com/prod/tenants/1c5eb42c-c7aa-457a-8e6d-93e27cc00ee5/qr/weapp/release/no-menu-weapp-v1-VB2XUIZL.jpg'
  );
END;
$$;
