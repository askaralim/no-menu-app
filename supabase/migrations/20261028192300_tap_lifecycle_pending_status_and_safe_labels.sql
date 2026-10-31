-- Treat coming_soon as a planned tap assignment, not a witnessed on-tap
-- lifecycle. Keep the event ledger append-only: an active session corrected
-- back to coming_soon receives a cancel boundary and is omitted from metrics.

-- Keep drink state and the one-time pending-session reconciliation on the same
-- snapshot. Reads remain available while tap-list writers wait for commit.
LOCK TABLE public.drinks IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE public.tap_lifecycle_events
  DROP CONSTRAINT IF EXISTS tap_lifecycle_events_action_check;

ALTER TABLE public.tap_lifecycle_events
  ADD CONSTRAINT tap_lifecycle_events_action_check
  CHECK (action IN (
    'assign', 'replace', 'clear', 'move', 'swap',
    'sold_out', 'reactivate', 'archive', 'baseline', 'keg_change', 'cancel'
  ));

ALTER TABLE public.tap_lifecycle_events
  DROP CONSTRAINT IF EXISTS tap_lifecycle_events_end_reason_check;

ALTER TABLE public.tap_lifecycle_events
  ADD CONSTRAINT tap_lifecycle_events_end_reason_check
  CHECK (end_reason IS NULL OR end_reason IN ('replace', 'clear', 'archive', 'cancel'));

-- A planned drink has never been witnessed on tap, so removing or replacing
-- it must not create a legacy "recently sold out" fact. This guard covers the
-- normal status trigger as well as older RPCs that insert the compatibility
-- event directly.
CREATE OR REPLACE FUNCTION public.ignore_pending_sold_out_status_event()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.from_status = 'coming_soon' AND NEW.to_status = 'sold_out' THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.ignore_pending_sold_out_status_event()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS drink_status_events_00_ignore_pending_sold_out
  ON public.drink_status_events;
CREATE TRIGGER drink_status_events_00_ignore_pending_sold_out
  BEFORE INSERT ON public.drink_status_events
  FOR EACH ROW
  EXECUTE FUNCTION public.ignore_pending_sold_out_status_event();

-- Future event snapshots contain only a role and an optional phone tail. The
-- writer signature stays unchanged so already-deployed clients and functions
-- cannot drift from the database function signature again.
CREATE OR REPLACE FUNCTION public._tap_lifecycle_actor_name(
  p_actor_user_id uuid,
  p_tenant_id uuid
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_phone text;
  v_digits text;
  v_tail text;
  v_role_label text;
BEGIN
  IF p_actor_user_id IS NULL THEN
    RETURN '系统';
  END IF;

  SELECT ur.role
  INTO v_role
  FROM public.user_roles ur
  WHERE ur.user_id = p_actor_user_id
    AND (ur.tenant_id = p_tenant_id OR ur.role = 'super_admin')
  ORDER BY
    CASE WHEN ur.tenant_id = p_tenant_id THEN 0 ELSE 1 END,
    CASE ur.role WHEN 'owner' THEN 0 WHEN 'staff' THEN 1 ELSE 2 END
  LIMIT 1;

  SELECT coalesce(nullif(trim(up.mobile), ''), nullif(trim(u.phone), ''))
  INTO v_phone
  FROM auth.users u
  LEFT JOIN public.user_profiles up ON up.user_id = u.id
  WHERE u.id = p_actor_user_id;

  v_digits := regexp_replace(coalesce(v_phone, ''), '[^0-9]', '', 'g');
  IF length(v_digits) >= 4 THEN
    v_tail := right(v_digits, 4);
  END IF;

  v_role_label := CASE v_role
    WHEN 'owner' THEN '店主'
    WHEN 'staff' THEN '员工'
    WHEN 'super_admin' THEN '平台管理员'
    ELSE NULL
  END;

  IF v_role_label IS NOT NULL AND v_tail IS NOT NULL THEN
    RETURN v_role_label || ' · ' || v_tail;
  END IF;
  IF v_role_label IS NOT NULL THEN
    RETURN v_role_label;
  END IF;
  IF v_tail IS NOT NULL THEN
    RETURN '手机尾号 ' || v_tail;
  END IF;
  RETURN '未知操作者';
END;
$$;

REVOKE ALL ON FUNCTION public._tap_lifecycle_actor_name(uuid, uuid)
  FROM PUBLIC, anon, authenticated;

-- Read-time normalization also protects legacy snapshots that contain a full
-- phone number. The current caller is rendered as "你" without rewriting the
-- immutable ledger.
CREATE OR REPLACE FUNCTION public._tap_lifecycle_actor_display_name(
  p_actor_user_id uuid,
  p_tenant_id uuid,
  p_snapshot text
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_safe_name text;
  v_snapshot text := nullif(trim(p_snapshot), '');
  v_snapshot_digits text;
  v_role_label text;
BEGIN
  IF p_actor_user_id IS NOT NULL AND p_actor_user_id = auth.uid() THEN
    RETURN '你';
  END IF;

  -- Future events already carry a safe immutable snapshot. Prefer it over
  -- current membership/profile data so historical labels do not change when
  -- somebody later changes role or phone number.
  IF v_snapshot IN ('系统', '店主', '员工', '平台管理员', '未知操作者')
     OR v_snapshot ~ '^(店主|员工|平台管理员) · [0-9]{4}$'
     OR v_snapshot ~ '^手机尾号 [0-9]{4}$' THEN
    RETURN v_snapshot;
  END IF;

  v_snapshot_digits := regexp_replace(coalesce(v_snapshot, ''), '[^0-9]', '', 'g');

  IF p_actor_user_id IS NULL THEN
    IF length(v_snapshot_digits) >= 7 THEN
      RETURN '手机尾号 ' || right(v_snapshot_digits, 4);
    END IF;
    RETURN '系统';
  END IF;

  v_safe_name := public._tap_lifecycle_actor_name(p_actor_user_id, p_tenant_id);
  v_role_label := regexp_replace(v_safe_name, ' · [0-9]{4}$', '');
  IF length(v_snapshot_digits) >= 7 THEN
    IF v_role_label IN ('店主', '员工', '平台管理员') THEN
      RETURN v_role_label || ' · ' || right(v_snapshot_digits, 4);
    END IF;
    RETURN '手机尾号 ' || right(v_snapshot_digits, 4);
  END IF;

  IF v_safe_name IS DISTINCT FROM '未知操作者' THEN
    RETURN v_safe_name;
  END IF;

  RETURN '未知操作者';
END;
$$;

REVOKE ALL ON FUNCTION public._tap_lifecycle_actor_display_name(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;

-- Append actor ids and a canceled flag without changing any existing view
-- columns. Existing dependent functions therefore remain valid until they are
-- replaced below.
CREATE OR REPLACE VIEW public.tap_lifecycle_sessions_v1
WITH (security_invoker = true)
AS
SELECT
  e.tenant_id,
  e.session_id,
  (array_agg(e.drink_id ORDER BY e.occurred_at DESC, e.operation_seq DESC, e.id DESC))[1]
    AS drink_id,
  (array_agg(e.drink_name_snapshot ORDER BY e.occurred_at DESC, e.operation_seq DESC, e.id DESC))[1]
    AS drink_name,
  min(e.occurred_at) FILTER (
    WHERE e.from_tap IS NULL AND e.to_tap IS NOT NULL
  ) AS started_at,
  min(e.occurred_at) FILTER (
    WHERE e.from_tap IS NOT NULL AND e.to_tap IS NULL
  ) AS ended_at,
  (array_agg(coalesce(e.to_tap, e.from_tap)
    ORDER BY e.occurred_at DESC, e.operation_seq DESC, e.id DESC))[1]
    AS current_tap,
  CASE
    WHEN NOT bool_or(e.from_tap IS NULL AND e.to_tap IS NOT NULL)
      THEN 'unclassified'
    WHEN bool_or(
      e.accuracy = 'unclassified'
      AND ((e.from_tap IS NULL) <> (e.to_tap IS NULL))
    ) THEN 'unclassified'
    WHEN bool_or(e.accuracy = 'partial_start') THEN 'partial_start'
    ELSE 'exact'
  END AS accuracy,
  (array_agg(e.action ORDER BY e.occurred_at, e.operation_seq, e.id)
    FILTER (WHERE e.from_tap IS NULL AND e.to_tap IS NOT NULL))[1]
    AS start_action,
  (array_agg(e.action ORDER BY e.occurred_at DESC, e.operation_seq DESC, e.id DESC)
    FILTER (WHERE e.from_tap IS NOT NULL AND e.to_tap IS NULL))[1]
    AS end_action,
  (array_agg(e.end_reason ORDER BY e.occurred_at DESC, e.operation_seq DESC, e.id DESC)
    FILTER (WHERE e.end_reason IS NOT NULL))[1]
    AS end_reason,
  (array_agg(e.actor_name_snapshot ORDER BY e.occurred_at, e.operation_seq, e.id)
    FILTER (WHERE e.from_tap IS NULL AND e.to_tap IS NOT NULL))[1]
    AS start_actor_name,
  (array_agg(e.actor_name_snapshot ORDER BY e.occurred_at DESC, e.operation_seq DESC, e.id DESC)
    FILTER (WHERE e.from_tap IS NOT NULL AND e.to_tap IS NULL))[1]
    AS end_actor_name,
  (array_agg(e.actor_user_id ORDER BY e.occurred_at, e.operation_seq, e.id)
    FILTER (WHERE e.from_tap IS NULL AND e.to_tap IS NOT NULL))[1]
    AS start_actor_user_id,
  (array_agg(e.actor_user_id ORDER BY e.occurred_at DESC, e.operation_seq DESC, e.id DESC)
    FILTER (WHERE e.from_tap IS NOT NULL AND e.to_tap IS NULL))[1]
    AS end_actor_user_id,
  bool_or(e.action = 'cancel') AS canceled
FROM public.tap_lifecycle_events e
WHERE e.session_id IS NOT NULL
GROUP BY e.tenant_id, e.session_id;

REVOKE ALL ON TABLE public.tap_lifecycle_sessions_v1
  FROM PUBLIC, anon, authenticated;

-- Record one drink's physical lifecycle transition. Planned assignments are
-- deliberately ignored. Paired replace/swap operations are handled by the
-- canonical writer below.
CREATE OR REPLACE FUNCTION public._record_single_tap_lifecycle_transition(
  p_tenant_id uuid,
  p_drink_id uuid,
  p_drink_name text,
  p_from_tap integer,
  p_to_tap integer,
  p_from_status text,
  p_to_status text,
  p_action_hint text,
  p_source text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_before_active boolean := false;
  v_after_active boolean := false;
  v_action text;
  v_session_id uuid;
  v_accuracy text := 'exact';
  v_event_from_tap integer := p_from_tap;
  v_event_to_tap integer := p_to_tap;
  v_end_reason text;
BEGIN
  SELECT s.session_id
  INTO v_session_id
  FROM public.tap_lifecycle_sessions_v1 s
  WHERE s.tenant_id = p_tenant_id
    AND s.drink_id = p_drink_id
    AND s.ended_at IS NULL
    AND s.canceled IS NOT TRUE
  ORDER BY s.started_at DESC NULLS LAST, s.session_id
  LIMIT 1;

  -- new / available / low can open a witnessed cycle. sold_out can only
  -- continue a cycle that already exists; it must never create one directly.
  v_before_active := p_from_tap IS NOT NULL
    AND (
      p_from_status IN ('new', 'available', 'low')
      OR (p_from_status = 'sold_out' AND v_session_id IS NOT NULL)
    );
  v_after_active := p_to_tap IS NOT NULL
    AND (
      p_to_status IN ('new', 'available', 'low')
      OR (p_to_status = 'sold_out' AND v_before_active)
    );

  IF NOT v_before_active AND NOT v_after_active THEN
    RETURN;
  END IF;

  IF NOT v_before_active AND v_after_active THEN
    v_action := CASE WHEN p_action_hint = 'baseline' THEN 'baseline' ELSE 'assign' END;
    v_event_from_tap := NULL;
    v_session_id := gen_random_uuid();
  ELSIF v_before_active AND NOT v_after_active THEN
    IF p_to_tap IS NOT NULL AND p_to_status = 'coming_soon' THEN
      v_action := 'cancel';
      v_end_reason := 'cancel';
    ELSIF p_action_hint = 'archive' THEN
      v_action := 'archive';
      v_end_reason := 'archive';
    ELSE
      v_action := 'clear';
      v_end_reason := 'clear';
    END IF;
    v_event_to_tap := NULL;
  ELSIF p_from_tap IS DISTINCT FROM p_to_tap THEN
    v_action := 'move';
  ELSIF p_from_status IS DISTINCT FROM 'sold_out' AND p_to_status = 'sold_out' THEN
    v_action := 'sold_out';
  ELSIF p_from_status = 'sold_out' AND p_to_status IS DISTINCT FROM 'sold_out' THEN
    v_action := 'reactivate';
  ELSE
    RETURN;
  END IF;

  IF v_session_id IS NULL THEN
    v_session_id := gen_random_uuid();
    v_accuracy := 'unclassified';
  END IF;

  PERFORM public._record_tap_lifecycle_event(
    p_tenant_id,
    gen_random_uuid(),
    1::smallint,
    v_action,
    p_drink_id,
    p_drink_name,
    v_session_id,
    v_event_from_tap,
    v_event_to_tap,
    p_from_status,
    p_to_status,
    clock_timestamp(),
    v_accuracy,
    v_end_reason,
    p_source,
    auth.uid()
  );
END;
$$;

REVOKE ALL ON FUNCTION public._record_single_tap_lifecycle_transition(
  uuid, uuid, text, integer, integer, text, text, text, text
) FROM PUBLIC, anon, authenticated;

-- Keep one operation id only when both physical sides really participate in
-- a replace/swap. When either side is merely coming_soon, record only the
-- active drink transitions so a planned item cannot create a session.
CREATE OR REPLACE FUNCTION public._record_canonical_tap_operation(
  p_tenant_id uuid,
  p_action text,
  p_drink_id uuid,
  p_drink_name text,
  p_from_tap integer,
  p_to_tap integer,
  p_from_status text,
  p_to_status text,
  p_other_drink_id uuid,
  p_other_drink_name text,
  p_other_from_tap integer,
  p_other_to_tap integer,
  p_other_from_status text,
  p_other_to_status text,
  p_source text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_operation_id uuid := gen_random_uuid();
  v_at timestamptz := clock_timestamp();
  v_primary_before_active boolean := false;
  v_primary_after_active boolean := false;
  v_other_before_active boolean := false;
  v_other_after_active boolean := false;
  v_pair_replace boolean;
  v_pair_swap boolean;
  v_primary_accuracy text := 'exact';
  v_other_accuracy text := 'exact';
  v_primary_session uuid;
  v_other_session uuid;
BEGIN
  IF p_action NOT IN (
    'assign', 'replace', 'clear', 'move', 'swap',
    'sold_out', 'reactivate', 'archive', 'cancel'
  ) THEN
    RAISE EXCEPTION 'Unsupported tap lifecycle action: %', p_action;
  END IF;

  SELECT s.session_id
  INTO v_primary_session
  FROM public.tap_lifecycle_sessions_v1 s
  WHERE s.tenant_id = p_tenant_id
    AND s.drink_id = p_drink_id
    AND s.ended_at IS NULL
    AND s.canceled IS NOT TRUE
  ORDER BY s.started_at DESC NULLS LAST, s.session_id
  LIMIT 1;

  IF p_other_drink_id IS NOT NULL THEN
    SELECT s.session_id
    INTO v_other_session
    FROM public.tap_lifecycle_sessions_v1 s
    WHERE s.tenant_id = p_tenant_id
      AND s.drink_id = p_other_drink_id
      AND s.ended_at IS NULL
      AND s.canceled IS NOT TRUE
    ORDER BY s.started_at DESC NULLS LAST, s.session_id
    LIMIT 1;
  END IF;

  v_primary_before_active := p_from_tap IS NOT NULL
    AND (
      p_from_status IN ('new', 'available', 'low')
      OR (p_from_status = 'sold_out' AND v_primary_session IS NOT NULL)
    );
  v_primary_after_active := p_to_tap IS NOT NULL
    AND (
      p_to_status IN ('new', 'available', 'low')
      OR (p_to_status = 'sold_out' AND v_primary_before_active)
    );
  v_other_before_active := p_other_from_tap IS NOT NULL
    AND (
      p_other_from_status IN ('new', 'available', 'low')
      OR (p_other_from_status = 'sold_out' AND v_other_session IS NOT NULL)
    );
  v_other_after_active := p_other_to_tap IS NOT NULL
    AND (
      p_other_to_status IN ('new', 'available', 'low')
      OR (p_other_to_status = 'sold_out' AND v_other_before_active)
    );

  v_pair_replace := p_action = 'replace'
    AND v_primary_after_active
    AND v_other_before_active
    AND NOT v_other_after_active;
  v_pair_swap := p_action = 'swap'
    AND v_primary_before_active
    AND v_primary_after_active
    AND v_other_before_active
    AND v_other_after_active;

  IF NOT v_pair_replace AND NOT v_pair_swap THEN
    IF p_other_drink_id IS NOT NULL THEN
      PERFORM public._record_single_tap_lifecycle_transition(
        p_tenant_id,
        p_other_drink_id,
        p_other_drink_name,
        p_other_from_tap,
        p_other_to_tap,
        p_other_from_status,
        p_other_to_status,
        p_action,
        p_source
      );
    END IF;

    PERFORM public._record_single_tap_lifecycle_transition(
      p_tenant_id,
      p_drink_id,
      p_drink_name,
      p_from_tap,
      p_to_tap,
      p_from_status,
      p_to_status,
      p_action,
      p_source
    );
    RETURN;
  END IF;

  IF v_pair_replace THEN
    SELECT s.session_id
    INTO v_other_session
    FROM public.tap_lifecycle_sessions_v1 s
    WHERE s.tenant_id = p_tenant_id
      AND s.drink_id = p_other_drink_id
      AND s.ended_at IS NULL
      AND s.canceled IS NOT TRUE
    ORDER BY s.started_at DESC NULLS LAST, s.session_id
    LIMIT 1;

    IF v_other_session IS NULL THEN
      v_other_session := gen_random_uuid();
      v_other_accuracy := 'unclassified';
    END IF;
    v_primary_session := gen_random_uuid();

    PERFORM public._record_tap_lifecycle_event(
      p_tenant_id, v_operation_id, 1::smallint, 'replace',
      p_other_drink_id, p_other_drink_name, v_other_session,
      p_other_from_tap, NULL, p_other_from_status, p_other_to_status,
      v_at, v_other_accuracy, 'replace', p_source, auth.uid()
    );

    PERFORM public._record_tap_lifecycle_event(
      p_tenant_id, v_operation_id, 2::smallint, 'replace',
      p_drink_id, p_drink_name, v_primary_session,
      NULL, p_to_tap, p_from_status, p_to_status,
      v_at, v_primary_accuracy, NULL, p_source, auth.uid()
    );
    RETURN;
  END IF;

  SELECT s.session_id
  INTO v_primary_session
  FROM public.tap_lifecycle_sessions_v1 s
  WHERE s.tenant_id = p_tenant_id
    AND s.drink_id = p_drink_id
    AND s.ended_at IS NULL
    AND s.canceled IS NOT TRUE
  ORDER BY s.started_at DESC NULLS LAST, s.session_id
  LIMIT 1;

  IF v_primary_session IS NULL THEN
    v_primary_session := gen_random_uuid();
    v_primary_accuracy := 'unclassified';
  END IF;

  SELECT s.session_id
  INTO v_other_session
  FROM public.tap_lifecycle_sessions_v1 s
  WHERE s.tenant_id = p_tenant_id
    AND s.drink_id = p_other_drink_id
    AND s.ended_at IS NULL
    AND s.canceled IS NOT TRUE
  ORDER BY s.started_at DESC NULLS LAST, s.session_id
  LIMIT 1;

  IF v_other_session IS NULL THEN
    v_other_session := gen_random_uuid();
    v_other_accuracy := 'unclassified';
  END IF;

  PERFORM public._record_tap_lifecycle_event(
    p_tenant_id, v_operation_id, 1::smallint, 'swap',
    p_drink_id, p_drink_name, v_primary_session,
    p_from_tap, p_to_tap, p_from_status, p_to_status,
    v_at, v_primary_accuracy, NULL, p_source, auth.uid()
  );

  PERFORM public._record_tap_lifecycle_event(
    p_tenant_id, v_operation_id, 2::smallint, 'swap',
    p_other_drink_id, p_other_drink_name, v_other_session,
    p_other_from_tap, p_other_to_tap, p_other_from_status, p_other_to_status,
    v_at, v_other_accuracy, NULL, p_source, auth.uid()
  );
END;
$$;

REVOKE ALL ON FUNCTION public._record_canonical_tap_operation(
  uuid, text, uuid, text, integer, integer, text, text,
  uuid, text, integer, integer, text, text, text
) FROM PUBLIC, anon, authenticated;

-- Direct writes and status-only RPCs follow the same pending/active boundary.
CREATE OR REPLACE FUNCTION public.capture_drink_tap_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_drink_id uuid;
  v_drink_name text;
  v_action text;
  v_action_hint text;
  v_accuracy text;
  v_source text;
  v_operation_id uuid;
  v_operation_text text;
  v_operation_seq smallint;
  v_session_id uuid;
  v_from_tap integer;
  v_to_tap integer;
  v_from_status text;
  v_to_status text;
  v_at timestamptz := clock_timestamp();
  v_end_reason text;
  v_before_active boolean := false;
  v_after_active boolean := false;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_tenant_id := OLD.tenant_id;
    v_drink_id := OLD.id;
  ELSE
    v_tenant_id := NEW.tenant_id;
    v_drink_id := NEW.id;
  END IF;

  IF coalesce(current_setting('app.tap_lifecycle.suppress_trigger', true), '') = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tenants t
    WHERE t.id = v_tenant_id
      AND t.tap_lifecycle_started_at IS NOT NULL
      AND v_at >= t.tap_lifecycle_started_at
  ) THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  v_accuracy := coalesce(
    nullif(current_setting('app.tap_lifecycle.accuracy', true), ''),
    'unclassified'
  );
  IF v_accuracy NOT IN ('exact', 'partial_start', 'unclassified') THEN
    v_accuracy := 'unclassified';
  END IF;
  v_source := coalesce(
    nullif(current_setting('app.tap_lifecycle.source', true), ''),
    'direct_drinks_write'
  );
  v_action_hint := nullif(current_setting('app.tap_lifecycle.action', true), '');

  SELECT s.session_id
  INTO v_session_id
  FROM public.tap_lifecycle_sessions_v1 s
  WHERE s.tenant_id = v_tenant_id
    AND s.drink_id = v_drink_id
    AND s.ended_at IS NULL
    AND s.canceled IS NOT TRUE
  ORDER BY s.started_at DESC NULLS LAST, s.session_id
  LIMIT 1;

  IF TG_OP = 'INSERT' THEN
    v_after_active := NEW.enabled IS TRUE
      AND NEW.public_sort_order IS NOT NULL
      AND NEW.public_status IN ('new', 'available', 'low');
    IF NOT v_after_active THEN RETURN NEW; END IF;

    v_action := CASE WHEN v_action_hint = 'baseline' THEN 'baseline' ELSE 'assign' END;
    v_from_tap := NULL;
    v_to_tap := NEW.public_sort_order;
    v_from_status := NEW.public_status;
    v_to_status := NEW.public_status;
    v_drink_name := coalesce(
      public._tap_lifecycle_drink_name(NEW.id),
      nullif(trim(NEW.name), ''),
      '未命名酒款'
    );
  ELSIF TG_OP = 'DELETE' THEN
    v_before_active := OLD.enabled IS TRUE
      AND OLD.public_sort_order IS NOT NULL
      AND (
        OLD.public_status IN ('new', 'available', 'low')
        OR (OLD.public_status = 'sold_out' AND v_session_id IS NOT NULL)
      );
    IF NOT v_before_active THEN RETURN OLD; END IF;

    v_action := 'archive';
    v_from_tap := OLD.public_sort_order;
    v_to_tap := NULL;
    v_from_status := OLD.public_status;
    v_to_status := OLD.public_status;
    v_end_reason := 'archive';
    v_drink_name := coalesce(
      nullif(trim(OLD.display_name), ''),
      nullif(trim(OLD.name), ''),
      '未命名酒款'
    );
  ELSE
    v_before_active := OLD.enabled IS TRUE
      AND OLD.public_sort_order IS NOT NULL
      AND (
        OLD.public_status IN ('new', 'available', 'low')
        OR (OLD.public_status = 'sold_out' AND v_session_id IS NOT NULL)
      );
    v_after_active := NEW.enabled IS TRUE
      AND NEW.public_sort_order IS NOT NULL
      AND (
        NEW.public_status IN ('new', 'available', 'low')
        OR (NEW.public_status = 'sold_out' AND v_before_active)
      );

    IF NOT v_before_active AND NOT v_after_active THEN
      RETURN NEW;
    END IF;

    v_from_tap := OLD.public_sort_order;
    v_to_tap := NEW.public_sort_order;
    v_from_status := OLD.public_status;
    v_to_status := NEW.public_status;
    v_drink_name := coalesce(
      public._tap_lifecycle_drink_name(NEW.id),
      nullif(trim(NEW.name), ''),
      '未命名酒款'
    );

    IF NOT v_before_active AND v_after_active THEN
      v_action := CASE WHEN v_action_hint = 'baseline' THEN 'baseline' ELSE 'assign' END;
      v_from_tap := NULL;
    ELSIF v_before_active AND NOT v_after_active THEN
      IF NEW.enabled IS TRUE
         AND NEW.public_sort_order IS NOT NULL
         AND NEW.public_status = 'coming_soon' THEN
        v_action := 'cancel';
        v_end_reason := 'cancel';
      ELSIF NEW.enabled IS NOT TRUE OR v_action_hint = 'archive' THEN
        v_action := 'archive';
        v_end_reason := 'archive';
      ELSE
        v_action := 'clear';
        v_end_reason := 'clear';
      END IF;
      v_to_tap := NULL;
    ELSIF OLD.public_sort_order IS DISTINCT FROM NEW.public_sort_order THEN
      v_action := 'move';
    ELSIF OLD.public_status IS DISTINCT FROM 'sold_out'
          AND NEW.public_status = 'sold_out' THEN
      v_action := 'sold_out';
    ELSIF OLD.public_status = 'sold_out'
          AND NEW.public_status IS DISTINCT FROM 'sold_out' THEN
      v_action := 'reactivate';
    ELSE
      RETURN NEW;
    END IF;
  END IF;

  IF v_action IN ('assign', 'baseline') THEN
    v_session_id := gen_random_uuid();
  ELSE
    SELECT s.session_id
    INTO v_session_id
    FROM public.tap_lifecycle_sessions_v1 s
    WHERE s.tenant_id = v_tenant_id
      AND s.drink_id = v_drink_id
      AND s.ended_at IS NULL
      AND s.canceled IS NOT TRUE
    ORDER BY s.started_at DESC NULLS LAST, s.session_id
    LIMIT 1;

    IF v_session_id IS NULL THEN
      v_session_id := gen_random_uuid();
      v_accuracy := 'unclassified';
    END IF;
  END IF;

  v_operation_text := nullif(current_setting('app.tap_lifecycle.operation_id', true), '');
  IF v_operation_text IS NULL THEN
    v_operation_id := gen_random_uuid();
  ELSE
    BEGIN
      v_operation_id := v_operation_text::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      v_operation_id := gen_random_uuid();
      v_accuracy := 'unclassified';
    END;
  END IF;

  SELECT (coalesce(max(e.operation_seq), 0) + 1)::smallint
  INTO v_operation_seq
  FROM public.tap_lifecycle_events e
  WHERE e.tenant_id = v_tenant_id
    AND e.operation_id = v_operation_id;

  PERFORM public._record_tap_lifecycle_event(
    v_tenant_id, v_operation_id, v_operation_seq, v_action,
    v_drink_id, v_drink_name, v_session_id,
    v_from_tap, v_to_tap, v_from_status, v_to_status,
    v_at, v_accuracy, v_end_reason, v_source, auth.uid()
  );

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.capture_drink_tap_lifecycle()
  FROM PUBLIC, anon, authenticated;

-- The existing canonical writers already handle tap moves. Wrap only the two
-- writers that suppress the fallback trigger so same-tap pending/active status
-- changes also cross the lifecycle boundary. Public signatures are unchanged.
ALTER FUNCTION public.set_drink_taplist_listing(uuid, boolean, text, integer)
  RENAME TO _set_drink_taplist_listing_without_pending_lifecycle;

REVOKE ALL ON FUNCTION public._set_drink_taplist_listing_without_pending_lifecycle(
  uuid, boolean, text, integer
) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.set_drink_taplist_listing(
  p_drink_id uuid,
  p_is_public_visible boolean,
  p_public_status text,
  p_public_sort_order integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_before_tap integer;
  v_before_status text;
  v_after_tap integer;
  v_after_status text;
  v_drink_name text;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT d.tenant_id
  INTO v_tenant_id
  FROM public.drinks d
  WHERE d.id = p_drink_id;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Drink not found';
  END IF;

  IF NOT public.taplist_can_view_tenant(v_tenant_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_tenant_id::text, 0));

  SELECT d.public_sort_order, d.public_status
  INTO v_before_tap, v_before_status
  FROM public.drinks d
  WHERE d.id = p_drink_id
    AND d.tenant_id = v_tenant_id
  FOR UPDATE;

  v_result := public._set_drink_taplist_listing_without_pending_lifecycle(
    p_drink_id,
    p_is_public_visible,
    p_public_status,
    p_public_sort_order
  );

  IF coalesce((v_result->>'ok')::boolean, false) IS NOT TRUE THEN
    RETURN v_result;
  END IF;

  SELECT
    d.public_sort_order,
    d.public_status,
    coalesce(public._tap_lifecycle_drink_name(d.id), '未命名酒款')
  INTO v_after_tap, v_after_status, v_drink_name
  FROM public.drinks d
  WHERE d.id = p_drink_id
    AND d.tenant_id = v_tenant_id;

  IF v_before_tap IS NOT NULL
     AND v_before_tap IS NOT DISTINCT FROM v_after_tap
     AND (
       (v_before_status = 'coming_soon'
        AND v_after_status IS DISTINCT FROM 'coming_soon'
        AND v_after_status IS DISTINCT FROM 'sold_out')
       OR
       (v_before_status IS DISTINCT FROM 'coming_soon'
        AND v_before_status IS DISTINCT FROM 'sold_out'
        AND v_after_status = 'coming_soon')
     ) THEN
    PERFORM public._record_canonical_tap_operation(
      v_tenant_id,
      CASE WHEN v_after_status = 'coming_soon' THEN 'cancel' ELSE 'assign' END,
      p_drink_id,
      v_drink_name,
      v_before_tap,
      v_after_tap,
      v_before_status,
      v_after_status,
      NULL, NULL, NULL, NULL, NULL, NULL,
      'set_drink_taplist_listing'
    );
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.set_drink_taplist_listing(uuid, boolean, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_drink_taplist_listing(uuid, boolean, text, integer)
  TO authenticated;

ALTER FUNCTION public.set_drink_taplist_consumer_fields(uuid, text, boolean, text, integer)
  RENAME TO _set_drink_taplist_consumer_fields_without_pending_lifecycle;

REVOKE ALL ON FUNCTION public._set_drink_taplist_consumer_fields_without_pending_lifecycle(
  uuid, text, boolean, text, integer
) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.set_drink_taplist_consumer_fields(
  p_drink_id uuid,
  p_image_url text,
  p_is_public_visible boolean,
  p_public_status text,
  p_public_sort_order integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_before_tap integer;
  v_before_status text;
  v_after_tap integer;
  v_after_status text;
  v_drink_name text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT d.tenant_id
  INTO v_tenant_id
  FROM public.drinks d
  WHERE d.id = p_drink_id;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Drink not found';
  END IF;

  IF NOT public.taplist_can_view_tenant(v_tenant_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_tenant_id::text, 0));

  SELECT d.public_sort_order, d.public_status
  INTO v_before_tap, v_before_status
  FROM public.drinks d
  WHERE d.id = p_drink_id
    AND d.tenant_id = v_tenant_id
  FOR UPDATE;

  PERFORM public._set_drink_taplist_consumer_fields_without_pending_lifecycle(
    p_drink_id,
    p_image_url,
    p_is_public_visible,
    p_public_status,
    p_public_sort_order
  );

  SELECT
    d.public_sort_order,
    d.public_status,
    coalesce(public._tap_lifecycle_drink_name(d.id), '未命名酒款')
  INTO v_after_tap, v_after_status, v_drink_name
  FROM public.drinks d
  WHERE d.id = p_drink_id
    AND d.tenant_id = v_tenant_id;

  IF v_before_tap IS NOT NULL
     AND v_before_tap IS NOT DISTINCT FROM v_after_tap
     AND (
       (v_before_status = 'coming_soon'
        AND v_after_status IS DISTINCT FROM 'coming_soon'
        AND v_after_status IS DISTINCT FROM 'sold_out')
       OR
       (v_before_status IS DISTINCT FROM 'coming_soon'
        AND v_before_status IS DISTINCT FROM 'sold_out'
        AND v_after_status = 'coming_soon')
     ) THEN
    PERFORM public._record_canonical_tap_operation(
      v_tenant_id,
      CASE WHEN v_after_status = 'coming_soon' THEN 'cancel' ELSE 'assign' END,
      p_drink_id,
      v_drink_name,
      v_before_tap,
      v_after_tap,
      v_before_status,
      v_after_status,
      NULL, NULL, NULL, NULL, NULL, NULL,
      'set_drink_taplist_consumer_fields'
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_drink_taplist_consumer_fields(
  uuid, text, boolean, text, integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_drink_taplist_consumer_fields(
  uuid, text, boolean, text, integer
) TO authenticated;

-- Close sessions that were incorrectly started for already-planned drinks by
-- the previous rules. The drink remains assigned to its planned tap; only the
-- lifecycle projection is corrected. These sessions are explicitly canceled,
-- never converted into completed durations.
INSERT INTO public.tap_lifecycle_events (
  tenant_id,
  operation_id,
  operation_seq,
  action,
  drink_id,
  drink_name_snapshot,
  session_id,
  from_tap,
  to_tap,
  from_status,
  to_status,
  actor_user_id,
  actor_name_snapshot,
  occurred_at,
  accuracy,
  end_reason,
  source
)
SELECT
  d.tenant_id,
  gen_random_uuid(),
  1::smallint,
  'cancel',
  d.id,
  coalesce(public._tap_lifecycle_drink_name(d.id), '未命名酒款'),
  s.session_id,
  d.public_sort_order,
  NULL,
  d.public_status,
  d.public_status,
  NULL,
  '系统',
  clock_timestamp(),
  CASE
    WHEN s.accuracy IN ('exact', 'partial_start') THEN s.accuracy
    ELSE 'unclassified'
  END,
  'cancel',
  'migration_pending_status_reconcile'
FROM public.drinks d
JOIN public.tap_lifecycle_sessions_v1 s
  ON s.tenant_id = d.tenant_id
 AND s.drink_id = d.id
 AND s.ended_at IS NULL
 AND s.canceled IS NOT TRUE
WHERE d.enabled IS TRUE
  AND d.public_sort_order BETWEEN 1 AND 99
  AND d.public_status = 'coming_soon';

CREATE OR REPLACE FUNCTION public.get_tap_lifecycle_overview(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_data_since timestamptz;
  v_window_start timestamptz;
  v_tap_count integer;
  v_current_on_tap_count integer;
  v_assign_count integer := 0;
  v_clear_count integer := 0;
  v_replace_count integer := 0;
  v_move_count integer := 0;
  v_keg_change_count integer := 0;
  v_operations jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant id is required';
  END IF;
  IF NOT public.taplist_can_view_tenant(p_tenant_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT t.tap_lifecycle_started_at, t.tap_slot_count
  INTO v_data_since, v_tap_count
  FROM public.tenants t
  WHERE t.id = p_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tenant not found';
  END IF;

  v_window_start := greatest(
    coalesce(v_data_since, '-infinity'::timestamptz),
    statement_timestamp() - interval '30 days'
  );

  SELECT count(*)::integer
  INTO v_current_on_tap_count
  FROM public.drinks d
  WHERE d.tenant_id = p_tenant_id
    AND d.enabled = true
    AND d.public_sort_order BETWEEN 1 AND 99
    AND (
      d.public_status IN ('new', 'available', 'low')
      OR (
        d.public_status = 'sold_out'
        AND EXISTS (
          SELECT 1
          FROM public.tap_lifecycle_sessions_v1 active_session
          WHERE active_session.tenant_id = d.tenant_id
            AND active_session.drink_id = d.id
            AND active_session.ended_at IS NULL
            AND active_session.canceled IS NOT TRUE
        )
      )
    );

  SELECT
    count(DISTINCT e.operation_id) FILTER (
      WHERE e.accuracy = 'exact'
        AND e.from_tap IS NULL
        AND e.to_tap IS NOT NULL
        AND e.action <> 'baseline'
        AND coalesce(s.canceled, false) IS NOT TRUE
    )::integer,
    count(DISTINCT e.operation_id) FILTER (
      WHERE e.accuracy = 'exact'
        AND e.from_tap IS NOT NULL
        AND e.to_tap IS NULL
        AND e.action NOT IN ('cancel')
        AND coalesce(s.canceled, false) IS NOT TRUE
    )::integer,
    count(DISTINCT e.operation_id) FILTER (
      WHERE e.accuracy = 'exact'
        AND e.action = 'replace'
        AND e.from_tap IS NULL
        AND e.to_tap IS NOT NULL
        AND coalesce(s.canceled, false) IS NOT TRUE
    )::integer,
    count(DISTINCT e.operation_id) FILTER (
      WHERE e.accuracy = 'exact'
        AND e.action IN ('move', 'swap')
        AND coalesce(s.canceled, false) IS NOT TRUE
    )::integer,
    count(DISTINCT e.operation_id) FILTER (
      WHERE e.accuracy = 'exact'
        AND e.action = 'keg_change'
        AND coalesce(s.canceled, false) IS NOT TRUE
    )::integer
  INTO
    v_assign_count,
    v_clear_count,
    v_replace_count,
    v_move_count,
    v_keg_change_count
  FROM public.tap_lifecycle_events e
  LEFT JOIN public.tap_lifecycle_sessions_v1 s
    ON s.tenant_id = e.tenant_id
   AND s.session_id = e.session_id
  WHERE e.tenant_id = p_tenant_id
    AND e.occurred_at >= v_window_start;

  WITH window_events AS (
    SELECT e.*
    FROM public.tap_lifecycle_events e
    WHERE e.tenant_id = p_tenant_id
      AND e.occurred_at >= v_window_start
      AND e.action <> 'baseline'
  ),
  grouped AS (
    SELECT
      e.operation_id,
      (array_agg(e.action ORDER BY e.operation_seq, e.id))[1] AS action,
      min(e.occurred_at) AS occurred_at,
      (array_agg(e.actor_user_id ORDER BY e.operation_seq, e.id))[1] AS actor_user_id,
      (array_agg(e.actor_name_snapshot ORDER BY e.operation_seq, e.id))[1]
        AS actor_name_snapshot,
      CASE
        WHEN bool_or(e.accuracy = 'unclassified') THEN 'unclassified'
        WHEN bool_or(e.accuracy = 'partial_start') THEN 'partial_start'
        ELSE 'exact'
      END AS accuracy,
      (array_agg(e.drink_id ORDER BY e.operation_seq, e.id))[1] AS first_drink_id,
      (array_agg(e.drink_name_snapshot ORDER BY e.operation_seq, e.id))[1]
        AS first_drink_name,
      (array_agg(e.from_tap ORDER BY e.operation_seq, e.id))[1] AS first_from_tap,
      (array_agg(e.to_tap ORDER BY e.operation_seq, e.id))[1] AS first_to_tap,
      (array_agg(e.drink_id ORDER BY e.operation_seq, e.id)
        FILTER (WHERE e.from_tap IS NOT NULL AND e.to_tap IS NULL))[1]
        AS outgoing_drink_id,
      (array_agg(e.drink_name_snapshot ORDER BY e.operation_seq, e.id)
        FILTER (WHERE e.from_tap IS NOT NULL AND e.to_tap IS NULL))[1]
        AS outgoing_drink_name,
      (array_agg(e.from_tap ORDER BY e.operation_seq, e.id)
        FILTER (WHERE e.from_tap IS NOT NULL AND e.to_tap IS NULL))[1]
        AS outgoing_tap,
      (array_agg(e.drink_id ORDER BY e.operation_seq, e.id)
        FILTER (WHERE e.from_tap IS NULL AND e.to_tap IS NOT NULL))[1]
        AS incoming_drink_id,
      (array_agg(e.drink_name_snapshot ORDER BY e.operation_seq, e.id)
        FILTER (WHERE e.from_tap IS NULL AND e.to_tap IS NOT NULL))[1]
        AS incoming_drink_name,
      (array_agg(e.to_tap ORDER BY e.operation_seq, e.id)
        FILTER (WHERE e.from_tap IS NULL AND e.to_tap IS NOT NULL))[1]
        AS incoming_tap,
      (array_agg(e.drink_id ORDER BY e.operation_seq, e.id))[2] AS second_drink_id,
      (array_agg(e.drink_name_snapshot ORDER BY e.operation_seq, e.id))[2]
        AS second_drink_name,
      max(
        CASE
          WHEN e.to_tap IS NULL
            AND e.action <> 'cancel'
            AND s.accuracy = 'exact'
            AND s.started_at IS NOT NULL
            AND s.canceled IS NOT TRUE
          THEN greatest(0, floor(extract(epoch FROM (e.occurred_at - s.started_at))))::bigint
          WHEN e.action = 'keg_change'
            AND s.canceled IS NOT TRUE
            AND coalesce(
              previous_keg.started_at,
              CASE WHEN s.accuracy = 'exact' THEN s.started_at END
            ) IS NOT NULL
          THEN greatest(
            0,
            floor(extract(epoch FROM (
              e.occurred_at - coalesce(
                previous_keg.started_at,
                CASE WHEN s.accuracy = 'exact' THEN s.started_at END
              )
            )))::bigint
          )
          ELSE NULL
        END
      ) AS duration_seconds,
      (array_agg(e.end_reason ORDER BY e.operation_seq, e.id)
        FILTER (WHERE e.end_reason IS NOT NULL))[1] AS end_reason
    FROM window_events e
    LEFT JOIN public.tap_lifecycle_sessions_v1 s
      ON s.tenant_id = e.tenant_id
     AND s.session_id = e.session_id
    LEFT JOIN LATERAL (
      SELECT max(prior_event.occurred_at) AS started_at
      FROM public.tap_lifecycle_events prior_event
      WHERE e.action = 'keg_change'
        AND prior_event.tenant_id = e.tenant_id
        AND prior_event.session_id = e.session_id
        AND prior_event.action = 'keg_change'
        AND (
          prior_event.occurred_at,
          prior_event.operation_seq,
          prior_event.id
        ) < (
          e.occurred_at,
          e.operation_seq,
          e.id
        )
    ) previous_keg ON true
    GROUP BY e.operation_id
  ),
  shaped AS (
    SELECT
      g.operation_id,
      g.action,
      g.occurred_at,
      g.actor_user_id,
      g.actor_name_snapshot,
      CASE WHEN g.action = 'replace' THEN g.outgoing_tap ELSE g.first_from_tap END
        AS from_tap,
      CASE WHEN g.action = 'replace' THEN g.incoming_tap ELSE g.first_to_tap END
        AS to_tap,
      CASE WHEN g.action = 'replace' THEN g.incoming_drink_id ELSE g.first_drink_id END
        AS drink_id,
      CASE WHEN g.action = 'replace' THEN g.incoming_drink_name ELSE g.first_drink_name END
        AS drink_name,
      CASE
        WHEN g.action IN ('replace', 'clear', 'archive', 'cancel') THEN
          coalesce(g.outgoing_drink_id, g.first_drink_id)
        WHEN g.action = 'assign' THEN NULL
        WHEN g.action = 'swap' THEN g.second_drink_id
        WHEN g.action = 'move' THEN g.first_drink_id
        ELSE NULL
      END AS previous_drink_id,
      CASE
        WHEN g.action IN ('replace', 'clear', 'archive', 'cancel') THEN
          coalesce(g.outgoing_drink_name, g.first_drink_name)
        WHEN g.action = 'assign' THEN NULL
        WHEN g.action = 'swap' THEN g.second_drink_name
        WHEN g.action = 'move' THEN g.first_drink_name
        ELSE NULL
      END AS previous_drink_name,
      CASE
        WHEN g.action IN ('replace', 'assign') THEN
          coalesce(g.incoming_drink_id, g.first_drink_id)
        WHEN g.action IN ('swap', 'move') THEN g.first_drink_id
        ELSE NULL
      END AS next_drink_id,
      CASE
        WHEN g.action IN ('replace', 'assign') THEN
          coalesce(g.incoming_drink_name, g.first_drink_name)
        WHEN g.action IN ('swap', 'move') THEN g.first_drink_name
        ELSE NULL
      END AS next_drink_name,
      g.duration_seconds,
      g.accuracy,
      g.end_reason
    FROM grouped g
  )
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'operation_id', s.operation_id,
        'action', s.action,
        'occurred_at', s.occurred_at,
        'actor_name', public._tap_lifecycle_actor_display_name(
          s.actor_user_id,
          p_tenant_id,
          s.actor_name_snapshot
        ),
        'from_tap', s.from_tap,
        'to_tap', s.to_tap,
        'drink_id', s.drink_id,
        'drink_name', s.drink_name,
        'previous_drink_id', s.previous_drink_id,
        'previous_drink_name', s.previous_drink_name,
        'next_drink_id', s.next_drink_id,
        'next_drink_name', s.next_drink_name,
        'duration_seconds', s.duration_seconds,
        'accuracy', s.accuracy,
        'end_reason', s.end_reason
      )
      ORDER BY s.occurred_at DESC, s.operation_id
    ),
    '[]'::jsonb
  )
  INTO v_operations
  FROM shaped s;

  RETURN jsonb_build_object(
    'ok', true,
    'data_since', v_data_since,
    'window_days', 30,
    'tap_count', v_tap_count,
    'tap_count_confirmed', v_tap_count IS NOT NULL,
    'current_on_tap_count', v_current_on_tap_count,
    'empty_tap_count', CASE
      WHEN v_tap_count IS NULL THEN NULL
      ELSE greatest(v_tap_count - v_current_on_tap_count, 0)
    END,
    'counts', jsonb_build_object(
      'assign', coalesce(v_assign_count, 0),
      'clear', coalesce(v_clear_count, 0),
      'replace', coalesce(v_replace_count, 0),
      'move', coalesce(v_move_count, 0),
      'keg_change', coalesce(v_keg_change_count, 0)
    ),
    'operations', v_operations
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_tap_lifecycle_overview(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_tap_lifecycle_overview(uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.list_tap_lifecycle_sessions(
  p_tenant_id uuid,
  p_status text DEFAULT 'completed'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text := lower(trim(coalesce(p_status, 'completed')));
  v_data_since timestamptz;
  v_window_start timestamptz;
  v_items jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant id is required';
  END IF;
  IF v_status NOT IN ('completed', 'active') THEN
    RAISE EXCEPTION 'Invalid lifecycle session status';
  END IF;
  IF NOT public.taplist_can_view_tenant(p_tenant_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT t.tap_lifecycle_started_at
  INTO v_data_since
  FROM public.tenants t
  WHERE t.id = p_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tenant not found';
  END IF;

  v_window_start := greatest(
    coalesce(v_data_since, '-infinity'::timestamptz),
    statement_timestamp() - interval '30 days'
  );

  WITH session_rows AS (
    SELECT
      s.*,
      coalesce(
        nullif(trim(dp.brewery), ''),
        nullif(trim(dp.brand_name), ''),
        nullif(trim(p.brewery), ''),
        nullif(trim(d.brand_name), '')
      ) AS brewery_name,
      coalesce(k.keg_change_count, 0)::integer AS keg_change_count,
      CASE
        WHEN k.last_keg_changed_at IS NOT NULL THEN k.last_keg_changed_at
        WHEN s.accuracy = 'exact' THEN s.started_at
        ELSE NULL
      END AS current_keg_started_at
    FROM public.tap_lifecycle_sessions_v1 s
    LEFT JOIN public.drinks d
      ON d.tenant_id = s.tenant_id
     AND d.id = s.drink_id
    LEFT JOIN public.drink_products dp ON dp.id = d.product_id
    LEFT JOIN public.drink_beer_profiles p ON p.drink_id = d.id
    LEFT JOIN LATERAL (
      SELECT
        count(*) FILTER (WHERE e.action = 'keg_change')::integer
          AS keg_change_count,
        max(e.occurred_at) FILTER (WHERE e.action = 'keg_change')
          AS last_keg_changed_at
      FROM public.tap_lifecycle_events e
      WHERE e.tenant_id = s.tenant_id
        AND e.session_id = s.session_id
    ) k ON true
    WHERE s.tenant_id = p_tenant_id
      AND s.canceled IS NOT TRUE
      AND (
        (
          v_status = 'active'
          AND s.ended_at IS NULL
          AND s.accuracy IN ('exact', 'partial_start')
        )
        OR
        (
          v_status = 'completed'
          AND s.ended_at IS NOT NULL
          AND s.ended_at >= v_window_start
          AND s.accuracy IN ('exact', 'partial_start')
        )
      )
  )
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'session_id', s.session_id,
        'drink_id', s.drink_id,
        'drink_name', s.drink_name,
        'brewery_name', s.brewery_name,
        'state', CASE WHEN s.ended_at IS NULL THEN 'active' ELSE 'completed' END,
        'accuracy', s.accuracy,
        'current_tap', s.current_tap,
        'started_at', s.started_at,
        'ended_at', s.ended_at,
        'duration_seconds', CASE
          WHEN s.accuracy <> 'exact' OR s.started_at IS NULL THEN NULL
          ELSE greatest(
            0,
            floor(extract(epoch FROM (
              coalesce(s.ended_at, statement_timestamp()) - s.started_at
            )))::bigint
          )
        END,
        'keg_change_count', s.keg_change_count,
        'current_keg_started_at', s.current_keg_started_at,
        'current_keg_duration_seconds', CASE
          WHEN s.current_keg_started_at IS NULL THEN NULL
          ELSE greatest(
            0,
            floor(extract(epoch FROM (
              coalesce(s.ended_at, statement_timestamp()) - s.current_keg_started_at
            )))::bigint
          )
        END,
        'end_reason', s.end_reason,
        'actor_name', CASE
          WHEN s.ended_at IS NULL THEN public._tap_lifecycle_actor_display_name(
            s.start_actor_user_id,
            p_tenant_id,
            s.start_actor_name
          )
          ELSE public._tap_lifecycle_actor_display_name(
            coalesce(s.end_actor_user_id, s.start_actor_user_id),
            p_tenant_id,
            coalesce(s.end_actor_name, s.start_actor_name)
          )
        END
      )
      ORDER BY
        CASE WHEN s.ended_at IS NULL THEN s.started_at ELSE s.ended_at END DESC NULLS LAST,
        s.session_id
    ),
    '[]'::jsonb
  )
  INTO v_items
  FROM session_rows s;

  RETURN jsonb_build_object(
    'ok', true,
    'data_since', v_data_since,
    'status', v_status,
    'items', v_items
  );
END;
$$;

REVOKE ALL ON FUNCTION public.list_tap_lifecycle_sessions(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_tap_lifecycle_sessions(uuid, text)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
