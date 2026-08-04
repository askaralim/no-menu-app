-- Allow linking a support request to a tenant after admin_create_bar succeeds
-- (partial failure: bar created, owner bind pending). NULL p_tenant_id does not clear.

DROP FUNCTION IF EXISTS public.admin_update_support_request(uuid, text, text);

CREATE OR REPLACE FUNCTION public.admin_update_support_request(
  p_request_id uuid,
  p_status text,
  p_resolution_note text DEFAULT NULL,
  p_tenant_id uuid DEFAULT NULL
)
RETURNS public.support_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.support_requests;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Unauthorized: super_admin role required';
  END IF;

  IF p_status NOT IN ('pending', 'in_progress', 'resolved', 'closed') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;

  IF length(coalesce(p_resolution_note, '')) > 2000 THEN
    RAISE EXCEPTION 'Resolution note is too long';
  END IF;

  IF p_tenant_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.tenants t WHERE t.id = p_tenant_id
  ) THEN
    RAISE EXCEPTION 'Tenant not found';
  END IF;

  UPDATE public.support_requests
  SET
    status = p_status,
    resolution_note = nullif(trim(p_resolution_note), ''),
    tenant_id = CASE
      WHEN p_tenant_id IS NOT NULL THEN p_tenant_id
      ELSE tenant_id
    END
  WHERE id = p_request_id
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Support request not found';
  END IF;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_support_request(uuid, text, text, uuid) TO authenticated;
