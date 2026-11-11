-- Brewery identity and tenant flag regression checks.
-- Usage: psql "$DATABASE_URL" -f supabase/tests/brewery_identity_flags.sql

BEGIN;

DO $$
DECLARE
  v_ref jsonb;
  v_drink_id uuid;
  v_tenant_id uuid;
  v_company_id uuid;
  v_decorated jsonb;
BEGIN
  IF to_regprocedure('public.get_public_taplist_drinks_v2(uuid)') IS NULL
     OR to_regprocedure('public.get_public_taplist_drink_v2(text,uuid)') IS NULL
     OR to_regprocedure('public.get_mini_brewery_by_id(uuid)') IS NULL
     OR to_regprocedure('public.search_mini_products_by_brewery_id_v2(uuid,text,integer)') IS NULL THEN
    RAISE EXCEPTION 'Required brewery identity RPC is missing';
  END IF;

  IF NOT has_function_privilege('anon', 'public.get_public_taplist_drinks_v2(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('anon', 'public.get_mini_brewery_by_id(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('anon', 'public.search_mini_products_by_brewery_id_v2(uuid,text,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous role cannot execute a public brewery identity RPC';
  END IF;

  IF has_function_privilege('anon', 'nomenu_i18n.brewery_ref(uuid,text,text,text,boolean)', 'EXECUTE')
     OR has_function_privilege('anon', 'nomenu_i18n.decorate_public_drink_brewery(jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous role can execute a private brewery helper';
  END IF;

  IF nomenu_i18n.country_flag('us') <> '🇺🇸'
     OR nomenu_i18n.country_flag('USA') IS NOT NULL THEN
    RAISE EXCEPTION 'Country-code flag conversion is incorrect';
  END IF;

  v_ref := nomenu_i18n.brewery_ref(
    '00000000-0000-4000-8000-000000000001'::uuid,
    'US',
    'RAR Brewing',
    'RAR Brewing',
    true
  );
  IF v_ref->>'display_name' <> '🇺🇸 RAR Brewing'
     OR v_ref->>'display_name_en' <> '🇺🇸 RAR Brewing' THEN
    RAISE EXCEPTION 'Flagged brewery display order is incorrect: %', v_ref;
  END IF;

  SELECT d.id, d.tenant_id, dc.id
  INTO v_drink_id, v_tenant_id, v_company_id
  FROM public.drinks d
  JOIN public.drink_products dp ON dp.id = d.product_id AND dp.status = 'active'
  JOIN public.drink_companies dc ON dc.id = dp.company_id AND dc.status = 'active'
  WHERE nullif(trim(dc.country_code), '') IS NOT NULL
  LIMIT 1;

  IF v_drink_id IS NOT NULL THEN
    UPDATE public.tenants
    SET show_brewery_country_flag = true
    WHERE id = v_tenant_id;

    v_decorated := nomenu_i18n.decorate_public_drink_brewery(
      jsonb_build_object(
        'id', v_drink_id,
        'beer', jsonb_build_object('brewery', 'Test Brewery', 'brewery_en', 'Test Brewery')
      )
    );

    IF v_decorated->'beer'->'brewery_ref'->>'id' <> v_company_id::text
       OR v_decorated->'beer'->'brewery_ref'->>'display_name'
          <> nomenu_i18n.country_flag(v_decorated->'beer'->'brewery_ref'->>'country_code') || ' Test Brewery' THEN
      RAISE EXCEPTION 'Linked drink did not receive an id-based flagged brewery ref: %', v_decorated;
    END IF;
  END IF;
END
$$;

ROLLBACK;
