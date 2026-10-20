-- Register the official release mini-program code for 蓝啤古.
-- The encoded scene reuses the immutable permanent venue QR code UFZRGLTL.

DO $$
DECLARE
  affected_rows integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.tenants t
    WHERE t.id = 'da21ab4e-93f7-49ca-8318-15fcbae24a93'::uuid
      AND t.slug = 'lanpigu'
      AND t.status = 'active'
      AND t.is_public_visible
  ) THEN
    RAISE EXCEPTION 'public active tenant lanpigu was not found with the expected id';
  END IF;

  UPDATE public.tenant_qr_links
  SET mini_program_code_url = 'https://img.nomenuapp.com/prod/tenants/da21ab4e-93f7-49ca-8318-15fcbae24a93/qr/weapp/release/no-menu-weapp-v1-UFZRGLTL.jpg'
  WHERE tenant_id = 'da21ab4e-93f7-49ca-8318-15fcbae24a93'::uuid
    AND tenant_slug = 'lanpigu'
    AND qr_code = 'UFZRGLTL'
    AND placement = 'venue'
    AND version = 1
    AND enabled = true
    AND (
      mini_program_code_url IS NULL
      OR mini_program_code_url = 'https://img.nomenuapp.com/prod/tenants/da21ab4e-93f7-49ca-8318-15fcbae24a93/qr/weapp/release/no-menu-weapp-v1-UFZRGLTL.jpg'
    );

  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  IF affected_rows <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one enabled lanpigu venue QR row, updated %', affected_rows;
  END IF;
END;
$$;
