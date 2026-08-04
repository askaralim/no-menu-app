-- Listed launch support/onboarding queue and in-app account-deletion requests.

CREATE TABLE IF NOT EXISTS public.support_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_type text NOT NULL CHECK (request_type IN (
    'bar_onboarding', 'product_support', 'privacy', 'account_deletion', 'other'
  )),
  source text NOT NULL CHECK (source IN ('tonight_app', 'taplist_web', 'platform_admin')),
  created_by_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  tenant_id uuid NULL REFERENCES public.tenants(id) ON DELETE SET NULL,
  contact_name text NULL,
  contact_channel text NULL CHECK (contact_channel IS NULL OR contact_channel IN ('mobile', 'wechat')),
  contact_value text NULL,
  venue_name text NULL,
  message text NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'resolved', 'closed')),
  resolution_note text NULL,
  ip_hash text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS support_requests_status_created_idx
  ON public.support_requests (status, created_at DESC);

CREATE INDEX IF NOT EXISTS support_requests_ip_created_idx
  ON public.support_requests (ip_hash, created_at DESC)
  WHERE ip_hash IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS support_requests_one_open_deletion_idx
  ON public.support_requests (created_by_user_id)
  WHERE request_type = 'account_deletion'
    AND status IN ('pending', 'in_progress')
    AND created_by_user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.support_requests_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  NEW.resolved_at = CASE
    WHEN NEW.status IN ('resolved', 'closed') THEN coalesce(NEW.resolved_at, now())
    ELSE NULL
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_support_requests_set_updated_at ON public.support_requests;
CREATE TRIGGER trg_support_requests_set_updated_at
BEFORE UPDATE ON public.support_requests
FOR EACH ROW EXECUTE FUNCTION public.support_requests_set_updated_at();

ALTER TABLE public.support_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS support_requests_self_select ON public.support_requests;
CREATE POLICY support_requests_self_select ON public.support_requests
  FOR SELECT TO authenticated
  USING (created_by_user_id = auth.uid());

DROP POLICY IF EXISTS support_requests_super_admin_all ON public.support_requests;
CREATE POLICY support_requests_super_admin_all ON public.support_requests
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- Public web submissions use the service-role Edge Function. No anon insert policy.

CREATE OR REPLACE FUNCTION public.request_my_account_deletion(
  p_tenant_id uuid DEFAULT NULL,
  p_message text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant_id uuid;
  v_profile public.user_profiles%ROWTYPE;
  v_existing public.support_requests%ROWTYPE;
  v_request public.support_requests%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF length(coalesce(p_message, '')) > 1000 THEN RAISE EXCEPTION 'Message is too long'; END IF;

  SELECT * INTO v_existing
  FROM public.support_requests
  WHERE created_by_user_id = v_uid
    AND request_type = 'account_deletion'
    AND status IN ('pending', 'in_progress')
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_existing.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'existing', true,
      'id', v_existing.id,
      'request_number', 'NM-' || upper(substr(replace(v_existing.id::text, '-', ''), 1, 8)),
      'status', v_existing.status,
      'created_at', v_existing.created_at
    );
  END IF;

  IF p_tenant_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = v_uid
        AND (ur.tenant_id = p_tenant_id OR ur.role = 'super_admin')
    ) THEN
      RAISE EXCEPTION 'Tenant access denied';
    END IF;
    v_tenant_id := p_tenant_id;
  ELSE
    SELECT ur.tenant_id INTO v_tenant_id
    FROM public.user_roles ur
    WHERE ur.user_id = v_uid
    ORDER BY CASE ur.role WHEN 'owner' THEN 0 WHEN 'staff' THEN 1 ELSE 2 END
    LIMIT 1;
  END IF;

  SELECT * INTO v_profile FROM public.user_profiles WHERE user_id = v_uid;

  INSERT INTO public.support_requests (
    request_type, source, created_by_user_id, tenant_id,
    contact_name, contact_channel, contact_value, message
  ) VALUES (
    'account_deletion', 'tonight_app', v_uid, v_tenant_id,
    nullif(trim(v_profile.display_name), ''),
    CASE WHEN nullif(trim(v_profile.mobile), '') IS NULL THEN NULL ELSE 'mobile' END,
    nullif(trim(v_profile.mobile), ''),
    nullif(trim(p_message), '')
  )
  RETURNING * INTO v_request;

  RETURN jsonb_build_object(
    'ok', true,
    'existing', false,
    'id', v_request.id,
    'request_number', 'NM-' || upper(substr(replace(v_request.id::text, '-', ''), 1, 8)),
    'status', v_request.status,
    'created_at', v_request.created_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_account_deletion_request()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce((
    SELECT jsonb_build_object(
      'id', sr.id,
      'request_number', 'NM-' || upper(substr(replace(sr.id::text, '-', ''), 1, 8)),
      'status', sr.status,
      'created_at', sr.created_at,
      'updated_at', sr.updated_at
    )
    FROM public.support_requests sr
    WHERE sr.created_by_user_id = auth.uid()
      AND sr.request_type = 'account_deletion'
    ORDER BY sr.created_at DESC
    LIMIT 1
  ), 'null'::jsonb);
$$;

CREATE OR REPLACE FUNCTION public.admin_list_support_requests(
  p_status text DEFAULT NULL,
  p_limit integer DEFAULT 100
)
RETURNS SETOF public.support_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'Unauthorized: super_admin role required'; END IF;
  IF p_status IS NOT NULL AND p_status NOT IN ('pending', 'in_progress', 'resolved', 'closed') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;
  RETURN QUERY
    SELECT sr.* FROM public.support_requests sr
    WHERE p_status IS NULL OR sr.status = p_status
    ORDER BY sr.created_at DESC
    LIMIT least(greatest(coalesce(p_limit, 100), 1), 500);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_support_request(
  p_request_id uuid,
  p_status text,
  p_resolution_note text DEFAULT NULL
)
RETURNS public.support_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_row public.support_requests;
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'Unauthorized: super_admin role required'; END IF;
  IF p_status NOT IN ('pending', 'in_progress', 'resolved', 'closed') THEN RAISE EXCEPTION 'Invalid status'; END IF;
  IF length(coalesce(p_resolution_note, '')) > 2000 THEN RAISE EXCEPTION 'Resolution note is too long'; END IF;

  UPDATE public.support_requests
  SET status = p_status,
      resolution_note = nullif(trim(p_resolution_note), '')
  WHERE id = p_request_id
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Support request not found'; END IF;
  RETURN v_row;
END;
$$;

REVOKE ALL ON public.support_requests FROM anon, authenticated;
GRANT SELECT ON public.support_requests TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_my_account_deletion(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_account_deletion_request() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_support_requests(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_support_request(uuid, text, text) TO authenticated;

