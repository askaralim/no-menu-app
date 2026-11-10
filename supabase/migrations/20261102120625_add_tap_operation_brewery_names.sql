-- Keep the deployed paginated dashboard implementation intact and add a thin
-- enrichment layer for brewery labels. The public RPC signature stays stable
-- for existing POS and mini-program clients.
ALTER FUNCTION public.get_tap_lifecycle_dashboard_page(
  uuid,
  integer,
  timestamptz,
  text,
  boolean
)
RENAME TO _get_tap_lifecycle_dashboard_page_core;

COMMENT ON FUNCTION public._get_tap_lifecycle_dashboard_page_core(
  uuid,
  integer,
  timestamptz,
  text,
  boolean
) IS
  'Internal paginated tap lifecycle dashboard core; call get_tap_lifecycle_dashboard_page instead.';

REVOKE ALL ON FUNCTION public._get_tap_lifecycle_dashboard_page_core(
  uuid,
  integer,
  timestamptz,
  text,
  boolean
) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.get_tap_lifecycle_dashboard_page(
  p_tenant_id uuid,
  p_limit integer DEFAULT 20,
  p_before_occurred_at timestamptz DEFAULT NULL,
  p_before_operation_key text DEFAULT NULL,
  p_include_summary boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_operations jsonb := '[]'::jsonb;
BEGIN
  -- The core applies the canonical authentication, tenant authorization,
  -- cursor validation, filtering, and pagination rules before enrichment.
  v_result := public._get_tap_lifecycle_dashboard_page_core(
    p_tenant_id,
    p_limit,
    p_before_occurred_at,
    p_before_operation_key,
    p_include_summary
  );

  WITH raw_operations AS (
    SELECT
      operation.value AS item,
      operation.ordinality
    FROM jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(v_result -> 'operations') = 'array'
          THEN v_result -> 'operations'
        ELSE '[]'::jsonb
      END
    ) WITH ORDINALITY AS operation(value, ordinality)
  ),
  requested_drink_ids AS (
    SELECT nullif(item ->> 'drink_id', '')::uuid AS drink_id
    FROM raw_operations
    UNION
    SELECT nullif(item ->> 'previous_drink_id', '')::uuid AS drink_id
    FROM raw_operations
    UNION
    SELECT nullif(item ->> 'next_drink_id', '')::uuid AS drink_id
    FROM raw_operations
  ),
  brewery_lookup AS (
    SELECT
      d.id AS drink_id,
      coalesce(
        nullif(trim(dp.brewery), ''),
        nullif(trim(dp.brand_name), ''),
        nullif(trim(profile.brewery), ''),
        nullif(trim(d.brand_name), '')
      ) AS brewery_name
    FROM requested_drink_ids requested
    JOIN public.drinks d
      ON d.tenant_id = p_tenant_id
     AND d.id = requested.drink_id
    LEFT JOIN public.drink_products dp
      ON dp.id = d.product_id
    LEFT JOIN public.drink_beer_profiles profile
      ON profile.drink_id = d.id
  ),
  enriched_operations AS (
    SELECT
      raw.ordinality,
      raw.item || jsonb_build_object(
        'brewery_name', current_brewery.brewery_name,
        'previous_brewery_name', previous_brewery.brewery_name,
        'next_brewery_name', next_brewery.brewery_name
      ) AS item
    FROM raw_operations raw
    LEFT JOIN brewery_lookup current_brewery
      ON current_brewery.drink_id = nullif(raw.item ->> 'drink_id', '')::uuid
    LEFT JOIN brewery_lookup previous_brewery
      ON previous_brewery.drink_id = nullif(raw.item ->> 'previous_drink_id', '')::uuid
    LEFT JOIN brewery_lookup next_brewery
      ON next_brewery.drink_id = nullif(raw.item ->> 'next_drink_id', '')::uuid
  )
  SELECT coalesce(
    jsonb_agg(item ORDER BY ordinality),
    '[]'::jsonb
  )
  INTO v_operations
  FROM enriched_operations;

  RETURN jsonb_set(v_result, '{operations}', v_operations, true);
END;
$$;

COMMENT ON FUNCTION public.get_tap_lifecycle_dashboard_page(
  uuid,
  integer,
  timestamptz,
  text,
  boolean
) IS
  'Returns a stable keyset-paginated page of 30-day tap lifecycle operations enriched with current brewery labels.';

REVOKE ALL ON FUNCTION public.get_tap_lifecycle_dashboard_page(
  uuid,
  integer,
  timestamptz,
  text,
  boolean
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_tap_lifecycle_dashboard_page(
  uuid,
  integer,
  timestamptz,
  text,
  boolean
) TO authenticated;
