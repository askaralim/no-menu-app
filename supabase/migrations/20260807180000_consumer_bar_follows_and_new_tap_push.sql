-- Consumer bar follows and reliable new-tap push outbox.
-- Private follow/device data is isolated by auth.uid(); push outbox tables are
-- service-role only. Delivery remains disabled until explicitly activated.

CREATE TABLE public.user_bar_follows (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  notify_new_taps boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, tenant_id)
);

CREATE INDEX user_bar_follows_tenant_notify_idx
  ON public.user_bar_follows (tenant_id, created_at)
  WHERE notify_new_taps = true;

ALTER TABLE public.user_bar_follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_bar_follows_own_rows
  ON public.user_bar_follows
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.user_push_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expo_push_token text NOT NULL UNIQUE,
  platform text NOT NULL DEFAULT 'ios' CHECK (platform = 'ios'),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_push_devices_expo_token_check CHECK (
    expo_push_token ~ '^(Expo|Exponent)PushToken[[][A-Za-z0-9_-]+[]]$'
  )
);

CREATE INDEX user_push_devices_user_enabled_idx
  ON public.user_push_devices (user_id, enabled);

ALTER TABLE public.user_push_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_push_devices_own_rows
  ON public.user_push_devices
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.new_tap_push_settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  enabled boolean NOT NULL DEFAULT false,
  activated_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT new_tap_push_settings_activation_check CHECK (NOT enabled OR activated_at IS NOT NULL)
);

INSERT INTO public.new_tap_push_settings (singleton, enabled)
VALUES (true, false);

ALTER TABLE public.new_tap_push_settings ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.new_tap_notification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  drink_id uuid NOT NULL REFERENCES public.drinks(id) ON DELETE CASCADE,
  detected_at timestamptz NOT NULL DEFAULT now(),
  ready_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'cancelled')),
  batch_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (drink_id)
);

CREATE INDEX new_tap_notification_events_ready_idx
  ON public.new_tap_notification_events (status, ready_at, tenant_id);

ALTER TABLE public.new_tap_notification_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.new_tap_push_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'sent', 'partial', 'failed', 'cancelled')),
  event_count integer NOT NULL DEFAULT 0 CHECK (event_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE public.new_tap_push_batches ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.new_tap_notification_events
  ADD CONSTRAINT new_tap_notification_events_batch_fk
  FOREIGN KEY (batch_id) REFERENCES public.new_tap_push_batches(id) ON DELETE SET NULL;

CREATE TABLE public.new_tap_push_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.new_tap_push_batches(id) ON DELETE CASCADE,
  device_id uuid REFERENCES public.user_push_devices(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  expo_push_token text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sending', 'ticketed', 'delivered', 'retry', 'failed', 'device_unregistered')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  expo_ticket_id text,
  error_code text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (batch_id, device_id)
);

CREATE INDEX new_tap_push_deliveries_retry_idx
  ON public.new_tap_push_deliveries (status, next_attempt_at);

CREATE INDEX new_tap_push_deliveries_receipt_idx
  ON public.new_tap_push_deliveries (status, updated_at)
  WHERE status = 'ticketed';

ALTER TABLE public.new_tap_push_deliveries ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.new_tap_push_settings FROM anon, authenticated;
REVOKE ALL ON public.new_tap_notification_events FROM anon, authenticated;
REVOKE ALL ON public.new_tap_push_batches FROM anon, authenticated;
REVOKE ALL ON public.new_tap_push_deliveries FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_my_bar_follow_state(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_follow public.user_bar_follows%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_follow
  FROM public.user_bar_follows
  WHERE user_id = auth.uid() AND tenant_id = p_tenant_id;

  RETURN jsonb_build_object(
    'ok', true,
    'followed', v_follow.user_id IS NOT NULL,
    'notify_new_taps', coalesce(v_follow.notify_new_taps, false),
    'followed_at', v_follow.created_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.follow_bar(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_public boolean;
  v_follow public.user_bar_follows%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT t.status = 'active' AND t.is_public_visible
  INTO v_public
  FROM public.tenants t
  WHERE t.id = p_tenant_id;

  IF coalesce(v_public, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Bar is not public';
  END IF;

  INSERT INTO public.user_bar_follows (user_id, tenant_id)
  VALUES (auth.uid(), p_tenant_id)
  ON CONFLICT (user_id, tenant_id) DO UPDATE
  SET updated_at = now()
  RETURNING * INTO v_follow;

  RETURN jsonb_build_object(
    'ok', true,
    'followed', true,
    'notify_new_taps', v_follow.notify_new_taps,
    'followed_at', v_follow.created_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.unfollow_bar(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  DELETE FROM public.user_bar_follows
  WHERE user_id = auth.uid() AND tenant_id = p_tenant_id;
  RETURN jsonb_build_object('ok', true, 'followed', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_bar_new_tap_notifications(
  p_tenant_id uuid,
  p_enabled boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.user_bar_follows
  SET notify_new_taps = coalesce(p_enabled, false), updated_at = now()
  WHERE user_id = auth.uid() AND tenant_id = p_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bar is not followed';
  END IF;

  RETURN jsonb_build_object('ok', true, 'notify_new_taps', coalesce(p_enabled, false));
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_followed_bars()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'results', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'tenant_id', t.id,
        'tenant_slug', t.slug,
        'tenant_display_name', coalesce(nullif(trim(t.display_name), ''), t.name),
        'tenant_district', t.district,
        'cover_image_url', t.cover_image_url,
        'notify_new_taps', f.notify_new_taps,
        'followed_at', f.created_at
      ) ORDER BY f.created_at DESC)
      FROM public.user_bar_follows f
      JOIN public.tenants t ON t.id = f.tenant_id
      WHERE f.user_id = auth.uid()
        AND t.status = 'active'
        AND t.is_public_visible = true
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.register_my_push_device(p_expo_push_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token text := trim(coalesce(p_expo_push_token, ''));
  v_device_id uuid;
  v_existing_user_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF v_token !~ '^(Expo|Exponent)PushToken[[][A-Za-z0-9_-]+[]]$' THEN
    RAISE EXCEPTION 'Invalid Expo push token';
  END IF;

  SELECT user_id INTO v_existing_user_id
  FROM public.user_push_devices
  WHERE expo_push_token = v_token
  FOR UPDATE;
  IF v_existing_user_id IS NOT NULL AND v_existing_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Push token belongs to another account';
  END IF;

  INSERT INTO public.user_push_devices (
    user_id, expo_push_token, platform, enabled, updated_at, last_seen_at
  ) VALUES (
    auth.uid(), v_token, 'ios', true, now(), now()
  )
  ON CONFLICT (expo_push_token) DO UPDATE
  SET user_id = auth.uid(), platform = 'ios', enabled = true,
      updated_at = now(), last_seen_at = now()
  RETURNING id INTO v_device_id;

  RETURN jsonb_build_object('ok', true, 'device_id', v_device_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.disable_my_push_device(p_expo_push_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  UPDATE public.user_push_devices
  SET enabled = false, updated_at = now()
  WHERE user_id = auth.uid() AND expo_push_token = trim(coalesce(p_expo_push_token, ''));
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_bar_follow_state(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.follow_bar(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.unfollow_bar(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_bar_new_tap_notifications(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_followed_bars() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.register_my_push_device(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.disable_my_push_device(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_bar_follow_state(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.follow_bar(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unfollow_bar(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_bar_new_tap_notifications(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_followed_bars() TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_my_push_device(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.disable_my_push_device(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.enqueue_new_tap_if_eligible(p_drink_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled boolean;
  v_activated_at timestamptz;
  v_tenant_id uuid;
  v_event_id uuid;
BEGIN
  SELECT enabled, activated_at INTO v_enabled, v_activated_at
  FROM public.new_tap_push_settings WHERE singleton = true;
  IF NOT coalesce(v_enabled, false) OR v_activated_at IS NULL THEN RETURN NULL; END IF;

  SELECT d.tenant_id INTO v_tenant_id
  FROM public.drinks d
  JOIN public.categories c ON c.id = d.category_id AND c.tenant_id = d.tenant_id
  JOIN public.tenants t ON t.id = d.tenant_id
  WHERE d.id = p_drink_id
    AND d.enabled = true
    AND d.is_public_visible = true
    AND d.public_status = 'new'
    AND d.public_status_changed_at >= v_activated_at
    AND c.enabled = true
    AND c.is_public_visible = true
    AND t.status = 'active'
    AND t.is_public_visible = true;

  IF v_tenant_id IS NULL THEN RETURN NULL; END IF;

  INSERT INTO public.new_tap_notification_events (tenant_id, drink_id)
  VALUES (v_tenant_id, p_drink_id)
  ON CONFLICT (drink_id) DO NOTHING
  RETURNING id INTO v_event_id;
  RETURN v_event_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_enqueue_new_tap_from_drink()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.enqueue_new_tap_if_eligible(NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enqueue_new_tap_from_drink
  AFTER INSERT OR UPDATE OF enabled, is_public_visible, public_status, category_id
  ON public.drinks
  FOR EACH ROW EXECUTE FUNCTION public.trg_enqueue_new_tap_from_drink();

CREATE OR REPLACE FUNCTION public.trg_enqueue_new_taps_from_category()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_drink_id uuid;
BEGIN
  IF NEW.enabled = true AND NEW.is_public_visible = true THEN
    FOR v_drink_id IN SELECT id FROM public.drinks WHERE category_id = NEW.id LOOP
      PERFORM public.enqueue_new_tap_if_eligible(v_drink_id);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enqueue_new_taps_from_category
  AFTER UPDATE OF enabled, is_public_visible ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.trg_enqueue_new_taps_from_category();

CREATE OR REPLACE FUNCTION public.trg_enqueue_new_taps_from_tenant()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_drink_id uuid;
BEGIN
  IF NEW.status = 'active' AND NEW.is_public_visible = true THEN
    FOR v_drink_id IN SELECT id FROM public.drinks WHERE tenant_id = NEW.id LOOP
      PERFORM public.enqueue_new_tap_if_eligible(v_drink_id);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enqueue_new_taps_from_tenant
  AFTER UPDATE OF status, is_public_visible ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.trg_enqueue_new_taps_from_tenant();

CREATE OR REPLACE FUNCTION public.backfill_missing_new_tap_events()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_drink_id uuid; v_count integer := 0;
BEGIN
  FOR v_drink_id IN
    SELECT d.id
    FROM public.drinks d
    JOIN public.categories c ON c.id = d.category_id AND c.tenant_id = d.tenant_id
    JOIN public.tenants t ON t.id = d.tenant_id
    JOIN public.new_tap_push_settings s ON s.singleton = true
    LEFT JOIN public.new_tap_notification_events e ON e.drink_id = d.id
    WHERE s.enabled = true AND s.activated_at IS NOT NULL
      AND d.enabled = true AND d.is_public_visible = true AND d.public_status = 'new'
      AND d.public_status_changed_at >= s.activated_at
      AND c.enabled = true AND c.is_public_visible = true
      AND t.status = 'active' AND t.is_public_visible = true
      AND e.id IS NULL
  LOOP
    IF public.enqueue_new_tap_if_eligible(v_drink_id) IS NOT NULL THEN v_count := v_count + 1; END IF;
  END LOOP;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_new_tap_if_eligible(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.backfill_missing_new_tap_events() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_new_tap_if_eligible(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.backfill_missing_new_tap_events() TO service_role;

CREATE OR REPLACE FUNCTION public.claim_ready_new_tap_batch()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_batch_id uuid;
  v_event_count integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.new_tap_push_settings
    WHERE singleton = true AND enabled = true AND activated_at IS NOT NULL
  ) THEN
    RETURN jsonb_build_object('ok', true, 'batch_id', NULL);
  END IF;

  -- Recover batches claimed by an invocation that stopped before creating any
  -- delivery records. Once deliveries exist, their own retry state owns recovery.
  UPDATE public.new_tap_notification_events e
  SET status = 'pending', batch_id = NULL, ready_at = now(), updated_at = now()
  FROM public.new_tap_push_batches b
  WHERE e.batch_id = b.id
    AND e.status = 'processing'
    AND b.status = 'processing'
    AND b.created_at < now() - interval '15 minutes'
    AND NOT EXISTS (
      SELECT 1 FROM public.new_tap_push_deliveries d WHERE d.batch_id = b.id
    );

  UPDATE public.new_tap_push_batches b
  SET status = 'failed', completed_at = now()
  WHERE b.status = 'processing'
    AND b.created_at < now() - interval '15 minutes'
    AND NOT EXISTS (
      SELECT 1 FROM public.new_tap_notification_events e WHERE e.batch_id = b.id
    );

  SELECT e.tenant_id INTO v_tenant_id
  FROM public.new_tap_notification_events e
  WHERE e.status = 'pending' AND e.ready_at <= now()
  ORDER BY e.ready_at, e.tenant_id
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'batch_id', NULL);
  END IF;

  -- Serialize claims per tenant. A concurrent dispatcher may have locked a
  -- different event for the same tenant before the first claim committed.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_tenant_id::text, 0));
  IF NOT EXISTS (
    SELECT 1 FROM public.new_tap_notification_events
    WHERE tenant_id = v_tenant_id AND status = 'pending' AND ready_at <= now()
  ) THEN
    RETURN jsonb_build_object('ok', true, 'batch_id', NULL);
  END IF;

  INSERT INTO public.new_tap_push_batches (tenant_id)
  VALUES (v_tenant_id)
  RETURNING id INTO v_batch_id;

  UPDATE public.new_tap_notification_events
  SET status = 'processing', batch_id = v_batch_id, updated_at = now()
  WHERE tenant_id = v_tenant_id
    AND status = 'pending'
    AND ready_at <= now();
  GET DIAGNOSTICS v_event_count = ROW_COUNT;

  UPDATE public.new_tap_push_batches
  SET event_count = v_event_count
  WHERE id = v_batch_id;

  RETURN jsonb_build_object(
    'ok', true,
    'batch_id', v_batch_id,
    'tenant_id', v_tenant_id,
    'event_count', v_event_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_ready_new_tap_batch() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_ready_new_tap_batch() TO service_role;

CREATE OR REPLACE FUNCTION public.set_new_tap_push_enabled(p_enabled boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_enabled boolean := coalesce(p_enabled, false); v_activated_at timestamptz;
BEGIN
  UPDATE public.new_tap_push_settings
  SET
    enabled = v_enabled,
    activated_at = CASE
      WHEN v_enabled AND enabled = false THEN now()
      ELSE activated_at
    END,
    updated_at = now()
  WHERE singleton = true
  RETURNING activated_at INTO v_activated_at;

  RETURN jsonb_build_object('ok', true, 'enabled', v_enabled, 'activated_at', v_activated_at);
END;
$$;

REVOKE ALL ON FUNCTION public.set_new_tap_push_enabled(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_new_tap_push_enabled(boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_pending_push_deliveries(p_limit integer DEFAULT 500)
RETURNS SETOF public.new_tap_push_deliveries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.new_tap_push_deliveries
  SET status = 'retry', next_attempt_at = now(), updated_at = now()
  WHERE status = 'sending' AND updated_at < now() - interval '15 minutes';

  RETURN QUERY
  UPDATE public.new_tap_push_deliveries d
  SET status = 'sending', updated_at = now()
  WHERE d.id IN (
    SELECT candidate.id
    FROM public.new_tap_push_deliveries candidate
    WHERE candidate.status IN ('pending', 'retry')
      AND candidate.next_attempt_at <= now()
    ORDER BY candidate.created_at
    FOR UPDATE SKIP LOCKED
    LIMIT greatest(1, least(coalesce(p_limit, 500), 500))
  )
  RETURNING d.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_pending_push_deliveries(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_pending_push_deliveries(integer) TO service_role;
