-- Phase 6: drink_status_events + consumer taplist partitions
-- - Main list excludes sold_out
-- - recently_sold_out: sold_out within current bar business day (05:00 Asia/Shanghai)
-- - coming_soon: separate array
-- Forward-only.

-- ---------------------------------------------------------------------------
-- 1) drink_status_events
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.drink_status_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  drink_id uuid NOT NULL REFERENCES public.drinks (id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  actor_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT drink_status_events_to_status_check
    CHECK (to_status IN ('new', 'available', 'low', 'sold_out', 'coming_soon'))
);

CREATE INDEX IF NOT EXISTS drink_status_events_drink_created_idx
  ON public.drink_status_events (drink_id, created_at DESC);

CREATE INDEX IF NOT EXISTS drink_status_events_tenant_created_idx
  ON public.drink_status_events (tenant_id, created_at DESC);

ALTER TABLE public.drink_status_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS drink_status_events_select_member ON public.drink_status_events;
CREATE POLICY drink_status_events_select_member
  ON public.drink_status_events
  FOR SELECT
  TO authenticated
  USING (public.taplist_can_view_tenant(tenant_id));

-- ---------------------------------------------------------------------------
-- 2) Trigger: log public_status changes
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trg_log_drink_status_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.public_status IS DISTINCT FROM OLD.public_status
     AND NEW.public_status IS NOT NULL
  THEN
    INSERT INTO public.drink_status_events (
      tenant_id,
      drink_id,
      from_status,
      to_status,
      actor_user_id
    ) VALUES (
      NEW.tenant_id,
      NEW.id,
      OLD.public_status,
      NEW.public_status,
      auth.uid()
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_drink_status_event ON public.drinks;
CREATE TRIGGER trg_log_drink_status_event
  AFTER UPDATE OF public_status ON public.drinks
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_log_drink_status_event();

-- ---------------------------------------------------------------------------
-- 3) Business-day helper (bar day flips at 05:00 Asia/Shanghai)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.taplist_business_day_start(p_at timestamptz DEFAULT now())
RETURNS timestamptz
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT (
    date_trunc(
      'day',
      (p_at AT TIME ZONE 'Asia/Shanghai') - interval '5 hours'
    ) + interval '5 hours'
  ) AT TIME ZONE 'Asia/Shanghai';
$$;

-- ---------------------------------------------------------------------------
-- 4) Owner: recent status events for a drink
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_drink_status_events(
  p_drink_id uuid,
  p_limit integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 50));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT d.tenant_id INTO v_tenant_id
  FROM public.drinks d
  WHERE d.id = p_drink_id;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Drink not found';
  END IF;

  IF NOT public.taplist_can_view_tenant(v_tenant_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'events', coalesce(
      (
        SELECT jsonb_agg(row_obj ORDER BY created_at DESC)
        FROM (
          SELECT
            jsonb_build_object(
              'id', e.id,
              'from_status', e.from_status,
              'to_status', e.to_status,
              'from_status_zh', CASE
                WHEN e.from_status IS NULL THEN NULL
                ELSE public.taplist_public_status_zh(e.from_status)
              END,
              'to_status_zh', public.taplist_public_status_zh(e.to_status),
              'actor_user_id', e.actor_user_id,
              'created_at', e.created_at
            ) AS row_obj,
            e.created_at
          FROM public.drink_status_events e
          WHERE e.drink_id = p_drink_id
          ORDER BY e.created_at DESC
          LIMIT v_limit
        ) x
      ),
      '[]'::jsonb
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_drink_status_events(uuid, integer) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5) get_public_taplist_drinks: partitions
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_public_taplist_drinks(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ok boolean;
  v_mode text;
  v_biz_start timestamptz := public.taplist_business_day_start(now());
BEGIN
  SELECT (t.status = 'active' AND t.is_public_visible), coalesce(t.public_price_mode, 'hide')
  INTO v_ok, v_mode
  FROM public.tenants t
  WHERE t.id = p_tenant_id;

  IF v_ok IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END IF;

  IF NOT v_ok THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_public');
  END IF;

  RETURN (
    WITH base AS (
      SELECT
        d.id,
        d.category_id,
        d.brand_name,
        d.public_status,
        d.public_sort_order,
        d.public_status_changed_at,
        d.product_id,
        CASE
          WHEN d.product_id IS NULL THEN d.name
          ELSE coalesce(nullif(trim(d.display_name), ''), dp.name, d.name)
        END AS display_name,
        CASE
          WHEN d.product_id IS NULL THEN d.image_url
          ELSE coalesce(nullif(trim(d.image_url), ''), dp.image_url)
        END AS image_url,
        coalesce(dp.brewery, dp.brand_name, p.brewery, d.brand_name) AS brewery,
        coalesce(dp.beer_style, p.beer_style) AS beer_style,
        coalesce(dp.abv, p.abv) AS abv,
        coalesce(dp.ibu, p.ibu) AS ibu,
        coalesce(dp.country, p.country) AS country,
        CASE
          WHEN d.product_id IS NULL THEN p.description
          ELSE coalesce(
            nullif(trim(d.display_description), ''),
            dp.tasting_note,
            dp.description,
            p.description
          )
        END AS description,
        CASE
          WHEN v_mode = 'hide' THEN '[]'::jsonb
          ELSE (
            SELECT coalesce(
              jsonb_agg(
                jsonb_build_object(
                  'id', so.id,
                  'serving_type', so.serving_type,
                  'label', so.label,
                  'volume_ml', so.volume_ml,
                  'price', so.price,
                  'is_default', so.is_default,
                  'is_active', so.is_active,
                  'public_sort_order', so.public_sort_order
                )
                ORDER BY so.public_sort_order, so.label
              ),
              '[]'::jsonb
            )
            FROM public.drink_serving_options so
            WHERE so.drink_id = d.id
              AND so.is_active = true
              AND so.price > 0
          )
        END AS serving_options,
        CASE d.public_status
          WHEN 'new' THEN 0
          WHEN 'available' THEN 1
          WHEN 'low' THEN 2
          WHEN 'coming_soon' THEN 3
          WHEN 'sold_out' THEN 4
          ELSE 5
        END AS status_rank
      FROM public.drinks d
      INNER JOIN public.categories c
        ON c.id = d.category_id AND c.tenant_id = d.tenant_id
      LEFT JOIN public.drink_beer_profiles p ON p.drink_id = d.id
      LEFT JOIN public.drink_products dp
        ON dp.id = d.product_id AND dp.status = 'active'
      WHERE d.tenant_id = p_tenant_id
        AND d.enabled = true
        AND d.is_public_visible = true
        AND d.public_sort_order IS NOT NULL
        AND d.public_sort_order >= 1
        AND c.enabled = true
        AND c.is_public_visible = true
    ),
    shaped AS (
      SELECT
        jsonb_build_object(
          'id', b.id,
          'category_id', b.category_id,
          'brand_name', b.brand_name,
          'name', b.display_name,
          'image_url', b.image_url,
          'public_status', public.taplist_public_status_zh(b.public_status),
          'public_sort_order', b.public_sort_order,
          'product_id', b.product_id,
          'public_status_changed_at', b.public_status_changed_at,
          'beer', CASE
            WHEN b.brewery IS NULL
              AND b.beer_style IS NULL
              AND b.abv IS NULL
              AND b.ibu IS NULL
              AND b.country IS NULL
              AND b.description IS NULL
            THEN NULL
            ELSE jsonb_build_object(
              'brewery', b.brewery,
              'beer_style', b.beer_style,
              'abv', b.abv,
              'ibu', b.ibu,
              'country', b.country,
              'description', b.description
            )
          END,
          'serving_options', b.serving_options
        ) AS drink_obj,
        b.public_status,
        b.status_rank,
        b.public_sort_order,
        b.public_status_changed_at,
        lower(b.display_name) AS name_sort
      FROM base b
    )
    SELECT jsonb_build_object(
      'ok', true,
      'public_price_mode', v_mode,
      'business_day_start', v_biz_start,
      'drinks', coalesce(
        (
          SELECT jsonb_agg(drink_obj ORDER BY status_rank, public_sort_order, name_sort)
          FROM shaped
          WHERE public_status NOT IN ('sold_out', 'coming_soon')
        ),
        '[]'::jsonb
      ),
      'coming_soon', coalesce(
        (
          SELECT jsonb_agg(drink_obj ORDER BY public_sort_order, name_sort)
          FROM shaped
          WHERE public_status = 'coming_soon'
        ),
        '[]'::jsonb
      ),
      'recently_sold_out', coalesce(
        (
          SELECT jsonb_agg(drink_obj ORDER BY public_status_changed_at DESC NULLS LAST, public_sort_order, name_sort)
          FROM shaped
          WHERE public_status = 'sold_out'
            AND public_status_changed_at IS NOT NULL
            AND public_status_changed_at >= v_biz_start
        ),
        '[]'::jsonb
      )
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_taplist_drinks(uuid) TO anon, authenticated;
