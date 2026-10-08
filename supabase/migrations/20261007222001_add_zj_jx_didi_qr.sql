-- Register the permanent venue QR code for 低地 in Jiaxing.
-- The code is immutable and must never be reassigned.

DO $$
DECLARE
  v_existing public.tenant_qr_links%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.tenants t
    WHERE t.id = 'ca8e0e81-409a-44e1-a5df-99bb3e0748e5'::uuid
      AND t.slug = 'zj-jx-didi'
      AND t.status = 'active'
      AND t.is_public_visible
  ) THEN
    RAISE EXCEPTION 'public active tenant zj-jx-didi was not found with the expected id';
  END IF;

  SELECT *
  INTO v_existing
  FROM public.tenant_qr_links q
  WHERE q.qr_code = 'FR73UGDP'
     OR (q.tenant_id = 'ca8e0e81-409a-44e1-a5df-99bb3e0748e5'::uuid
         AND q.placement = 'venue'
         AND q.enabled)
  LIMIT 1;

  IF FOUND THEN
    IF v_existing.qr_code = 'FR73UGDP'
       AND v_existing.tenant_id = 'ca8e0e81-409a-44e1-a5df-99bb3e0748e5'::uuid
       AND v_existing.tenant_slug = 'zj-jx-didi'
       AND v_existing.placement = 'venue'
       AND v_existing.version = 1
       AND v_existing.image_path = 'ca8e0e81-409a-44e1-a5df-99bb3e0748e5/qr/no-menu-qr-zj-jx-didi-FR73UGDP.png'
       AND v_existing.image_url = 'https://img.nomenuapp.com/prod/tenants/ca8e0e81-409a-44e1-a5df-99bb3e0748e5/qr/no-menu-qr-zj-jx-didi-FR73UGDP.png'
       AND v_existing.enabled THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'tenant zj-jx-didi QR registration conflicts with an existing permanent code';
  END IF;

  INSERT INTO public.tenant_qr_links (
    qr_code, tenant_id, tenant_slug, placement, version, enabled, label, image_path, image_url
  ) VALUES (
    'FR73UGDP',
    'ca8e0e81-409a-44e1-a5df-99bb3e0748e5'::uuid,
    'zj-jx-didi',
    'venue',
    1,
    true,
    '低地',
    'ca8e0e81-409a-44e1-a5df-99bb3e0748e5/qr/no-menu-qr-zj-jx-didi-FR73UGDP.png',
    'https://img.nomenuapp.com/prod/tenants/ca8e0e81-409a-44e1-a5df-99bb3e0748e5/qr/no-menu-qr-zj-jx-didi-FR73UGDP.png'
  );
END;
$$;
