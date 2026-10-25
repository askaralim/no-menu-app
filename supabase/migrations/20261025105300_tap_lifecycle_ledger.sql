-- Forward-only, exact tap lifecycle ledger.
--
-- Accuracy boundary:
-- - Existing on-tap drinks are snapshotted as partial_start at cutover.
-- - Canonical RPCs write exact semantic operations.
-- - Unknown/direct writes are never dropped; the fallback trigger records them
--   as unclassified so they cannot silently contaminate exact metrics.
-- - Legacy drink_status_events writes remain for compatibility but are never
--   queried as a source for this ledger.

-- ---------------------------------------------------------------------------
-- 1) Accuracy cutover + append-only event ledger
-- ---------------------------------------------------------------------------

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS tap_lifecycle_started_at timestamptz;

COMMENT ON COLUMN public.tenants.tap_lifecycle_started_at IS
  'Server-side cutover for exact tap lifecycle tracking; history before this instant is not inferred.';

-- Keep the baseline and trigger installation inside one write-free cutover.
-- Reads remain available while writers wait for this migration transaction.
LOCK TABLE public.drinks IN SHARE ROW EXCLUSIVE MODE;

-- Normalize legacy contradictions before declaring the new accuracy boundary.
-- This cleanup is baseline state, not a fabricated lifecycle operation.
UPDATE public.drinks
SET
  public_sort_order = NULL,
  is_public_visible = false
WHERE enabled IS NOT TRUE
  AND (public_sort_order IS NOT NULL OR is_public_visible IS DISTINCT FROM false);

DO $$
DECLARE
  v_cutover_at timestamptz := clock_timestamp();
BEGIN
  UPDATE public.tenants
  SET tap_lifecycle_started_at = v_cutover_at
  WHERE tap_lifecycle_started_at IS NULL;
END
$$;

ALTER TABLE public.tenants
  ALTER COLUMN tap_lifecycle_started_at SET DEFAULT now(),
  ALTER COLUMN tap_lifecycle_started_at SET NOT NULL;

CREATE OR REPLACE FUNCTION public.protect_tap_lifecycle_cutover()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.tap_lifecycle_started_at IS DISTINCT FROM OLD.tap_lifecycle_started_at
     AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'tap_lifecycle_started_at is immutable';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_tap_lifecycle_cutover()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS tenants_00_protect_tap_lifecycle_cutover ON public.tenants;
CREATE TRIGGER tenants_00_protect_tap_lifecycle_cutover
  BEFORE UPDATE OF tap_lifecycle_started_at ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_tap_lifecycle_cutover();

CREATE TABLE public.tap_lifecycle_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Deliberately snapshot identifiers without FKs: account or tenant cleanup
  -- must not rewrite the ledger or become blocked by append-only history.
  tenant_id uuid NOT NULL,
  operation_id uuid NOT NULL,
  operation_seq smallint NOT NULL,
  action text NOT NULL,
  drink_id uuid NOT NULL,
  drink_name_snapshot text NOT NULL,
  session_id uuid,
  from_tap integer,
  to_tap integer,
  from_status text,
  to_status text,
  actor_user_id uuid,
  actor_name_snapshot text NOT NULL,
  occurred_at timestamptz NOT NULL,
  accuracy text NOT NULL,
  end_reason text,
  source text NOT NULL,
  schema_version smallint NOT NULL DEFAULT 1,
  CONSTRAINT tap_lifecycle_events_operation_seq_check
    CHECK (operation_seq > 0),
  CONSTRAINT tap_lifecycle_events_action_check
    CHECK (action IN (
      'assign', 'replace', 'clear', 'move', 'swap',
      'sold_out', 'reactivate', 'archive', 'baseline'
    )),
  CONSTRAINT tap_lifecycle_events_from_tap_check
    CHECK (from_tap IS NULL OR from_tap BETWEEN 1 AND 99),
  CONSTRAINT tap_lifecycle_events_to_tap_check
    CHECK (to_tap IS NULL OR to_tap BETWEEN 1 AND 99),
  CONSTRAINT tap_lifecycle_events_accuracy_check
    CHECK (accuracy IN ('exact', 'partial_start', 'unclassified')),
  CONSTRAINT tap_lifecycle_events_end_reason_check
    CHECK (end_reason IS NULL OR end_reason IN ('replace', 'clear', 'archive')),
  CONSTRAINT tap_lifecycle_events_operation_seq_unique
    UNIQUE (tenant_id, operation_id, operation_seq)
);

COMMENT ON TABLE public.tap_lifecycle_events IS
  'Append-only tap lifecycle facts captured after tenants.tap_lifecycle_started_at.';

CREATE INDEX tap_lifecycle_events_tenant_occurred_idx
  ON public.tap_lifecycle_events (tenant_id, occurred_at DESC, id DESC);

CREATE INDEX tap_lifecycle_events_session_occurred_idx
  ON public.tap_lifecycle_events (tenant_id, session_id, occurred_at, operation_seq, id)
  WHERE session_id IS NOT NULL;

CREATE INDEX tap_lifecycle_events_drink_occurred_idx
  ON public.tap_lifecycle_events (tenant_id, drink_id, occurred_at DESC, id DESC);

ALTER TABLE public.tap_lifecycle_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY tap_lifecycle_events_select_member
  ON public.tap_lifecycle_events
  FOR SELECT
  TO authenticated
  USING (public.taplist_can_view_tenant(tenant_id));

REVOKE ALL ON TABLE public.tap_lifecycle_events FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.prevent_tap_lifecycle_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'tap_lifecycle_events is append-only';
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_tap_lifecycle_event_mutation() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER tap_lifecycle_events_append_only
  BEFORE UPDATE OR DELETE ON public.tap_lifecycle_events
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_tap_lifecycle_event_mutation();

-- ---------------------------------------------------------------------------
-- 2) Immutable snapshots and internal event writer
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._tap_lifecycle_drink_name(p_drink_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    nullif(trim(d.display_name), ''),
    nullif(trim(dp.name), ''),
    nullif(trim(d.name), ''),
    '未命名酒款'
  )
  FROM public.drinks d
  LEFT JOIN public.drink_products dp ON dp.id = d.product_id
  WHERE d.id = p_drink_id;
$$;

REVOKE ALL ON FUNCTION public._tap_lifecycle_drink_name(uuid) FROM PUBLIC, anon, authenticated;

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
  v_name text;
  v_role text;
BEGIN
  IF p_actor_user_id IS NULL THEN
    RETURN '系统';
  END IF;

  SELECT nullif(trim(up.display_name), '')
  INTO v_name
  FROM public.user_profiles up
  WHERE up.user_id = p_actor_user_id;

  IF v_name IS NOT NULL THEN
    RETURN v_name;
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

  RETURN CASE v_role
    WHEN 'owner' THEN '店主'
    WHEN 'staff' THEN '员工'
    WHEN 'super_admin' THEN '平台管理员'
    ELSE '未知操作者'
  END;
END;
$$;

REVOKE ALL ON FUNCTION public._tap_lifecycle_actor_name(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._record_tap_lifecycle_event(
  p_tenant_id uuid,
  p_operation_id uuid,
  p_operation_seq smallint,
  p_action text,
  p_drink_id uuid,
  p_drink_name text,
  p_session_id uuid,
  p_from_tap integer,
  p_to_tap integer,
  p_from_status text,
  p_to_status text,
  p_occurred_at timestamptz,
  p_accuracy text,
  p_end_reason text,
  p_source text,
  p_actor_user_id uuid DEFAULT auth.uid()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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
  ) VALUES (
    p_tenant_id,
    p_operation_id,
    p_operation_seq,
    p_action,
    p_drink_id,
    coalesce(nullif(trim(p_drink_name), ''), '未命名酒款'),
    p_session_id,
    p_from_tap,
    p_to_tap,
    p_from_status,
    p_to_status,
    p_actor_user_id,
    public._tap_lifecycle_actor_name(p_actor_user_id, p_tenant_id),
    p_occurred_at,
    p_accuracy,
    p_end_reason,
    p_source
  );
END;
$$;

REVOKE ALL ON FUNCTION public._record_tap_lifecycle_event(
  uuid, uuid, smallint, text, uuid, text, uuid, integer, integer,
  text, text, timestamptz, text, text, text, uuid
) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) Baseline: current assignments are known, their actual start time is not
-- ---------------------------------------------------------------------------

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
  1,
  'baseline',
  d.id,
  coalesce(
    nullif(trim(d.display_name), ''),
    nullif(trim(dp.name), ''),
    nullif(trim(d.name), ''),
    '未命名酒款'
  ),
  gen_random_uuid(),
  NULL,
  d.public_sort_order,
  d.public_status,
  d.public_status,
  NULL,
  '系统',
  t.tap_lifecycle_started_at,
  'partial_start',
  NULL,
  'cutover'
FROM public.drinks d
JOIN public.tenants t ON t.id = d.tenant_id
LEFT JOIN public.drink_products dp ON dp.id = d.product_id
WHERE d.enabled = true
  AND d.public_sort_order BETWEEN 1 AND 99;

-- ---------------------------------------------------------------------------
-- 4) Read-only session projection
-- ---------------------------------------------------------------------------

CREATE VIEW public.tap_lifecycle_sessions_v1
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
    -- Unknown status-only or tap-to-tap writes do not change the observed
    -- session boundaries. Keep the operation itself unclassified, but do not
    -- discard an otherwise exact duration. Missing or unknown boundaries do.
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
    AS end_actor_name
FROM public.tap_lifecycle_events e
WHERE e.session_id IS NOT NULL
GROUP BY e.tenant_id, e.session_id;

REVOKE ALL ON TABLE public.tap_lifecycle_sessions_v1 FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5) Unavoidable fallback for direct/unknown drinks writes
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.normalize_disabled_drink_tap_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.enabled IS NOT TRUE THEN
    NEW.public_sort_order := NULL;
    NEW.is_public_visible := false;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.normalize_disabled_drink_tap_state() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS drinks_00_normalize_disabled_tap_state ON public.drinks;
CREATE TRIGGER drinks_00_normalize_disabled_tap_state
  BEFORE INSERT OR UPDATE OF enabled, public_sort_order, is_public_visible
  ON public.drinks
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_disabled_drink_tap_state();

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
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_tenant_id := OLD.tenant_id;
    v_drink_id := OLD.id;
  ELSE
    v_tenant_id := NEW.tenant_id;
    v_drink_id := NEW.id;
  END IF;

  IF coalesce(current_setting('app.tap_lifecycle.suppress_trigger', true), '') = 'on' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tenants t
    WHERE t.id = v_tenant_id
      AND t.tap_lifecycle_started_at IS NOT NULL
      AND v_at >= t.tap_lifecycle_started_at
  ) THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
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
  v_action := nullif(current_setting('app.tap_lifecycle.action', true), '');

  IF TG_OP = 'DELETE' THEN
    IF OLD.public_sort_order IS NULL THEN
      RETURN OLD;
    END IF;
    v_action := coalesce(v_action, 'archive');
    v_from_tap := OLD.public_sort_order;
    v_to_tap := NULL;
    v_from_status := OLD.public_status;
    v_to_status := OLD.public_status;
    v_drink_name := coalesce(nullif(trim(OLD.display_name), ''), nullif(trim(OLD.name), ''), '未命名酒款');
    v_end_reason := 'archive';
  ELSIF TG_OP = 'INSERT' THEN
    IF NEW.enabled IS NOT TRUE OR NEW.public_sort_order IS NULL THEN
      RETURN NEW;
    END IF;
    v_action := coalesce(v_action, 'assign');
    v_from_tap := NULL;
    v_to_tap := NEW.public_sort_order;
    v_from_status := NEW.public_status;
    v_to_status := NEW.public_status;
    v_drink_name := coalesce(public._tap_lifecycle_drink_name(NEW.id), nullif(trim(NEW.name), ''), '未命名酒款');
  ELSE
    v_from_tap := OLD.public_sort_order;
    v_to_tap := NEW.public_sort_order;
    v_from_status := OLD.public_status;
    v_to_status := NEW.public_status;
    v_drink_name := coalesce(public._tap_lifecycle_drink_name(NEW.id), nullif(trim(NEW.name), ''), '未命名酒款');

    IF OLD.enabled IS TRUE AND NEW.enabled IS NOT TRUE THEN
      IF OLD.public_sort_order IS NULL THEN
        RETURN NEW; -- Catalog-only archive is outside the tap lifecycle.
      END IF;
      v_action := coalesce(v_action, 'archive');
      v_to_tap := NULL;
      v_end_reason := 'archive';
    ELSIF OLD.enabled IS NOT TRUE AND NEW.enabled IS TRUE THEN
      IF NEW.public_sort_order IS NULL THEN
        RETURN NEW; -- Catalog restore is not a tap lifecycle event.
      END IF;
      v_action := coalesce(v_action, 'assign');
      v_from_tap := NULL;
    ELSIF OLD.public_sort_order IS DISTINCT FROM NEW.public_sort_order THEN
      IF OLD.public_sort_order IS NULL AND NEW.public_sort_order IS NOT NULL THEN
        v_action := coalesce(v_action, 'assign');
      ELSIF OLD.public_sort_order IS NOT NULL AND NEW.public_sort_order IS NULL THEN
        v_action := coalesce(v_action, 'clear');
        v_end_reason := CASE WHEN v_action = 'archive' THEN 'archive' ELSE 'clear' END;
      ELSE
        v_action := coalesce(v_action, 'move');
      END IF;
    ELSIF OLD.public_status IS DISTINCT FROM NEW.public_status
          AND NEW.public_status = 'sold_out'
          AND NEW.public_sort_order IS NOT NULL THEN
      v_action := coalesce(v_action, 'sold_out');
    ELSIF OLD.public_status = 'sold_out'
          AND NEW.public_status IS DISTINCT FROM 'sold_out'
          AND NEW.public_sort_order IS NOT NULL THEN
      v_action := coalesce(v_action, 'reactivate');
    ELSE
      RETURN NEW;
    END IF;
  END IF;

  IF v_action NOT IN (
    'assign', 'replace', 'clear', 'move', 'swap',
    'sold_out', 'reactivate', 'archive', 'baseline'
  ) THEN
    v_accuracy := 'unclassified';
    v_action := CASE
      WHEN v_from_tap IS NULL AND v_to_tap IS NOT NULL THEN 'assign'
      WHEN v_from_tap IS NOT NULL AND v_to_tap IS NULL THEN 'clear'
      WHEN v_from_tap IS DISTINCT FROM v_to_tap THEN 'move'
      WHEN v_to_status = 'sold_out' THEN 'sold_out'
      ELSE 'reactivate'
    END;
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
    ORDER BY s.started_at DESC NULLS LAST, s.session_id
    LIMIT 1;

    IF v_session_id IS NULL AND coalesce(v_from_tap, v_to_tap) IS NOT NULL THEN
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
    v_tenant_id,
    v_operation_id,
    v_operation_seq,
    v_action,
    v_drink_id,
    v_drink_name,
    v_session_id,
    v_from_tap,
    v_to_tap,
    v_from_status,
    v_to_status,
    v_at,
    v_accuracy,
    v_end_reason,
    v_source,
    auth.uid()
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.capture_drink_tap_lifecycle() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS drinks_zz_capture_tap_lifecycle ON public.drinks;
CREATE TRIGGER drinks_zz_capture_tap_lifecycle
  AFTER INSERT OR UPDATE OF enabled, public_sort_order, public_status, is_public_visible OR DELETE
  ON public.drinks
  FOR EACH ROW
  EXECUTE FUNCTION public.capture_drink_tap_lifecycle();

-- ---------------------------------------------------------------------------
-- 6) Canonical semantic writer for multi-row tap operations
-- ---------------------------------------------------------------------------

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
  v_accuracy text := 'exact';
  v_primary_session uuid;
  v_other_session uuid;
  v_end_reason text;
BEGIN
  IF p_action NOT IN (
    'assign', 'replace', 'clear', 'move', 'swap',
    'sold_out', 'reactivate', 'archive'
  ) THEN
    RAISE EXCEPTION 'Unsupported tap lifecycle action: %', p_action;
  END IF;

  IF p_action = 'assign' THEN
    v_primary_session := gen_random_uuid();
  ELSIF p_action = 'replace' THEN
    SELECT s.session_id
    INTO v_other_session
    FROM public.tap_lifecycle_sessions_v1 s
    WHERE s.tenant_id = p_tenant_id
      AND s.drink_id = p_other_drink_id
      AND s.ended_at IS NULL
    ORDER BY s.started_at DESC NULLS LAST, s.session_id
    LIMIT 1;

    v_primary_session := gen_random_uuid();
    IF v_other_session IS NULL THEN
      v_other_session := gen_random_uuid();
      v_accuracy := 'unclassified';
    END IF;
  ELSE
    SELECT s.session_id
    INTO v_primary_session
    FROM public.tap_lifecycle_sessions_v1 s
    WHERE s.tenant_id = p_tenant_id
      AND s.drink_id = p_drink_id
      AND s.ended_at IS NULL
    ORDER BY s.started_at DESC NULLS LAST, s.session_id
    LIMIT 1;

    IF v_primary_session IS NULL THEN
      v_primary_session := gen_random_uuid();
      v_accuracy := 'unclassified';
    END IF;

    IF p_action = 'swap' THEN
      SELECT s.session_id
      INTO v_other_session
      FROM public.tap_lifecycle_sessions_v1 s
      WHERE s.tenant_id = p_tenant_id
        AND s.drink_id = p_other_drink_id
        AND s.ended_at IS NULL
      ORDER BY s.started_at DESC NULLS LAST, s.session_id
      LIMIT 1;

      IF v_other_session IS NULL THEN
        v_other_session := gen_random_uuid();
        v_accuracy := 'unclassified';
      END IF;
    END IF;
  END IF;

  v_end_reason := CASE p_action
    WHEN 'replace' THEN 'replace'
    WHEN 'clear' THEN 'clear'
    WHEN 'archive' THEN 'archive'
    ELSE NULL
  END;

  IF p_action = 'replace' THEN
    PERFORM public._record_tap_lifecycle_event(
      p_tenant_id,
      v_operation_id,
      1,
      p_action,
      p_other_drink_id,
      p_other_drink_name,
      v_other_session,
      p_other_from_tap,
      p_other_to_tap,
      p_other_from_status,
      p_other_to_status,
      v_at,
      v_accuracy,
      v_end_reason,
      p_source,
      auth.uid()
    );

    PERFORM public._record_tap_lifecycle_event(
      p_tenant_id,
      v_operation_id,
      2,
      p_action,
      p_drink_id,
      p_drink_name,
      v_primary_session,
      p_from_tap,
      p_to_tap,
      p_from_status,
      p_to_status,
      v_at,
      v_accuracy,
      NULL,
      p_source,
      auth.uid()
    );
    RETURN;
  END IF;

  PERFORM public._record_tap_lifecycle_event(
    p_tenant_id,
    v_operation_id,
    1,
    p_action,
    p_drink_id,
    p_drink_name,
    v_primary_session,
    p_from_tap,
    p_to_tap,
    p_from_status,
    p_to_status,
    v_at,
    v_accuracy,
    v_end_reason,
    p_source,
    auth.uid()
  );

  IF p_action = 'swap' THEN
    PERFORM public._record_tap_lifecycle_event(
      p_tenant_id,
      v_operation_id,
      2,
      p_action,
      p_other_drink_id,
      p_other_drink_name,
      v_other_session,
      p_other_from_tap,
      p_other_to_tap,
      p_other_from_status,
      p_other_to_status,
      v_at,
      v_accuracy,
      NULL,
      p_source,
      auth.uid()
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public._record_canonical_tap_operation(
  uuid, text, uuid, text, integer, integer, text, text,
  uuid, text, integer, integer, text, text, text
) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7) Existing write RPCs, preserved with canonical lifecycle semantics
-- ---------------------------------------------------------------------------

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
  v_errors jsonb := '[]'::jsonb;
  v_tenant_id uuid;
  v_enabled boolean;
  v_from integer;
  v_from_status text;
  v_drink_name text;
  v_other_id uuid;
  v_other_status text;
  v_other_name text;
  v_action text;
  v_mode text;
  v_status text;
  v_visible boolean;
  v_tap integer;
  v_limit integer;
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

  SELECT
    d.enabled,
    d.public_sort_order,
    d.public_status,
    coalesce(public._tap_lifecycle_drink_name(d.id), '未命名酒款')
  INTO v_enabled, v_from, v_from_status, v_drink_name
  FROM public.drinks d
  WHERE d.id = p_drink_id
    AND d.tenant_id = v_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Drink not found';
  END IF;

  IF NOT v_enabled THEN
    RETURN jsonb_build_object(
      'ok', false,
      'errors', jsonb_build_array(jsonb_build_object(
        'field', 'enabled', 'message', '已下架商品请先恢复后再加入今晚')));
  END IF;

  v_status := coalesce(nullif(trim(p_public_status), ''), 'available');
  IF v_status NOT IN ('new', 'available', 'low', 'sold_out', 'coming_soon') THEN
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'field', 'public_status', 'message', '无效的状态值'));
  END IF;

  SELECT coalesce(t.public_price_mode, 'hide'), t.tap_slot_count
  INTO v_mode, v_limit
  FROM public.tenants t
  WHERE t.id = v_tenant_id;

  v_tap := p_public_sort_order;
  IF v_tap IS NULL OR v_tap < 1 OR v_tap > coalesce(v_limit, 99) THEN
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'field', 'public_sort_order',
      'message', format('加入今晚必须分配酒头编号（1–%s）', coalesce(v_limit, 99))));
  END IF;

  v_visible := coalesce(p_is_public_visible, false);

  IF v_visible AND v_mode = 'show' AND NOT public.drink_has_orderable_price(p_drink_id) THEN
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'field', 'price',
      'message', '门店设置为公开显示价格：请先设置有效价格规格'));
  END IF;

  IF jsonb_array_length(v_errors) > 0 THEN
    RETURN jsonb_build_object('ok', false, 'errors', v_errors);
  END IF;

  IF v_from IS DISTINCT FROM v_tap THEN
    SELECT
      d.id,
      d.public_status,
      coalesce(public._tap_lifecycle_drink_name(d.id), '未命名酒款')
    INTO v_other_id, v_other_status, v_other_name
    FROM public.drinks d
    WHERE d.tenant_id = v_tenant_id
      AND d.id <> p_drink_id
      AND d.enabled = true
      AND d.public_sort_order = v_tap
    ORDER BY d.created_at
    LIMIT 1
    FOR UPDATE;

    v_action := CASE
      WHEN v_other_id IS NOT NULL AND v_from IS NULL THEN 'replace'
      WHEN v_other_id IS NOT NULL THEN 'swap'
      WHEN v_from IS NULL THEN 'assign'
      ELSE 'move'
    END;

    -- Preserve the legacy analytics side effect without reading it back into
    -- the exact lifecycle ledger.
    IF v_action = 'replace' AND v_other_status IS DISTINCT FROM 'sold_out' THEN
      INSERT INTO public.drink_status_events (
        tenant_id, drink_id, from_status, to_status, actor_user_id
      ) VALUES (
        v_tenant_id, v_other_id, v_other_status, 'sold_out', auth.uid()
      );
    END IF;
  END IF;

  PERFORM set_config('app.tap_lifecycle.suppress_trigger', 'on', true);

  IF v_from IS DISTINCT FROM v_tap THEN
    UPDATE public.drinks
    SET public_sort_order = NULL
    WHERE id = p_drink_id;

    IF v_other_id IS NOT NULL THEN
      UPDATE public.drinks
      SET
        public_sort_order = v_from,
        is_public_visible = CASE WHEN v_from IS NULL THEN false ELSE is_public_visible END,
        public_status = CASE WHEN v_from IS NULL THEN 'available' ELSE public_status END
      WHERE id = v_other_id;
    END IF;

    UPDATE public.drinks
    SET public_sort_order = v_tap
    WHERE id = p_drink_id;
  END IF;

  UPDATE public.drinks
  SET
    is_public_visible = v_visible,
    public_status = v_status
  WHERE id = p_drink_id
    AND tenant_id = v_tenant_id;

  PERFORM set_config('app.tap_lifecycle.suppress_trigger', 'off', true);

  IF v_action IS NOT NULL THEN
    PERFORM public._record_canonical_tap_operation(
      v_tenant_id,
      v_action,
      p_drink_id,
      v_drink_name,
      v_from,
      v_tap,
      v_from_status,
      v_status,
      v_other_id,
      v_other_name,
      v_tap,
      CASE WHEN v_action = 'swap' THEN v_from ELSE NULL END,
      v_other_status,
      CASE WHEN v_action = 'replace' THEN 'available' ELSE v_other_status END,
      'set_drink_taplist_listing'
    );
  ELSIF v_from IS NOT NULL AND v_from_status IS DISTINCT FROM v_status THEN
    v_action := CASE
      WHEN v_status = 'sold_out' THEN 'sold_out'
      WHEN v_from_status = 'sold_out' THEN 'reactivate'
      ELSE NULL
    END;

    IF v_action IS NOT NULL THEN
      PERFORM public._record_canonical_tap_operation(
        v_tenant_id, v_action, p_drink_id, v_drink_name,
        v_from, v_from, v_from_status, v_status,
        NULL, NULL, NULL, NULL, NULL, NULL,
        'set_drink_taplist_listing'
      );
    END IF;
  END IF;

  UPDATE public.tenants
  SET last_menu_updated_at = now()
  WHERE id = v_tenant_id;

  RETURN jsonb_build_object(
    'ok', true,
    'drink_id', p_drink_id,
    'public_sort_order', v_tap,
    'is_public_visible', v_visible,
    'public_status', v_status,
    'swapped_with', CASE
      WHEN v_other_id IS NULL THEN NULL
      ELSE jsonb_build_object('drink_id', v_other_id, 'tap_number', v_from)
    END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_drink_taplist_listing(uuid, boolean, text, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_drink_taplist_listing(uuid, boolean, text, integer)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.remove_drink_from_tonight(p_drink_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_status text;
  v_tap integer;
  v_drink_name text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT
    d.tenant_id,
    d.public_status,
    d.public_sort_order,
    coalesce(public._tap_lifecycle_drink_name(d.id), '未命名酒款')
  INTO v_tenant_id, v_status, v_tap, v_drink_name
  FROM public.drinks d
  WHERE d.id = p_drink_id
  FOR UPDATE;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Drink not found';
  END IF;

  IF NOT public.taplist_can_view_tenant(v_tenant_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF v_tap IS NOT NULL AND v_status IS DISTINCT FROM 'sold_out' THEN
    INSERT INTO public.drink_status_events (
      tenant_id, drink_id, from_status, to_status, actor_user_id
    ) VALUES (
      v_tenant_id, p_drink_id, v_status, 'sold_out', auth.uid()
    );
  END IF;

  PERFORM set_config('app.tap_lifecycle.suppress_trigger', 'on', true);
  UPDATE public.drinks
  SET
    public_sort_order = NULL,
    is_public_visible = false,
    public_status = 'available'
  WHERE id = p_drink_id
    AND tenant_id = v_tenant_id;
  PERFORM set_config('app.tap_lifecycle.suppress_trigger', 'off', true);

  IF v_tap IS NOT NULL THEN
    PERFORM public._record_canonical_tap_operation(
      v_tenant_id, 'clear', p_drink_id, v_drink_name,
      v_tap, NULL, v_status, 'available',
      NULL, NULL, NULL, NULL, NULL, NULL,
      'remove_drink_from_tonight'
    );
  END IF;

  UPDATE public.tenants
  SET last_menu_updated_at = now()
  WHERE id = v_tenant_id;

  RETURN jsonb_build_object(
    'ok', true,
    'drink_id', p_drink_id,
    'public_sort_order', NULL,
    'is_public_visible', false,
    'public_status', 'available'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.remove_drink_from_tonight(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_drink_from_tonight(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.assign_drink_tap_number(
  p_drink_id uuid,
  p_tap_number integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_enabled boolean;
  v_from integer;
  v_status text;
  v_drink_name text;
  v_other_id uuid;
  v_other_status text;
  v_other_name text;
  v_action text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_tap_number IS NULL OR p_tap_number < 1 OR p_tap_number > 99 THEN
    RAISE EXCEPTION 'Invalid tap number';
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

  SELECT
    d.enabled,
    d.public_sort_order,
    d.public_status,
    coalesce(public._tap_lifecycle_drink_name(d.id), '未命名酒款')
  INTO v_enabled, v_from, v_status, v_drink_name
  FROM public.drinks d
  WHERE d.id = p_drink_id
    AND d.tenant_id = v_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Drink not found';
  END IF;

  IF NOT v_enabled THEN
    RAISE EXCEPTION 'Cannot assign disabled drink to a tap';
  END IF;

  IF v_from IS NOT DISTINCT FROM p_tap_number THEN
    RETURN jsonb_build_object(
      'ok', true,
      'drink_id', p_drink_id,
      'tap_number', p_tap_number,
      'swapped_with', NULL
    );
  END IF;

  SELECT
    d.id,
    d.public_status,
    coalesce(public._tap_lifecycle_drink_name(d.id), '未命名酒款')
  INTO v_other_id, v_other_status, v_other_name
  FROM public.drinks d
  WHERE d.tenant_id = v_tenant_id
    AND d.id <> p_drink_id
    AND d.enabled = true
    AND d.public_sort_order = p_tap_number
  ORDER BY d.created_at
  LIMIT 1
  FOR UPDATE;

  v_action := CASE
    WHEN v_other_id IS NOT NULL AND v_from IS NULL THEN 'replace'
    WHEN v_other_id IS NOT NULL THEN 'swap'
    WHEN v_from IS NULL THEN 'assign'
    ELSE 'move'
  END;

  PERFORM set_config('app.tap_lifecycle.suppress_trigger', 'on', true);

  UPDATE public.drinks
  SET public_sort_order = NULL
  WHERE id = p_drink_id;

  IF v_other_id IS NOT NULL THEN
    UPDATE public.drinks
    SET
      public_sort_order = v_from,
      is_public_visible = CASE WHEN v_from IS NULL THEN false ELSE is_public_visible END
    WHERE id = v_other_id;
  END IF;

  UPDATE public.drinks
  SET public_sort_order = p_tap_number
  WHERE id = p_drink_id;

  PERFORM set_config('app.tap_lifecycle.suppress_trigger', 'off', true);

  PERFORM public._record_canonical_tap_operation(
    v_tenant_id,
    v_action,
    p_drink_id,
    v_drink_name,
    v_from,
    p_tap_number,
    v_status,
    v_status,
    v_other_id,
    v_other_name,
    p_tap_number,
    CASE WHEN v_action = 'swap' THEN v_from ELSE NULL END,
    v_other_status,
    v_other_status,
    'assign_drink_tap_number'
  );

  UPDATE public.tenants
  SET last_menu_updated_at = now()
  WHERE id = v_tenant_id;

  RETURN jsonb_build_object(
    'ok', true,
    'drink_id', p_drink_id,
    'tap_number', p_tap_number,
    'swapped_with', CASE
      WHEN v_other_id IS NULL THEN NULL
      ELSE jsonb_build_object('drink_id', v_other_id, 'tap_number', v_from)
    END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.assign_drink_tap_number(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_drink_tap_number(uuid, integer) TO authenticated;

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
  v_enabled boolean;
  v_from integer;
  v_from_status text;
  v_drink_name text;
  v_tap integer;
  v_other_id uuid;
  v_other_status text;
  v_other_name text;
  v_visible boolean;
  v_status text;
  v_action text;
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

  SELECT
    d.enabled,
    d.public_sort_order,
    d.public_status,
    coalesce(public._tap_lifecycle_drink_name(d.id), '未命名酒款')
  INTO v_enabled, v_from, v_from_status, v_drink_name
  FROM public.drinks d
  WHERE d.id = p_drink_id
    AND d.tenant_id = v_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Drink not found';
  END IF;

  IF p_is_public_visible AND NOT v_enabled THEN
    RAISE EXCEPTION 'Cannot make disabled drink public on Tap List';
  END IF;

  v_tap := CASE
    WHEN p_public_sort_order IS NULL OR p_public_sort_order < 1 THEN NULL
    WHEN p_public_sort_order > 99 THEN 99
    ELSE p_public_sort_order
  END;
  v_status := coalesce(nullif(trim(p_public_status), ''), 'available');
  v_visible := CASE
    WHEN v_tap IS NULL THEN false
    ELSE coalesce(p_is_public_visible, false)
  END;

  IF v_tap IS NOT NULL AND NOT v_enabled THEN
    RAISE EXCEPTION 'Cannot assign disabled drink to a tap';
  END IF;

  IF v_from IS DISTINCT FROM v_tap AND v_tap IS NOT NULL THEN
    SELECT
      d.id,
      d.public_status,
      coalesce(public._tap_lifecycle_drink_name(d.id), '未命名酒款')
    INTO v_other_id, v_other_status, v_other_name
    FROM public.drinks d
    WHERE d.tenant_id = v_tenant_id
      AND d.id <> p_drink_id
      AND d.enabled = true
      AND d.public_sort_order = v_tap
    ORDER BY d.created_at
    LIMIT 1
    FOR UPDATE;
  END IF;

  IF v_from IS DISTINCT FROM v_tap THEN
    v_action := CASE
      WHEN v_tap IS NULL THEN 'clear'
      WHEN v_other_id IS NOT NULL AND v_from IS NULL THEN 'replace'
      WHEN v_other_id IS NOT NULL THEN 'swap'
      WHEN v_from IS NULL THEN 'assign'
      ELSE 'move'
    END;
  END IF;

  PERFORM set_config('app.tap_lifecycle.suppress_trigger', 'on', true);

  IF v_from IS DISTINCT FROM v_tap THEN
    UPDATE public.drinks
    SET public_sort_order = NULL
    WHERE id = p_drink_id;

    IF v_other_id IS NOT NULL THEN
      UPDATE public.drinks
      SET
        public_sort_order = v_from,
        is_public_visible = CASE WHEN v_from IS NULL THEN false ELSE is_public_visible END
      WHERE id = v_other_id;
    END IF;

    IF v_tap IS NOT NULL THEN
      UPDATE public.drinks
      SET public_sort_order = v_tap
      WHERE id = p_drink_id;
    END IF;
  END IF;

  UPDATE public.drinks
  SET
    image_url = nullif(trim(p_image_url), ''),
    is_public_visible = v_visible,
    public_status = v_status
  WHERE id = p_drink_id;

  PERFORM set_config('app.tap_lifecycle.suppress_trigger', 'off', true);

  IF v_action IS NOT NULL THEN
    PERFORM public._record_canonical_tap_operation(
      v_tenant_id,
      v_action,
      p_drink_id,
      v_drink_name,
      v_from,
      v_tap,
      v_from_status,
      v_status,
      v_other_id,
      v_other_name,
      v_tap,
      CASE WHEN v_action = 'swap' THEN v_from ELSE NULL END,
      v_other_status,
      v_other_status,
      'set_drink_taplist_consumer_fields'
    );
  ELSIF v_from IS NOT NULL AND v_from_status IS DISTINCT FROM v_status THEN
    v_action := CASE
      WHEN v_status = 'sold_out' THEN 'sold_out'
      WHEN v_from_status = 'sold_out' THEN 'reactivate'
      ELSE NULL
    END;

    IF v_action IS NOT NULL THEN
      PERFORM public._record_canonical_tap_operation(
        v_tenant_id, v_action, p_drink_id, v_drink_name,
        v_from, v_from, v_from_status, v_status,
        NULL, NULL, NULL, NULL, NULL, NULL,
        'set_drink_taplist_consumer_fields'
      );
    END IF;
  END IF;

  UPDATE public.tenants
  SET last_menu_updated_at = now()
  WHERE id = v_tenant_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_drink_taplist_consumer_fields(
  uuid, text, boolean, text, integer
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_drink_taplist_consumer_fields(
  uuid, text, boolean, text, integer
) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_drink_taplist_status(
  p_drink_id uuid,
  p_is_public_visible boolean,
  p_public_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_enabled boolean;
  v_tap integer;
  v_status text;
  v_operation_id uuid := gen_random_uuid();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT d.tenant_id, d.enabled, d.public_sort_order
  INTO v_tenant_id, v_enabled, v_tap
  FROM public.drinks d
  WHERE d.id = p_drink_id
  FOR UPDATE;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Drink not found';
  END IF;

  IF NOT public.taplist_can_view_tenant(v_tenant_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_is_public_visible AND NOT v_enabled THEN
    RAISE EXCEPTION 'Cannot make disabled drink public on Tap List';
  END IF;

  v_status := coalesce(nullif(trim(p_public_status), ''), 'available');
  IF v_status NOT IN ('new', 'available', 'low', 'sold_out', 'coming_soon') THEN
    RAISE EXCEPTION 'Invalid public_status';
  END IF;

  PERFORM set_config('app.tap_lifecycle.accuracy', 'exact', true);
  PERFORM set_config('app.tap_lifecycle.source', 'set_drink_taplist_status', true);
  PERFORM set_config('app.tap_lifecycle.action', '', true);
  PERFORM set_config('app.tap_lifecycle.operation_id', v_operation_id::text, true);

  UPDATE public.drinks
  SET
    is_public_visible = CASE
      WHEN v_tap IS NULL THEN false
      ELSE coalesce(p_is_public_visible, false)
    END,
    public_status = v_status
  WHERE id = p_drink_id;

  PERFORM set_config('app.tap_lifecycle.accuracy', '', true);
  PERFORM set_config('app.tap_lifecycle.source', '', true);
  PERFORM set_config('app.tap_lifecycle.action', '', true);
  PERFORM set_config('app.tap_lifecycle.operation_id', '', true);
END;
$$;

REVOKE ALL ON FUNCTION public.set_drink_taplist_status(uuid, boolean, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_drink_taplist_status(uuid, boolean, text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.archive_drink(p_drink_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_was_on_tonight boolean := false;
  v_operation_id uuid := gen_random_uuid();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT
    d.tenant_id,
    (d.is_public_visible = true AND d.public_sort_order IS NOT NULL)
  INTO v_tenant_id, v_was_on_tonight
  FROM public.drinks d
  WHERE d.id = p_drink_id
  FOR UPDATE;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Drink not found';
  END IF;

  IF NOT public.taplist_can_view_tenant(v_tenant_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  PERFORM set_config('app.tap_lifecycle.accuracy', 'exact', true);
  PERFORM set_config('app.tap_lifecycle.source', 'archive_drink', true);
  PERFORM set_config('app.tap_lifecycle.action', 'archive', true);
  PERFORM set_config('app.tap_lifecycle.operation_id', v_operation_id::text, true);

  UPDATE public.drinks
  SET
    enabled = false,
    is_public_visible = false,
    public_sort_order = NULL
  WHERE id = p_drink_id
    AND tenant_id = v_tenant_id;

  PERFORM set_config('app.tap_lifecycle.accuracy', '', true);
  PERFORM set_config('app.tap_lifecycle.source', '', true);
  PERFORM set_config('app.tap_lifecycle.action', '', true);
  PERFORM set_config('app.tap_lifecycle.operation_id', '', true);

  IF v_was_on_tonight THEN
    UPDATE public.tenants
    SET last_menu_updated_at = now()
    WHERE id = v_tenant_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'drink_id', p_drink_id,
    'enabled', false,
    'is_public_visible', false,
    'public_sort_order', NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.archive_drink(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.archive_drink(uuid) TO authenticated;

-- admin_upsert_beers imports current state, not a witnessed physical tap event.
-- Keep its public signature while marking inserted sessions as partial baselines.
ALTER FUNCTION public.admin_upsert_beers(uuid, jsonb)
  RENAME TO _admin_upsert_beers_without_lifecycle_context;

REVOKE ALL ON FUNCTION public._admin_upsert_beers_without_lifecycle_context(uuid, jsonb)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_upsert_beers(
  p_tenant_id uuid,
  p_rows jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM set_config('app.tap_lifecycle.suppress_trigger', 'off', true);
  PERFORM set_config('app.tap_lifecycle.accuracy', 'partial_start', true);
  PERFORM set_config('app.tap_lifecycle.source', 'admin_upsert_beers', true);
  PERFORM set_config('app.tap_lifecycle.action', 'baseline', true);
  PERFORM set_config('app.tap_lifecycle.operation_id', '', true);

  v_result := public._admin_upsert_beers_without_lifecycle_context(p_tenant_id, p_rows);

  PERFORM set_config('app.tap_lifecycle.accuracy', '', true);
  PERFORM set_config('app.tap_lifecycle.source', '', true);
  PERFORM set_config('app.tap_lifecycle.action', '', true);
  PERFORM set_config('app.tap_lifecycle.operation_id', '', true);
  PERFORM set_config('app.tap_lifecycle.suppress_trigger', '', true);

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_upsert_beers(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_upsert_beers(uuid, jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- 8) Read-only merchant RPCs (30-day default)
-- ---------------------------------------------------------------------------

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
    AND d.public_sort_order BETWEEN 1 AND 99;

  SELECT
    count(DISTINCT e.operation_id) FILTER (
      WHERE e.accuracy = 'exact'
        AND e.from_tap IS NULL
        AND e.to_tap IS NOT NULL
    )::integer,
    count(DISTINCT e.operation_id) FILTER (
      WHERE e.accuracy = 'exact'
        AND e.from_tap IS NOT NULL
        AND e.to_tap IS NULL
    )::integer,
    count(DISTINCT e.operation_id) FILTER (
      WHERE e.accuracy = 'exact'
        AND e.action = 'replace'
    )::integer,
    count(DISTINCT e.operation_id) FILTER (
      WHERE e.accuracy = 'exact'
        AND e.action IN ('move', 'swap')
    )::integer
  INTO v_assign_count, v_clear_count, v_replace_count, v_move_count
  FROM public.tap_lifecycle_events e
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
      (array_agg(e.actor_name_snapshot ORDER BY e.operation_seq, e.id))[1] AS actor_name,
      CASE
        WHEN bool_or(e.accuracy = 'unclassified') THEN 'unclassified'
        WHEN bool_or(e.accuracy = 'partial_start') THEN 'partial_start'
        ELSE 'exact'
      END AS accuracy,
      (array_agg(e.drink_id ORDER BY e.operation_seq, e.id))[1] AS first_drink_id,
      (array_agg(e.drink_name_snapshot ORDER BY e.operation_seq, e.id))[1] AS first_drink_name,
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
            AND s.accuracy = 'exact'
            AND s.started_at IS NOT NULL
          THEN greatest(0, floor(extract(epoch FROM (e.occurred_at - s.started_at))))::bigint
          ELSE NULL
        END
      ) AS duration_seconds,
      (array_agg(e.end_reason ORDER BY e.operation_seq, e.id)
        FILTER (WHERE e.end_reason IS NOT NULL))[1] AS end_reason
    FROM window_events e
    LEFT JOIN public.tap_lifecycle_sessions_v1 s
      ON s.tenant_id = e.tenant_id
     AND s.session_id = e.session_id
    GROUP BY e.operation_id
  ),
  shaped AS (
    SELECT
      g.operation_id,
      g.action,
      g.occurred_at,
      g.actor_name,
      CASE
        WHEN g.action = 'replace' THEN g.outgoing_tap
        ELSE g.first_from_tap
      END AS from_tap,
      CASE
        WHEN g.action = 'replace' THEN g.incoming_tap
        ELSE g.first_to_tap
      END AS to_tap,
      CASE
        WHEN g.action = 'replace' THEN g.incoming_drink_id
        ELSE g.first_drink_id
      END AS drink_id,
      CASE
        WHEN g.action = 'replace' THEN g.incoming_drink_name
        ELSE g.first_drink_name
      END AS drink_name,
      CASE
        WHEN g.action IN ('replace', 'clear', 'archive') THEN
          coalesce(g.outgoing_drink_id, g.first_drink_id)
        WHEN g.action = 'assign' THEN NULL
        WHEN g.action = 'swap' THEN g.second_drink_id
        WHEN g.action = 'move' THEN g.first_drink_id
        ELSE NULL
      END AS previous_drink_id,
      CASE
        WHEN g.action IN ('replace', 'clear', 'archive') THEN
          coalesce(g.outgoing_drink_name, g.first_drink_name)
        WHEN g.action = 'assign' THEN NULL
        WHEN g.action = 'swap' THEN g.second_drink_name
        WHEN g.action = 'move' THEN g.first_drink_name
        ELSE NULL
      END AS previous_drink_name,
      CASE
        WHEN g.action IN ('replace', 'assign') THEN
          coalesce(g.incoming_drink_id, g.first_drink_id)
        WHEN g.action = 'swap' THEN g.first_drink_id
        WHEN g.action = 'move' THEN g.first_drink_id
        ELSE NULL
      END AS next_drink_id,
      CASE
        WHEN g.action IN ('replace', 'assign') THEN
          coalesce(g.incoming_drink_name, g.first_drink_name)
        WHEN g.action = 'swap' THEN g.first_drink_name
        WHEN g.action = 'move' THEN g.first_drink_name
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
        'actor_name', s.actor_name,
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
      'move', coalesce(v_move_count, 0)
    ),
    'operations', v_operations
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_tap_lifecycle_overview(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_tap_lifecycle_overview(uuid) TO authenticated;

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

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'session_id', s.session_id,
        'drink_id', s.drink_id,
        'drink_name', s.drink_name,
        'state', CASE WHEN s.ended_at IS NULL THEN 'active' ELSE 'completed' END,
        'accuracy', s.accuracy,
        'current_tap', s.current_tap,
        'started_at', s.started_at,
        'ended_at', s.ended_at,
        'duration_seconds', CASE
          WHEN s.accuracy <> 'exact' OR s.started_at IS NULL THEN NULL
          ELSE greatest(
            0,
            floor(extract(epoch FROM (coalesce(s.ended_at, statement_timestamp()) - s.started_at)))::bigint
          )
        END,
        'end_reason', s.end_reason,
        'actor_name', CASE
          WHEN s.ended_at IS NULL THEN s.start_actor_name
          ELSE coalesce(s.end_actor_name, s.start_actor_name)
        END
      )
      ORDER BY
        CASE WHEN s.ended_at IS NULL THEN s.started_at ELSE s.ended_at END DESC NULLS LAST,
        s.session_id
    ),
    '[]'::jsonb
  )
  INTO v_items
  FROM public.tap_lifecycle_sessions_v1 s
  WHERE s.tenant_id = p_tenant_id
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
    );

  RETURN jsonb_build_object(
    'ok', true,
    'data_since', v_data_since,
    'status', v_status,
    'items', v_items
  );
END;
$$;

REVOKE ALL ON FUNCTION public.list_tap_lifecycle_sessions(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_tap_lifecycle_sessions(uuid, text) TO authenticated;

-- Related compatibility RPCs keep their existing implementations, but their
-- execute surface is made explicit alongside the rewritten entry points.
REVOKE ALL ON FUNCTION public.restore_drink(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_drink(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.upsert_drink_product(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_drink_product(uuid, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.upsert_taplist_drink(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_taplist_drink(uuid, jsonb) TO authenticated;
