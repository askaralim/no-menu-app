-- WeChat mini-program consumer identities and audited manual account merging.
-- Existing Taplist consumer tables continue to use auth.users.id directly.

CREATE TABLE public.consumer_wechat_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id text NOT NULL,
  openid text NOT NULL,
  unionid text,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT consumer_wechat_identities_app_openid_unique UNIQUE (app_id, openid),
  CONSTRAINT consumer_wechat_identities_app_user_unique UNIQUE (app_id, user_id),
  CONSTRAINT consumer_wechat_identities_app_id_check CHECK (length(trim(app_id)) BETWEEN 3 AND 64),
  CONSTRAINT consumer_wechat_identities_openid_check CHECK (length(trim(openid)) BETWEEN 6 AND 128)
);

CREATE INDEX consumer_wechat_identities_unionid_idx
  ON public.consumer_wechat_identities (unionid)
  WHERE unionid IS NOT NULL;
CREATE INDEX consumer_wechat_identities_user_idx
  ON public.consumer_wechat_identities (user_id);

ALTER TABLE public.consumer_wechat_identities ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.consumer_wechat_identities FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.consumer_wechat_identities TO service_role;

CREATE TABLE public.consumer_account_merge_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL UNIQUE,
  source_user_id uuid NOT NULL,
  target_user_id uuid NOT NULL,
  keep_username text NOT NULL CHECK (keep_username IN ('source', 'target')),
  source_username text,
  target_username_before text,
  final_username text,
  merged_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  cleanup_status text NOT NULL DEFAULT 'pending' CHECK (cleanup_status IN ('pending', 'completed', 'failed')),
  cleanup_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX consumer_account_merge_audits_users_idx
  ON public.consumer_account_merge_audits (source_user_id, target_user_id, created_at DESC);

ALTER TABLE public.consumer_account_merge_audits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.consumer_account_merge_audits FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.consumer_account_merge_audits TO service_role;

ALTER TABLE public.support_requests
  DROP CONSTRAINT IF EXISTS support_requests_request_type_check;
ALTER TABLE public.support_requests
  ADD CONSTRAINT support_requests_request_type_check CHECK (request_type IN (
    'bar_onboarding', 'product_support', 'privacy', 'account_deletion',
    'apple_account_link', 'other'
  ));

ALTER TABLE public.support_requests
  DROP CONSTRAINT IF EXISTS support_requests_source_check;
ALTER TABLE public.support_requests
  ADD CONSTRAINT support_requests_source_check CHECK (source IN (
    'tonight_app', 'taplist_web', 'miniprogram', 'platform_admin'
  ));

CREATE OR REPLACE FUNCTION public.admin_merge_consumer_accounts(
  p_source_user_id uuid,
  p_target_user_id uuid,
  p_keep_username text,
  p_operation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_source_profile public.user_profiles%ROWTYPE;
  v_target_profile public.user_profiles%ROWTYPE;
  v_source_light public.user_drink_lights%ROWTYPE;
  v_target_light public.user_drink_lights%ROWTYPE;
  v_existing_audit public.consumer_account_merge_audits%ROWTYPE;
  v_final_username text;
  v_final_normalized text;
  v_final_is_default boolean := false;
  v_follow_count integer := 0;
  v_light_count integer := 0;
  v_venue_count integer := 0;
  v_identity_count integer := 0;
  v_device_count integer := 0;
  v_support_count integer := 0;
  v_delivery_count integer := 0;
  v_counts jsonb;
BEGIN
  IF p_source_user_id IS NULL OR p_target_user_id IS NULL OR p_source_user_id = p_target_user_id THEN
    RAISE EXCEPTION USING MESSAGE = 'INVALID_MERGE_USERS', ERRCODE = 'P0001';
  END IF;
  IF p_keep_username NOT IN ('source', 'target') THEN
    RAISE EXCEPTION USING MESSAGE = 'INVALID_USERNAME_SELECTION', ERRCODE = 'P0001';
  END IF;
  IF p_operation_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'OPERATION_ID_REQUIRED', ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_existing_audit
  FROM public.consumer_account_merge_audits
  WHERE operation_id = p_operation_id;
  IF v_existing_audit.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'audit_id', v_existing_audit.id,
      'target_user_id', v_existing_audit.target_user_id,
      'final_username', v_existing_audit.final_username,
      'merged_counts', v_existing_audit.merged_counts
    );
  END IF;

  -- Lock both account rows in a stable order so concurrent operator retries
  -- cannot deadlock by acquiring the same pair in the opposite order.
  PERFORM 1
  FROM auth.users
  WHERE id IN (p_source_user_id, p_target_user_id)
  ORDER BY id
  FOR UPDATE;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_source_user_id) THEN
    RAISE EXCEPTION USING MESSAGE = 'SOURCE_USER_NOT_FOUND', ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_target_user_id) THEN
    RAISE EXCEPTION USING MESSAGE = 'TARGET_USER_NOT_FOUND', ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.consumer_wechat_identities WHERE user_id = p_source_user_id
  ) THEN
    RAISE EXCEPTION USING MESSAGE = 'SOURCE_WECHAT_IDENTITY_REQUIRED', ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM auth.identities WHERE user_id = p_target_user_id AND provider = 'apple'
  ) THEN
    RAISE EXCEPTION USING MESSAGE = 'TARGET_APPLE_IDENTITY_REQUIRED', ERRCODE = 'P0001';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = p_source_user_id
  ) THEN
    RAISE EXCEPTION USING MESSAGE = 'SOURCE_HAS_MERCHANT_ACCESS', ERRCODE = 'P0001';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.consumer_wechat_identities source_identity
    JOIN public.consumer_wechat_identities target_identity
      ON target_identity.app_id = source_identity.app_id
     AND target_identity.user_id = p_target_user_id
     AND target_identity.id <> source_identity.id
    WHERE source_identity.user_id = p_source_user_id
  ) THEN
    RAISE EXCEPTION USING MESSAGE = 'TARGET_WECHAT_ALREADY_BOUND', ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.user_profiles (user_id)
  VALUES (p_source_user_id), (p_target_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO v_source_profile
  FROM public.user_profiles WHERE user_id = p_source_user_id FOR UPDATE;
  SELECT * INTO v_target_profile
  FROM public.user_profiles WHERE user_id = p_target_user_id FOR UPDATE;

  IF p_keep_username = 'source' AND v_source_profile.consumer_username IS NOT NULL THEN
    v_final_username := v_source_profile.consumer_username;
    v_final_normalized := v_source_profile.consumer_username_normalized;
    v_final_is_default := v_source_profile.consumer_username_is_default;

    UPDATE public.user_profiles
    SET consumer_username = NULL,
        consumer_username_normalized = NULL,
        consumer_username_is_default = false,
        updated_at = now()
    WHERE user_id IN (p_source_user_id, p_target_user_id);

    UPDATE public.user_profiles
    SET consumer_username = v_final_username,
        consumer_username_normalized = v_final_normalized,
        consumer_username_is_default = v_final_is_default,
        updated_at = now()
    WHERE user_id = p_target_user_id;
  ELSE
    v_final_username := coalesce(v_target_profile.consumer_username, v_source_profile.consumer_username);
    v_final_normalized := coalesce(v_target_profile.consumer_username_normalized, v_source_profile.consumer_username_normalized);
    v_final_is_default := CASE
      WHEN v_target_profile.consumer_username IS NOT NULL THEN v_target_profile.consumer_username_is_default
      ELSE v_source_profile.consumer_username_is_default
    END;

    IF v_target_profile.consumer_username IS NULL AND v_source_profile.consumer_username IS NOT NULL THEN
      UPDATE public.user_profiles
      SET consumer_username = NULL,
          consumer_username_normalized = NULL,
          consumer_username_is_default = false,
          updated_at = now()
      WHERE user_id = p_source_user_id;

      UPDATE public.user_profiles
      SET consumer_username = v_final_username,
          consumer_username_normalized = v_final_normalized,
          consumer_username_is_default = v_final_is_default,
          updated_at = now()
      WHERE user_id = p_target_user_id;
    END IF;
  END IF;

  SELECT count(*)::integer INTO v_follow_count
  FROM public.user_bar_follows WHERE user_id = p_source_user_id;

  INSERT INTO public.user_bar_follows (
    user_id, tenant_id, notify_new_taps, created_at, updated_at
  )
  SELECT p_target_user_id, tenant_id, notify_new_taps, created_at, updated_at
  FROM public.user_bar_follows
  WHERE user_id = p_source_user_id
  ON CONFLICT (user_id, tenant_id) DO UPDATE SET
    created_at = least(public.user_bar_follows.created_at, excluded.created_at),
    updated_at = greatest(public.user_bar_follows.updated_at, excluded.updated_at);

  DELETE FROM public.user_bar_follows WHERE user_id = p_source_user_id;

  SELECT count(*)::integer INTO v_light_count
  FROM public.user_drink_lights WHERE user_id = p_source_user_id;
  SELECT count(*)::integer INTO v_venue_count
  FROM public.user_drink_venues WHERE user_id = p_source_user_id;

  FOR v_source_light IN
    SELECT * FROM public.user_drink_lights
    WHERE user_id = p_source_user_id
    ORDER BY created_at, id
    FOR UPDATE
  LOOP
    v_target_light := NULL;
    IF v_source_light.product_id IS NOT NULL THEN
      SELECT * INTO v_target_light
      FROM public.user_drink_lights
      WHERE user_id = p_target_user_id AND product_id = v_source_light.product_id
      LIMIT 1 FOR UPDATE;
    ELSE
      SELECT * INTO v_target_light
      FROM public.user_drink_lights
      WHERE user_id = p_target_user_id
        AND product_id IS NULL
        AND provisional_drink_id = v_source_light.provisional_drink_id
      LIMIT 1 FOR UPDATE;
    END IF;

    IF v_target_light.id IS NULL THEN
      UPDATE public.user_drink_venues
      SET user_id = p_target_user_id
      WHERE light_id = v_source_light.id;
      UPDATE public.user_drink_lights
      SET user_id = p_target_user_id, updated_at = now()
      WHERE id = v_source_light.id;
    ELSE
      INSERT INTO public.user_drink_venues (
        light_id, user_id, tenant_id, source_drink_id, first_drank_at, created_at
      )
      SELECT
        v_target_light.id,
        p_target_user_id,
        tenant_id,
        source_drink_id,
        first_drank_at,
        created_at
      FROM public.user_drink_venues
      WHERE light_id = v_source_light.id
      ON CONFLICT (light_id, tenant_id) DO UPDATE SET
        source_drink_id = coalesce(public.user_drink_venues.source_drink_id, excluded.source_drink_id),
        first_drank_at = least(public.user_drink_venues.first_drank_at, excluded.first_drank_at),
        created_at = least(public.user_drink_venues.created_at, excluded.created_at);

      UPDATE public.user_drink_lights
      SET first_lit_at = least(first_lit_at, v_source_light.first_lit_at),
          last_activity_at = greatest(last_activity_at, v_source_light.last_activity_at),
          created_at = least(created_at, v_source_light.created_at),
          updated_at = now()
      WHERE id = v_target_light.id;

      DELETE FROM public.user_drink_lights WHERE id = v_source_light.id;
    END IF;
  END LOOP;

  UPDATE public.user_push_devices
  SET user_id = p_target_user_id, updated_at = now()
  WHERE user_id = p_source_user_id;
  GET DIAGNOSTICS v_device_count = ROW_COUNT;

  UPDATE public.new_tap_push_deliveries
  SET user_id = p_target_user_id, updated_at = now()
  WHERE user_id = p_source_user_id;
  GET DIAGNOSTICS v_delivery_count = ROW_COUNT;

  -- Keep the manual Apple-link request attached to the surviving account.
  UPDATE public.support_requests
  SET created_by_user_id = p_target_user_id, updated_at = now()
  WHERE created_by_user_id = p_source_user_id
    AND request_type = 'apple_account_link';
  GET DIAGNOSTICS v_support_count = ROW_COUNT;

  UPDATE public.consumer_wechat_identities
  SET user_id = p_target_user_id,
      updated_at = now()
  WHERE user_id = p_source_user_id;
  GET DIAGNOSTICS v_identity_count = ROW_COUNT;

  v_counts := jsonb_build_object(
    'follows', v_follow_count,
    'drinks', v_light_count,
    'venues', v_venue_count,
    'wechat_identities', v_identity_count,
    'push_devices', v_device_count,
    'push_deliveries', v_delivery_count,
    'support_requests', v_support_count
  );

  INSERT INTO public.consumer_account_merge_audits (
    operation_id,
    source_user_id,
    target_user_id,
    keep_username,
    source_username,
    target_username_before,
    final_username,
    merged_counts
  ) VALUES (
    p_operation_id,
    p_source_user_id,
    p_target_user_id,
    p_keep_username,
    v_source_profile.consumer_username,
    v_target_profile.consumer_username,
    v_final_username,
    v_counts
  )
  RETURNING * INTO v_existing_audit;

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'audit_id', v_existing_audit.id,
    'target_user_id', p_target_user_id,
    'final_username', v_final_username,
    'merged_counts', v_counts
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_merge_consumer_accounts(uuid, uuid, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_merge_consumer_accounts(uuid, uuid, text, uuid)
  TO service_role;
