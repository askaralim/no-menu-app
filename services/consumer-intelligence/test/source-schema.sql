-- Minimal business schema fixture, ONLY in a new disposable local test DB.
-- Validates SQL execution/types/grants, not full production migration history.
CREATE SCHEMA auth;
CREATE SCHEMA extensions;
CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
$$;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
END $$;
CREATE TABLE public.user_profiles(user_id uuid PRIMARY KEY,updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.taplist_public_cities(city text PRIMARY KEY,label text NOT NULL,sort_order int DEFAULT 100,is_enabled boolean DEFAULT true);
-- Enabled public city directory observed read-only on 2026-10-31. Keep the
-- existing Linxi/临沂 business mapping, including its source spelling.
INSERT INTO public.taplist_public_cities(city,label) VALUES
  ('Beijing','北京'),('Binzhou','滨州'),('Changchun','长春'),('Chengdu','成都'),
  ('Guiyang','贵阳'),('Hangzhou','杭州'),('Jiaxing','嘉兴'),('Linxi','临沂'),
  ('Nanjing','南京'),('Qingdao','青岛'),('Shanghai','上海'),('Shenyang','沈阳'),
  ('Suzhou','苏州'),('Tianjin','天津'),('Xi''an','西安');
CREATE TABLE public.tenants(id uuid PRIMARY KEY,name text,display_name text,slug text,city text,status text,is_public_visible boolean,display_name_en text);
CREATE TABLE public.categories(id uuid PRIMARY KEY,tenant_id uuid,enabled boolean,is_public_visible boolean);
CREATE TABLE public.drinks(id uuid PRIMARY KEY,tenant_id uuid,category_id uuid,product_id uuid,name text,display_name text,brand_name text,image_url text,enabled boolean,is_public_visible boolean,public_sort_order int,public_status text);
CREATE TABLE public.drink_companies(id uuid PRIMARY KEY,canonical_name_en text,status text);
CREATE TABLE public.drink_products(id uuid PRIMARY KEY,name text,brewery text,brand_name text,beer_style text,image_url text,status text,name_en text,company_id uuid);
CREATE TABLE public.drink_beer_profiles(drink_id uuid PRIMARY KEY,brewery text,beer_style text);
CREATE TABLE public.test_cycles(tenant_id uuid,session_id uuid,drink_id uuid,started_at timestamptz,ended_at timestamptz,accuracy text,canceled boolean);
CREATE VIEW public.tap_lifecycle_sessions_v1 AS SELECT * FROM public.test_cycles;
CREATE TABLE public.user_drink_lights(id uuid PRIMARY KEY,user_id uuid,product_id uuid,provisional_drink_id uuid);
CREATE TABLE public.user_drink_venues(id uuid PRIMARY KEY,light_id uuid,user_id uuid,tenant_id uuid,source_drink_id uuid,first_drank_at timestamptz,created_at timestamptz);
CREATE TABLE public.user_bar_follows(user_id uuid,tenant_id uuid);
