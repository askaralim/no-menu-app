-- Register the permanent venue QR and release mini-program code for 圆弧 · 花果园.
DO $$
DECLARE
  v_existing public.tenant_qr_links%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.tenants t
    WHERE t.id = '3299a887-bfcb-40fb-9b57-c189fe99f8c3'::uuid
      AND t.slug = 'gz-gy-yuanhu-huaguoyuan'
  ) THEN
    RAISE EXCEPTION 'tenant gz-gy-yuanhu-huaguoyuan was not found with the expected id';
  END IF;

  SELECT * INTO v_existing
  FROM public.tenant_qr_links q
  WHERE q.qr_code = 'ZELHVA63'
     OR (q.tenant_id = '3299a887-bfcb-40fb-9b57-c189fe99f8c3'::uuid
       AND q.placement = 'venue' AND q.enabled)
  LIMIT 1;

  IF FOUND THEN
    IF v_existing.qr_code = 'ZELHVA63'
       AND v_existing.tenant_id = '3299a887-bfcb-40fb-9b57-c189fe99f8c3'::uuid
       AND v_existing.tenant_slug = 'gz-gy-yuanhu-huaguoyuan'
       AND v_existing.placement = 'venue'
       AND v_existing.version = 1
       AND v_existing.image_path = '3299a887-bfcb-40fb-9b57-c189fe99f8c3/qr/no-menu-qr-gz-gy-yuanhu-huaguoyuan-ZELHVA63.png'
       AND v_existing.image_url = 'https://img.nomenuapp.com/prod/tenants/3299a887-bfcb-40fb-9b57-c189fe99f8c3/qr/no-menu-qr-gz-gy-yuanhu-huaguoyuan-ZELHVA63.png'
       AND v_existing.mini_program_code_url = 'https://img.nomenuapp.com/prod/tenants/3299a887-bfcb-40fb-9b57-c189fe99f8c3/qr/weapp/release/no-menu-weapp-v1-ZELHVA63.jpg'
       AND v_existing.enabled THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'tenant gz-gy-yuanhu-huaguoyuan QR registration conflicts with an existing permanent code';
  END IF;

  INSERT INTO public.tenant_qr_links (
    qr_code, tenant_id, tenant_slug, placement, version, enabled,
    label, image_path, image_url, mini_program_code_url
  ) VALUES (
    'ZELHVA63',
    '3299a887-bfcb-40fb-9b57-c189fe99f8c3'::uuid,
    'gz-gy-yuanhu-huaguoyuan', 'venue', 1, true, '圆弧 · 花果园',
    '3299a887-bfcb-40fb-9b57-c189fe99f8c3/qr/no-menu-qr-gz-gy-yuanhu-huaguoyuan-ZELHVA63.png',
    'https://img.nomenuapp.com/prod/tenants/3299a887-bfcb-40fb-9b57-c189fe99f8c3/qr/no-menu-qr-gz-gy-yuanhu-huaguoyuan-ZELHVA63.png',
    'https://img.nomenuapp.com/prod/tenants/3299a887-bfcb-40fb-9b57-c189fe99f8c3/qr/weapp/release/no-menu-weapp-v1-ZELHVA63.jpg'
  );
END;
$$;
