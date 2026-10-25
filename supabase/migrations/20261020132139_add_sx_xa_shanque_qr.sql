-- Register the permanent venue QR and official WeChat mini-program code for 山雀精酿.
-- The code is immutable and must never be reassigned.

DO $$
DECLARE
  v_existing public.tenant_qr_links%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.tenants t
    WHERE t.id = '244c1bf8-a58d-4225-b945-23cd77bf448f'::uuid
      AND t.slug = 'sx-xa-shanque'
  ) THEN
    RAISE EXCEPTION 'tenant sx-xa-shanque was not found with the expected id';
  END IF;

  SELECT *
  INTO v_existing
  FROM public.tenant_qr_links q
  WHERE q.qr_code = 'HALCAWZJ'
     OR (q.tenant_id = '244c1bf8-a58d-4225-b945-23cd77bf448f'::uuid
         AND q.placement = 'venue'
         AND q.enabled)
  LIMIT 1;

  IF FOUND THEN
    IF v_existing.qr_code = 'HALCAWZJ'
       AND v_existing.tenant_id = '244c1bf8-a58d-4225-b945-23cd77bf448f'::uuid
       AND v_existing.tenant_slug = 'sx-xa-shanque'
       AND v_existing.placement = 'venue'
       AND v_existing.version = 1
       AND v_existing.image_path = '244c1bf8-a58d-4225-b945-23cd77bf448f/qr/no-menu-qr-sx-xa-shanque-HALCAWZJ.png'
       AND v_existing.image_url = 'https://img.nomenuapp.com/prod/tenants/244c1bf8-a58d-4225-b945-23cd77bf448f/qr/no-menu-qr-sx-xa-shanque-HALCAWZJ.png'
       AND v_existing.mini_program_code_url = 'https://img.nomenuapp.com/prod/tenants/244c1bf8-a58d-4225-b945-23cd77bf448f/qr/weapp/release/no-menu-weapp-v1-HALCAWZJ.jpg'
       AND v_existing.enabled THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'tenant sx-xa-shanque QR registration conflicts with an existing permanent code';
  END IF;

  INSERT INTO public.tenant_qr_links (
    qr_code,
    tenant_id,
    tenant_slug,
    placement,
    version,
    enabled,
    label,
    image_path,
    image_url,
    mini_program_code_url
  ) VALUES (
    'HALCAWZJ',
    '244c1bf8-a58d-4225-b945-23cd77bf448f'::uuid,
    'sx-xa-shanque',
    'venue',
    1,
    true,
    '山雀精酿',
    '244c1bf8-a58d-4225-b945-23cd77bf448f/qr/no-menu-qr-sx-xa-shanque-HALCAWZJ.png',
    'https://img.nomenuapp.com/prod/tenants/244c1bf8-a58d-4225-b945-23cd77bf448f/qr/no-menu-qr-sx-xa-shanque-HALCAWZJ.png',
    'https://img.nomenuapp.com/prod/tenants/244c1bf8-a58d-4225-b945-23cd77bf448f/qr/weapp/release/no-menu-weapp-v1-HALCAWZJ.jpg'
  );
END;
$$;
