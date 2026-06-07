-- Concierge bulk import: super_admin upserts public tap list beers for any tenant.

CREATE OR REPLACE FUNCTION public.admin_upsert_beers(
  p_tenant_id uuid,
  p_rows jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_category_id uuid;
  v_max_sort integer;
  v_max_public_sort integer;
  v_row jsonb;
  v_brewery text;
  v_name text;
  v_beer_style text;
  v_country text;
  v_abv numeric;
  v_sort_order integer;
  v_public_sort_order integer;
  v_public_status text;
  v_drink_id uuid;
  v_inserted integer := 0;
  v_skipped integer := 0;
  v_results jsonb := '[]'::jsonb;
  v_default_price numeric;
  v_default_volume integer;
  v_servings jsonb;
  v_serving jsonb;
  v_sort_idx integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = 'super_admin'
  ) THEN
    RAISE EXCEPTION 'Unauthorized: super_admin role required';
  END IF;

  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant id is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tenants t
    WHERE t.id = p_tenant_id
  ) THEN
    RAISE EXCEPTION 'Tenant not found: %', p_tenant_id;
  END IF;

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'p_rows must be a JSON array';
  END IF;

  SELECT c.id
  INTO v_category_id
  FROM public.categories c
  WHERE c.tenant_id = p_tenant_id
    AND c.name = '生啤'
  ORDER BY c.sort_order, c.created_at, c.id
  LIMIT 1;

  IF v_category_id IS NULL THEN
    INSERT INTO public.categories (tenant_id, name, sort_order, enabled, is_public_visible)
    VALUES (p_tenant_id, '生啤', 1, true, true)
    RETURNING id INTO v_category_id;
  END IF;

  SELECT
    COALESCE(MAX(d.sort_order), 0),
    COALESCE(MAX(d.public_sort_order), 0)
  INTO v_max_sort, v_max_public_sort
  FROM public.drinks d
  WHERE d.tenant_id = p_tenant_id;

  FOR v_row IN
    SELECT value
    FROM jsonb_array_elements(p_rows)
  LOOP
    v_brewery := trim(coalesce(v_row->>'brewery', ''));
    v_name := trim(coalesce(v_row->>'name', ''));
    v_beer_style := trim(coalesce(v_row->>'beer_style', ''));

    IF v_brewery = '' OR v_name = '' OR v_beer_style = '' THEN
      v_results := v_results || jsonb_build_array(
        jsonb_build_object(
          'brewery', v_brewery,
          'name', v_name,
          'status', 'error',
          'message', 'brewery, name, and beer_style are required'
        )
      );
      CONTINUE;
    END IF;

    SELECT d.id
    INTO v_drink_id
    FROM public.drinks d
    WHERE d.tenant_id = p_tenant_id
      AND d.brand_name = v_brewery
      AND d.name = v_name
    ORDER BY d.created_at DESC, d.id DESC
    LIMIT 1;

    IF v_drink_id IS NOT NULL THEN
      v_skipped := v_skipped + 1;
      v_results := v_results || jsonb_build_array(
        jsonb_build_object(
          'brewery', v_brewery,
          'name', v_name,
          'status', 'skipped',
          'drink_id', v_drink_id
        )
      );
      CONTINUE;
    END IF;

    v_country := nullif(trim(coalesce(v_row->>'country', '')), '');
    IF v_country IN ('-', '—', '–') THEN
      v_country := NULL;
    END IF;

    IF nullif(trim(coalesce(v_row->>'abv', '')), '') IS NULL
       OR trim(coalesce(v_row->>'abv', '')) IN ('-', '—', '–') THEN
      v_abv := NULL;
    ELSE
      v_abv := (regexp_replace(trim(v_row->>'abv'), '[^0-9.]+', '', 'g'))::numeric;
    END IF;

    v_max_sort := v_max_sort + 1;
    v_max_public_sort := v_max_public_sort + 1;

    IF nullif(trim(coalesce(v_row->>'sort_order', '')), '') IS NOT NULL THEN
      v_sort_order := (v_row->>'sort_order')::integer;
      v_public_sort_order := v_sort_order;
      v_max_sort := GREATEST(v_max_sort, v_sort_order);
      v_max_public_sort := GREATEST(v_max_public_sort, v_public_sort_order);
    ELSE
      v_sort_order := v_max_sort;
      v_public_sort_order := v_max_public_sort;
    END IF;

    v_public_status := coalesce(nullif(trim(v_row->>'public_status'), ''), 'available');

    v_servings := v_row->'servings';
    v_default_price := 0;
    v_default_volume := NULL;

    IF v_servings IS NOT NULL AND jsonb_typeof(v_servings) = 'array' AND jsonb_array_length(v_servings) > 0 THEN
      SELECT
        (elem->>'price')::numeric,
        nullif(trim(coalesce(elem->>'volume_ml', '')), '')::integer
      INTO v_default_price, v_default_volume
      FROM jsonb_array_elements(v_servings) AS elem
      WHERE coalesce((elem->>'is_default')::boolean, false)
      ORDER BY coalesce((elem->>'public_sort_order')::integer, 0) DESC
      LIMIT 1;

      IF v_default_price IS NULL THEN
        SELECT
          (elem->>'price')::numeric,
          nullif(trim(coalesce(elem->>'volume_ml', '')), '')::integer
        INTO v_default_price, v_default_volume
        FROM jsonb_array_elements(v_servings) AS elem
        ORDER BY coalesce((elem->>'volume_ml')::integer, 0) DESC
        LIMIT 1;
      END IF;

      v_default_price := coalesce(v_default_price, 0);
    END IF;

    INSERT INTO public.drinks (
      tenant_id,
      category_id,
      brand_name,
      name,
      price,
      price_unit,
      volume_ml,
      sort_order,
      enabled,
      is_public_visible,
      public_status,
      public_sort_order
    )
    VALUES (
      p_tenant_id,
      v_category_id,
      v_brewery,
      v_name,
      v_default_price,
      '杯',
      v_default_volume,
      v_sort_order,
      true,
      true,
      v_public_status,
      v_public_sort_order
    )
    RETURNING id INTO v_drink_id;

    INSERT INTO public.drink_beer_profiles (
      tenant_id,
      drink_id,
      brewery,
      beer_style,
      abv,
      country
    )
    VALUES (
      p_tenant_id,
      v_drink_id,
      v_brewery,
      v_beer_style,
      v_abv,
      v_country
    );

    IF v_servings IS NOT NULL AND jsonb_typeof(v_servings) = 'array' THEN
      v_sort_idx := 0;
      FOR v_serving IN
        SELECT value
        FROM jsonb_array_elements(v_servings)
      LOOP
        INSERT INTO public.drink_serving_options (
          tenant_id,
          drink_id,
          serving_type,
          label,
          volume_ml,
          price,
          is_default,
          is_active,
          public_sort_order
        )
        VALUES (
          p_tenant_id,
          v_drink_id,
          coalesce(nullif(trim(v_serving->>'serving_type'), ''), 'draft'),
          coalesce(nullif(trim(v_serving->>'label'), ''), '杯'),
          nullif(trim(coalesce(v_serving->>'volume_ml', '')), '')::integer,
          coalesce((v_serving->>'price')::numeric, 0),
          coalesce((v_serving->>'is_default')::boolean, false),
          coalesce((v_serving->>'is_active')::boolean, true),
          coalesce((v_serving->>'public_sort_order')::integer, v_sort_idx)
        );
        v_sort_idx := v_sort_idx + 1;
      END LOOP;
    END IF;

    v_inserted := v_inserted + 1;
    v_results := v_results || jsonb_build_array(
      jsonb_build_object(
        'brewery', v_brewery,
        'name', v_name,
        'status', 'inserted',
        'drink_id', v_drink_id
      )
    );
  END LOOP;

  IF v_inserted > 0 THEN
    UPDATE public.tenants
    SET last_menu_updated_at = now()
    WHERE id = p_tenant_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'inserted', v_inserted,
    'skipped', v_skipped,
    'results', v_results
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_upsert_beers(uuid, jsonb) TO authenticated;
