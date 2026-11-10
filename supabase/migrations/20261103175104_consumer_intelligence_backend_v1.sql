-- Backend-only integration; applied 2026-11-04 (Asia/Shanghai).
-- Existing Taplist/mini-program RPCs and their response shapes are untouched.
ALTER TABLE public.taplist_public_cities
  ADD COLUMN city_code text,
  ADD COLUMN timezone text;
ALTER TABLE public.taplist_public_cities
  ADD CONSTRAINT ci_city_code_unique UNIQUE(city_code),
  ADD CONSTRAINT ci_city_code_format CHECK(city_code IS NULL OR city_code ~ '^[a-z][a-z0-9_-]{0,63}$'),
  ADD CONSTRAINT ci_city_metadata_pair CHECK((city_code IS NULL) = (timezone IS NULL));

-- Explicit business mapping, never derive an identifier from a display label.
-- Unmapped public cities intentionally block export until an operator maps them.
UPDATE public.taplist_public_cities c
SET city_code=m.code, timezone='Asia/Shanghai'
FROM (VALUES
  ('Shanghai','shanghai'),('Beijing','beijing'),('Qingdao','qingdao'),
  ('Guangzhou','guangzhou'),('Shenzhen','shenzhen'),('Chengdu','chengdu'),
  ('Hangzhou','hangzhou'),('Nanjing','nanjing'),('Suzhou','suzhou'),
  ('Wuhan','wuhan'),('Xi''an','xian'),('Chongqing','chongqing'),
  ('Tianjin','tianjin'),('Ningbo','ningbo'),('Xiamen','xiamen'),
  ('Changsha','changsha'),('Jinan','jinan'),('Dalian','dalian'),
  ('Binzhou','binzhou'),('Changchun','changchun'),('Guiyang','guiyang'),
  ('Jiaxing','jiaxing'),('Shenyang','shenyang'),
  -- Production currently uses source_city=Linxi with label=临沂. Preserve the
  -- existing business key; this migration does not rename or infer a city.
  ('Linxi','linxi')
) AS m(source,code)
WHERE c.city=m.source;

ALTER TABLE public.user_profiles ADD COLUMN home_city_code text
  REFERENCES public.taplist_public_cities(city_code);
CREATE INDEX user_profiles_home_city_code_idx ON public.user_profiles(home_city_code)
  WHERE home_city_code IS NOT NULL;

CREATE FUNCTION public.ci_get_cities_v1() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object('cities',coalesce(jsonb_agg(jsonb_build_object(
    'city_code',c.city_code,'source_city',c.city,'display_name',c.label,'timezone',c.timezone
  ) ORDER BY c.sort_order,c.city_code),'[]'::jsonb))
  FROM public.taplist_public_cities c
  WHERE c.is_enabled AND c.city_code IS NOT NULL;
$$;

CREATE FUNCTION public.ci_get_profile_v1() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_profile jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  v_profile := public.get_my_consumer_profile();
  RETURN (v_profile - 'ok') || jsonb_build_object('home_city_code',(
    SELECT home_city_code FROM public.user_profiles WHERE user_id=auth.uid()
  ));
END;
$$;

CREATE FUNCTION public.ci_patch_profile_v1(p_patch jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_city text; v_profile jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF p_patch IS NULL OR jsonb_typeof(p_patch)<>'object' THEN RAISE EXCEPTION 'INVALID_PROFILE_PATCH'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_patch) k WHERE k NOT IN ('consumer_username','home_city_code')) THEN
    RAISE EXCEPTION 'INVALID_PROFILE_PATCH';
  END IF;
  IF p_patch ? 'consumer_username' AND jsonb_typeof(p_patch->'consumer_username')<>'string' THEN
    RAISE EXCEPTION 'INVALID_PROFILE_PATCH';
  END IF;
  IF p_patch ? 'home_city_code' THEN
    IF jsonb_typeof(p_patch->'home_city_code') NOT IN ('string','null') THEN RAISE EXCEPTION 'INVALID_PROFILE_PATCH'; END IF;
    v_city := p_patch->>'home_city_code';
    IF v_city IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.taplist_public_cities WHERE city_code=v_city AND is_enabled) THEN
      RAISE EXCEPTION 'UNKNOWN_CITY';
    END IF;
  END IF;
  -- Existing helper ensures/locks the current consumer profile. All changes
  -- below commit or roll back as one RPC transaction, including username clashes.
  v_profile := public.ci_get_profile_v1();
  IF p_patch ? 'consumer_username' THEN
    PERFORM public.update_my_consumer_username(p_patch->>'consumer_username');
  END IF;
  IF p_patch ? 'home_city_code' THEN
    UPDATE public.user_profiles SET home_city_code=v_city,updated_at=now()
    WHERE user_id=auth.uid() AND home_city_code IS DISTINCT FROM v_city;
  END IF;
  IF p_patch='{}'::jsonb THEN RETURN v_profile; END IF;
  RETURN public.ci_get_profile_v1();
END;
$$;

CREATE FUNCTION public.intelligence_export_snapshot_v1(p_scope text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_data jsonb; v_counts jsonb;
BEGIN
  -- This is a full, consistent source statement snapshot. No pagination, no
  -- per-venue limits, no client-facing RPC reuse, no raw emails/device tokens.
  IF p_scope='catalog' THEN
    IF EXISTS(SELECT 1 FROM public.taplist_public_cities c WHERE c.is_enabled AND c.city_code IS NULL) THEN
      RAISE EXCEPTION 'CITY_MAPPING_INCOMPLETE';
    END IF;
    v_data := public.ci_get_cities_v1() || jsonb_build_object('active_cycles',coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'session_id',s.session_id,'city_code',city.city_code,
        'tenant_id',t.id,'tenant_slug',t.slug,'tenant_name',coalesce(nullif(trim(t.display_name),''),t.name),
        'source_drink_id',d.id,'product_id',d.product_id,
        'beer_name',CASE WHEN d.product_id IS NULL THEN d.name ELSE coalesce(nullif(trim(d.display_name),''),dp.name,d.name) END,
        'brewery',coalesce(nullif(trim(dp.brewery),''),nullif(trim(dp.brand_name),''),nullif(trim(bp.brewery),''),nullif(trim(d.brand_name),'')),
        'style',coalesce(nullif(trim(dp.beer_style),''),nullif(trim(bp.beer_style),'')),
        'image_url',CASE WHEN d.product_id IS NULL THEN nullif(trim(d.image_url),'') ELSE coalesce(nullif(trim(d.image_url),''),nullif(trim(dp.image_url),'')) END,
        'current_cycle_started_at',s.started_at,'ended_at',s.ended_at,'accuracy',s.accuracy,'canceled',coalesce(s.canceled,false),
        'public_tenant',true,'public_category',true,'public_drink',true,'tap_assigned',true,'public_status',d.public_status
      ) ORDER BY t.id,d.id,s.session_id)
      FROM public.tap_lifecycle_sessions_v1 s
      JOIN public.drinks d ON d.id=s.drink_id AND d.tenant_id=s.tenant_id
      JOIN public.tenants t ON t.id=d.tenant_id
      JOIN public.categories c ON c.id=d.category_id AND c.tenant_id=t.id
      JOIN public.taplist_public_cities city ON city.city=t.city AND city.is_enabled AND city.city_code IS NOT NULL
      LEFT JOIN public.drink_products dp ON dp.id=d.product_id
      LEFT JOIN public.drink_beer_profiles bp ON bp.drink_id=d.id
      WHERE s.ended_at IS NULL AND s.canceled IS NOT TRUE AND s.accuracy='exact' AND s.started_at IS NOT NULL
        AND t.status='active' AND t.is_public_visible
        AND c.enabled AND c.is_public_visible AND d.enabled AND d.is_public_visible
        AND d.public_sort_order>=1 AND d.public_status IN ('new','available','low')
        AND (d.product_id IS NULL OR dp.status='active')
    ),'[]'::jsonb));
  ELSIF p_scope='consumer' THEN
    v_data := jsonb_build_object(
      'user_beers',coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id',l.id,'user_id',l.user_id,'product_id',l.product_id,'provisional_drink_id',l.provisional_drink_id,
        'style',coalesce(nullif(trim(dp.beer_style),''),nullif(trim(bp.beer_style),''))
      ) ORDER BY l.id) FROM public.user_drink_lights l
      LEFT JOIN public.drink_products dp ON dp.id=l.product_id
      LEFT JOIN public.drink_beer_profiles bp ON bp.drink_id=l.provisional_drink_id),'[]'::jsonb),
      'venue_experiences',coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id',v.id,'user_id',v.user_id,'product_id',l.product_id,'provisional_drink_id',l.provisional_drink_id,
        'tenant_id',v.tenant_id,'source_drink_id',v.source_drink_id,'first_drank_at',v.first_drank_at,
        'created_at',v.created_at,'style',null
      ) ORDER BY v.id) FROM public.user_drink_venues v JOIN public.user_drink_lights l ON l.id=v.light_id AND l.user_id=v.user_id),'[]'::jsonb),
      'follows',coalesce((SELECT jsonb_agg(jsonb_build_object('user_id',user_id,'tenant_id',tenant_id) ORDER BY user_id,tenant_id) FROM public.user_bar_follows),'[]'::jsonb),
      'consumer_profiles',coalesce((SELECT jsonb_agg(jsonb_build_object('user_id',user_id,'home_city_code',home_city_code) ORDER BY user_id) FROM public.user_profiles),'[]'::jsonb)
    );
  ELSE RAISE EXCEPTION 'INVALID_EXPORT_SCOPE';
  END IF;
  SELECT jsonb_object_agg(key,jsonb_array_length(value)) INTO v_counts FROM jsonb_each(v_data);
  RETURN v_data || jsonb_build_object('schema_version',1,'export_id',gen_random_uuid(),'scope',p_scope,
    'source_as_of',statement_timestamp(),'complete',true,'counts',v_counts);
END;
$$;

REVOKE ALL ON FUNCTION public.ci_get_cities_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ci_get_profile_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ci_patch_profile_v1(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.intelligence_export_snapshot_v1(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ci_get_cities_v1() TO anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.ci_get_profile_v1() TO authenticated;
GRANT EXECUTE ON FUNCTION public.ci_patch_profile_v1(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.intelligence_export_snapshot_v1(text) TO service_role;
