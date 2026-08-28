-- Register the permanent venue QR code for 铁锤妹妹·三里屯 in Beijing.
-- The code is immutable and must never be reassigned.

DO $$
DECLARE
  v_existing public.tenant_qr_links%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.tenants t
    WHERE t.id = 'ba609189-e551-4511-8fa4-6bc51fcb1198'::uuid
      AND t.slug = 'bj-hammer-sanlitun'
      AND t.status = 'active'
      AND t.is_public_visible
  ) THEN
    RAISE EXCEPTION 'public active tenant bj-hammer-sanlitun was not found with the expected id';
  END IF;

  SELECT *
  INTO v_existing
  FROM public.tenant_qr_links q
  WHERE q.qr_code = 'VAJQXTVL'
     OR (q.tenant_id = 'ba609189-e551-4511-8fa4-6bc51fcb1198'::uuid
         AND q.placement = 'venue'
         AND q.enabled)
  LIMIT 1;

  IF FOUND THEN
    IF v_existing.qr_code = 'VAJQXTVL'
       AND v_existing.tenant_id = 'ba609189-e551-4511-8fa4-6bc51fcb1198'::uuid
       AND v_existing.tenant_slug = 'bj-hammer-sanlitun'
       AND v_existing.placement = 'venue'
       AND v_existing.version = 1
       AND v_existing.image_path = 'ba609189-e551-4511-8fa4-6bc51fcb1198/qr/no-menu-qr-bj-hammer-sanlitun-VAJQXTVL.png'
       AND v_existing.enabled THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'tenant bj-hammer-sanlitun QR registration conflicts with an existing permanent code';
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
    'VAJQXTVL',
    'ba609189-e551-4511-8fa4-6bc51fcb1198'::uuid,
    'bj-hammer-sanlitun',
    'venue',
    1,
    true,
    '铁锤妹妹·三里屯',
    'ba609189-e551-4511-8fa4-6bc51fcb1198/qr/no-menu-qr-bj-hammer-sanlitun-VAJQXTVL.png'
  );
END;
$$;
