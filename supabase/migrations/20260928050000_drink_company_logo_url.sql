-- Brewery/brand logo stored on drink_companies.
-- Admin writes go through admin_set_drink_company_logo, which only accepts
-- the OSS CDN path issued for that company.

ALTER TABLE public.drink_companies
  ADD COLUMN IF NOT EXISTS logo_url text;

ALTER TABLE public.drink_companies
  DROP CONSTRAINT IF EXISTS drink_companies_logo_url_check;

ALTER TABLE public.drink_companies
  ADD CONSTRAINT drink_companies_logo_url_check CHECK (
    logo_url IS NULL
    OR logo_url ~ '^https://img\.nomenuapp\.com/prod/companies/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9_-][A-Za-z0-9._-]{0,119}$'
  );

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
              'logo_url', c.logo_url,
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

CREATE OR REPLACE FUNCTION public.admin_set_drink_company_logo(
  p_company_id uuid,
  p_logo_url text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_logo_url text := nullif(trim(p_logo_url), '');
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

  IF v_logo_url IS NOT NULL AND v_logo_url !~ (
    '^https://img\.nomenuapp\.com/prod/companies/' ||
    p_company_id::text ||
    '/[A-Za-z0-9_-][A-Za-z0-9._-]{0,119}$'
  ) THEN
    RAISE EXCEPTION 'Invalid company logo URL';
  END IF;

  UPDATE public.drink_companies
  SET logo_url = v_logo_url
  WHERE id = p_company_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Company not found';
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', p_company_id, 'logo_url', v_logo_url);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_drink_company_logo(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_drink_company_logo(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_set_drink_company_logo(uuid, text) TO authenticated;
