-- Register the official release mini-program code for 低地.
-- The encoded scene reuses the immutable permanent venue QR code FR73UGDP.

DO $$
DECLARE
  affected_rows integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.tenants t
    WHERE t.id = 'ca8e0e81-409a-44e1-a5df-99bb3e0748e5'::uuid
      AND t.slug = 'zj-jx-didi'
      AND t.status = 'active'
      AND t.is_public_visible
  ) THEN
    RAISE EXCEPTION 'public active tenant zj-jx-didi was not found with the expected id';
  END IF;

  UPDATE public.tenant_qr_links
  SET mini_program_code_url = 'https://img.nomenuapp.com/prod/tenants/ca8e0e81-409a-44e1-a5df-99bb3e0748e5/qr/weapp/release/no-menu-weapp-v1-FR73UGDP.jpg'
  WHERE tenant_id = 'ca8e0e81-409a-44e1-a5df-99bb3e0748e5'::uuid
    AND tenant_slug = 'zj-jx-didi'
    AND qr_code = 'FR73UGDP'
    AND placement = 'venue'
    AND version = 1
    AND enabled = true
    AND (
      mini_program_code_url IS NULL
      OR mini_program_code_url = 'https://img.nomenuapp.com/prod/tenants/ca8e0e81-409a-44e1-a5df-99bb3e0748e5/qr/weapp/release/no-menu-weapp-v1-FR73UGDP.jpg'
    );

  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  IF affected_rows <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one enabled zj-jx-didi venue QR row, updated %', affected_rows;
  END IF;
END;
$$;
