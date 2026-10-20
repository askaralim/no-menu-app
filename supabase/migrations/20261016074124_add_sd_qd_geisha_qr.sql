-- Register the permanent venue QR and official WeChat mini-program code for 瑰夏 Geisha.
-- The code is immutable and must never be reassigned.

DO $$
DECLARE
  v_existing public.tenant_qr_links%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.tenants t
    WHERE t.id = '240dbe1a-41ca-430a-9041-15887b8f9b39'::uuid
      AND t.slug = 'sd-qd-geisha'
      AND t.status = 'active'
      AND t.is_public_visible
  ) THEN
    RAISE EXCEPTION 'public active tenant sd-qd-geisha was not found with the expected id';
  END IF;

  SELECT *
  INTO v_existing
  FROM public.tenant_qr_links q
  WHERE q.qr_code = 'RNRYGP77'
     OR (q.tenant_id = '240dbe1a-41ca-430a-9041-15887b8f9b39'::uuid
         AND q.placement = 'venue'
         AND q.enabled)
  LIMIT 1;

  IF FOUND THEN
    IF v_existing.qr_code = 'RNRYGP77'
       AND v_existing.tenant_id = '240dbe1a-41ca-430a-9041-15887b8f9b39'::uuid
       AND v_existing.tenant_slug = 'sd-qd-geisha'
       AND v_existing.placement = 'venue'
       AND v_existing.version = 1
       AND v_existing.image_path = '240dbe1a-41ca-430a-9041-15887b8f9b39/qr/no-menu-qr-sd-qd-geisha-RNRYGP77.png'
       AND v_existing.image_url = 'https://img.nomenuapp.com/prod/tenants/240dbe1a-41ca-430a-9041-15887b8f9b39/qr/no-menu-qr-sd-qd-geisha-RNRYGP77.png'
       AND v_existing.mini_program_code_url = 'https://img.nomenuapp.com/prod/tenants/240dbe1a-41ca-430a-9041-15887b8f9b39/qr/weapp/release/no-menu-weapp-v1-RNRYGP77.jpg'
       AND v_existing.enabled THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'tenant sd-qd-geisha QR registration conflicts with an existing permanent code';
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
    'RNRYGP77',
    '240dbe1a-41ca-430a-9041-15887b8f9b39'::uuid,
    'sd-qd-geisha',
    'venue',
    1,
    true,
    '瑰夏 Geisha',
    '240dbe1a-41ca-430a-9041-15887b8f9b39/qr/no-menu-qr-sd-qd-geisha-RNRYGP77.png',
    'https://img.nomenuapp.com/prod/tenants/240dbe1a-41ca-430a-9041-15887b8f9b39/qr/no-menu-qr-sd-qd-geisha-RNRYGP77.png',
    'https://img.nomenuapp.com/prod/tenants/240dbe1a-41ca-430a-9041-15887b8f9b39/qr/weapp/release/no-menu-weapp-v1-RNRYGP77.jpg'
  );
END;
$$;
