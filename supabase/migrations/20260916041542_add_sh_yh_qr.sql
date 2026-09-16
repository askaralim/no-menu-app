-- Register the permanent venue QR code for 右晃 Taproom in Shanghai.
-- The code is immutable and must never be reassigned.

DO $$
DECLARE
  v_existing public.tenant_qr_links%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.tenants t
    WHERE t.id = '4daa2912-3268-4396-bfcc-8a4c2a406dc6'::uuid
      AND t.slug = 'sh-yh'
      AND t.status = 'active'
      AND t.is_public_visible
  ) THEN
    RAISE EXCEPTION 'public active tenant sh-yh was not found with the expected id';
  END IF;

  SELECT *
  INTO v_existing
  FROM public.tenant_qr_links q
  WHERE q.qr_code = 'CD6ZEWBV'
     OR (q.tenant_id = '4daa2912-3268-4396-bfcc-8a4c2a406dc6'::uuid
         AND q.placement = 'venue'
         AND q.enabled)
  LIMIT 1;

  IF FOUND THEN
    IF v_existing.qr_code = 'CD6ZEWBV'
       AND v_existing.tenant_id = '4daa2912-3268-4396-bfcc-8a4c2a406dc6'::uuid
       AND v_existing.tenant_slug = 'sh-yh'
       AND v_existing.placement = 'venue'
       AND v_existing.version = 1
       AND v_existing.image_path = '4daa2912-3268-4396-bfcc-8a4c2a406dc6/qr/no-menu-qr-sh-yh-CD6ZEWBV.png'
       AND v_existing.enabled THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'tenant sh-yh QR registration conflicts with an existing permanent code';
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
    'CD6ZEWBV',
    '4daa2912-3268-4396-bfcc-8a4c2a406dc6'::uuid,
    'sh-yh',
    'venue',
    1,
    true,
    '右晃 Taproom',
    '4daa2912-3268-4396-bfcc-8a4c2a406dc6/qr/no-menu-qr-sh-yh-CD6ZEWBV.png'
  );
END;
$$;
