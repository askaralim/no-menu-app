-- 6x6 campaign regression checks (run locally after 20261105192649).
-- Usage: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/six_by_six_campaigns.sql

BEGIN;

DO $$
DECLARE
  v_campaign_id uuid := gen_random_uuid();
  v_user_id uuid := gen_random_uuid();
  v_row record;
  v_stop_count integer := 0;
  v_old_event_count integer;
  v_new_event_count integer;
  v_event_tenant uuid;
  v_event_id text;
  v_validation jsonb;
BEGIN
  IF to_regprocedure('public.list_public_campaigns(text)') IS NULL
    OR to_regprocedure('public.get_public_campaign(text)') IS NULL
    OR to_regprocedure('public.get_my_campaign_progress(uuid)') IS NULL
    OR to_regprocedure('public.complete_my_campaign_stop(uuid,uuid)') IS NULL
    OR to_regprocedure('public.undo_my_campaign_stop(uuid)') IS NULL THEN
    RAISE EXCEPTION 'A required 6x6 RPC is missing';
  END IF;

  IF NOT has_function_privilege('anon', 'public.list_public_campaigns(text)', 'EXECUTE')
    OR NOT has_function_privilege('anon', 'public.get_public_campaign(text)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.complete_my_campaign_stop(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Campaign RPC grants do not match the public/authenticated contract';
  END IF;

  SELECT count(*) INTO v_old_event_count FROM public.bar_events;
  SELECT tenant_id INTO v_event_tenant FROM public.drinks WHERE tenant_id IS NOT NULL LIMIT 1;
  INSERT INTO public.bar_events(
    tenant_id, title, event_type, image_url, is_public_visible
  ) VALUES (
    v_event_tenant, '__6x6_legacy_event_test__', 'other',
    'https://example.invalid/legacy.jpg', false
  ) RETURNING id::text INTO v_event_id;
  SELECT count(*) INTO v_new_event_count FROM public.bar_events;
  IF v_new_event_count <> v_old_event_count + 1 THEN
    RAISE EXCEPTION 'Legacy bar event payload no longer inserts';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.bar_events
    WHERE id::text = v_event_id
      AND image_url = 'https://example.invalid/legacy.jpg'
      AND card_image_url IS NULL
      AND detail_image_urls = '{}'::text[]
  ) THEN
    RAISE EXCEPTION 'Legacy event image fallback fields changed unexpectedly';
  END IF;

  INSERT INTO public.campaign_events(
    id, slug, qr_code, city, title, card_image_url, detail_image_urls,
    purchase_qr_url, purchase_short_link, mini_program_code_url, start_at, end_at
  ) VALUES (
    v_campaign_id, 'six-by-six-test', 'T6X6TEST', 'Shanghai', '__6x6_test__',
    'https://example.invalid/card.jpg', '{}'::text[],
    'https://example.invalid/purchase.png', '#小程序://快团团/pqcSzp0XmnRV6Tj', NULL,
    now() - interval '1 hour', now() + interval '1 hour'
  );

  FOR v_row IN
    SELECT DISTINCT ON (t.id)
      t.id AS tenant_id,
      d.id AS drink_id
    FROM public.tenants t
    JOIN public.drinks d ON d.tenant_id = t.id
    WHERE t.status = 'active'
      AND t.is_public_visible
      AND t.roadmap_latitude IS NOT NULL
      AND t.roadmap_longitude IS NOT NULL
      AND d.enabled
      AND d.is_public_visible
      AND d.public_status IN ('new', 'available', 'low', 'sold_out')
    ORDER BY t.id, d.public_sort_order NULLS LAST, d.id
    LIMIT 6
  LOOP
    v_stop_count := v_stop_count + 1;
    INSERT INTO public.campaign_stops(
      campaign_id, tenant_id, drink_id, brewery_label, sort_order
    ) VALUES (
      v_campaign_id, v_row.tenant_id, v_row.drink_id,
      'Test Brewery ' || v_stop_count, v_stop_count
    );
  END LOOP;

  IF v_stop_count <> 6 THEN
    RAISE EXCEPTION 'Six eligible local tenant/drink fixtures are required';
  END IF;

  v_validation := public.validate_campaign_for_publication(v_campaign_id);
  IF NOT coalesce((v_validation->>'ok')::boolean, false) THEN
    RAISE EXCEPTION 'Valid six-stop campaign failed publication validation: %', v_validation;
  END IF;

  UPDATE public.campaign_events SET is_public_visible = true WHERE id = v_campaign_id;

  INSERT INTO auth.users(
    instance_id, id, aud, role, email, encrypted_password,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new,
    email_change, phone_change, phone_change_token,
    email_change_token_current, reauthentication_token,
    is_sso_user, is_anonymous
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', v_user_id,
    'authenticated', 'authenticated',
    'six-by-six-' || replace(v_user_id::text, '-', '') || '@example.invalid', '',
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
    '{}'::jsonb, now(), now(), '', '', '', '', '', '', '', '', false, false
  );

  PERFORM set_config('six_by_six_test.campaign_id', v_campaign_id::text, true);
  PERFORM set_config('six_by_six_test.user_id', v_user_id::text, true);
END
$$;

SET LOCAL ROLE anon;

DO $$
DECLARE
  v_campaign_id uuid := current_setting('six_by_six_test.campaign_id')::uuid;
  v_payload jsonb;
BEGIN
  v_payload := public.get_public_campaign(v_campaign_id::text);
  IF NOT coalesce((v_payload->>'ok')::boolean, false)
    OR jsonb_array_length(v_payload->'campaign'->'stops') <> 6
    OR v_payload->'campaign'->>'purchase_short_link' IS DISTINCT FROM '#小程序://快团团/pqcSzp0XmnRV6Tj' THEN
    RAISE EXCEPTION 'Anonymous campaign DTO is invalid: %', v_payload;
  END IF;
  BEGIN
    PERFORM 1 FROM public.campaign_events WHERE id = v_campaign_id;
    RAISE EXCEPTION 'Anonymous role unexpectedly has direct campaign_events access';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
END
$$;

RESET ROLE;
SET LOCAL ROLE authenticated;

SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', current_setting('six_by_six_test.user_id'),
    'role', 'authenticated'
  )::text,
  true
);
SELECT set_config('request.jwt.claim.sub', current_setting('six_by_six_test.user_id'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

DO $$
DECLARE
  v_campaign_id uuid := current_setting('six_by_six_test.campaign_id')::uuid;
  v_stop_id uuid;
  v_complete jsonb;
  v_duplicate jsonb;
  v_undo jsonb;
BEGIN
  IF EXISTS (SELECT 1 FROM public.campaign_events WHERE id = v_campaign_id) THEN
    RAISE EXCEPTION 'Authenticated consumer bypassed campaign_events RLS';
  END IF;

  SELECT (value->>'id')::uuid INTO v_stop_id
  FROM jsonb_array_elements((public.get_public_campaign(v_campaign_id::text))->'campaign'->'stops')
  ORDER BY (value->>'sort_order')::integer
  LIMIT 1;

  v_complete := public.complete_my_campaign_stop(v_campaign_id, v_stop_id);
  IF NOT coalesce((v_complete->>'ok')::boolean, false)
    OR (v_complete->>'completed_count')::integer <> 1
    OR v_complete->>'completion_id' IS NULL THEN
    RAISE EXCEPTION 'Campaign completion failed: %', v_complete;
  END IF;

  v_duplicate := public.complete_my_campaign_stop(v_campaign_id, v_stop_id);
  IF v_duplicate->>'code' <> 'ALREADY_COMPLETED'
    OR (v_duplicate->>'completed_count')::integer <> 1 THEN
    RAISE EXCEPTION 'Campaign completion is not idempotent: %', v_duplicate;
  END IF;

  v_undo := public.undo_my_campaign_stop((v_complete->>'completion_id')::uuid);
  IF NOT coalesce((v_undo->>'ok')::boolean, false)
    OR (v_undo->>'completed_count')::integer <> 0 THEN
    RAISE EXCEPTION 'Campaign undo failed: %', v_undo;
  END IF;
END
$$;

RESET ROLE;
-- Run boundary cases as the fixture owner while varying the caller identity.
DO $$
DECLARE
  c uuid := current_setting('six_by_six_test.campaign_id')::uuid;
  u uuid := current_setting('six_by_six_test.user_id')::uuid;
  s public.campaign_stops%ROWTYPE;
  result jsonb;
  completion uuid;
  ordinary_venue uuid;
BEGIN
  SELECT * INTO s FROM public.campaign_stops WHERE campaign_id = c ORDER BY sort_order LIMIT 1;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '{}', true);
  IF public.complete_my_campaign_stop(c,s.id)->>'code' IS DISTINCT FROM 'AUTH_REQUIRED' THEN
    RAISE EXCEPTION 'Missing authentication not rejected';
  END IF;
  PERFORM set_config('request.jwt.claim.sub', u::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub',u,'role','authenticated')::text, true);
  UPDATE public.campaign_events SET start_at=now()+interval '1 hour',end_at=now()+interval '2 hours' WHERE id=c;
  IF public.complete_my_campaign_stop(c,s.id)->>'code' IS DISTINCT FROM 'NOT_STARTED' THEN RAISE EXCEPTION 'Early completion allowed'; END IF;
  UPDATE public.campaign_events SET start_at=now()-interval '2 hours',end_at=now()-interval '1 hour' WHERE id=c;
  IF public.complete_my_campaign_stop(c,s.id)->>'code' IS DISTINCT FROM 'ENDED' THEN RAISE EXCEPTION 'Late completion allowed'; END IF;
  IF NOT (public.get_public_campaign(c::text)->>'ok')::boolean THEN RAISE EXCEPTION 'Ended detail inaccessible'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(public.list_public_campaigns('Shanghai')->'results') e WHERE e->>'id'=c::text) THEN RAISE EXCEPTION 'Ended campaign still listed'; END IF;
  UPDATE public.campaign_events SET start_at=now()-interval '1 hour',end_at=now()+interval '1 hour' WHERE id=c;
  IF public.complete_my_campaign_stop(c,gen_random_uuid())->>'code' IS DISTINCT FROM 'STOP_NOT_FOUND' THEN RAISE EXCEPTION 'Unknown stop allowed'; END IF;
  UPDATE public.drinks SET is_public_visible=false WHERE id=s.drink_id;
  IF public.complete_my_campaign_stop(c,s.id)->>'code' IS DISTINCT FROM 'DRINK_NOT_AVAILABLE' THEN RAISE EXCEPTION 'Hidden drink allowed'; END IF;
  UPDATE public.drinks SET is_public_visible=true WHERE id=s.drink_id;

  -- An ordinary drink record must survive activity undo.
  result := public.light_my_drink(s.drink_id);
  SELECT id INTO ordinary_venue FROM public.user_drink_venues WHERE user_id=u AND light_id=(result->>'light_id')::uuid AND tenant_id=s.tenant_id;
  result := public.complete_my_campaign_stop(c,s.id);
  IF (result->>'created_venue')::boolean THEN RAISE EXCEPTION 'Duplicate ordinary venue created'; END IF;
  PERFORM public.undo_my_campaign_stop((result->>'completion_id')::uuid);
  IF NOT EXISTS (SELECT 1 FROM public.user_drink_venues WHERE id=ordinary_venue) THEN RAISE EXCEPTION 'Existing ordinary venue removed'; END IF;

  FOR s IN SELECT * FROM public.campaign_stops WHERE campaign_id=c ORDER BY sort_order LOOP
    result := public.complete_my_campaign_stop(c,s.id);
    IF NOT (result->>'ok')::boolean THEN RAISE EXCEPTION 'Six-stop completion failed: %', result; END IF;
  END LOOP;
  IF (result->>'completed_count')::integer <> 6 OR NOT (result->>'is_complete')::boolean THEN RAISE EXCEPTION '6/6 not reached'; END IF;
  completion := (result->>'completion_id')::uuid;
  PERFORM set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
  IF (public.get_my_campaign_progress(c)->>'completed_count')::integer <> 0 THEN RAISE EXCEPTION 'Cross-user progress disclosed'; END IF;
  IF public.undo_my_campaign_stop(completion)->>'code' IS DISTINCT FROM 'STOP_NOT_FOUND' THEN RAISE EXCEPTION 'Cross-user undo allowed'; END IF;
  PERFORM set_config('request.jwt.claim.sub', u::text, true);
  UPDATE public.user_campaign_stop_completions SET completed_at=now()-interval '6 minutes' WHERE id=completion;
  IF public.undo_my_campaign_stop(completion)->>'code' IS DISTINCT FROM 'UNDO_EXPIRED' THEN RAISE EXCEPTION 'Expired undo allowed'; END IF;
  UPDATE public.user_campaign_stop_completions SET completed_at=now() WHERE id=completion;
  IF (public.undo_my_campaign_stop(completion)->>'completed_count')::integer <> 5 THEN RAISE EXCEPTION 'Undo did not restore 5/6'; END IF;
  UPDATE public.campaign_events SET is_public_visible=false WHERE id=c;
  IF public.get_public_campaign(c::text)->>'code' IS DISTINCT FROM 'NOT_PUBLIC' THEN RAISE EXCEPTION 'Hidden campaign exposed'; END IF;
END $$;
ROLLBACK;
