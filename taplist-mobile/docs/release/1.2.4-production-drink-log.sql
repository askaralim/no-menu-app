-- No Menu Taplist 1.2.4 production deployment
-- Consumer DRINK LOG v1: private per-user drink lights and venue experiences.
--
-- Run this file once in the production Supabase SQL Editor.
-- It is intentionally independent from Supabase migration history because the
-- linked production project currently has no recorded remote migrations.

BEGIN;

DO $dependency_check$
BEGIN
  IF to_regclass('public.drinks') IS NULL
    OR to_regclass('public.drink_products') IS NULL
    OR to_regclass('public.drink_beer_profiles') IS NULL
    OR to_regclass('public.tenants') IS NULL
    OR to_regprocedure('public.is_super_admin()') IS NULL
  THEN
    RAISE EXCEPTION 'DRINK LOG dependencies are missing; no changes were committed';
  END IF;
END;
$dependency_check$;

CREATE TABLE IF NOT EXISTS public.user_drink_lights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.drink_products(id) ON DELETE SET NULL,
  provisional_drink_id uuid REFERENCES public.drinks(id) ON DELETE CASCADE,
  first_lit_at timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_drink_lights_identity_check CHECK (
    product_id IS NOT NULL OR provisional_drink_id IS NOT NULL
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS user_drink_lights_user_product_uidx
  ON public.user_drink_lights(user_id, product_id)
  WHERE product_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS user_drink_lights_user_provisional_uidx
  ON public.user_drink_lights(user_id, provisional_drink_id)
  WHERE product_id IS NULL AND provisional_drink_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS user_drink_lights_user_activity_idx
  ON public.user_drink_lights(user_id, last_activity_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS public.user_drink_venues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  light_id uuid NOT NULL REFERENCES public.user_drink_lights(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  source_drink_id uuid REFERENCES public.drinks(id) ON DELETE SET NULL,
  first_drank_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(light_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS user_drink_venues_user_idx
  ON public.user_drink_venues(user_id, first_drank_at DESC);

ALTER TABLE public.user_drink_lights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_drink_venues ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_drink_lights_own_rows ON public.user_drink_lights;
CREATE POLICY user_drink_lights_own_rows ON public.user_drink_lights
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS user_drink_venues_own_rows ON public.user_drink_venues;
CREATE POLICY user_drink_venues_own_rows ON public.user_drink_venues
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.light_my_drink(p_drink_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_drink public.drinks%ROWTYPE;
  v_light public.user_drink_lights%ROWTYPE;
  v_venue_id uuid;
  v_created_light boolean := false;
  v_created_venue boolean := false;
  v_drink_count integer;
  v_bar_count integer;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_drink FROM public.drinks WHERE id = p_drink_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'code', 'DRINK_NOT_FOUND'); END IF;

  IF v_drink.product_id IS NOT NULL THEN
    SELECT * INTO v_light
    FROM public.user_drink_lights
    WHERE user_id = v_user_id AND product_id = v_drink.product_id;
  ELSE
    SELECT * INTO v_light
    FROM public.user_drink_lights
    WHERE user_id = v_user_id AND product_id IS NULL AND provisional_drink_id = v_drink.id;
  END IF;

  IF v_light.id IS NULL THEN
    INSERT INTO public.user_drink_lights(user_id, product_id, provisional_drink_id)
    VALUES (
      v_user_id,
      v_drink.product_id,
      CASE WHEN v_drink.product_id IS NULL THEN v_drink.id ELSE NULL END
    )
    RETURNING * INTO v_light;
    v_created_light := true;
  END IF;

  INSERT INTO public.user_drink_venues(light_id, user_id, tenant_id, source_drink_id)
  VALUES (v_light.id, v_user_id, v_drink.tenant_id, v_drink.id)
  ON CONFLICT (light_id, tenant_id) DO NOTHING
  RETURNING id INTO v_venue_id;
  v_created_venue := v_venue_id IS NOT NULL;

  IF v_created_venue THEN
    UPDATE public.user_drink_lights
    SET last_activity_at = now(), updated_at = now()
    WHERE id = v_light.id
    RETURNING * INTO v_light;
  END IF;

  SELECT count(*)::integer INTO v_drink_count
  FROM public.user_drink_lights WHERE user_id = v_user_id;
  SELECT count(DISTINCT tenant_id)::integer INTO v_bar_count
  FROM public.user_drink_venues WHERE user_id = v_user_id;

  RETURN jsonb_build_object(
    'ok', true,
    'light_id', v_light.id,
    'created_light', v_created_light,
    'created_venue', v_created_venue,
    'is_lit', true,
    'is_current_venue_lit', true,
    'first_lit_at', v_light.first_lit_at,
    'drink_count', v_drink_count,
    'bar_count', v_bar_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_drink_state(p_drink_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_drink public.drinks%ROWTYPE;
  v_light public.user_drink_lights%ROWTYPE;
  v_current_venue boolean := false;
  v_venue_count integer := 0;
BEGIN
  IF v_user_id IS NULL THEN RETURN jsonb_build_object('ok', true, 'is_lit', false, 'is_current_venue_lit', false, 'venue_count', 0); END IF;
  SELECT * INTO v_drink FROM public.drinks WHERE id = p_drink_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'code', 'DRINK_NOT_FOUND'); END IF;

  SELECT * INTO v_light FROM public.user_drink_lights
  WHERE user_id = v_user_id
    AND ((v_drink.product_id IS NOT NULL AND product_id = v_drink.product_id)
      OR (v_drink.product_id IS NULL AND product_id IS NULL AND provisional_drink_id = v_drink.id))
  LIMIT 1;

  IF v_light.id IS NOT NULL THEN
    SELECT count(*)::integer, bool_or(tenant_id = v_drink.tenant_id)
    INTO v_venue_count, v_current_venue
    FROM public.user_drink_venues WHERE light_id = v_light.id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'light_id', v_light.id,
    'is_lit', v_light.id IS NOT NULL,
    'is_current_venue_lit', coalesce(v_current_venue, false),
    'first_lit_at', v_light.first_lit_at,
    'venue_count', coalesce(v_venue_count, 0)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_drink_history(p_cursor timestamptz DEFAULT NULL, p_limit integer DEFAULT 60)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  RETURN jsonb_build_object(
    'ok', true,
    'results', coalesce((
      SELECT jsonb_agg(row_obj ORDER BY activity_at DESC)
      FROM (
        SELECT jsonb_build_object(
          'light_id', l.id,
          'product_id', l.product_id,
          'source_drink_id', coalesce(representative.source_drink_id, l.provisional_drink_id),
          'tenant_slug', representative.tenant_slug,
          'name', coalesce(dp.name, representative.drink_name),
          'brewery', coalesce(dp.brewery, representative.brewery, representative.brand_name),
          'beer_style', coalesce(dp.beer_style, representative.beer_style),
          'image_url', coalesce(dp.image_url, representative.image_url),
          'first_lit_at', l.first_lit_at,
          'last_activity_at', l.last_activity_at,
          'venue_count', (SELECT count(*) FROM public.user_drink_venues uv WHERE uv.light_id = l.id),
          'venues', coalesce((
            SELECT jsonb_agg(jsonb_build_object(
              'tenant_id', uv.tenant_id,
              'tenant_name', coalesce(t.display_name, t.name),
              'tenant_slug', t.slug,
              'country', t.country,
              'city', t.city,
              'district', t.district,
              'first_drank_at', uv.first_drank_at
            ) ORDER BY uv.first_drank_at DESC)
            FROM public.user_drink_venues uv
            JOIN public.tenants t ON t.id = uv.tenant_id
            WHERE uv.light_id = l.id
          ), '[]'::jsonb)
        ) AS row_obj,
        l.last_activity_at AS activity_at
        FROM public.user_drink_lights l
        LEFT JOIN public.drink_products dp ON dp.id = l.product_id
        LEFT JOIN LATERAL (
          SELECT uv.source_drink_id, t.slug AS tenant_slug, d.name AS drink_name,
            d.brand_name, d.image_url, p.brewery, p.beer_style
          FROM public.user_drink_venues uv
          LEFT JOIN public.drinks d ON d.id = uv.source_drink_id
          LEFT JOIN public.drink_beer_profiles p ON p.drink_id = d.id
          JOIN public.tenants t ON t.id = uv.tenant_id
          WHERE uv.light_id = l.id
          ORDER BY uv.first_drank_at DESC
          LIMIT 1
        ) representative ON true
        WHERE l.user_id = v_user_id
          AND (p_cursor IS NULL OR l.last_activity_at < p_cursor)
        ORDER BY l.last_activity_at DESC
        LIMIT greatest(1, least(coalesce(p_limit, 60), 100))
      ) rows
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_drink_summary()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_history jsonb;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  v_history := public.get_my_drink_history(NULL, 6);
  RETURN jsonb_build_object(
    'ok', true,
    'drink_count', (SELECT count(*) FROM public.user_drink_lights WHERE user_id = v_user_id),
    'bar_count', (SELECT count(DISTINCT tenant_id) FROM public.user_drink_venues WHERE user_id = v_user_id),
    'started_at', (SELECT min(first_lit_at) FROM public.user_drink_lights WHERE user_id = v_user_id),
    'recent', coalesce(v_history->'results', '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_my_drink_venue(p_light_id uuid, p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_remaining integer;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  DELETE FROM public.user_drink_venues
  WHERE light_id = p_light_id AND tenant_id = p_tenant_id AND user_id = v_user_id;
  SELECT count(*)::integer INTO v_remaining FROM public.user_drink_venues WHERE light_id = p_light_id AND user_id = v_user_id;
  IF v_remaining = 0 THEN DELETE FROM public.user_drink_lights WHERE id = p_light_id AND user_id = v_user_id; END IF;
  RETURN jsonb_build_object('ok', true, 'remaining_venues', v_remaining, 'is_lit', v_remaining > 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.unlight_my_drink(p_light_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  DELETE FROM public.user_drink_lights WHERE id = p_light_id AND user_id = auth.uid();
  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.reconcile_provisional_drink(p_drink_id uuid, p_product_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row record;
  v_target_id uuid;
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  FOR v_row IN SELECT * FROM public.user_drink_lights WHERE provisional_drink_id = p_drink_id LOOP
    SELECT id INTO v_target_id FROM public.user_drink_lights
    WHERE user_id = v_row.user_id AND product_id = p_product_id;
    IF v_target_id IS NULL THEN
      UPDATE public.user_drink_lights SET product_id = p_product_id, provisional_drink_id = NULL, updated_at = now()
      WHERE id = v_row.id;
    ELSE
      INSERT INTO public.user_drink_venues(light_id, user_id, tenant_id, source_drink_id, first_drank_at)
      SELECT v_target_id, user_id, tenant_id, source_drink_id, first_drank_at
      FROM public.user_drink_venues WHERE light_id = v_row.id
      ON CONFLICT (light_id, tenant_id) DO UPDATE SET
        first_drank_at = least(user_drink_venues.first_drank_at, excluded.first_drank_at);
      UPDATE public.user_drink_lights
      SET first_lit_at = least(first_lit_at, v_row.first_lit_at),
          last_activity_at = greatest(last_activity_at, v_row.last_activity_at), updated_at = now()
      WHERE id = v_target_id;
      DELETE FROM public.user_drink_lights WHERE id = v_row.id;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_reconcile_drink_log_product_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row record;
  v_target_id uuid;
BEGIN
  IF NEW.product_id IS NULL OR NEW.product_id IS NOT DISTINCT FROM OLD.product_id THEN
    RETURN NEW;
  END IF;
  FOR v_row IN SELECT * FROM public.user_drink_lights WHERE provisional_drink_id = NEW.id LOOP
    SELECT id INTO v_target_id FROM public.user_drink_lights
    WHERE user_id = v_row.user_id AND product_id = NEW.product_id;
    IF v_target_id IS NULL THEN
      UPDATE public.user_drink_lights
      SET product_id = NEW.product_id, provisional_drink_id = NULL, updated_at = now()
      WHERE id = v_row.id;
    ELSE
      INSERT INTO public.user_drink_venues(light_id, user_id, tenant_id, source_drink_id, first_drank_at)
      SELECT v_target_id, user_id, tenant_id, source_drink_id, first_drank_at
      FROM public.user_drink_venues WHERE light_id = v_row.id
      ON CONFLICT (light_id, tenant_id) DO UPDATE SET
        first_drank_at = least(user_drink_venues.first_drank_at, excluded.first_drank_at);
      UPDATE public.user_drink_lights
      SET first_lit_at = least(first_lit_at, v_row.first_lit_at),
          last_activity_at = greatest(last_activity_at, v_row.last_activity_at), updated_at = now()
      WHERE id = v_target_id;
      DELETE FROM public.user_drink_lights WHERE id = v_row.id;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_drinks_reconcile_drink_log_product_link ON public.drinks;
CREATE TRIGGER trg_drinks_reconcile_drink_log_product_link
AFTER UPDATE OF product_id ON public.drinks
FOR EACH ROW EXECUTE FUNCTION public.trg_reconcile_drink_log_product_link();

REVOKE ALL ON FUNCTION public.light_my_drink(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_drink_state(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_drink_history(timestamptz, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_drink_summary() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.remove_my_drink_venue(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.unlight_my_drink(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reconcile_provisional_drink(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.trg_reconcile_drink_log_product_link() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.light_my_drink(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_drink_state(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_drink_history(timestamptz, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_drink_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_my_drink_venue(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unlight_my_drink(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_provisional_drink(uuid, uuid) TO authenticated;

COMMIT;

-- Expected result: two true table checks, seven true API function checks,
-- one true trigger-function check, and one true trigger check.
SELECT
  to_regclass('public.user_drink_lights') IS NOT NULL AS user_drink_lights_ready,
  to_regclass('public.user_drink_venues') IS NOT NULL AS user_drink_venues_ready,
  to_regprocedure('public.light_my_drink(uuid)') IS NOT NULL AS light_my_drink_ready,
  to_regprocedure('public.get_my_drink_state(uuid)') IS NOT NULL AS get_my_drink_state_ready,
  to_regprocedure('public.get_my_drink_history(timestamptz,integer)') IS NOT NULL AS get_my_drink_history_ready,
  to_regprocedure('public.get_my_drink_summary()') IS NOT NULL AS get_my_drink_summary_ready,
  to_regprocedure('public.remove_my_drink_venue(uuid,uuid)') IS NOT NULL AS remove_my_drink_venue_ready,
  to_regprocedure('public.unlight_my_drink(uuid)') IS NOT NULL AS unlight_my_drink_ready,
  to_regprocedure('public.reconcile_provisional_drink(uuid,uuid)') IS NOT NULL AS reconcile_provisional_drink_ready,
  to_regprocedure('public.trg_reconcile_drink_log_product_link()') IS NOT NULL AS reconcile_trigger_function_ready,
  EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_drinks_reconcile_drink_log_product_link'
      AND NOT tgisinternal
  ) AS reconcile_trigger_ready;
