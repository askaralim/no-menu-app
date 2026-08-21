-- Private consumer drink-history insights for Tonight and current-month sharing.
-- Additive only: existing drink-log write/read RPCs remain unchanged.

CREATE OR REPLACE FUNCTION public.get_my_drink_insights(p_at timestamptz DEFAULT now())
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_at timestamptz := coalesce(p_at, now());
  v_business_day_start timestamptz := public.taplist_business_day_start(coalesce(p_at, now()));
  v_month_start timestamptz;
  v_month_end timestamptz;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  v_month_start := date_trunc('month', v_at AT TIME ZONE 'Asia/Shanghai') AT TIME ZONE 'Asia/Shanghai';
  v_month_end := (date_trunc('month', v_at AT TIME ZONE 'Asia/Shanghai') + interval '1 month')
    AT TIME ZONE 'Asia/Shanghai';

  RETURN (
    WITH light_details AS (
      SELECT
        l.id AS light_id,
        l.first_lit_at,
        l.last_activity_at,
        coalesce(dp.name, representative.drink_name) AS name,
        coalesce(dp.brewery, representative.brewery, representative.brand_name) AS brewery,
        coalesce(dp.beer_style, representative.beer_style) AS beer_style,
        coalesce(dp.image_url, representative.image_url) AS image_url
      FROM public.user_drink_lights l
      LEFT JOIN public.drink_products dp ON dp.id = l.product_id
      LEFT JOIN LATERAL (
        SELECT
          d.name AS drink_name,
          d.brand_name,
          d.image_url,
          p.brewery,
          p.beer_style
        FROM public.user_drink_venues uv
        LEFT JOIN public.drinks d ON d.id = uv.source_drink_id
        LEFT JOIN public.drink_beer_profiles p ON p.drink_id = d.id
        WHERE uv.light_id = l.id
        ORDER BY uv.first_drank_at DESC
        LIMIT 1
      ) representative ON true
      WHERE l.user_id = v_user_id
    ),
    month_lights AS (
      SELECT *
      FROM light_details
      WHERE first_lit_at >= v_month_start AND first_lit_at < v_month_end
    ),
    month_styles AS (
      SELECT coalesce(beer_style, '其他') AS style, count(*)::integer AS count
      FROM month_lights
      GROUP BY coalesce(beer_style, '其他')
    ),
    first_style_dates AS (
      SELECT beer_style AS style, min(first_lit_at) AS first_recorded_at
      FROM light_details
      WHERE beer_style IS NOT NULL
      GROUP BY beer_style
    ),
    first_new_style AS (
      SELECT fs.style, fs.first_recorded_at, ml.light_id
      FROM first_style_dates fs
      JOIN LATERAL (
        SELECT light_id
        FROM month_lights
        WHERE beer_style = fs.style
        ORDER BY first_lit_at ASC, light_id ASC
        LIMIT 1
      ) ml ON true
      WHERE fs.first_recorded_at >= v_month_start AND fs.first_recorded_at < v_month_end
      ORDER BY fs.first_recorded_at ASC, fs.style ASC
      LIMIT 1
    ),
    top_style AS (
      SELECT style, count
      FROM month_styles
      ORDER BY count DESC, style ASC
      LIMIT 1
    ),
    month_bar_count AS (
      SELECT count(DISTINCT uv.tenant_id)::integer AS count
      FROM public.user_drink_venues uv
      JOIN month_lights ml ON ml.light_id = uv.light_id
      WHERE uv.user_id = v_user_id
        AND uv.first_drank_at >= v_month_start
        AND uv.first_drank_at < v_month_end
    ),
    tonight_activity AS (
      SELECT
        uv.light_id,
        max(uv.first_drank_at) AS activity_at,
        count(DISTINCT uv.tenant_id)::integer AS venue_count
      FROM public.user_drink_venues uv
      WHERE uv.user_id = v_user_id
        AND uv.first_drank_at >= v_business_day_start
        AND uv.first_drank_at <= v_at
      GROUP BY uv.light_id
    ),
    tonight_bar_count AS (
      SELECT count(DISTINCT uv.tenant_id)::integer AS count
      FROM public.user_drink_venues uv
      WHERE uv.user_id = v_user_id
        AND uv.first_drank_at >= v_business_day_start
        AND uv.first_drank_at <= v_at
    )
    SELECT jsonb_build_object(
      'ok', true,
      'generated_at', v_at,
      'tonight', jsonb_build_object(
        'business_day_start', v_business_day_start,
        'drink_count', (SELECT count(*) FROM tonight_activity),
        'bar_count', (SELECT count FROM tonight_bar_count),
        'drinks', coalesce((
          SELECT jsonb_agg(jsonb_build_object(
            'light_id', ld.light_id,
            'name', ld.name,
            'brewery', ld.brewery,
            'beer_style', ld.beer_style,
            'image_url', ld.image_url,
            'recorded_at', ta.activity_at
          ) ORDER BY ta.activity_at DESC, ld.light_id DESC)
          FROM tonight_activity ta
          JOIN light_details ld ON ld.light_id = ta.light_id
        ), '[]'::jsonb)
      ),
      'month', jsonb_build_object(
        'month_start', v_month_start,
        'month_end', v_month_end,
        'new_drink_count', (SELECT count(*) FROM month_lights),
        'bar_count', (SELECT count FROM month_bar_count),
        'style_counts', coalesce((
          SELECT jsonb_agg(jsonb_build_object('style', style, 'count', count) ORDER BY count DESC, style ASC)
          FROM month_styles
        ), '[]'::jsonb),
        'first_drink_id', (SELECT light_id FROM month_lights ORDER BY first_lit_at ASC, light_id ASC LIMIT 1),
        'first_new_style', (SELECT style FROM first_new_style),
        'first_new_style_drink_id', (SELECT light_id FROM first_new_style),
        'top_style', (SELECT style FROM top_style),
        'latest_drink_id', (SELECT light_id FROM month_lights ORDER BY first_lit_at DESC, light_id DESC LIMIT 1),
        'drinks', coalesce((
          SELECT jsonb_agg(jsonb_build_object(
            'light_id', ml.light_id,
            'name', ml.name,
            'brewery', ml.brewery,
            'beer_style', ml.beer_style,
            'image_url', ml.image_url,
            'recorded_at', ml.first_lit_at
          ) ORDER BY ml.first_lit_at DESC, ml.light_id DESC)
          FROM month_lights ml
        ), '[]'::jsonb)
      )
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_drink_insights(timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_drink_insights(timestamptz) TO authenticated;
