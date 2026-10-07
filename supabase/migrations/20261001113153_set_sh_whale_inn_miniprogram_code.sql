-- Register the official release mini-program code for Whale Inn.
-- The encoded scene reuses the immutable permanent venue QR code HRETCZJC.

DO $$
DECLARE
  affected_rows integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.tenants t
    WHERE t.id = 'b2657ad5-9152-4258-a020-1f853b35fac1'::uuid
      AND t.slug = 'sh-whale-inn'
      AND t.status = 'active'
      AND t.is_public_visible
  ) THEN
    RAISE EXCEPTION 'public active tenant sh-whale-inn was not found with the expected id';
  END IF;

  UPDATE public.tenant_qr_links
  SET mini_program_code_url = 'https://img.nomenuapp.com/prod/tenants/b2657ad5-9152-4258-a020-1f853b35fac1/qr/weapp/release/no-menu-weapp-v1-HRETCZJC.jpg'
  WHERE tenant_id = 'b2657ad5-9152-4258-a020-1f853b35fac1'::uuid
    AND tenant_slug = 'sh-whale-inn'
    AND qr_code = 'HRETCZJC'
    AND placement = 'venue'
    AND version = 1
    AND enabled = true
    AND (
      mini_program_code_url IS NULL
      OR mini_program_code_url = 'https://img.nomenuapp.com/prod/tenants/b2657ad5-9152-4258-a020-1f853b35fac1/qr/weapp/release/no-menu-weapp-v1-HRETCZJC.jpg'
    );

  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  IF affected_rows <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one enabled sh-whale-inn venue QR row, updated %', affected_rows;
  END IF;
END;
$$;
