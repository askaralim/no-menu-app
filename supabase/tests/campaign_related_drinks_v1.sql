-- Isolated RPC contract test. Run ONLY in an empty local test database.
-- Creates minimal schema and a controlled existing-menu boundary; rolls everything back.
-- This verifies the new function, not the full production menu implementation.
-- psql -v ON_ERROR_STOP=1 -f supabase/tests/campaign_related_drinks_v1.sql
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF to_regclass('public.campaign_stops') IS NOT NULL OR to_regclass('public.drinks') IS NOT NULL THEN
    RAISE EXCEPTION 'Use an empty local database; never run this fixture on an application database';
  END IF;
END $$;
CREATE TABLE public.campaign_events(id uuid PRIMARY KEY, is_public_visible boolean, status text);
CREATE TABLE public.tenants(id uuid PRIMARY KEY, status text, is_public_visible boolean);
CREATE TABLE public.campaign_stops(id uuid PRIMARY KEY, campaign_id uuid, tenant_id uuid, drink_id uuid, brewery_label text);
CREATE TABLE public.drink_companies(id uuid PRIMARY KEY, status text, display_name text, canonical_name text);
CREATE TABLE public.drink_products(id uuid PRIMARY KEY, company_id uuid, status text);
CREATE TABLE public.drinks(id uuid PRIMARY KEY, tenant_id uuid, product_id uuid, enabled boolean, is_public_visible boolean, public_status text);
CREATE TABLE public.test_campaign_menu_rows(id uuid, position integer, item jsonb);
REVOKE ALL ON public.campaign_events, public.tenants, public.campaign_stops, public.drink_companies,
  public.drink_products, public.drinks, public.test_campaign_menu_rows FROM anon, authenticated;
CREATE FUNCTION public.get_public_taplist_drinks_i18n(p_tenant_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object('ok', true,
    'drinks', coalesce(jsonb_agg(m.item ORDER BY m.position) FILTER (WHERE d.public_status NOT IN ('coming_soon','sold_out')), '[]'::jsonb),
    'coming_soon', coalesce(jsonb_agg(m.item ORDER BY m.position) FILTER (WHERE d.public_status='coming_soon'), '[]'::jsonb),
    'recently_sold_out', coalesce(jsonb_agg(m.item ORDER BY m.position) FILTER (WHERE d.public_status='sold_out'), '[]'::jsonb))
  FROM public.test_campaign_menu_rows m JOIN public.drinks d ON d.id=m.id
  WHERE d.tenant_id=p_tenant_id AND d.enabled AND d.is_public_visible;
$$;
CREATE TEMP TABLE old_definitions AS SELECT oid, pg_get_functiondef(oid) definition FROM pg_proc
WHERE oid='public.get_public_taplist_drinks_i18n(uuid)'::regprocedure;
\ir ../migrations/20261111083209_campaign_related_drinks_v1.sql

DO $$
DECLARE
  campaign uuid := '00000000-0000-0000-0000-000000000001';
  stop uuid := '00000000-0000-0000-0000-000000000002';
  venue uuid := '00000000-0000-0000-0000-000000000003';
  other_venue uuid := '00000000-0000-0000-0000-000000000004';
  company uuid := '00000000-0000-0000-0000-000000000005';
  other_company uuid := '00000000-0000-0000-0000-000000000006';
  product uuid := '00000000-0000-0000-0000-000000000010';
  main uuid := '00000000-0000-0000-0000-000000000100';
  item_id uuid;
  result jsonb;
  before_result jsonb;
BEGIN
  INSERT INTO public.campaign_events VALUES(campaign,true,'scheduled');
  INSERT INTO public.tenants VALUES(venue,'active',true),(other_venue,'active',true);
  INSERT INTO public.drink_companies VALUES(company,'active','退界','退界'),(other_company,'active','退界','退界');
  INSERT INTO public.drink_products VALUES(product,company,'active');
  INSERT INTO public.drinks VALUES(main,venue,product,true,false,'coming_soon');
  INSERT INTO public.campaign_stops VALUES(stop,campaign,venue,main,'退界酿造');
  FOR i IN 1..5 LOOP
    item_id := ('00000000-0000-0000-0000-'||lpad((100+i)::text,12,'0'))::uuid;
    product := ('00000000-0000-0000-0000-'||lpad((10+i)::text,12,'0'))::uuid;
    INSERT INTO public.drink_products VALUES(product,company,'active');
    INSERT INTO public.drinks VALUES(item_id,venue,product,true,true,'coming_soon');
    INSERT INTO public.test_campaign_menu_rows VALUES(item_id,i,jsonb_build_object('id',item_id,'name','预告酒'||i,
      'name_en','Upcoming '||i,'image_url','https://example.invalid/beer.jpg',
      'secret_cost',99,'beer',jsonb_build_object('brewery','退界','beer_style','皮尔森','abv',0)));
  END LOOP;
  -- Same product duplicate, same-named different company, hidden, cross-venue,
  -- main product duplicate, inactive product, missing product, outside public menu.
  FOR i IN 6..13 LOOP
    item_id := ('00000000-0000-0000-0000-'||lpad((100+i)::text,12,'0'))::uuid;
    product := ('00000000-0000-0000-0000-'||lpad((10+i)::text,12,'0'))::uuid;
    INSERT INTO public.drink_products VALUES(product,CASE WHEN i=7 THEN other_company ELSE company END,
      CASE WHEN i=11 THEN 'archived' ELSE 'active' END);
    INSERT INTO public.drinks VALUES(item_id,CASE WHEN i=9 THEN other_venue ELSE venue END,
      CASE WHEN i=6 THEN '00000000-0000-0000-0000-000000000011'::uuid
        WHEN i=10 THEN '00000000-0000-0000-0000-000000000010'::uuid WHEN i=12 THEN NULL ELSE product END,
      true,i<>8,'coming_soon');
    IF i<>13 THEN
      INSERT INTO public.test_campaign_menu_rows VALUES(item_id,i,jsonb_build_object('id',item_id,'name','excluded','beer',jsonb_build_object('brewery','退界')));
    END IF;
  END LOOP;
  before_result := public.get_public_taplist_drinks_i18n(venue);
  result := public.get_public_campaign_related_drinks_v1(campaign,stop);
  ASSERT result->>'state'='ready' AND jsonb_array_length(result->'items')=5, result::text;
  ASSERT result->'brewery'->>'id'=company::text;
  ASSERT result->'items'->0->>'name'='预告酒1';
  ASSERT result->'items'->0->>'abv'='0';
  ASSERT NOT (result->'items'->0 ? 'secret_cost');
  ASSERT result->'items'->4->>'public_status'='coming_soon';
  ASSERT before_result=public.get_public_taplist_drinks_i18n(venue), 'New RPC wrote existing data';

  UPDATE public.drinks SET public_status='available' WHERE id='00000000-0000-0000-0000-000000000106';
  UPDATE public.drinks SET public_status='sold_out' WHERE id='00000000-0000-0000-0000-000000000102';
  UPDATE public.drinks SET public_status='future_state' WHERE id='00000000-0000-0000-0000-000000000103';
  result := public.get_public_campaign_related_drinks_v1(campaign,stop);
  ASSERT jsonb_array_length(result->'items')=5;
  ASSERT result->'items'->0->>'id'='00000000-0000-0000-0000-000000000106', 'Prefer available duplicate';
  ASSERT result->'items'->3->>'public_status'='sold_out';
  ASSERT result->'items'->4->>'public_status'='future_state', 'Keep unknown states';
  UPDATE public.drinks SET enabled=false WHERE id='00000000-0000-0000-0000-000000000105';
  ASSERT jsonb_array_length(public.get_public_campaign_related_drinks_v1(campaign,stop)->'items')=4;

  UPDATE public.drink_companies SET display_name='New brewery name' WHERE id=company;
  UPDATE public.campaign_stops SET brewery_label='Another display name' WHERE id=stop;
  ASSERT jsonb_array_length(public.get_public_campaign_related_drinks_v1(campaign,stop)->'items')=4, 'Names must not change matching';
  UPDATE public.drink_products SET company_id=NULL WHERE id='00000000-0000-0000-0000-000000000010';
  ASSERT public.get_public_campaign_related_drinks_v1(campaign,stop)->>'state'='unconfigured';
  UPDATE public.drink_products SET company_id=company WHERE id='00000000-0000-0000-0000-000000000010';
  UPDATE public.drink_companies SET status='archived' WHERE id=company;
  ASSERT public.get_public_campaign_related_drinks_v1(campaign,stop)->>'state'='unconfigured';
  UPDATE public.drink_companies SET status='active' WHERE id=company;
  UPDATE public.tenants SET is_public_visible=false WHERE id=venue;
  ASSERT public.get_public_campaign_related_drinks_v1(campaign,stop)->>'code'='NOT_PUBLIC';
  UPDATE public.tenants SET is_public_visible=true WHERE id=venue;
  UPDATE public.campaign_events SET status='cancelled' WHERE id=campaign;
  ASSERT public.get_public_campaign_related_drinks_v1(campaign,stop)->>'code'='NOT_PUBLIC';
  UPDATE public.campaign_events SET status='scheduled',is_public_visible=false WHERE id=campaign;
  ASSERT public.get_public_campaign_related_drinks_v1(campaign,stop)->>'code'='NOT_PUBLIC';
  UPDATE public.campaign_events SET is_public_visible=true WHERE id=campaign;
  ASSERT public.get_public_campaign_related_drinks_v1(campaign,gen_random_uuid())->>'code'='STOP_NOT_FOUND';
  ASSERT public.get_public_campaign_related_drinks_v1(gen_random_uuid(),stop)->>'code'='NOT_PUBLIC';
  ASSERT public.get_public_campaign_related_drinks_v1(NULL,NULL)->>'code'='NOT_PUBLIC';
  ASSERT NOT EXISTS(SELECT 1 FROM old_definitions WHERE definition<>pg_get_functiondef(oid)), 'Old RPC definition changed';
  ASSERT NOT EXISTS(SELECT 1 FROM pg_proc p, LATERAL aclexplode(p.proacl) a
    WHERE p.oid='public.get_public_campaign_related_drinks_v1(uuid,uuid)'::regprocedure AND a.grantee=0), 'PUBLIC execute grant';
  ASSERT (SELECT prosecdef AND provolatile='s' AND proconfig=ARRAY['search_path=""'] FROM pg_proc
    WHERE oid='public.get_public_campaign_related_drinks_v1(uuid,uuid)'::regprocedure), 'Function security settings';
  RAISE NOTICE 'RPC identity, visibility, ordering, dedupe, missing data, output and isolation checks passed';
END $$;
SET LOCAL ROLE anon;
DO $$ BEGIN
  ASSERT public.get_public_campaign_related_drinks_v1('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002')->>'state'='ready';
  BEGIN
    PERFORM 1 FROM public.drinks;
    RAISE EXCEPTION 'Anon unexpectedly reads private base table';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  ASSERT public.get_public_campaign_related_drinks_v1('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002')->>'state'='ready';
END $$;
RESET ROLE;
ROLLBACK;
