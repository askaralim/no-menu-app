-- Register the permanent venue QR code for North Bank in Shanghai.
-- The code is immutable and must never be reassigned.

DO $$
DECLARE
  v_existing public.tenant_qr_links%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.tenants t
    WHERE t.id = '56f4b065-040d-46b4-bfab-86491d4aa283'::uuid
      AND t.slug = 'sh-north-bank'
      AND t.status = 'active'
      AND t.is_public_visible
  ) THEN
    RAISE EXCEPTION 'public active tenant sh-north-bank was not found with the expected id';
  END IF;

  SELECT *
  INTO v_existing
  FROM public.tenant_qr_links q
  WHERE q.qr_code = 'P2362OY7'
     OR (q.tenant_id = '56f4b065-040d-46b4-bfab-86491d4aa283'::uuid
         AND q.placement = 'venue'
         AND q.enabled)
  LIMIT 1;

  IF FOUND THEN
    IF v_existing.qr_code = 'P2362OY7'
       AND v_existing.tenant_id = '56f4b065-040d-46b4-bfab-86491d4aa283'::uuid
       AND v_existing.tenant_slug = 'sh-north-bank'
       AND v_existing.placement = 'venue'
       AND v_existing.version = 1
       AND v_existing.image_path = '56f4b065-040d-46b4-bfab-86491d4aa283/qr/no-menu-qr-sh-north-bank-P2362OY7.png'
       AND v_existing.enabled THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'tenant sh-north-bank QR registration conflicts with an existing permanent code';
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
    'P2362OY7',
    '56f4b065-040d-46b4-bfab-86491d4aa283'::uuid,
    'sh-north-bank',
    'venue',
    1,
    true,
    'North Bank',
    '56f4b065-040d-46b4-bfab-86491d4aa283/qr/no-menu-qr-sh-north-bank-P2362OY7.png'
  );
END;
$$;
