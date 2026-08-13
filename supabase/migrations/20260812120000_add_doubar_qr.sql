-- Register the permanent venue QR code for Doubar.
-- The code is immutable and must never be reassigned.

DO $$
DECLARE
  v_existing public.tenant_qr_links%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.tenants t
    WHERE t.id = '13996d91-6fc0-4758-9a45-974845d3db57'::uuid
      AND t.slug = 'doubar'
      AND t.status = 'active'
      AND t.is_public_visible
  ) THEN
    RAISE EXCEPTION 'public active tenant doubar was not found with the expected id';
  END IF;

  SELECT *
  INTO v_existing
  FROM public.tenant_qr_links q
  WHERE q.qr_code = 'KFM5WJPW'
     OR (q.tenant_id = '13996d91-6fc0-4758-9a45-974845d3db57'::uuid
         AND q.placement = 'venue'
         AND q.enabled)
  LIMIT 1;

  IF FOUND THEN
    IF v_existing.qr_code = 'KFM5WJPW'
       AND v_existing.tenant_id = '13996d91-6fc0-4758-9a45-974845d3db57'::uuid
       AND v_existing.tenant_slug = 'doubar'
       AND v_existing.placement = 'venue'
       AND v_existing.version = 1
       AND v_existing.image_path = '13996d91-6fc0-4758-9a45-974845d3db57/qr/no-menu-qr-doubar-KFM5WJPW.png'
       AND v_existing.enabled THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'tenant doubar QR registration conflicts with an existing permanent code';
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
    'KFM5WJPW',
    '13996d91-6fc0-4758-9a45-974845d3db57'::uuid,
    'doubar',
    'venue',
    1,
    true,
    'Doubar',
    '13996d91-6fc0-4758-9a45-974845d3db57/qr/no-menu-qr-doubar-KFM5WJPW.png'
  );
END;
$$;
