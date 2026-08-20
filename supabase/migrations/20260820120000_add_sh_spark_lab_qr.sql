-- Register the permanent venue QR code for Spark Lab in Shanghai.
-- The code is immutable and must never be reassigned.

DO $$
DECLARE
  v_existing public.tenant_qr_links%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.tenants t
    WHERE t.id = '08f98bec-8d02-4ebc-85ab-f870080f4ea6'::uuid
      AND t.slug = 'sh-spark-lab'
      AND t.status = 'active'
      AND t.is_public_visible
  ) THEN
    RAISE EXCEPTION 'public active tenant sh-spark-lab was not found with the expected id';
  END IF;

  SELECT *
  INTO v_existing
  FROM public.tenant_qr_links q
  WHERE q.qr_code = 'AWH45QIU'
     OR (q.tenant_id = '08f98bec-8d02-4ebc-85ab-f870080f4ea6'::uuid
         AND q.placement = 'venue'
         AND q.enabled)
  LIMIT 1;

  IF FOUND THEN
    IF v_existing.qr_code = 'AWH45QIU'
       AND v_existing.tenant_id = '08f98bec-8d02-4ebc-85ab-f870080f4ea6'::uuid
       AND v_existing.tenant_slug = 'sh-spark-lab'
       AND v_existing.placement = 'venue'
       AND v_existing.version = 1
       AND v_existing.image_path = '08f98bec-8d02-4ebc-85ab-f870080f4ea6/qr/no-menu-qr-sh-spark-lab-AWH45QIU.png'
       AND v_existing.enabled THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'tenant sh-spark-lab QR registration conflicts with an existing permanent code';
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
    'AWH45QIU',
    '08f98bec-8d02-4ebc-85ab-f870080f4ea6'::uuid,
    'sh-spark-lab',
    'venue',
    1,
    true,
    'Spark Lab',
    '08f98bec-8d02-4ebc-85ab-f870080f4ea6/qr/no-menu-qr-sh-spark-lab-AWH45QIU.png'
  );
END;
$$;
