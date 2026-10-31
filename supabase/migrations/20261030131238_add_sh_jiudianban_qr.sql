-- Register the permanent venue QR and release mini-program code for 酒点伴 Half Past Drink.
DO $$
DECLARE
  v_existing public.tenant_qr_links%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.tenants t
    WHERE t.id = 'aefb7c29-f08c-4168-b4a3-17449d2e749e'::uuid
      AND t.slug = 'sh-jiudianban'
  ) THEN
    RAISE EXCEPTION 'tenant sh-jiudianban was not found with the expected id';
  END IF;

  SELECT * INTO v_existing
  FROM public.tenant_qr_links q
  WHERE q.qr_code = '7VJGKMY4'
     OR (
       q.tenant_id = 'aefb7c29-f08c-4168-b4a3-17449d2e749e'::uuid
       AND q.placement = 'venue'
       AND q.enabled
     )
  LIMIT 1;

  IF FOUND THEN
    IF v_existing.qr_code = '7VJGKMY4'
       AND v_existing.tenant_id = 'aefb7c29-f08c-4168-b4a3-17449d2e749e'::uuid
       AND v_existing.tenant_slug = 'sh-jiudianban'
       AND v_existing.placement = 'venue'
       AND v_existing.version = 1
       AND v_existing.image_path = 'aefb7c29-f08c-4168-b4a3-17449d2e749e/qr/no-menu-qr-sh-jiudianban-7VJGKMY4.png'
       AND v_existing.image_url = 'https://img.nomenuapp.com/prod/tenants/aefb7c29-f08c-4168-b4a3-17449d2e749e/qr/no-menu-qr-sh-jiudianban-7VJGKMY4.png'
       AND v_existing.mini_program_code_url = 'https://img.nomenuapp.com/prod/tenants/aefb7c29-f08c-4168-b4a3-17449d2e749e/qr/weapp/release/no-menu-weapp-v1-7VJGKMY4.jpg'
       AND v_existing.enabled THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'tenant sh-jiudianban QR registration conflicts with an existing permanent code';
  END IF;

  INSERT INTO public.tenant_qr_links (
    qr_code, tenant_id, tenant_slug, placement, version, enabled,
    label, image_path, image_url, mini_program_code_url
  ) VALUES (
    '7VJGKMY4',
    'aefb7c29-f08c-4168-b4a3-17449d2e749e'::uuid,
    'sh-jiudianban',
    'venue',
    1,
    true,
    '酒点伴 Half Past Drink',
    'aefb7c29-f08c-4168-b4a3-17449d2e749e/qr/no-menu-qr-sh-jiudianban-7VJGKMY4.png',
    'https://img.nomenuapp.com/prod/tenants/aefb7c29-f08c-4168-b4a3-17449d2e749e/qr/no-menu-qr-sh-jiudianban-7VJGKMY4.png',
    'https://img.nomenuapp.com/prod/tenants/aefb7c29-f08c-4168-b4a3-17449d2e749e/qr/weapp/release/no-menu-weapp-v1-7VJGKMY4.jpg'
  );
END;
$$;
