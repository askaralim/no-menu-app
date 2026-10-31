-- Company-origin and city i18n regression checks (run after all 20261031 migrations).
-- Usage: psql "$DATABASE_URL" -f supabase/tests/company_location_i18n.sql

BEGIN;

DO $$
DECLARE
  v_cities jsonb;
  v_city jsonb;
  v_company_id uuid;
  v_drink_id uuid;
  v_drink jsonb;
BEGIN
  IF to_regprocedure('public.get_public_taplist_cities()') IS NULL
     OR to_regprocedure('public.get_public_taplist_drink_i18n(text,uuid)') IS NULL
     OR to_regprocedure('public.admin_set_drink_company_i18n(uuid,text,text)') IS NULL
     OR to_regprocedure('public.admin_set_drink_company_origin_city(uuid,text,text)') IS NULL
     OR to_regprocedure('public.admin_set_taplist_city_i18n(text,text,text,text,text)') IS NULL THEN
    RAISE EXCEPTION 'Required company/city i18n RPC is missing';
  END IF;

  IF has_function_privilege('anon', 'public.admin_set_drink_company_i18n(uuid,text,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.admin_set_drink_company_origin_city(uuid,text,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.admin_set_taplist_city_i18n(text,text,text,text,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.admin_list_taplist_cities()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous role can execute an admin company/city RPC';
  END IF;

  v_cities := public.get_public_taplist_cities();
  SELECT value INTO v_city
  FROM jsonb_array_elements(v_cities->'cities')
  WHERE value->>'city' = 'Xi''an'
  LIMIT 1;

  IF v_city IS NULL
     OR v_city->>'label' <> '西安'
     OR v_city->>'label_en' <> 'Xi''an'
     OR v_city->>'region_code' <> 'shaanxi'
     OR v_city->>'region_label_en' <> 'Shaanxi' THEN
    RAISE EXCEPTION 'Xi''an city directory normalization is missing: %', v_city;
  END IF;

  SELECT value INTO v_city
  FROM jsonb_array_elements(v_cities->'cities')
  WHERE value->>'city' = 'Linxi'
  LIMIT 1;

  IF v_city IS NULL OR v_city->>'label' <> '临沂' OR v_city->>'label_en' <> 'Linyi' THEN
    RAISE EXCEPTION 'Linxi compatibility key does not display as Linyi: %', v_city;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.taplist_public_cities
    WHERE city NOT IN ('Shanghai', 'Beijing', 'Tianjin', 'Chongqing')
      AND (nullif(trim(region_label), '') IS NULL OR nullif(trim(region_label_en), '') IS NULL)
  ) THEN
    RAISE EXCEPTION 'A non-municipality city is missing its bilingual region label';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.drinks d
    CROSS JOIN LATERAL nomenu_i18n.public_drink(
      jsonb_build_object(
        'id', d.id,
        'beer', jsonb_build_object(
          'country', 'legacy custom origin',
          'country_en', 'legacy product country',
          'origin_region', 'legacy product region',
          'origin_city', 'legacy product city',
          'origin_city_en', 'legacy product city en'
        )
      )
    ) localized
    WHERE d.product_id IS NULL
      AND (
        localized->'beer'->>'country' IS NOT NULL
        OR localized->'beer'->>'country_en' IS NOT NULL
        OR localized->'beer'->>'origin_region' IS NOT NULL
        OR localized->'beer'->>'origin_region_en' IS NOT NULL
        OR localized->'beer'->>'origin_city' IS NOT NULL
        OR localized->'beer'->>'origin_city_en' IS NOT NULL
      )
  ) THEN
    RAISE EXCEPTION 'A product without a company leaked a product-level origin';
  END IF;

  SELECT c.id, d.id
  INTO v_company_id, v_drink_id
  FROM public.drinks d
  JOIN public.drink_products p ON p.id = d.product_id
  JOIN public.drink_companies c ON c.id = p.company_id
  WHERE p.status = 'active' AND c.status = 'active'
  LIMIT 1;

  UPDATE public.drink_companies
  SET origin_city = '__i18n_test_city__', origin_city_en = '__i18n_test_city_en__'
  WHERE id = v_company_id;

  v_drink := nomenu_i18n.public_drink(
    jsonb_build_object('id', v_drink_id, 'beer', '{}'::jsonb)
  );
  IF v_drink->'beer'->>'origin_city' <> '__i18n_test_city__'
     OR v_drink->'beer'->>'origin_city_en' <> '__i18n_test_city_en__' THEN
    RAISE EXCEPTION 'Company city did not propagate through public drink DTO: %', v_drink;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.drinks d
    JOIN public.drink_products p ON p.id = d.product_id
    JOIN public.drink_companies c ON c.id = p.company_id
    CROSS JOIN LATERAL nomenu_i18n.public_drink(
      jsonb_build_object('id', d.id, 'beer', '{}'::jsonb)
    ) localized
    WHERE (localized->'beer'->>'country') IS DISTINCT FROM c.country
       OR (localized->'beer'->>'country_en') IS DISTINCT FROM c.country_en
       OR (localized->'beer'->>'origin_region') IS DISTINCT FROM c.origin_region
       OR (localized->'beer'->>'origin_region_en') IS DISTINCT FROM c.origin_region_en
       OR (localized->'beer'->>'origin_city') IS DISTINCT FROM c.origin_city
       OR (localized->'beer'->>'origin_city_en') IS DISTINCT FROM c.origin_city_en
  ) THEN
    RAISE EXCEPTION 'A linked product origin differs from its company origin';
  END IF;
END
$$;

ROLLBACK;
