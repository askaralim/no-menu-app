-- Additive public discovery API. Existing Taplist RPCs are unchanged.
-- Private views are never granted to API roles; public wrappers return explicit DTOs.
CREATE SCHEMA IF NOT EXISTS nomenu_mini;
REVOKE ALL ON SCHEMA nomenu_mini FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION nomenu_mini.style_group(value text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
 SELECT CASE
 WHEN coalesce(value,'') ~* '(果泥|smoothie|pastry sour)' THEN '果泥'
 WHEN value ~* '(ipa|印度淡色|西海岸|新英格兰|浑浊|ddh)' THEN 'IPA'
 WHEN value ~* '(酸|sour|gose|古斯|柏林酸)' THEN '酸啤'
 WHEN value ~* '(拉格|lager|pils|皮尔森|博克|helles|ipl)' THEN '拉格'
 WHEN value ~* '(小麦|白啤|wheat|weizen|witbier)' THEN '小麦'
 WHEN value ~* '(世涛|波特|stout|porter)' THEN '世涛'
 WHEN value ~* '(赛松|农舍|saison|farmhouse)' THEN '赛松 / 农舍'
 WHEN value ~* '(比利时|修道院|三料|四料|belgian|tripel|dubbel|quadrupel)' THEN '比利时艾尔'
 WHEN value ~* '(西打|苹果酒|cider)' THEN '西打'
 WHEN value ~* '(蜂蜜酒|mead)' THEN '蜂蜜酒'
 WHEN value ~* '(淡色艾尔|金色艾尔|琥珀艾尔|pale ale|amber ale|golden ale)' THEN '艾尔'
 ELSE '其他' END;
$$;

CREATE OR REPLACE VIEW nomenu_mini.listings AS
 SELECT d.id AS drink_id,d.product_id,d.tenant_id,d.name,d.image_url,d.brand_name,
 d.public_status,t.slug,t.city,coalesce(nullif(trim(t.display_name),''),t.name) AS tenant_name,
 t.district,t.last_menu_updated_at,
 coalesce(dp.brewery,dp.brand_name,p.brewery,d.brand_name) AS brewery,
 p.beer_style,p.abv,p.ibu,p.country,p.description,
 CASE WHEN coalesce(t.public_price_mode,'hide')='show' THEN coalesce((
   SELECT jsonb_agg(jsonb_build_object('id',s.id,'label',s.label,'volume_ml',s.volume_ml,'price',s.price,'serving_type',s.serving_type)
     ORDER BY s.is_default DESC,s.public_sort_order,s.id)
   FROM public.drink_serving_options s WHERE s.drink_id=d.id AND s.tenant_id=d.tenant_id
     AND s.is_active AND s.archived_at IS NULL AND s.price>0
 ),'[]'::jsonb) ELSE '[]'::jsonb END AS servings
 FROM public.drinks d JOIN public.tenants t ON t.id=d.tenant_id
 JOIN public.categories c ON c.id=d.category_id AND c.tenant_id=d.tenant_id
 LEFT JOIN public.drink_products dp ON dp.id=d.product_id AND dp.status='active'
 LEFT JOIN public.drink_beer_profiles p ON p.drink_id=d.id AND p.tenant_id=d.tenant_id
 WHERE t.status='active' AND t.is_public_visible AND c.enabled AND c.is_public_visible
 AND d.enabled AND d.is_public_visible AND d.public_sort_order>=1
 AND d.public_status IN ('new','available','low','coming_soon','sold_out')
 AND (d.product_id IS NULL OR dp.id IS NOT NULL);

CREATE OR REPLACE VIEW nomenu_mini.catalog AS
 SELECT 'product:'||p.id AS key,p.id AS product_id,NULL::uuid AS drink_id,
 p.name,p.name_en,p.aliases,p.image_url,coalesce(nullif(trim(p.brewery),''),p.brand_name) AS brewery,
 p.beer_style,p.abv,p.ibu,p.country,p.description
 FROM public.drink_products p WHERE p.status='active'
 UNION ALL
 SELECT 'drink:'||l.drink_id,NULL::uuid,l.drink_id,l.name,NULL::text,'{}'::text[],l.image_url,l.brewery,
 l.beer_style,l.abv,l.ibu,l.country,l.description FROM nomenu_mini.listings l WHERE l.product_id IS NULL;

CREATE OR REPLACE FUNCTION public.search_mini_products(p_city text DEFAULT NULL,p_query text DEFAULT '',p_style text DEFAULT NULL,p_brewery text DEFAULT NULL,p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 WITH candidates AS (
 SELECT c.*,CASE
   WHEN lower(c.name)=lower(trim(p_query)) OR lower(c.name_en)=lower(trim(p_query)) OR EXISTS(SELECT 1 FROM unnest(c.aliases) a WHERE lower(a)=lower(trim(p_query))) THEN 0
   WHEN starts_with(lower(c.name),lower(trim(p_query))) OR starts_with(lower(coalesce(c.name_en,'')),lower(trim(p_query))) THEN 1
   ELSE 2 END AS rank,
   coalesce(v.venues,'[]'::jsonb) AS venues,coalesce(v.cnt,0) AS venue_count
 FROM nomenu_mini.catalog c
 LEFT JOIN LATERAL (
 SELECT count(*) AS cnt,jsonb_agg(jsonb_build_object('id',id,'name',name,'slug',slug) ORDER BY updated DESC NULLS LAST,lower(name),id) AS venues FROM (
 SELECT l.tenant_id AS id,l.tenant_name AS name,l.slug,max(l.last_menu_updated_at) AS updated
 FROM nomenu_mini.listings l WHERE (l.product_id=c.product_id OR l.drink_id=c.drink_id)
 AND lower(trim(l.city))=lower(coalesce(nullif(trim(p_city),''),'Shanghai'))
 AND l.public_status IN ('new','available','low') GROUP BY l.tenant_id,l.tenant_name,l.slug
 ) x) v ON true
 WHERE (nullif(trim(p_query),'') IS NOT NULL OR nullif(p_style,'') IS NOT NULL OR nullif(p_brewery,'') IS NOT NULL)
 AND (nullif(trim(p_query),'') IS NULL OR strpos(lower(concat_ws(' ',c.name,c.name_en,c.brewery,c.beer_style,array_to_string(c.aliases,' '))),lower(trim(p_query)))>0)
 AND (nullif(p_style,'') IS NULL OR nomenu_mini.style_group(c.beer_style)=p_style)
 AND (nullif(p_brewery,'') IS NULL OR lower(regexp_replace(trim(c.brewery),'\s+',' ','g'))=lower(regexp_replace(trim(p_brewery),'\s+',' ','g')))
 ), page AS (
 SELECT * FROM candidates ORDER BY rank,(venue_count>0) DESC,lower(name),key
 LIMIT 21 OFFSET greatest(coalesce(p_offset,0),0)
 ), shown AS (SELECT * FROM page ORDER BY rank,(venue_count>0) DESC,lower(name),key LIMIT 20)
 SELECT jsonb_build_object('ok',true,'results',coalesce((SELECT jsonb_agg(
 jsonb_build_object('key',key,'product_id',product_id,'drink_id',drink_id,'name',name,'image_url',image_url,'brewery',brewery,'beer_style',beer_style,'abv',abv,'venue_count',venue_count,'venues',jsonb_path_query_array(venues,'$[0 to 1]'))
 ORDER BY rank,(venue_count>0) DESC,lower(name),key) FROM shown),'[]'::jsonb),
 'next_offset',CASE WHEN (SELECT count(*) FROM page)>20 THEN greatest(coalesce(p_offset,0),0)+20 ELSE NULL END);
$$;

CREATE OR REPLACE FUNCTION public.get_mini_breweries(p_city text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 WITH counts AS (
 SELECT lower(regexp_replace(trim(c.brewery),'\s+',' ','g')) AS brewery_key,
 min(regexp_replace(trim(c.brewery),'\s+',' ','g')) AS brewery_name,
 count(DISTINCT c.key) AS product_count,count(DISTINCT l.tenant_id) AS venue_count
 FROM nomenu_mini.catalog c JOIN nomenu_mini.listings l ON (l.product_id=c.product_id OR l.drink_id=c.drink_id)
 WHERE lower(trim(l.city))=lower(coalesce(nullif(trim(p_city),''),'Shanghai'))
 AND l.public_status IN ('new','available','low') AND nullif(trim(c.brewery),'') IS NOT NULL
 GROUP BY 1
 ), top AS (SELECT * FROM counts ORDER BY product_count DESC,venue_count DESC,brewery_key LIMIT 9)
 SELECT jsonb_build_object('ok',true,'results',coalesce((SELECT jsonb_agg(jsonb_build_object('brewery',brewery_name,'product_count',product_count)
 ORDER BY product_count DESC,venue_count DESC,brewery_key) FROM top),'[]'::jsonb));
$$;

CREATE OR REPLACE FUNCTION public.get_mini_product(p_product_id uuid DEFAULT NULL,p_drink_id uuid DEFAULT NULL,p_city text DEFAULT NULL,p_source_slug text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE item record; resolved uuid; venues jsonb;
BEGIN
 resolved:=p_product_id;
 IF resolved IS NULL AND p_drink_id IS NOT NULL THEN
   SELECT l.product_id INTO resolved FROM nomenu_mini.listings l WHERE l.drink_id=p_drink_id;
 END IF;
 SELECT * INTO item FROM nomenu_mini.catalog c WHERE
 (resolved IS NOT NULL AND c.product_id=resolved) OR (resolved IS NULL AND c.drink_id=p_drink_id) LIMIT 1;
 IF item.key IS NULL THEN RETURN jsonb_build_object('ok',false,'code','not_found'); END IF;
 SELECT coalesce(jsonb_agg(v.row ORDER BY v.source DESC,v.rank,v.updated DESC NULLS LAST,lower(v.name),v.id),'[]'::jsonb) INTO venues FROM (
 SELECT l.tenant_id AS id,l.tenant_name AS name,bool_or(coalesce(l.slug=p_source_slug,false)) AS source,
 min(CASE WHEN l.public_status IN ('new','available','low') THEN 0 WHEN l.public_status='coming_soon' THEN 1 ELSE 2 END) AS rank,
 max(l.last_menu_updated_at) AS updated,
 jsonb_build_object('id',l.tenant_id,'name',l.tenant_name,'slug',l.slug,'district',l.district,
 'is_source',coalesce(l.slug=p_source_slug,false),'available',bool_or(l.public_status IN ('new','available','low')),
 'group',CASE WHEN bool_or(l.public_status IN ('new','available','low')) THEN 'available' WHEN bool_or(l.public_status='coming_soon') THEN 'coming_soon' ELSE 'sold_out' END,
 'listings',jsonb_agg(jsonb_build_object('drink_id',l.drink_id,'status',l.public_status,'servings',l.servings) ORDER BY l.drink_id)) AS row
 FROM nomenu_mini.listings l WHERE (l.product_id=item.product_id OR l.drink_id=item.drink_id)
 AND (lower(trim(l.city))=lower(coalesce(nullif(trim(p_city),''),'Shanghai')) OR l.slug=p_source_slug)
 GROUP BY l.tenant_id,l.tenant_name,l.slug,l.district
 ) v;
 RETURN jsonb_build_object('ok',true,'product',jsonb_build_object('key',item.key,'product_id',item.product_id,'drink_id',item.drink_id,'name',item.name,'image_url',item.image_url,'brewery',item.brewery,'beer_style',item.beer_style,'abv',item.abv,'ibu',item.ibu,'country',item.country,'description',item.description),
 'venues',venues,'source_unavailable',nullif(p_source_slug,'') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(venues) v WHERE v->>'slug'=p_source_slug));
END;
$$;

CREATE OR REPLACE FUNCTION public.get_mini_event(p_event_id text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT coalesce((SELECT jsonb_build_object('ok',true,'event',public.taplist_public_event_row(e,t)||jsonb_build_object('expired',NOT public.taplist_event_is_not_expired(e.start_at,e.end_at,e.visible_until_at)))
 FROM public.bar_events e JOIN public.tenants t ON t.id=e.tenant_id
 WHERE e.id=p_event_id AND t.status='active' AND t.is_public_visible AND e.is_public_visible AND e.status<>'cancelled'),jsonb_build_object('ok',false,'code','not_public'));
$$;

REVOKE ALL ON ALL TABLES IN SCHEMA nomenu_mini FROM PUBLIC,anon,authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA nomenu_mini FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.search_mini_products(text,text,text,text,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_mini_breweries(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_mini_product(uuid,uuid,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_mini_event(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_mini_products(text,text,text,text,integer),public.get_mini_breweries(text),public.get_mini_product(uuid,uuid,text,text),public.get_mini_event(text) TO anon,authenticated;
