-- Private consumer identities for the No Menu tap-list app.
-- POS display_name/email/mobile fields keep their existing semantics.

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS consumer_username text,
  ADD COLUMN IF NOT EXISTS consumer_username_normalized text,
  ADD COLUMN IF NOT EXISTS consumer_username_is_default boolean NOT NULL DEFAULT false;

ALTER TABLE public.user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_consumer_username_normalized_check;
ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_consumer_username_normalized_check CHECK (
    (consumer_username IS NULL AND consumer_username_normalized IS NULL)
    OR (
      consumer_username IS NOT NULL
      AND consumer_username_normalized = lower(trim(consumer_username))
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS user_profiles_consumer_username_unique
  ON public.user_profiles (consumer_username_normalized)
  WHERE consumer_username_normalized IS NOT NULL;

CREATE OR REPLACE FUNCTION public._consumer_username_reserved(p_normalized text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT coalesce(p_normalized, '') = ANY (ARRAY[
    'admin', 'administrator', 'official', 'support', 'system', 'nomenu',
    '官方', '客服', '管理员', '系统'
  ]::text[]);
$$;

CREATE OR REPLACE FUNCTION public._generate_consumer_username()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = public, extensions
AS $$
DECLARE
  v_candidate text;
BEGIN
  FOR v_attempt IN 1..20 LOOP
    v_candidate := 'NoMenuist_' || upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 6));
    IF NOT EXISTS (
      SELECT 1
      FROM public.user_profiles p
      WHERE p.consumer_username_normalized = lower(v_candidate)
    ) THEN
      RETURN v_candidate;
    END IF;
  END LOOP;
  RAISE EXCEPTION USING MESSAGE = 'USERNAME_GENERATION_FAILED', ERRCODE = 'P0001';
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_consumer_profile()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_username text;
  v_is_default boolean;
  v_attempt integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'NOT_AUTHENTICATED', ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.user_profiles (user_id, consumer_username, consumer_username_normalized, consumer_username_is_default)
  VALUES (v_uid, NULL, NULL, false)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT p.consumer_username, p.consumer_username_is_default
  INTO v_username, v_is_default
  FROM public.user_profiles p
  WHERE p.user_id = v_uid
  FOR UPDATE;

  IF nullif(trim(v_username), '') IS NULL THEN
    FOR v_attempt IN 1..20 LOOP
      BEGIN
        v_username := public._generate_consumer_username();
        UPDATE public.user_profiles
        SET consumer_username = v_username,
            consumer_username_normalized = lower(v_username),
            consumer_username_is_default = true,
            updated_at = now()
        WHERE user_id = v_uid;
        v_is_default := true;
        EXIT;
      EXCEPTION
        WHEN unique_violation THEN
          IF v_attempt = 20 THEN
            RAISE EXCEPTION USING MESSAGE = 'USERNAME_GENERATION_FAILED', ERRCODE = 'P0001';
          END IF;
      END;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'consumer_username', v_username,
    'is_default', v_is_default
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.update_my_consumer_username(p_username text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_username text := trim(coalesce(p_username, ''));
  v_normalized text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'NOT_AUTHENTICATED', ERRCODE = 'P0001';
  END IF;

  IF char_length(v_username) < 2 OR char_length(v_username) > 24
     OR v_username !~ U&'^[A-Za-z0-9_\4E00-\9FFF]+$' THEN
    RAISE EXCEPTION USING MESSAGE = 'USERNAME_INVALID', ERRCODE = 'P0001';
  END IF;

  v_normalized := lower(v_username);
  IF public._consumer_username_reserved(v_normalized) THEN
    RAISE EXCEPTION USING MESSAGE = 'USERNAME_RESERVED', ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.user_profiles (
    user_id, consumer_username, consumer_username_normalized,
    consumer_username_is_default, updated_at
  ) VALUES (
    v_uid, v_username, v_normalized, false, now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    consumer_username = excluded.consumer_username,
    consumer_username_normalized = excluded.consumer_username_normalized,
    consumer_username_is_default = false,
    updated_at = now();

  RETURN jsonb_build_object(
    'ok', true,
    'consumer_username', v_username,
    'is_default', false
  );
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION USING MESSAGE = 'USERNAME_TAKEN', ERRCODE = 'P0001';
END;
$$;

REVOKE ALL ON FUNCTION public._consumer_username_reserved(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._generate_consumer_username() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_consumer_profile() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_my_consumer_username(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_consumer_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_my_consumer_username(text) TO authenticated;
