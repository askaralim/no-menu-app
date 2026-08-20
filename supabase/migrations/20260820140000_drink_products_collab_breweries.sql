-- Product-pool archive field for collab brewery names (admin web only).
-- Does NOT change public taplist / search / new-tap payloads, link_drink_to_product,
-- or POS upsert_drink_product — venue display stays on drink_beer_profiles.

ALTER TABLE public.drink_products
  ADD COLUMN IF NOT EXISTS collab_breweries text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.drink_products.collab_breweries IS
  'Secondary brewery names for product-pool archive (max 3). Not projected to consumer apps.';

CREATE OR REPLACE FUNCTION public.admin_list_drink_products(
  p_query text DEFAULT NULL,
  p_review_status text DEFAULT NULL,
  p_status text DEFAULT 'active',
  p_unlinked_company_only boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_query text := nullif(trim(p_query), '');
  v_review_status text := nullif(trim(p_review_status), '');
  v_status text := coalesce(nullif(trim(p_status), ''), 'active');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Unauthorized: super_admin role required';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'products', coalesce(
      (
        SELECT jsonb_agg(row_obj ORDER BY lower(name), lower(coalesce(brand_name, '')))
        FROM (
          SELECT
            jsonb_build_object(
              'id', dp.id,
              'name', dp.name,
              'name_en', dp.name_en,
              'aliases', dp.aliases,
              'brand_name', dp.brand_name,
              'brewery', dp.brewery,
              'collab_breweries', coalesce(dp.collab_breweries, '{}'::text[]),
              'beer_style', dp.beer_style,
              'abv', dp.abv,
              'ibu', dp.ibu,
              'country', dp.country,
              'origin_region', dp.origin_region,
              'image_url', dp.image_url,
              'description', dp.description,
              'tasting_note', dp.tasting_note,
              'status', dp.status,
              'source', dp.source,
              'company_id', dp.company_id,
              'normalized_key', dp.normalized_key,
              'review_status', dp.review_status,
              'review_note', dp.review_note,
              'beer_verification_status', dp.beer_verification_status,
              'brewery_verification_status', dp.brewery_verification_status,
              'created_at', dp.created_at,
              'updated_at', dp.updated_at,
              'company_display_name', c.display_name,
              'company_normalized_key', c.normalized_key,
              'linked_drink_count', coalesce(lc.cnt, 0)
            ) AS row_obj,
            dp.name,
            dp.brand_name
          FROM public.drink_products dp
          LEFT JOIN public.drink_companies c ON c.id = dp.company_id
          LEFT JOIN LATERAL (
            SELECT count(*)::int AS cnt
            FROM public.drinks d
            WHERE d.product_id = dp.id
          ) lc ON true
          WHERE
            (v_status = 'all' OR dp.status = v_status)
            AND (v_review_status IS NULL OR dp.review_status = v_review_status)
            AND (NOT p_unlinked_company_only OR dp.company_id IS NULL)
            AND (
              v_query IS NULL
              OR dp.name ILIKE '%' || v_query || '%'
              OR coalesce(dp.name_en, '') ILIKE '%' || v_query || '%'
              OR coalesce(dp.brand_name, '') ILIKE '%' || v_query || '%'
              OR coalesce(dp.brewery, '') ILIKE '%' || v_query || '%'
              OR coalesce(dp.normalized_key, '') ILIKE '%' || v_query || '%'
              OR coalesce(dp.beer_style, '') ILIKE '%' || v_query || '%'
              OR coalesce(c.display_name, '') ILIKE '%' || v_query || '%'
              OR EXISTS (
                SELECT 1
                FROM unnest(dp.aliases) AS alias_item
                WHERE alias_item ILIKE '%' || v_query || '%'
              )
              OR EXISTS (
                SELECT 1
                FROM unnest(coalesce(dp.collab_breweries, '{}'::text[])) AS collab_item
                WHERE collab_item ILIKE '%' || v_query || '%'
              )
            )
          ORDER BY lower(dp.name), lower(coalesce(dp.brand_name, ''))
          LIMIT 1000
        ) sub
      ),
      '[]'::jsonb
    )
  );
END;
$$;

DROP FUNCTION IF EXISTS public.admin_upsert_drink_product(
  uuid, text, text, text[], text, text, text, numeric, integer, text, text, text, text, text,
  uuid, text, text, text, text, text, text, text
);

CREATE OR REPLACE FUNCTION public.admin_upsert_drink_product(
  p_id uuid DEFAULT NULL,
  p_name text DEFAULT NULL,
  p_name_en text DEFAULT NULL,
  p_aliases text[] DEFAULT '{}',
  p_brand_name text DEFAULT NULL,
  p_brewery text DEFAULT NULL,
  p_beer_style text DEFAULT NULL,
  p_abv numeric DEFAULT NULL,
  p_ibu integer DEFAULT NULL,
  p_country text DEFAULT NULL,
  p_origin_region text DEFAULT NULL,
  p_image_url text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_tasting_note text DEFAULT NULL,
  p_company_id uuid DEFAULT NULL,
  p_normalized_key text DEFAULT NULL,
  p_review_status text DEFAULT 'pending',
  p_review_note text DEFAULT NULL,
  p_beer_verification_status text DEFAULT NULL,
  p_brewery_verification_status text DEFAULT NULL,
  p_status text DEFAULT 'active',
  p_source text DEFAULT NULL,
  p_collab_breweries text[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid := p_id;
  v_name text := nullif(trim(p_name), '');
  v_name_en text := nullif(trim(p_name_en), '');
  v_aliases text[] := coalesce(p_aliases, '{}');
  v_brand_name text := nullif(trim(p_brand_name), '');
  v_brewery text := nullif(trim(p_brewery), '');
  v_beer_style text := nullif(trim(p_beer_style), '');
  v_country text := nullif(trim(p_country), '');
  v_origin_region text := nullif(trim(p_origin_region), '');
  v_image_url text := nullif(trim(p_image_url), '');
  v_description text := nullif(trim(p_description), '');
  v_tasting_note text := nullif(trim(p_tasting_note), '');
  v_company_id uuid := p_company_id;
  v_normalized_key text := nullif(trim(p_normalized_key), '');
  v_review_status text := coalesce(nullif(trim(p_review_status), ''), 'pending');
  v_review_note text := nullif(trim(p_review_note), '');
  v_beer_verification_status text := nullif(trim(p_beer_verification_status), '');
  v_brewery_verification_status text := nullif(trim(p_brewery_verification_status), '');
  v_status text := coalesce(nullif(trim(p_status), ''), 'active');
  v_source text := nullif(trim(p_source), '');
  v_collab_breweries text[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Unauthorized: super_admin role required';
  END IF;

  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Product name is required';
  END IF;

  IF v_company_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.drink_companies WHERE id = v_company_id
  ) THEN
    RAISE EXCEPTION 'Company not found';
  END IF;

  IF p_collab_breweries IS NULL THEN
    v_collab_breweries := NULL;
  ELSE
    SELECT coalesce(array_agg(trimmed ORDER BY ord), '{}'::text[])
    INTO v_collab_breweries
    FROM (
      SELECT nullif(trim(x), '') AS trimmed, ord
      FROM unnest(p_collab_breweries) WITH ORDINALITY AS t(x, ord)
      WHERE nullif(trim(x), '') IS NOT NULL
      ORDER BY ord
      LIMIT 3
    ) s;
  END IF;

  IF v_id IS NULL THEN
    IF v_normalized_key IS NULL THEN
      RAISE EXCEPTION 'normalized_key is required when creating a product';
    END IF;

    INSERT INTO public.drink_products (
      name,
      name_en,
      aliases,
      brand_name,
      brewery,
      collab_breweries,
      beer_style,
      abv,
      ibu,
      country,
      origin_region,
      image_url,
      description,
      tasting_note,
      company_id,
      normalized_key,
      review_status,
      review_note,
      beer_verification_status,
      brewery_verification_status,
      status,
      source,
      created_by
    )
    VALUES (
      v_name,
      v_name_en,
      v_aliases,
      v_brand_name,
      v_brewery,
      coalesce(v_collab_breweries, '{}'::text[]),
      v_beer_style,
      p_abv,
      p_ibu,
      v_country,
      v_origin_region,
      v_image_url,
      v_description,
      v_tasting_note,
      v_company_id,
      v_normalized_key,
      v_review_status,
      v_review_note,
      v_beer_verification_status,
      v_brewery_verification_status,
      v_status,
      v_source,
      auth.uid()
    )
    RETURNING id INTO v_id;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM public.drink_products WHERE id = v_id) THEN
      RAISE EXCEPTION 'Product not found';
    END IF;

    UPDATE public.drink_products
    SET
      name = v_name,
      name_en = v_name_en,
      aliases = v_aliases,
      brand_name = v_brand_name,
      brewery = v_brewery,
      collab_breweries = coalesce(v_collab_breweries, collab_breweries),
      beer_style = v_beer_style,
      abv = p_abv,
      ibu = p_ibu,
      country = v_country,
      origin_region = v_origin_region,
      image_url = v_image_url,
      description = v_description,
      tasting_note = v_tasting_note,
      company_id = v_company_id,
      review_status = v_review_status,
      review_note = v_review_note,
      beer_verification_status = v_beer_verification_status,
      brewery_verification_status = v_brewery_verification_status,
      status = v_status,
      source = coalesce(v_source, source)
    WHERE id = v_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_drink_products(text, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_upsert_drink_product(
  uuid, text, text, text[], text, text, text, numeric, integer, text, text, text, text, text,
  uuid, text, text, text, text, text, text, text, text[]
) TO authenticated;
