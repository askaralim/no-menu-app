-- A4: tenant members (owner/staff) may edit storefront + public toggles.
-- A7: collab_breweries on drink_beer_profiles; upsert_drink_product syncs brand_name from brewery.

-- ---------------------------------------------------------------------------
-- 1) Allow staff on storefront / visibility / price mode
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_tenant_taplist_storefront(
  p_tenant_id uuid,
  p_display_name text,
  p_district text,
  p_address text,
  p_cover_image_url text,
  p_city text,
  p_opening_hour jsonb DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_tag_keys text[] DEFAULT NULL,
  p_brewing_type text DEFAULT NULL,
  p_update_storefront_extras boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tag_key text;
  v_brewing_type text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.taplist_can_view_tenant(p_tenant_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_update_storefront_extras THEN
    v_brewing_type := nullif(trim(p_brewing_type), '');
    IF v_brewing_type IS NOT NULL
       AND v_brewing_type NOT IN ('house_brand', 'on_site_brewery') THEN
      RAISE EXCEPTION 'Invalid brewing_type: %', v_brewing_type;
    END IF;

    IF p_tag_keys IS NOT NULL THEN
      FOREACH v_tag_key IN ARRAY p_tag_keys LOOP
        IF v_tag_key IS NULL OR trim(v_tag_key) = '' THEN
          CONTINUE;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM public.bar_tag_definitions d WHERE d.key = trim(v_tag_key)
        ) THEN
          RAISE EXCEPTION 'Unknown tag key: %', v_tag_key;
        END IF;
      END LOOP;
    END IF;
  END IF;

  UPDATE public.tenants
  SET
    display_name = nullif(trim(p_display_name), ''),
    district = nullif(trim(p_district), ''),
    address = nullif(trim(p_address), ''),
    cover_image_url = nullif(trim(p_cover_image_url), ''),
    city = coalesce(nullif(trim(p_city), ''), 'Shanghai'),
    opening_hour = CASE
      WHEN p_opening_hour IS NULL THEN NULL
      WHEN p_opening_hour = 'null'::jsonb THEN NULL
      ELSE p_opening_hour
    END,
    description = nullif(trim(p_description), ''),
    brewing_type = CASE
      WHEN p_update_storefront_extras THEN v_brewing_type
      ELSE brewing_type
    END
  WHERE id = p_tenant_id;

  PERFORM public.taplist_mark_public_projection_changed(p_tenant_id, 'storefront');

  IF p_update_storefront_extras THEN
    DELETE FROM public.tenant_bar_tags WHERE tenant_id = p_tenant_id;

    INSERT INTO public.tenant_bar_tags (tenant_id, tag_key)
    SELECT DISTINCT p_tenant_id, trim(k)
    FROM unnest(coalesce(p_tag_keys, ARRAY[]::text[])) AS k
    WHERE k IS NOT NULL AND trim(k) <> '';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_tenant_taplist_storefront(
  uuid, text, text, text, text, text, jsonb, text, text[], text, boolean
) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_tenant_public_price_mode(
  p_tenant_id uuid,
  p_mode text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_before text;
  v_mode text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.taplist_can_view_tenant(p_tenant_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  v_mode := lower(trim(coalesce(p_mode, '')));
  IF v_mode NOT IN ('show', 'hide') THEN
    RAISE EXCEPTION 'Invalid public_price_mode';
  END IF;

  SELECT coalesce(t.public_price_mode, 'hide')
  INTO v_before
  FROM public.tenants t
  WHERE t.id = p_tenant_id;

  IF v_before IS NULL THEN
    RAISE EXCEPTION 'Tenant not found';
  END IF;

  UPDATE public.tenants
  SET
    public_price_mode = v_mode,
    last_menu_updated_at = now()
  WHERE id = p_tenant_id;

  PERFORM public._audit_log(
    p_tenant_id,
    'tenant_public_price_mode_changed',
    'tenant',
    p_tenant_id,
    jsonb_build_object('public_price_mode', v_before),
    jsonb_build_object('public_price_mode', v_mode)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'tenant_id', p_tenant_id,
    'public_price_mode', v_mode
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_tenant_public_price_mode(uuid, text) TO authenticated;

-- Open publish visibility to tenant members; keep readiness + onboarding side effects.
CREATE OR REPLACE FUNCTION public.set_tenant_public_visibility(
  p_tenant_id uuid,
  p_visible boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ready jsonb;
  v_before boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.taplist_can_view_tenant(p_tenant_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT is_public_visible INTO v_before FROM public.tenants WHERE id = p_tenant_id;

  IF p_visible THEN
    v_ready := public.get_tenant_publish_readiness(p_tenant_id);
    IF NOT coalesce((v_ready->>'ok')::boolean, false) THEN
      RAISE EXCEPTION 'Publish blocked: %', coalesce(v_ready->>'errors', '[]');
    END IF;

    UPDATE public.tenants
    SET
      is_public_visible = true,
      onboarding_status = 'public_live',
      last_menu_updated_at = now()
    WHERE id = p_tenant_id;

    PERFORM public._audit_log(
      p_tenant_id, 'tenant_published', 'tenant', p_tenant_id,
      jsonb_build_object('is_public_visible', v_before),
      jsonb_build_object('is_public_visible', true)
    );
  ELSE
    UPDATE public.tenants
    SET
      is_public_visible = false,
      onboarding_status = CASE
        WHEN onboarding_status = 'public_live' THEN 'setup_in_progress'
        ELSE onboarding_status
      END,
      last_menu_updated_at = now()
    WHERE id = p_tenant_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_tenant_public_visibility(uuid, boolean) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2) A7 collab_breweries
-- ---------------------------------------------------------------------------

ALTER TABLE public.drink_beer_profiles
  ADD COLUMN IF NOT EXISTS collab_breweries text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.drink_beer_profiles.collab_breweries IS
  'Secondary breweries for collab beers; primary remains brewery. Max 3 in POS.';

-- Staff/owner can read tenant tags for POS profile editor
DROP POLICY IF EXISTS tenant_bar_tags_member_read ON public.tenant_bar_tags;
CREATE POLICY tenant_bar_tags_member_read ON public.tenant_bar_tags
  FOR SELECT TO authenticated
  USING (public.taplist_can_view_tenant(tenant_id));
