-- Additive endpoint only: existing public RPC signatures and payloads remain unchanged.
-- Reuse their shaping logic so the detail payload stays compatible with the public taplist.
CREATE OR REPLACE FUNCTION public.get_public_taplist_drink(p_slug text, p_drink_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_result jsonb;
  v_drinks_result jsonb;
  v_drink jsonb;
BEGIN
  v_tenant_result := public.get_public_taplist_tenant(p_slug);
  IF coalesce((v_tenant_result->>'ok')::boolean, false) IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'tenant_' || coalesce(v_tenant_result->>'code', 'not_found'),
      'name', v_tenant_result->'name'
    );
  END IF;

  v_drinks_result := public.get_public_taplist_drinks((v_tenant_result#>>'{tenant,id}')::uuid);
  IF coalesce((v_drinks_result->>'ok')::boolean, false) IS NOT TRUE THEN
    RETURN v_drinks_result;
  END IF;

  SELECT item INTO v_drink
  FROM jsonb_array_elements(
    coalesce(v_drinks_result->'drinks', '[]'::jsonb)
    || coalesce(v_drinks_result->'coming_soon', '[]'::jsonb)
    || coalesce(v_drinks_result->'recently_sold_out', '[]'::jsonb)
  ) AS item
  WHERE item->>'id' = p_drink_id::text
  LIMIT 1;

  IF v_drink IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'tenant', v_tenant_result->'tenant',
    'drink', v_drink
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_taplist_drink(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_taplist_drink(text, uuid) TO anon, authenticated;

COMMENT ON FUNCTION public.get_public_taplist_drink(text, uuid) IS
  'Additive consumer detail endpoint reusing current public visibility and payload rules.';
