-- Register the permanent venue QR code for 牛棚 Bullpen in Shenyang.
-- The code is immutable and must never be reassigned.

DO $$
DECLARE
  v_existing public.tenant_qr_links%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.tenants t
    WHERE t.id = 'd044f26a-e6a9-4912-b8ed-b2c8023f00d0'::uuid
      AND t.slug = 'sy-niu-peng'
      AND t.status = 'active'
      AND t.is_public_visible
  ) THEN
    RAISE EXCEPTION 'public active tenant sy-niu-peng was not found with the expected id';
  END IF;

  SELECT *
  INTO v_existing
  FROM public.tenant_qr_links q
  WHERE q.qr_code = 'M5YLM5GI'
     OR (q.tenant_id = 'd044f26a-e6a9-4912-b8ed-b2c8023f00d0'::uuid
         AND q.placement = 'venue'
         AND q.enabled)
  LIMIT 1;

  IF FOUND THEN
    IF v_existing.qr_code = 'M5YLM5GI'
       AND v_existing.tenant_id = 'd044f26a-e6a9-4912-b8ed-b2c8023f00d0'::uuid
       AND v_existing.tenant_slug = 'sy-niu-peng'
       AND v_existing.placement = 'venue'
       AND v_existing.version = 1
       AND v_existing.image_path = 'd044f26a-e6a9-4912-b8ed-b2c8023f00d0/qr/no-menu-qr-sy-niu-peng-M5YLM5GI.png'
       AND v_existing.enabled THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'tenant sy-niu-peng QR registration conflicts with an existing permanent code';
  END IF;

  INSERT INTO public.tenant_qr_links (
    qr_code,
    tenant_id,
    tenant_slug,
    placement,
    version,
    enabled,
    label,
    image_path
  )
  VALUES (
    'M5YLM5GI',
    'd044f26a-e6a9-4912-b8ed-b2c8023f00d0'::uuid,
    'sy-niu-peng',
    'venue',
    1,
    true,
    '牛棚 Bullpen',
    'd044f26a-e6a9-4912-b8ed-b2c8023f00d0/qr/no-menu-qr-sy-niu-peng-M5YLM5GI.png'
  );
END;
$$;
