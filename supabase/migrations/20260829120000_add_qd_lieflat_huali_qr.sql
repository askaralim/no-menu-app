-- Register the permanent venue QR code for Lie Flat · 华丽广场 in Qingdao.
-- The code is immutable and must never be reassigned.

DO $$
DECLARE
  v_existing public.tenant_qr_links%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.tenants t
    WHERE t.id = 'a01e03f3-89de-4716-9d53-62545efda2c3'::uuid
      AND t.slug = 'qd-lieflat-huali'
      AND t.status = 'active'
      AND t.is_public_visible
  ) THEN
    RAISE EXCEPTION 'public active tenant qd-lieflat-huali was not found with the expected id';
  END IF;

  SELECT *
  INTO v_existing
  FROM public.tenant_qr_links q
  WHERE q.qr_code = 'CJBVEPHJ'
     OR (q.tenant_id = 'a01e03f3-89de-4716-9d53-62545efda2c3'::uuid
         AND q.placement = 'venue'
         AND q.enabled)
  LIMIT 1;

  IF FOUND THEN
    IF v_existing.qr_code = 'CJBVEPHJ'
       AND v_existing.tenant_id = 'a01e03f3-89de-4716-9d53-62545efda2c3'::uuid
       AND v_existing.tenant_slug = 'qd-lieflat-huali'
       AND v_existing.placement = 'venue'
       AND v_existing.version = 1
       AND v_existing.image_path = 'a01e03f3-89de-4716-9d53-62545efda2c3/qr/no-menu-qr-qd-lieflat-huali-CJBVEPHJ.png'
       AND v_existing.enabled THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'tenant qd-lieflat-huali QR registration conflicts with an existing permanent code';
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
    'CJBVEPHJ',
    'a01e03f3-89de-4716-9d53-62545efda2c3'::uuid,
    'qd-lieflat-huali',
    'venue',
    1,
    true,
    'Lie Flat · 华丽广场',
    'a01e03f3-89de-4716-9d53-62545efda2c3/qr/no-menu-qr-qd-lieflat-huali-CJBVEPHJ.png'
  );
END;
$$;
