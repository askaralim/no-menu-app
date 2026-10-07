-- Consumer discovery: structured opening status, canonical-product search,
-- multi-venue beer details, public brewery pages, and the venue QR image used
-- by the existing Taplist export. Home NEW ON TAP and per-bar taplists remain
-- source-drink queries and are intentionally unchanged.

CREATE OR REPLACE FUNCTION public.taplist_opening_snapshot(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now timestamp := now() AT TIME ZONE 'Asia/Shanghai';
  v_dow smallint;
  v_time time;
  v_has_structured boolean;
  v_is_open boolean;
  v_opens time;
  v_closes time;
  v_next_day boolean := false;
  v_legacy jsonb;
  v_legacy_open text;
  v_legacy_close text;
BEGIN
  v_dow := extract(isodow FROM v_now)::smallint;
  v_time := v_now::time;

  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_opening_periods p
    WHERE p.tenant_id = p_tenant_id
  ) INTO v_has_structured;

  IF v_has_structured THEN
    v_is_open := public.tenant_is_open_now(p_tenant_id);

    -- Prefer the period that is open now. The previous day's overnight period
    -- is checked first so 01:00 correctly belongs to (for example) 18:00–02:00.
    SELECT p.opens_at, p.closes_at, p.closes_next_day
    INTO v_opens, v_closes, v_next_day
    FROM public.tenant_opening_periods p
    WHERE p.tenant_id = p_tenant_id
      AND (
        (
          p.closes_next_day
          AND p.iso_day_of_week = CASE WHEN v_dow = 1 THEN 7 ELSE v_dow - 1 END
          AND (p.closes_at = time '00:00' OR v_time < p.closes_at)
        )
        OR (
          p.iso_day_of_week = v_dow
          AND v_time >= p.opens_at
          AND (
            p.closes_next_day
            OR p.closes_at = p.opens_at
            OR v_time < p.closes_at
          )
        )
      )
    ORDER BY
      CASE WHEN p.iso_day_of_week = v_dow THEN 1 ELSE 0 END,
      p.opens_at
    LIMIT 1;

    -- When closed, show today's next period (or today's first completed one)
    -- without changing the open/closed result.
    IF v_opens IS NULL THEN
      SELECT p.opens_at, p.closes_at, p.closes_next_day
      INTO v_opens, v_closes, v_next_day
      FROM public.tenant_opening_periods p
      WHERE p.tenant_id = p_tenant_id
        AND p.iso_day_of_week = v_dow
      ORDER BY CASE WHEN p.opens_at > v_time THEN 0 ELSE 1 END, p.opens_at
      LIMIT 1;
    END IF;

    RETURN jsonb_build_object(
      'source', 'tenant_opening_periods',
      'is_open_now', coalesce(v_is_open, false),
      'opening_hour', CASE
        WHEN v_opens IS NULL OR v_closes IS NULL THEN NULL
        ELSE jsonb_build_object(
          'open', to_char(v_opens, 'HH24:MI'),
          'close', to_char(v_closes, 'HH24:MI'),
          'closes_next_day', coalesce(v_next_day, false)
        )
      END
    );
  END IF;

  SELECT t.opening_hour INTO v_legacy
  FROM public.tenants t
  WHERE t.id = p_tenant_id;

  v_legacy_open := v_legacy->>'open';
  v_legacy_close := v_legacy->>'close';
  IF coalesce(v_legacy_open, '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
     OR coalesce(v_legacy_close, '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
    RETURN jsonb_build_object(
      'source', 'none',
      'is_open_now', NULL,
      'opening_hour', v_legacy
    );
  END IF;

  v_opens := v_legacy_open::time;
  v_closes := v_legacy_close::time;
  v_is_open := CASE
    WHEN v_opens = v_closes THEN true
    WHEN v_closes > v_opens THEN v_time >= v_opens AND v_time < v_closes
    ELSE v_time >= v_opens OR v_time < v_closes
  END;

  RETURN jsonb_build_object(
    'source', 'tenants.opening_hour',
    'is_open_now', v_is_open,
    'opening_hour', v_legacy
  );
END;
$$;

REVOKE ALL ON FUNCTION public.taplist_opening_snapshot(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_public_taplist_bars(p_city text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_city text := coalesce(nullif(trim(p_city), ''), 'Shanghai');
BEGIN
  RETURN coalesce(
    (
      SELECT jsonb_agg(row_obj ORDER BY lm DESC NULLS LAST)
      FROM (
        SELECT
          jsonb_build_object(
            'id', t.id,
            'slug', t.slug,
            'name', t.name,
            'display_name', coalesce(nullif(trim(t.display_name), ''), t.name),
            'district', t.district,
            'address', t.address,
            'opening_hour', hours.snapshot->'opening_hour',
            'opening_hour_source', hours.snapshot->>'source',
            'is_open_now', (hours.snapshot->>'is_open_now')::boolean,
            'description', t.description,
            'cover_image_url', t.cover_image_url,
            'city', t.city,
            'country', t.country,
            'latitude', t.roadmap_latitude,
            'longitude', t.roadmap_longitude,
            'last_menu_updated_at', t.last_menu_updated_at,
            'brewing_type', t.brewing_type,
            'brewing_label', public.taplist_brewing_label(t.brewing_type),
            'status_counts', (
              SELECT jsonb_build_object(
                '上新', count(*) FILTER (WHERE d.public_status = 'new'),
                '在售', count(*) FILTER (WHERE d.public_status = 'available'),
                '少量', count(*) FILTER (WHERE d.public_status = 'low'),
                '售罄', count(*) FILTER (WHERE d.public_status = 'sold_out'),
                '即将上新', count(*) FILTER (WHERE d.public_status = 'coming_soon')
              )
              FROM public.drinks d
              INNER JOIN public.categories c
                ON c.id = d.category_id AND c.tenant_id = d.tenant_id
              WHERE d.tenant_id = t.id
                AND d.enabled = true
                AND d.is_public_visible = true
                AND c.enabled = true
                AND c.is_public_visible = true
            )
          ) AS row_obj,
          t.last_menu_updated_at AS lm
        FROM public.tenants t
        CROSS JOIN LATERAL (
          SELECT public.taplist_opening_snapshot(t.id) AS snapshot
        ) hours
        WHERE t.status = 'active'
          AND t.is_public_visible = true
          AND lower(trim(t.city)) = lower(trim(v_city))
      ) sub
    ),
    '[]'::jsonb
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_taplist_bars(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_taplist_bars(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_public_taplist_tenant(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_slug text := trim(p_slug);
  rec record;
  v_hours jsonb;
BEGIN
  IF v_slug = '' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'bad_request');
  END IF;

  SELECT
    t.id, t.slug, t.name,
    coalesce(nullif(trim(t.display_name), ''), t.name) AS display_name,
    t.district, t.address, t.description, t.cover_image_url, t.city, t.country,
    t.roadmap_latitude AS latitude, t.roadmap_longitude AS longitude,
    t.last_menu_updated_at, t.status, t.is_public_visible, t.brewing_type
  INTO rec
  FROM public.tenants t
  WHERE t.slug = v_slug;

  IF rec IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END IF;
  IF rec.status = 'suspended' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'suspended', 'name', rec.name);
  END IF;
  IF NOT rec.is_public_visible THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_public');
  END IF;

  v_hours := public.taplist_opening_snapshot(rec.id);

  RETURN jsonb_build_object(
    'ok', true,
    'tenant', jsonb_build_object(
      'id', rec.id,
      'slug', rec.slug,
      'name', rec.name,
      'display_name', rec.display_name,
      'district', rec.district,
      'address', rec.address,
      'opening_hour', v_hours->'opening_hour',
      'opening_hour_source', v_hours->>'source',
      'is_open_now', (v_hours->>'is_open_now')::boolean,
      'description', rec.description,
      'cover_image_url', rec.cover_image_url,
      'city', rec.city,
      'country', rec.country,
      'latitude', rec.latitude,
      'longitude', rec.longitude,
      'last_menu_updated_at', rec.last_menu_updated_at,
      'brewing_type', rec.brewing_type,
      'brewing_label', public.taplist_brewing_label(rec.brewing_type),
      'qr_image_url', (
        SELECT q.image_url
        FROM public.tenant_qr_links q
        WHERE q.tenant_id = rec.id
          AND q.enabled = true
          AND q.placement = 'venue'
          AND nullif(trim(q.image_url), '') IS NOT NULL
        ORDER BY q.version DESC, q.created_at DESC
        LIMIT 1
      ),
      'qr_image_path', (
        SELECT q.image_path
        FROM public.tenant_qr_links q
        WHERE q.tenant_id = rec.id
          AND q.enabled = true
          AND q.placement = 'venue'
        ORDER BY q.version DESC, q.created_at DESC
        LIMIT 1
      ),
      'tags', coalesce(
        (
          SELECT jsonb_agg(
            jsonb_build_object('key', d.key, 'label', d.label_zh)
            ORDER BY d.sort_order, d.key
          )
          FROM public.tenant_bar_tags tbt
          INNER JOIN public.bar_tag_definitions d ON d.key = tbt.tag_key
          WHERE tbt.tenant_id = rec.id
        ),
        '[]'::jsonb
      )
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_taplist_tenant(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_taplist_tenant(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.search_public_taplist(
  p_city text DEFAULT NULL,
  p_query text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_city text := coalesce(nullif(trim(p_city), ''), 'Shanghai');
  v_q text := nullif(trim(p_query), '');
  v_pattern text;
BEGIN
  IF v_q IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'results', '[]'::jsonb);
  END IF;
  v_pattern := '%' || v_q || '%';

  RETURN jsonb_build_object(
    'ok', true,
    'results', coalesce(
      (
        WITH candidates AS MATERIALIZED (
          SELECT
            d.id AS drink_id,
            d.product_id,
            coalesce(d.product_id::text, 'drink:' || d.id::text) AS group_key,
            CASE WHEN d.product_id IS NULL
              THEN d.name
              ELSE coalesce(nullif(trim(d.display_name), ''), dp.name, d.name)
            END AS display_name,
            d.brand_name,
            CASE WHEN d.product_id IS NULL
              THEN d.image_url
              ELSE coalesce(nullif(trim(d.image_url), ''), dp.image_url)
            END AS image_url,
            d.public_status,
            d.public_status_changed_at,
            d.public_sort_order,
            t.id AS tenant_id,
            t.slug AS tenant_slug,
            coalesce(nullif(trim(t.display_name), ''), t.name) AS tenant_display_name,
            t.district AS tenant_district,
            t.address AS tenant_address,
            t.last_menu_updated_at,
            coalesce(dp.brewery, dp.brand_name, p.brewery, d.brand_name) AS brewery,
            coalesce(dp.beer_style, p.beer_style) AS beer_style,
            coalesce(dp.abv, p.abv) AS abv,
            CASE
              WHEN coalesce(t.public_price_mode, 'hide') = 'hide' THEN NULL
              ELSE (
                SELECT jsonb_build_object(
                  'label', so.label,
                  'volume_ml', so.volume_ml,
                  'price', so.price
                )
                FROM public.drink_serving_options so
                WHERE so.drink_id = d.id
                  AND so.is_active = true
                  AND so.price > 0
                ORDER BY so.is_default DESC, so.public_sort_order, so.label
                LIMIT 1
              )
            END AS default_serving,
            (
              d.name ILIKE v_pattern
              OR coalesce(d.display_name, '') ILIKE v_pattern
              OR coalesce(d.brand_name, '') ILIKE v_pattern
              OR coalesce(p.brewery, '') ILIKE v_pattern
              OR coalesce(p.beer_style, '') ILIKE v_pattern
              OR coalesce(dp.name, '') ILIKE v_pattern
              OR coalesce(dp.name_en, '') ILIKE v_pattern
              OR coalesce(dp.brand_name, '') ILIKE v_pattern
              OR coalesce(dp.brewery, '') ILIKE v_pattern
              OR coalesce(dp.beer_style, '') ILIKE v_pattern
              OR EXISTS (
                SELECT 1 FROM unnest(coalesce(dp.aliases, '{}'::text[])) alias_item
                WHERE alias_item ILIKE v_pattern
              )
              OR coalesce(t.name, '') ILIKE v_pattern
              OR coalesce(t.display_name, '') ILIKE v_pattern
              OR coalesce(t.district, '') ILIKE v_pattern
              OR coalesce(t.address, '') ILIKE v_pattern
            ) AS matches_query,
            CASE WHEN d.public_status IN ('new', 'available', 'low') THEN 0 ELSE 1 END AS availability_rank,
            CASE WHEN t.last_menu_updated_at >= now() - interval '7 days' THEN 0 ELSE 1 END AS active_menu_rank
          FROM public.drinks d
          INNER JOIN public.tenants t ON t.id = d.tenant_id
          INNER JOIN public.categories c
            ON c.id = d.category_id AND c.tenant_id = d.tenant_id
          LEFT JOIN public.drink_beer_profiles p ON p.drink_id = d.id
          LEFT JOIN public.drink_products dp
            ON dp.id = d.product_id AND dp.status = 'active'
          WHERE t.status = 'active'
            AND t.is_public_visible = true
            AND lower(trim(t.city)) = lower(trim(v_city))
            AND d.enabled = true
            AND d.is_public_visible = true
            AND d.public_sort_order IS NOT NULL
            AND d.public_sort_order >= 1
            AND c.enabled = true
            AND c.is_public_visible = true
        ),
        matching_groups AS (
          SELECT DISTINCT group_key
          FROM candidates
          WHERE matches_query
        ),
        ranked AS (
          SELECT
            c.*,
            row_number() OVER (
              PARTITION BY c.group_key
              ORDER BY
                c.availability_rank,
                c.active_menu_rank,
                c.public_status_changed_at DESC NULLS LAST,
                c.last_menu_updated_at DESC NULLS LAST,
                c.public_sort_order,
                lower(c.display_name)
            ) AS representative_rank
          FROM candidates c
          INNER JOIN matching_groups g USING (group_key)
        ),
        representatives AS (
          SELECT * FROM ranked WHERE representative_rank = 1
        ),
        representatives_limited AS (
          SELECT *
          FROM representatives
          ORDER BY
            availability_rank,
            active_menu_rank,
            public_status_changed_at DESC NULLS LAST,
            last_menu_updated_at DESC NULLS LAST,
            lower(display_name)
          LIMIT 50
        )
        SELECT jsonb_agg(
          jsonb_build_object(
            'drink_id', r.drink_id,
            'product_id', r.product_id,
            'name', r.display_name,
            'brand_name', r.brand_name,
            'image_url', r.image_url,
            'public_status', public.taplist_public_status_zh(r.public_status),
            'tenant_id', r.tenant_id,
            'tenant_slug', r.tenant_slug,
            'tenant_display_name', r.tenant_display_name,
            'tenant_district', r.tenant_district,
            'tenant_address', r.tenant_address,
            'brewery', r.brewery,
            'beer_style', r.beer_style,
            'abv', r.abv,
            'default_serving', r.default_serving,
            'venue_count', venues.venue_count,
            'venues', venues.items
          )
          ORDER BY
            r.availability_rank,
            r.active_menu_rank,
            r.public_status_changed_at DESC NULLS LAST,
            r.last_menu_updated_at DESC NULLS LAST,
            lower(r.display_name)
        )
        FROM representatives_limited r
        CROSS JOIN LATERAL (
          SELECT
            count(*)::int AS venue_count,
            jsonb_agg(
              jsonb_build_object(
                'drink_id', v.drink_id,
                'tenant_id', v.tenant_id,
                'tenant_slug', v.tenant_slug,
                'tenant_display_name', v.tenant_display_name,
                'tenant_district', v.tenant_district,
                'tenant_address', v.tenant_address,
                'public_status', public.taplist_public_status_zh(v.public_status),
                'default_serving', v.default_serving,
                'last_menu_updated_at', v.last_menu_updated_at
              )
              ORDER BY
                v.availability_rank,
                v.active_menu_rank,
                v.last_menu_updated_at DESC NULLS LAST,
                lower(v.tenant_display_name)
            ) AS items
          FROM ranked v
          WHERE v.group_key = r.group_key
        ) venues
      ),
      '[]'::jsonb
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.search_public_taplist(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_public_taplist(text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_public_taplist_brewery(
  p_city text DEFAULT NULL,
  p_brewery text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_brewery text := nullif(trim(p_brewery), '');
  v_search jsonb;
BEGIN
  IF v_brewery IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'bad_request');
  END IF;

  v_search := public.search_public_taplist(p_city, v_brewery);
  RETURN jsonb_build_object(
    'ok', true,
    'brewery_name', v_brewery,
    'results', coalesce(
      (
        SELECT jsonb_agg(item)
        FROM jsonb_array_elements(coalesce(v_search->'results', '[]'::jsonb)) item
        WHERE lower(trim(item->>'brewery')) = lower(v_brewery)
      ),
      '[]'::jsonb
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_taplist_brewery(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_taplist_brewery(text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_public_taplist_drink(p_slug text, p_drink_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tenant_result jsonb;
  v_drinks_result jsonb;
  v_drink jsonb;
  v_product_id uuid;
  v_source_tenant_id uuid;
  v_source_city text;
  v_venues jsonb := '[]'::jsonb;
BEGIN
  v_tenant_result := public.get_public_taplist_tenant(p_slug);
  IF coalesce((v_tenant_result->>'ok')::boolean, false) IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'tenant_' || coalesce(v_tenant_result->>'code', 'not_found'),
      'name', v_tenant_result->'name'
    );
  END IF;

  v_source_tenant_id := (v_tenant_result#>>'{tenant,id}')::uuid;
  v_source_city := v_tenant_result#>>'{tenant,city}';
  v_drinks_result := public.get_public_taplist_drinks(v_source_tenant_id);
  IF coalesce((v_drinks_result->>'ok')::boolean, false) IS NOT TRUE THEN
    RETURN v_drinks_result;
  END IF;

  SELECT item INTO v_drink
  FROM jsonb_array_elements(
    coalesce(v_drinks_result->'drinks', '[]'::jsonb)
    || coalesce(v_drinks_result->'coming_soon', '[]'::jsonb)
    || coalesce(v_drinks_result->'recently_sold_out', '[]'::jsonb)
  ) item
  WHERE item->>'id' = p_drink_id::text
  LIMIT 1;

  IF v_drink IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END IF;

  v_product_id := nullif(v_drink->>'product_id', '')::uuid;
  IF v_product_id IS NOT NULL THEN
    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object(
          'drink_id', d.id,
          'tenant_id', t.id,
          'tenant_slug', t.slug,
          'tenant_display_name', coalesce(nullif(trim(t.display_name), ''), t.name),
          'tenant_district', t.district,
          'tenant_address', t.address,
          'public_status', public.taplist_public_status_zh(d.public_status),
          'default_serving', CASE
            WHEN coalesce(t.public_price_mode, 'hide') = 'hide' THEN NULL
            ELSE (
              SELECT jsonb_build_object('label', so.label, 'volume_ml', so.volume_ml, 'price', so.price)
              FROM public.drink_serving_options so
              WHERE so.drink_id = d.id AND so.is_active = true AND so.price > 0
              ORDER BY so.is_default DESC, so.public_sort_order, so.label
              LIMIT 1
            )
          END,
          'last_menu_updated_at', t.last_menu_updated_at
        )
        ORDER BY
          CASE WHEN t.id = v_source_tenant_id THEN 0 ELSE 1 END,
          CASE WHEN d.public_status IN ('new', 'available', 'low') THEN 0 ELSE 1 END,
          t.last_menu_updated_at DESC NULLS LAST,
          lower(coalesce(nullif(trim(t.display_name), ''), t.name))
      ),
      '[]'::jsonb
    ) INTO v_venues
    FROM public.drinks d
    INNER JOIN public.tenants t ON t.id = d.tenant_id
    INNER JOIN public.categories c ON c.id = d.category_id AND c.tenant_id = d.tenant_id
    WHERE d.product_id = v_product_id
      AND lower(trim(t.city)) = lower(trim(v_source_city))
      AND t.status = 'active'
      AND t.is_public_visible = true
      AND d.enabled = true
      AND d.is_public_visible = true
      AND d.public_sort_order IS NOT NULL
      AND d.public_sort_order >= 1
      AND c.enabled = true
      AND c.is_public_visible = true;
  ELSE
    v_venues := jsonb_build_array(jsonb_build_object(
      'drink_id', p_drink_id,
      'tenant_id', v_source_tenant_id,
      'tenant_slug', v_tenant_result#>>'{tenant,slug}',
      'tenant_display_name', v_tenant_result#>>'{tenant,display_name}',
      'tenant_district', v_tenant_result#>>'{tenant,district}',
      'tenant_address', v_tenant_result#>>'{tenant,address}',
      'public_status', v_drink->>'public_status',
      'default_serving', NULL,
      'last_menu_updated_at', v_tenant_result#>'{tenant,last_menu_updated_at}'
    ));
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'tenant', v_tenant_result->'tenant',
    'drink', v_drink,
    'venues', v_venues
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_taplist_drink(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_taplist_drink(text, uuid) TO anon, authenticated;
