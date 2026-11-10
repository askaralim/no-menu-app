-- Add optional consumer display labels to the internal Feed export. Existing
-- snapshots and instances remain valid because the public fields are additive.
CREATE OR REPLACE FUNCTION public.intelligence_export_snapshot_v1(p_scope text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_data jsonb; v_counts jsonb;
BEGIN
  IF p_scope='catalog' THEN
    IF EXISTS(SELECT 1 FROM public.taplist_public_cities c WHERE c.is_enabled AND c.city_code IS NULL) THEN
      RAISE EXCEPTION 'CITY_MAPPING_INCOMPLETE';
    END IF;
    v_data := public.ci_get_cities_v1() || jsonb_build_object('active_cycles',coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'session_id',s.session_id,'city_code',city.city_code,
        'tenant_id',t.id,'tenant_slug',t.slug,'tenant_name',coalesce(nullif(trim(t.display_name),''),t.name),
        'tenant_name_en',nullif(trim(t.display_name_en),''),
        'source_drink_id',d.id,'product_id',d.product_id,
        'beer_name',CASE WHEN d.product_id IS NULL THEN d.name ELSE coalesce(nullif(trim(d.display_name),''),dp.name,d.name) END,
        'beer_name_en',CASE WHEN d.product_id IS NULL THEN NULL ELSE nullif(trim(dp.name_en),'') END,
        'brewery',coalesce(nullif(trim(dp.brewery),''),nullif(trim(dp.brand_name),''),nullif(trim(bp.brewery),''),nullif(trim(d.brand_name),'')),
        'brewery_en',nullif(trim(dc.canonical_name_en),''),
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
      LEFT JOIN public.drink_companies dc ON dc.id=dp.company_id AND dc.status='active'
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

REVOKE ALL ON FUNCTION public.intelligence_export_snapshot_v1(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.intelligence_export_snapshot_v1(text) TO service_role;
