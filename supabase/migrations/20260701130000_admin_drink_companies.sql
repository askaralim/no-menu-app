-- super_admin RPCs for drink company / alias management.
--
-- Admin-only. No impact on consumer Tap List RPCs or Edge Functions.

CREATE OR REPLACE FUNCTION public.admin_list_drink_companies(
  p_query text DEFAULT NULL,
  p_entity_type text DEFAULT NULL,
  p_review_status text DEFAULT NULL,
  p_status text DEFAULT 'active'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_query text := nullif(trim(p_query), '');
  v_entity_type text := nullif(trim(p_entity_type), '');
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
    'companies', coalesce(
      (
        SELECT jsonb_agg(row_obj ORDER BY lower(display_name), lower(canonical_name))
        FROM (
          SELECT
            jsonb_build_object(
              'id', c.id,
              'normalized_key', c.normalized_key,
              'canonical_name', c.canonical_name,
              'canonical_name_en', c.canonical_name_en,
              'display_name', c.display_name,
              'entity_type', c.entity_type,
              'country', c.country,
              'country_code', c.country_code,
              'origin_region', c.origin_region,
              'raw_country_values', c.raw_country_values,
              'confidence', c.confidence,
              'review_status', c.review_status,
              'source', c.source,
              'source_note', c.source_note,
              'status', c.status,
              'created_at', c.created_at,
              'updated_at', c.updated_at,
              'alias_count', coalesce(ac.cnt, 0),
              'global_alias_collision_count', coalesce(cc.collision_count, 0)
            ) AS row_obj,
            c.display_name,
            c.canonical_name
          FROM public.drink_companies c
          LEFT JOIN LATERAL (
            SELECT count(*)::int AS cnt
            FROM public.drink_company_aliases a
            WHERE a.company_id = c.id
          ) ac ON true
          LEFT JOIN LATERAL (
            SELECT count(DISTINCT a.alias_normalized)::int AS collision_count
            FROM public.drink_company_aliases a
            WHERE a.company_id = c.id
              AND EXISTS (
                SELECT 1
                FROM public.drink_company_aliases a2
                WHERE a2.alias_normalized = a.alias_normalized
                  AND a2.company_id <> c.id
              )
          ) cc ON true
          WHERE
            (v_status = 'all' OR c.status = v_status)
            AND (v_entity_type IS NULL OR c.entity_type = v_entity_type)
            AND (v_review_status IS NULL OR c.review_status = v_review_status)
            AND (
              v_query IS NULL
              OR c.normalized_key ILIKE '%' || v_query || '%'
              OR c.canonical_name ILIKE '%' || v_query || '%'
              OR coalesce(c.canonical_name_en, '') ILIKE '%' || v_query || '%'
              OR c.display_name ILIKE '%' || v_query || '%'
              OR EXISTS (
                SELECT 1
                FROM public.drink_company_aliases a
                WHERE a.company_id = c.id
                  AND a.alias ILIKE '%' || v_query || '%'
              )
            )
          ORDER BY lower(c.display_name), lower(c.canonical_name)
          LIMIT 500
        ) sub
      ),
      '[]'::jsonb
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_upsert_drink_company(
  p_id uuid DEFAULT NULL,
  p_normalized_key text DEFAULT NULL,
  p_canonical_name text DEFAULT NULL,
  p_canonical_name_en text DEFAULT NULL,
  p_display_name text DEFAULT NULL,
  p_entity_type text DEFAULT 'brewery',
  p_country text DEFAULT NULL,
  p_country_code text DEFAULT NULL,
  p_origin_region text DEFAULT NULL,
  p_raw_country_values text[] DEFAULT '{}',
  p_confidence text DEFAULT 'medium',
  p_review_status text DEFAULT 'reviewed',
  p_source text DEFAULT NULL,
  p_source_note text DEFAULT NULL,
  p_status text DEFAULT 'active'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid := p_id;
  v_normalized_key text := nullif(trim(p_normalized_key), '');
  v_canonical_name text := nullif(trim(p_canonical_name), '');
  v_canonical_name_en text := nullif(trim(p_canonical_name_en), '');
  v_display_name text := nullif(trim(p_display_name), '');
  v_entity_type text := coalesce(nullif(trim(p_entity_type), ''), 'brewery');
  v_country text := nullif(trim(p_country), '');
  v_country_code text := nullif(trim(p_country_code), '');
  v_origin_region text := nullif(trim(p_origin_region), '');
  v_raw_country_values text[] := coalesce(p_raw_country_values, '{}');
  v_confidence text := coalesce(nullif(trim(p_confidence), ''), 'medium');
  v_review_status text := coalesce(nullif(trim(p_review_status), ''), 'reviewed');
  v_source text := nullif(trim(p_source), '');
  v_source_note text := nullif(trim(p_source_note), '');
  v_status text := coalesce(nullif(trim(p_status), ''), 'active');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Unauthorized: super_admin role required';
  END IF;

  IF v_canonical_name IS NULL THEN
    RAISE EXCEPTION 'canonical_name is required';
  END IF;

  IF v_display_name IS NULL THEN
    v_display_name := v_canonical_name;
  END IF;

  IF v_id IS NULL THEN
    IF v_normalized_key IS NULL THEN
      RAISE EXCEPTION 'normalized_key is required when creating a company';
    END IF;

    INSERT INTO public.drink_companies (
      normalized_key,
      canonical_name,
      canonical_name_en,
      display_name,
      entity_type,
      country,
      country_code,
      origin_region,
      raw_country_values,
      confidence,
      review_status,
      source,
      source_note,
      status
    )
    VALUES (
      v_normalized_key,
      v_canonical_name,
      v_canonical_name_en,
      v_display_name,
      v_entity_type,
      v_country,
      v_country_code,
      v_origin_region,
      v_raw_country_values,
      v_confidence,
      v_review_status,
      v_source,
      v_source_note,
      v_status
    )
    RETURNING id INTO v_id;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM public.drink_companies WHERE id = v_id) THEN
      RAISE EXCEPTION 'Company not found';
    END IF;

    UPDATE public.drink_companies
    SET
      canonical_name = v_canonical_name,
      canonical_name_en = v_canonical_name_en,
      display_name = v_display_name,
      entity_type = v_entity_type,
      country = v_country,
      country_code = v_country_code,
      origin_region = v_origin_region,
      raw_country_values = v_raw_country_values,
      confidence = v_confidence,
      review_status = v_review_status,
      source = v_source,
      source_note = v_source_note,
      status = v_status
    WHERE id = v_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_drink_company_aliases(
  p_company_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Unauthorized: super_admin role required';
  END IF;

  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'company_id is required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.drink_companies WHERE id = p_company_id) THEN
    RAISE EXCEPTION 'Company not found';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'aliases', coalesce(
      (
        SELECT jsonb_agg(row_obj ORDER BY lower(alias))
        FROM (
          SELECT
            jsonb_build_object(
              'id', a.id,
              'company_id', a.company_id,
              'alias', a.alias,
              'alias_language', a.alias_language,
              'alias_type', a.alias_type,
              'source', a.source,
              'created_at', a.created_at,
              'collision_company_count', (
                SELECT count(DISTINCT a2.company_id)::int
                FROM public.drink_company_aliases a2
                WHERE a2.alias_normalized = a.alias_normalized
                  AND a2.company_id <> a.company_id
              )
            ) AS row_obj,
            a.alias
          FROM public.drink_company_aliases a
          WHERE a.company_id = p_company_id
          ORDER BY lower(a.alias)
        ) sub
      ),
      '[]'::jsonb
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_upsert_drink_company_alias(
  p_id uuid DEFAULT NULL,
  p_company_id uuid DEFAULT NULL,
  p_alias text DEFAULT NULL,
  p_alias_language text DEFAULT NULL,
  p_alias_type text DEFAULT 'name',
  p_source text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid := p_id;
  v_company_id uuid := p_company_id;
  v_alias text := nullif(trim(p_alias), '');
  v_alias_language text := nullif(trim(p_alias_language), '');
  v_alias_type text := coalesce(nullif(trim(p_alias_type), ''), 'name');
  v_source text := nullif(trim(p_source), '');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Unauthorized: super_admin role required';
  END IF;

  IF v_alias IS NULL THEN
    RAISE EXCEPTION 'alias is required';
  END IF;

  IF v_id IS NULL THEN
    IF v_company_id IS NULL THEN
      RAISE EXCEPTION 'company_id is required when creating an alias';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.drink_companies WHERE id = v_company_id) THEN
      RAISE EXCEPTION 'Company not found';
    END IF;

    INSERT INTO public.drink_company_aliases (
      company_id,
      alias,
      alias_language,
      alias_type,
      source
    )
    VALUES (
      v_company_id,
      v_alias,
      v_alias_language,
      v_alias_type,
      v_source
    )
    ON CONFLICT (company_id, alias_normalized) DO UPDATE
    SET
      alias = EXCLUDED.alias,
      alias_language = EXCLUDED.alias_language,
      alias_type = EXCLUDED.alias_type,
      source = EXCLUDED.source
    RETURNING id INTO v_id;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM public.drink_company_aliases WHERE id = v_id) THEN
      RAISE EXCEPTION 'Alias not found';
    END IF;

    UPDATE public.drink_company_aliases
    SET
      alias = v_alias,
      alias_language = v_alias_language,
      alias_type = v_alias_type,
      source = v_source
    WHERE id = v_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_drink_company_alias(
  p_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Unauthorized: super_admin role required';
  END IF;

  IF p_id IS NULL THEN
    RAISE EXCEPTION 'id is required';
  END IF;

  DELETE FROM public.drink_company_aliases
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Alias not found';
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', p_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_drink_companies(text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_upsert_drink_company(uuid, text, text, text, text, text, text, text, text, text[], text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_drink_company_aliases(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_upsert_drink_company_alias(uuid, uuid, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_drink_company_alias(uuid) TO authenticated;
