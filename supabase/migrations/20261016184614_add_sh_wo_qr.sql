-- Register the permanent venue QR and official WeChat mini-program code for 窝精酿啤酒屋.
-- The code is immutable and must never be reassigned.

DO $$
DECLARE
  v_existing public.tenant_qr_links%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.tenants t
    WHERE t.id = 'a3a976cb-c916-4145-8695-d28256ffe717'::uuid
      AND t.slug = 'sh-wo'
  ) THEN
    RAISE EXCEPTION 'tenant sh-wo was not found with the expected id';
  END IF;

  SELECT *
  INTO v_existing
  FROM public.tenant_qr_links q
  WHERE q.qr_code = 'DN2F2JFQ'
     OR (q.tenant_id = 'a3a976cb-c916-4145-8695-d28256ffe717'::uuid
         AND q.placement = 'venue'
         AND q.enabled)
  LIMIT 1;

  IF FOUND THEN
    IF v_existing.qr_code = 'DN2F2JFQ'
       AND v_existing.tenant_id = 'a3a976cb-c916-4145-8695-d28256ffe717'::uuid
       AND v_existing.tenant_slug = 'sh-wo'
       AND v_existing.placement = 'venue'
       AND v_existing.version = 1
       AND v_existing.image_path = 'a3a976cb-c916-4145-8695-d28256ffe717/qr/no-menu-qr-sh-wo-DN2F2JFQ.png'
       AND v_existing.image_url = 'https://img.nomenuapp.com/prod/tenants/a3a976cb-c916-4145-8695-d28256ffe717/qr/no-menu-qr-sh-wo-DN2F2JFQ.png'
       AND v_existing.mini_program_code_url = 'https://img.nomenuapp.com/prod/tenants/a3a976cb-c916-4145-8695-d28256ffe717/qr/weapp/release/no-menu-weapp-v1-DN2F2JFQ.jpg'
       AND v_existing.enabled THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'tenant sh-wo QR registration conflicts with an existing permanent code';
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
    'DN2F2JFQ',
    'a3a976cb-c916-4145-8695-d28256ffe717'::uuid,
    'sh-wo',
    'venue',
    1,
    true,
    '窝精酿啤酒屋',
    'a3a976cb-c916-4145-8695-d28256ffe717/qr/no-menu-qr-sh-wo-DN2F2JFQ.png',
    'https://img.nomenuapp.com/prod/tenants/a3a976cb-c916-4145-8695-d28256ffe717/qr/no-menu-qr-sh-wo-DN2F2JFQ.png',
    'https://img.nomenuapp.com/prod/tenants/a3a976cb-c916-4145-8695-d28256ffe717/qr/weapp/release/no-menu-weapp-v1-DN2F2JFQ.jpg'
  );
END;
$$;
