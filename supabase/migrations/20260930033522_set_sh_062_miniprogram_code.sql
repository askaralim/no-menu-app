DO $$
DECLARE
  affected_rows integer;
BEGIN
  UPDATE public.tenant_qr_links
  SET mini_program_code_url = 'https://img.nomenuapp.com/prod/tenants/4d1da7d9-8b21-4706-b535-355b9ff79388/qr/weapp/release/no-menu-weapp-v1-R6N3V7DX.jpg'
  WHERE tenant_id = '4d1da7d9-8b21-4706-b535-355b9ff79388'::uuid
    AND tenant_slug = '062'
    AND qr_code = 'R6N3V7DX'
    AND placement = 'venue'
    AND version = 1
    AND enabled = true
    AND (
      mini_program_code_url IS NULL
      OR mini_program_code_url = 'https://img.nomenuapp.com/prod/tenants/4d1da7d9-8b21-4706-b535-355b9ff79388/qr/weapp/release/no-menu-weapp-v1-R6N3V7DX.jpg'
    );

  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  IF affected_rows <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one enabled 062 venue QR row, updated %', affected_rows;
  END IF;
END;
$$;
