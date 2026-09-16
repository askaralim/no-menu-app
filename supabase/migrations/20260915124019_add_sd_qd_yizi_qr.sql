-- Register the permanent venue QR code for 椅子 Chairs in Qingdao.
-- The code is immutable and must never be reassigned.

DO $$
DECLARE
  v_existing public.tenant_qr_links%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.tenants t
    WHERE t.id = '26470864-0131-48cf-9df4-b631e406a774'::uuid
      AND t.slug = 'sd-qd-yizi'
      AND t.status = 'active'
      AND t.is_public_visible
  ) THEN
    RAISE EXCEPTION 'public active tenant sd-qd-yizi was not found with the expected id';
  END IF;

  SELECT *
  INTO v_existing
  FROM public.tenant_qr_links q
  WHERE q.qr_code = '2W5QLHIF'
     OR (q.tenant_id = '26470864-0131-48cf-9df4-b631e406a774'::uuid
         AND q.placement = 'venue'
         AND q.enabled)
  LIMIT 1;

  IF FOUND THEN
    IF v_existing.qr_code = '2W5QLHIF'
       AND v_existing.tenant_id = '26470864-0131-48cf-9df4-b631e406a774'::uuid
       AND v_existing.tenant_slug = 'sd-qd-yizi'
       AND v_existing.placement = 'venue'
       AND v_existing.version = 1
       AND v_existing.image_path = '26470864-0131-48cf-9df4-b631e406a774/qr/no-menu-qr-sd-qd-yizi-2W5QLHIF.png'
       AND v_existing.enabled THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'tenant sd-qd-yizi QR registration conflicts with an existing permanent code';
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
    '2W5QLHIF',
    '26470864-0131-48cf-9df4-b631e406a774'::uuid,
    'sd-qd-yizi',
    'venue',
    1,
    true,
    '椅子 Chairs',
    '26470864-0131-48cf-9df4-b631e406a774/qr/no-menu-qr-sd-qd-yizi-2W5QLHIF.png'
  );
END;
$$;
