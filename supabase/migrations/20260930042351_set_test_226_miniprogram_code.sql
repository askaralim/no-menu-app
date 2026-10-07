DO $$
DECLARE
  affected_rows integer;
BEGIN
  UPDATE public.tenant_qr_links
  SET mini_program_code_url = 'https://img.nomenuapp.com/prod/tenants/00000000-0000-0000-0000-000000000001/qr/weapp/release/no-menu-weapp-v1-EH7YJ3QS.jpg'
  WHERE tenant_id = '00000000-0000-0000-0000-000000000001'::uuid
    AND tenant_slug = '226'
    AND qr_code = 'EH7YJ3QS'
    AND placement = 'venue'
    AND version = 1
    AND enabled = true
    AND (
      mini_program_code_url IS NULL
      OR mini_program_code_url = 'https://img.nomenuapp.com/prod/tenants/00000000-0000-0000-0000-000000000001/qr/weapp/release/no-menu-weapp-v1-EH7YJ3QS.jpg'
    );

  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  IF affected_rows <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one enabled 226 venue QR row, updated %', affected_rows;
  END IF;
END;
$$;
