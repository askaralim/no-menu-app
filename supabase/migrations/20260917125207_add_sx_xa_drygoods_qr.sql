-- Register the permanent venue QR code for Dry Goods in Xi'an.
-- The code is immutable and must never be reassigned.

DO $$
DECLARE
  v_existing public.tenant_qr_links%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.tenants t
    WHERE t.id = '26448c39-f7c1-448f-b6da-63b7c80a1ca3'::uuid
      AND t.slug = 'sx-xa-drygoods'
      AND t.status = 'active'
      AND t.is_public_visible
  ) THEN
    RAISE EXCEPTION 'public active tenant sx-xa-drygoods was not found with the expected id';
  END IF;

  SELECT *
  INTO v_existing
  FROM public.tenant_qr_links q
  WHERE q.qr_code = '2S5SKOPO'
     OR (q.tenant_id = '26448c39-f7c1-448f-b6da-63b7c80a1ca3'::uuid
         AND q.placement = 'venue'
         AND q.enabled)
  LIMIT 1;

  IF FOUND THEN
    IF v_existing.qr_code = '2S5SKOPO'
       AND v_existing.tenant_id = '26448c39-f7c1-448f-b6da-63b7c80a1ca3'::uuid
       AND v_existing.tenant_slug = 'sx-xa-drygoods'
       AND v_existing.placement = 'venue'
       AND v_existing.version = 1
       AND v_existing.image_path = '26448c39-f7c1-448f-b6da-63b7c80a1ca3/qr/no-menu-qr-sx-xa-drygoods-2S5SKOPO.png'
       AND v_existing.enabled THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'tenant sx-xa-drygoods QR registration conflicts with an existing permanent code';
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
    '2S5SKOPO',
    '26448c39-f7c1-448f-b6da-63b7c80a1ca3'::uuid,
    'sx-xa-drygoods',
    'venue',
    1,
    true,
    'Dry Goods',
    '26448c39-f7c1-448f-b6da-63b7c80a1ca3/qr/no-menu-qr-sx-xa-drygoods-2S5SKOPO.png'
  );
END;
$$;
