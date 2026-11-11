-- Additive brewery identity/display contract for new consumer clients.
-- Legacy brewery strings and RPC signatures remain unchanged.

-- Fail fast instead of waiting behind a long-running transaction on tenants.
SET lock_timeout = '1s';

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS show_brewery_country_flag boolean NOT NULL DEFAULT false;

RESET lock_timeout;

COMMENT ON COLUMN public.tenants.show_brewery_country_flag IS
  'When true, v2 venue-scoped brewery display names are prefixed with the verified company country flag.';

CREATE OR REPLACE FUNCTION nomenu_i18n.country_flag(p_country_code text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN upper(trim(coalesce(p_country_code, ''))) ~ '^[A-Z]{2}$' THEN
      chr(ascii(substr(upper(trim(p_country_code)), 1, 1)) + 127397) ||
      chr(ascii(substr(upper(trim(p_country_code)), 2, 1)) + 127397)
    ELSE NULL
  END;
$$;

REVOKE ALL ON FUNCTION nomenu_i18n.country_flag(text)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION nomenu_i18n.brewery_ref(
  p_company_id uuid,
  p_country_code text,
  p_name text,
  p_name_en text,
  p_show_country_flag boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN nullif(trim(p_name), '') IS NULL
      AND nullif(trim(p_name_en), '') IS NULL THEN NULL
    ELSE jsonb_build_object(
      'id', p_company_id,
      'name', nullif(trim(p_name), ''),
      'name_en', nullif(trim(p_name_en), ''),
      'country_code', nullif(upper(trim(p_country_code)), ''),
      'display_name', CASE
        WHEN coalesce(p_show_country_flag, false)
          AND nomenu_i18n.country_flag(p_country_code) IS NOT NULL
          AND nullif(trim(p_name), '') IS NOT NULL
        THEN nomenu_i18n.country_flag(p_country_code) || ' ' || trim(p_name)
        ELSE nullif(trim(p_name), '')
      END,
      'display_name_en', CASE
        WHEN coalesce(p_show_country_flag, false)
          AND nomenu_i18n.country_flag(p_country_code) IS NOT NULL
          AND nullif(trim(p_name_en), '') IS NOT NULL
        THEN nomenu_i18n.country_flag(p_country_code) || ' ' || trim(p_name_en)
        ELSE nullif(trim(p_name_en), '')
      END
    )
  END;
$$;

REVOKE ALL ON FUNCTION nomenu_i18n.brewery_ref(uuid, text, text, text, boolean)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION nomenu_i18n.decorate_public_drink_brewery(item jsonb)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT item || jsonb_build_object(
    'beer', CASE
      WHEN item->'beer' IS NULL OR item->'beer' = 'null'::jsonb THEN item->'beer'
      ELSE item->'beer' || jsonb_build_object(
        'brewery_ref', nomenu_i18n.brewery_ref(
          dc.id,
          dc.country_code,
          item->'beer'->>'brewery',
          item->'beer'->>'brewery_en',
          t.show_brewery_country_flag
        )
      )
    END
  )
  FROM public.drinks d
  JOIN public.tenants t ON t.id = d.tenant_id
  LEFT JOIN public.drink_products dp ON dp.id = d.product_id AND dp.status = 'active'
  LEFT JOIN public.drink_companies dc ON dc.id = dp.company_id AND dc.status = 'active'
  WHERE d.id = nullif(item->>'id', '')::uuid;
$$;

REVOKE ALL ON FUNCTION nomenu_i18n.decorate_public_drink_brewery(jsonb)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION nomenu_i18n.decorate_product_brewery(
  item jsonb,
  p_show_country_flag boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT item || jsonb_build_object(
    'brewery_ref', nomenu_i18n.brewery_ref(
      dc.id,
      dc.country_code,
      item->>'brewery',
      item->>'brewery_en',
      p_show_country_flag
    )
  )
  FROM (SELECT nullif(item->>'product_id', '')::uuid AS product_id) source
  LEFT JOIN public.drink_products dp ON dp.id = source.product_id AND dp.status = 'active'
  LEFT JOIN public.drink_companies dc ON dc.id = dp.company_id AND dc.status = 'active';
$$;

REVOKE ALL ON FUNCTION nomenu_i18n.decorate_product_brewery(jsonb, boolean)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION nomenu_i18n.decorate_brewery_catalog_item(item jsonb)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT item || jsonb_build_object(
    'brewery_ref', nomenu_i18n.brewery_ref(
      company.id,
      company.country_code,
      item->>'brewery',
      coalesce(item->>'name_en', item->>'brewery_en', company.canonical_name_en),
      false
    )
  )
  FROM (SELECT 1) seed
  LEFT JOIN LATERAL (
    SELECT dc.id, dc.country_code, dc.canonical_name_en
    FROM public.drink_companies dc
    WHERE dc.status = 'active'
      AND (
        lower(trim(dc.canonical_name)) = lower(trim(item->>'brewery'))
        OR lower(trim(dc.display_name)) = lower(trim(item->>'brewery'))
        OR lower(trim(coalesce(dc.canonical_name_en, ''))) = lower(trim(item->>'brewery'))
        OR EXISTS (
          SELECT 1
          FROM public.drink_company_aliases a
          WHERE a.company_id = dc.id
            AND a.alias_normalized = lower(trim(item->>'brewery'))
        )
      )
    ORDER BY dc.updated_at DESC
    LIMIT 1
  ) company ON true;
$$;

REVOKE ALL ON FUNCTION nomenu_i18n.decorate_brewery_catalog_item(jsonb)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_public_taplist_drinks_v2(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb := public.get_public_taplist_drinks_i18n(p_tenant_id);
  v_key text;
  v_items jsonb;
BEGIN
  IF coalesce((v_result->>'ok')::boolean, false) IS NOT TRUE THEN RETURN v_result; END IF;
  FOREACH v_key IN ARRAY ARRAY['drinks', 'coming_soon', 'recently_sold_out'] LOOP
    SELECT coalesce(
      jsonb_agg(nomenu_i18n.decorate_public_drink_brewery(item) ORDER BY ord),
      '[]'::jsonb
    )
    INTO v_items
    FROM jsonb_array_elements(coalesce(v_result->v_key, '[]'::jsonb))
      WITH ORDINALITY AS rows(item, ord);
    v_result := jsonb_set(v_result, ARRAY[v_key], v_items);
  END LOOP;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_taplist_drinks_v2(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_taplist_drinks_v2(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_public_taplist_drink_v2(p_slug text, p_drink_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_result jsonb := public.get_public_taplist_drink_i18n(p_slug, p_drink_id);
BEGIN
  IF coalesce((v_result->>'ok')::boolean, false) IS NOT TRUE THEN RETURN v_result; END IF;
  RETURN jsonb_set(
    v_result,
    '{drink}',
    nomenu_i18n.decorate_public_drink_brewery(v_result->'drink')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_taplist_drink_v2(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_taplist_drink_v2(text, uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.search_mini_products_v2(
  p_city text DEFAULT NULL,
  p_query text DEFAULT '',
  p_style text DEFAULT NULL,
  p_brewery text DEFAULT NULL,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb := public.search_mini_products_i18n(p_city, p_query, p_style, p_brewery, p_offset);
  v_items jsonb;
BEGIN
  IF coalesce((v_result->>'ok')::boolean, false) IS NOT TRUE THEN RETURN v_result; END IF;
  SELECT coalesce(
    jsonb_agg(nomenu_i18n.decorate_product_brewery(item, false) ORDER BY ord),
    '[]'::jsonb
  )
  INTO v_items
  FROM jsonb_array_elements(coalesce(v_result->'results', '[]'::jsonb))
    WITH ORDINALITY AS rows(item, ord);
  RETURN jsonb_set(v_result, '{results}', v_items);
END;
$$;

REVOKE ALL ON FUNCTION public.search_mini_products_v2(text, text, text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_mini_products_v2(text, text, text, text, integer) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_mini_product_v2(
  p_product_id uuid DEFAULT NULL,
  p_drink_id uuid DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_source_slug text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb := public.get_mini_product_i18n(p_product_id, p_drink_id, p_city, p_source_slug);
  v_show_flag boolean := false;
BEGIN
  IF coalesce((v_result->>'ok')::boolean, false) IS NOT TRUE THEN RETURN v_result; END IF;
  IF nullif(trim(p_source_slug), '') IS NOT NULL THEN
    SELECT t.show_brewery_country_flag INTO v_show_flag
    FROM public.tenants t
    WHERE t.slug = trim(p_source_slug);
  END IF;
  RETURN jsonb_set(
    v_result,
    '{product}',
    nomenu_i18n.decorate_product_brewery(v_result->'product', coalesce(v_show_flag, false))
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_mini_product_v2(uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_mini_product_v2(uuid, uuid, text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_mini_breweries_v2(p_city text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_result jsonb := public.get_mini_breweries_i18n(p_city); v_items jsonb;
BEGIN
  IF coalesce((v_result->>'ok')::boolean, false) IS NOT TRUE THEN RETURN v_result; END IF;
  SELECT coalesce(
    jsonb_agg(nomenu_i18n.decorate_brewery_catalog_item(item) ORDER BY ord),
    '[]'::jsonb
  ) INTO v_items
  FROM jsonb_array_elements(coalesce(v_result->'results', '[]'::jsonb))
    WITH ORDINALITY AS rows(item, ord);
  RETURN jsonb_set(v_result, '{results}', v_items);
END;
$$;

REVOKE ALL ON FUNCTION public.get_mini_breweries_v2(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_mini_breweries_v2(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.list_mini_breweries_v2(
  p_city text DEFAULT NULL,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_result jsonb := public.list_mini_breweries_i18n(p_city, p_offset); v_items jsonb;
BEGIN
  IF coalesce((v_result->>'ok')::boolean, false) IS NOT TRUE THEN RETURN v_result; END IF;
  SELECT coalesce(
    jsonb_agg(nomenu_i18n.decorate_brewery_catalog_item(item) ORDER BY ord),
    '[]'::jsonb
  ) INTO v_items
  FROM jsonb_array_elements(coalesce(v_result->'results', '[]'::jsonb))
    WITH ORDINALITY AS rows(item, ord);
  RETURN jsonb_set(v_result, '{results}', v_items);
END;
$$;

REVOKE ALL ON FUNCTION public.list_mini_breweries_v2(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_mini_breweries_v2(text, integer) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_mini_brewery_by_id(p_company_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(
    (
      SELECT jsonb_build_object(
        'ok', true,
        'brewery', jsonb_build_object(
          'id', dc.id,
          'name_zh', coalesce(nullif(trim(dc.display_name), ''), dc.canonical_name),
          'name_en', dc.canonical_name_en,
          'country', dc.country,
          'country_en', dc.country_en,
          'country_code', dc.country_code,
          'origin_region', dc.origin_region,
          'origin_region_en', dc.origin_region_en,
          'origin_city', dc.origin_city,
          'origin_city_en', dc.origin_city_en,
          'logo_url', dc.logo_url
        )
      )
      FROM public.drink_companies dc
      WHERE dc.id = p_company_id AND dc.status = 'active'
    ),
    jsonb_build_object('ok', false, 'code', 'not_found')
  );
$$;

REVOKE ALL ON FUNCTION public.get_mini_brewery_by_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_mini_brewery_by_id(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.search_mini_products_by_brewery_id_v2(
  p_company_id uuid,
  p_city text DEFAULT NULL,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH candidates AS (
    SELECT
      c.*,
      dp.beer_style_en,
      dp.beer_style_en_status,
      dc.id AS company_id,
      dc.canonical_name_en,
      dc.country AS company_country,
      dc.country_en AS company_country_en,
      dc.country_code,
      dc.origin_region,
      dc.origin_region_en,
      dc.origin_city,
      dc.origin_city_en,
      coalesce(v.venues, '[]'::jsonb) AS venues,
      coalesce(v.cnt, 0) AS venue_count
    FROM nomenu_mini.catalog c
    JOIN public.drink_products dp
      ON dp.id = c.product_id
     AND dp.status = 'active'
     AND dp.company_id = p_company_id
    JOIN public.drink_companies dc
      ON dc.id = dp.company_id
     AND dc.status = 'active'
    LEFT JOIN LATERAL (
      SELECT
        count(*) AS cnt,
        jsonb_agg(
          jsonb_build_object(
            'id', x.id,
            'name', x.name,
            'display_name_en', x.display_name_en,
            'slug', x.slug
          )
          ORDER BY x.updated DESC NULLS LAST, lower(x.name), x.id
        ) AS venues
      FROM (
        SELECT
          l.tenant_id AS id,
          l.tenant_name AS name,
          t.display_name_en,
          l.slug,
          max(l.last_menu_updated_at) AS updated
        FROM nomenu_mini.listings l
        LEFT JOIN public.tenants t ON t.id = l.tenant_id
        WHERE l.product_id = c.product_id
          AND lower(trim(l.city)) = lower(coalesce(nullif(trim(p_city), ''), 'Shanghai'))
          AND l.public_status IN ('new', 'available', 'low')
        GROUP BY l.tenant_id, l.tenant_name, t.display_name_en, l.slug
      ) x
    ) v ON true
  ), page AS (
    SELECT *
    FROM candidates
    ORDER BY (venue_count > 0) DESC, lower(name), key
    LIMIT 21 OFFSET greatest(coalesce(p_offset, 0), 0)
  ), shown AS (
    SELECT * FROM page
    ORDER BY (venue_count > 0) DESC, lower(name), key
    LIMIT 20
  )
  SELECT jsonb_build_object(
    'ok', true,
    'results', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'key', key,
          'product_id', product_id,
          'drink_id', drink_id,
          'name', name,
          'name_en', name_en,
          'image_url', image_url,
          'brewery', brewery,
          'brewery_en', canonical_name_en,
          'brewery_ref', nomenu_i18n.brewery_ref(
            company_id,
            country_code,
            brewery,
            canonical_name_en,
            false
          ),
          'beer_style', beer_style,
          'beer_style_en', CASE
            WHEN beer_style_en_status = 'approved' THEN beer_style_en
          END,
          'abv', abv,
          'country', company_country,
          'country_en', company_country_en,
          'origin_region', origin_region,
          'origin_region_en', origin_region_en,
          'origin_city', origin_city,
          'origin_city_en', origin_city_en,
          'venue_count', venue_count,
          'venues', jsonb_path_query_array(venues, '$[0 to 1]')
        )
        ORDER BY (venue_count > 0) DESC, lower(name), key
      )
      FROM shown
    ), '[]'::jsonb),
    'next_offset', CASE
      WHEN (SELECT count(*) FROM page) > 20
      THEN greatest(coalesce(p_offset, 0), 0) + 20
      ELSE NULL
    END
  );
$$;

REVOKE ALL ON FUNCTION public.search_mini_products_by_brewery_id_v2(uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_mini_products_by_brewery_id_v2(uuid, text, integer) TO anon, authenticated;
