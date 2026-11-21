-- Super-admin read of existing consumer accounts for the web admin user page.
-- Does not change miniprogram, Taplist, or POS behavior.

CREATE OR REPLACE FUNCTION public.admin_list_consumer_users()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, extensions
SET statement_timeout = '5s'
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Shanghai')::date;
  v_summary jsonb;
  v_users jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF public.is_super_admin() IS NOT TRUE THEN
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
  known AS (
    SELECT user_id FROM wechat UNION SELECT user_id FROM apple
    UNION SELECT user_id FROM public.user_drink_lights
    UNION SELECT user_id FROM public.user_bar_follows
  ),
  consumers AS (
    SELECT
      k.user_id,
      w.user_id IS NOT NULL AS has_wechat,
      a.user_id IS NOT NULL AS has_apple,
      w.registered_at AS wechat_registered_at,
      w.last_login_at
    FROM known k
    LEFT JOIN wechat w ON w.user_id=k.user_id
    LEFT JOIN apple a ON a.user_id=k.user_id
  ),
  eligible AS (
    SELECT
      c.user_id,
      c.has_wechat,
      c.has_apple,
      c.last_login_at,
      u.created_at AS registered_at, c.wechat_registered_at AS wechat_linked_at
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
      e.wechat_linked_at,
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
      'tap_count', coalesce(sum(tap_count),0),
      'follow_count', coalesce(sum(follow_count),0),
      'unbound_consumers', count(*) FILTER(WHERE NOT has_wechat AND NOT has_apple),
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
            WHEN r.has_apple THEN 'apple'
            ELSE 'unbound'
          END,
          'registered_at', r.registered_at,
          'wechat_linked_at', r.wechat_linked_at,
          'semantics_version', 2,
          'last_login_at', r.last_login_at,
          'last_core_at', r.last_core_at,
          'tap_count', r.tap_count,
          'follow_count', r.follow_count,
          'activated_within_24h', (
            r.first_core_at IS NOT NULL
            AND r.first_core_at >= r.registered_at
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

-- Private, explicitly requested account details; identifiers remain server-side.
CREATE OR REPLACE FUNCTION public.admin_get_consumer_user_detail(p_user_ref text, p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, auth, extensions
SET statement_timeout = '5s'
AS $$
DECLARE v_id uuid; v_count integer;
BEGIN
  IF auth.uid() IS NULL OR public.is_super_admin() IS NOT TRUE THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF p_user_ref IS NULL OR p_user_ref !~ '^[a-f0-9]{16}$' OR p_offset IS NULL OR p_offset < 0 OR p_offset > 100000 THEN RAISE EXCEPTION 'Invalid scope'; END IF;
  SELECT count(*) INTO v_count FROM auth.users u
    WHERE left(encode(extensions.digest(u.id::text,'sha256'),'hex'),16)=p_user_ref;
  IF v_count <> 1 THEN RAISE EXCEPTION 'Account unavailable'; END IF;
  SELECT u.id INTO v_id FROM auth.users u WHERE left(encode(extensions.digest(u.id::text,'sha256'),'hex'),16)=p_user_ref;
  IF EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=v_id) OR NOT (
    EXISTS(SELECT 1 FROM public.consumer_wechat_identities WHERE user_id=v_id) OR
    EXISTS(SELECT 1 FROM auth.identities WHERE user_id=v_id AND provider='apple') OR
    EXISTS(SELECT 1 FROM public.user_drink_lights WHERE user_id=v_id) OR
    EXISTS(SELECT 1 FROM public.user_bar_follows WHERE user_id=v_id)
  ) THEN RAISE EXCEPTION 'Account unavailable'; END IF;
  RETURN jsonb_build_object('ok',true,'offset',p_offset,'limit',20,
    'tap_count',(SELECT count(*) FROM public.user_drink_lights WHERE user_id=v_id),
    'follow_count',(SELECT count(*) FROM public.user_bar_follows WHERE user_id=v_id),
    'taps',coalesce((SELECT jsonb_agg(row_data ORDER BY at DESC,id) FROM (
      SELECT l.id,l.last_activity_at AS at,jsonb_build_object('name',coalesce(dp.name,d.name,'历史酒款'),
        'style',dp.beer_style,'recorded_at',l.created_at,'last_activity_at',l.last_activity_at) AS row_data
      FROM public.user_drink_lights l LEFT JOIN public.drink_products dp ON dp.id=l.product_id
      LEFT JOIN public.drinks d ON d.id=l.provisional_drink_id WHERE l.user_id=v_id
      ORDER BY l.last_activity_at DESC,l.id LIMIT 20 OFFSET p_offset
    ) q),'[]'::jsonb),
    'follows',coalesce((SELECT jsonb_agg(row_data ORDER BY at DESC,id) FROM (
      SELECT t.id,f.created_at AS at,jsonb_build_object('name',coalesce(t.display_name,t.name),'followed_at',f.created_at) AS row_data
      FROM public.user_bar_follows f JOIN public.tenants t ON t.id=f.tenant_id WHERE f.user_id=v_id
      ORDER BY f.created_at DESC,t.id LIMIT 20 OFFSET p_offset
    ) q),'[]'::jsonb));
END;
$$;
REVOKE ALL ON FUNCTION public.admin_get_consumer_user_detail(text,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_consumer_user_detail(text,integer) TO authenticated;

-- Server-side bridge from the existing admin reference to the existing CI HMAC.
CREATE OR REPLACE FUNCTION public.admin_resolve_consumer_ref(p_user_ref text)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, auth, extensions SET statement_timeout = '5s'
AS $$
DECLARE v_id uuid;
BEGIN
  -- Reuse the same authorization, eligibility and collision checks as details.
  PERFORM public.admin_get_consumer_user_detail(p_user_ref,0);
  SELECT id INTO STRICT v_id FROM auth.users
    WHERE left(encode(extensions.digest(id::text,'sha256'),'hex'),16)=p_user_ref;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_resolve_consumer_ref(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_resolve_consumer_ref(text) TO authenticated;
