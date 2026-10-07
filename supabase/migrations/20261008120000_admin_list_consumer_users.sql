-- Super-admin read of existing consumer accounts for the web admin user page.
-- Does not change miniprogram, Taplist, or POS behavior.

CREATE OR REPLACE FUNCTION public.admin_list_consumer_users()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Shanghai')::date;
  v_summary jsonb;
  v_users jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Unauthorized: super_admin role required';
  END IF;

  WITH wechat AS (
    SELECT
      user_id,
      min(created_at) AS registered_at,
      max(last_login_at) AS last_login_at
    FROM public.consumer_wechat_identities
    GROUP BY user_id
  ),
  apple AS (
    SELECT DISTINCT user_id
    FROM auth.identities
    WHERE provider = 'apple'
  ),
  consumers AS (
    SELECT
      coalesce(w.user_id, a.user_id) AS user_id,
      w.user_id IS NOT NULL AS has_wechat,
      a.user_id IS NOT NULL AS has_apple,
      w.registered_at AS wechat_registered_at,
      w.last_login_at
    FROM wechat w
    FULL OUTER JOIN apple a ON a.user_id = w.user_id
  ),
  eligible AS (
    SELECT
      c.user_id,
      c.has_wechat,
      c.has_apple,
      c.last_login_at,
      coalesce(c.wechat_registered_at, u.created_at) AS registered_at
    FROM consumers c
    JOIN auth.users u ON u.id = c.user_id
    WHERE NOT EXISTS (
      SELECT 1 FROM public.user_roles ur WHERE ur.user_id = c.user_id
    )
  ),
  tap_stats AS (
    SELECT
      user_id,
      count(*)::integer AS tap_count,
      min(created_at) AS first_tap_at,
      max(last_activity_at) AS last_tap_at
    FROM public.user_drink_lights
    GROUP BY user_id
  ),
  follow_stats AS (
    SELECT
      user_id,
      count(*)::integer AS follow_count,
      min(created_at) AS first_follow_at,
      max(created_at) AS last_follow_at
    FROM public.user_bar_follows
    GROUP BY user_id
  ),
  rows AS (
    SELECT
      e.user_id,
      e.has_wechat,
      e.has_apple,
      e.registered_at,
      e.last_login_at,
      coalesce(nullif(trim(up.consumer_username), ''), '未设置') AS username,
      (
        nullif(trim(up.consumer_username), '') IS NOT NULL
        AND up.consumer_username_is_default IS NOT TRUE
      ) AS has_custom_username,
      coalesce(up.consumer_username_normalized, '') = 'askar_mp' AS is_internal,
      coalesce(ts.tap_count, 0) AS tap_count,
      ts.first_tap_at,
      ts.last_tap_at,
      coalesce(fs.follow_count, 0) AS follow_count,
      fs.first_follow_at,
      fs.last_follow_at,
      CASE
        WHEN ts.first_tap_at IS NULL THEN fs.first_follow_at
        WHEN fs.first_follow_at IS NULL THEN ts.first_tap_at
        ELSE least(ts.first_tap_at, fs.first_follow_at)
      END AS first_core_at,
      CASE
        WHEN ts.last_tap_at IS NULL THEN fs.last_follow_at
        WHEN fs.last_follow_at IS NULL THEN ts.last_tap_at
        ELSE greatest(ts.last_tap_at, fs.last_follow_at)
      END AS last_core_at
    FROM eligible e
    LEFT JOIN public.user_profiles up ON up.user_id = e.user_id
    LEFT JOIN tap_stats ts ON ts.user_id = e.user_id
    LEFT JOIN follow_stats fs ON fs.user_id = e.user_id
  )
  SELECT
    jsonb_build_object(
      'consumers', count(*),
      'wechat_users', count(*) FILTER (WHERE has_wechat),
      'apple_only_users', count(*) FILTER (WHERE has_apple AND NOT has_wechat),
      'wechat_new_today', count(*) FILTER (
        WHERE has_wechat
          AND (registered_at AT TIME ZONE 'Asia/Shanghai')::date = v_today
      ),
      'wechat_new_7d', count(*) FILTER (
        WHERE has_wechat
          AND (registered_at AT TIME ZONE 'Asia/Shanghai')::date >= v_today - 6
      ),
      'wechat_users_with_taps', count(*) FILTER (WHERE has_wechat AND tap_count > 0),
      'wechat_tap_count', coalesce(sum(tap_count) FILTER (WHERE has_wechat), 0),
      'wechat_users_with_follows', count(*) FILTER (WHERE has_wechat AND follow_count > 0),
      'wechat_follow_count', coalesce(sum(follow_count) FILTER (WHERE has_wechat), 0),
      'wechat_custom_usernames', count(*) FILTER (WHERE has_wechat AND has_custom_username),
      'wechat_app_linked', count(*) FILTER (WHERE has_wechat AND has_apple)
    ),
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'user_ref', left(encode(extensions.digest(r.user_id::text, 'sha256'), 'hex'), 16),
          'username', r.username,
          'has_custom_username', r.has_custom_username,
          'source', CASE
            WHEN r.has_wechat AND r.has_apple THEN 'both'
            WHEN r.has_wechat THEN 'wechat'
            ELSE 'apple'
          END,
          'registered_at', r.registered_at,
          'last_login_at', r.last_login_at,
          'last_core_at', r.last_core_at,
          'tap_count', r.tap_count,
          'follow_count', r.follow_count,
          'activated_within_24h', (
            r.first_core_at IS NOT NULL
            AND r.first_core_at <= r.registered_at + interval '24 hours'
          ),
          'app_linked', r.has_apple,
          'is_internal', r.is_internal
        )
        ORDER BY r.last_core_at DESC NULLS LAST, r.registered_at DESC
      ),
      '[]'::jsonb
    )
  INTO v_summary, v_users
  FROM rows r;

  RETURN jsonb_build_object(
    'ok', true,
    'summary', v_summary,
    'users', v_users
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_consumer_users() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_consumer_users() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_list_consumer_users() TO authenticated;
