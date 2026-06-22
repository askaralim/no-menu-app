-- Bar amenity tags (preset catalog + junction) and brewing highlight on tenants

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS brewing_type text
  CONSTRAINT tenants_brewing_type_check
    CHECK (brewing_type IS NULL OR brewing_type IN ('house_brand', 'on_site_brewery'));

CREATE TABLE IF NOT EXISTS public.bar_tag_definitions (
  key text PRIMARY KEY,
  label_zh text NOT NULL,
  category text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  icon text
);

CREATE TABLE IF NOT EXISTS public.tenant_bar_tags (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tag_key text NOT NULL REFERENCES public.bar_tag_definitions(key) ON DELETE CASCADE,
  PRIMARY KEY (tenant_id, tag_key)
);

CREATE INDEX IF NOT EXISTS tenant_bar_tags_tag_key_idx ON public.tenant_bar_tags(tag_key);

INSERT INTO public.bar_tag_definitions (key, label_zh, category, sort_order) VALUES
  ('seats_small', '小型门店', '座位规模', 10),
  ('seats_medium', '约20座', '座位规模', 20),
  ('seats_large', '大型空间', '座位规模', 30),
  ('outdoor_seating', '室外有座位', '空间', 40),
  ('pet_friendly', '宠物友好', '友好政策', 50),
  ('family_friendly', '亲子友好', '友好政策', 60),
  ('late_night', '营业至深夜', '设施', 70),
  ('wifi', '有 Wi‑Fi', '设施', 80),
  ('card_payment', '可刷卡', '设施', 90)
ON CONFLICT (key) DO UPDATE SET
  label_zh = EXCLUDED.label_zh,
  category = EXCLUDED.category,
  sort_order = EXCLUDED.sort_order;

CREATE OR REPLACE FUNCTION public.taplist_brewing_label(p_brewing_type text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE p_brewing_type
    WHEN 'house_brand' THEN '自有品牌'
    WHEN 'on_site_brewery' THEN '店内自酿'
    ELSE NULL
  END;
$$;

ALTER TABLE public.bar_tag_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_bar_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bar_tag_definitions_public_read ON public.bar_tag_definitions;
CREATE POLICY bar_tag_definitions_public_read ON public.bar_tag_definitions
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS tenant_bar_tags_owner_read ON public.tenant_bar_tags;
CREATE POLICY tenant_bar_tags_owner_read ON public.tenant_bar_tags
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND (
          ur.role = 'super_admin'
          OR (ur.tenant_id = tenant_bar_tags.tenant_id AND ur.role = 'owner')
        )
    )
  );

CREATE OR REPLACE FUNCTION public.get_bar_tag_catalog()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'key', d.key,
        'label_zh', d.label_zh,
        'category', d.category,
        'sort_order', d.sort_order
      )
      ORDER BY d.sort_order, d.key
    ),
    '[]'::jsonb
  )
  FROM public.bar_tag_definitions d;
$$;

GRANT EXECUTE ON FUNCTION public.get_bar_tag_catalog() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_bar_tag_catalog() TO anon;

DROP FUNCTION IF EXISTS public.set_tenant_taplist_storefront(uuid, text, text, text, text, text, jsonb, text);
DROP FUNCTION IF EXISTS public.set_tenant_taplist_storefront(uuid, text, text, text, text, text, jsonb, text, text[], text);

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

  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND (
        ur.role = 'super_admin'
        OR (ur.tenant_id = p_tenant_id AND ur.role = 'owner')
      )
  ) THEN
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
    END,
    last_menu_updated_at = now()
  WHERE id = p_tenant_id;

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

CREATE OR REPLACE FUNCTION public.get_public_taplist_bars(p_city text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
            'opening_hour', t.opening_hour,
            'description', t.description,
            'cover_image_url', t.cover_image_url,
            'city', t.city,
            'country', t.country,
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
        WHERE t.status = 'active'
          AND t.is_public_visible = true
          AND lower(trim(t.city)) = lower(trim(v_city))
      ) sub
    ),
    '[]'::jsonb
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_public_taplist_tenant(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slug text := trim(p_slug);
  rec record;
BEGIN
  IF v_slug = '' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'bad_request');
  END IF;

  SELECT
    t.id, t.slug, t.name,
    coalesce(nullif(trim(t.display_name), ''), t.name) AS display_name,
    t.district, t.address, t.opening_hour, t.description, t.cover_image_url, t.city, t.country,
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

  RETURN jsonb_build_object(
    'ok', true,
    'tenant', jsonb_build_object(
      'id', rec.id,
      'slug', rec.slug,
      'name', rec.name,
      'display_name', rec.display_name,
      'district', rec.district,
      'address', rec.address,
      'opening_hour', rec.opening_hour,
      'description', rec.description,
      'cover_image_url', rec.cover_image_url,
      'city', rec.city,
      'country', rec.country,
      'last_menu_updated_at', rec.last_menu_updated_at,
      'brewing_type', rec.brewing_type,
      'brewing_label', public.taplist_brewing_label(rec.brewing_type),
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
