-- Public discovery rails for the consumer app.
--
-- New taps should rank by drink-level status freshness, not by the bar's
-- latest menu update. Breweries are text/count discovery only; there are no
-- public brewery logos in v1.

CREATE OR REPLACE FUNCTION public.trg_drinks_public_status_changed_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.public_status = 'new' THEN
      NEW.public_status_changed_at := coalesce(NEW.public_status_changed_at, now());
    END IF;
  ELSIF NEW.public_status IS DISTINCT FROM OLD.public_status THEN
    NEW.public_status_changed_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_drinks_public_status_changed_at ON public.drinks;
CREATE TRIGGER trg_drinks_public_status_changed_at
  BEFORE INSERT OR UPDATE OF public_status ON public.drinks
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_drinks_public_status_changed_at();

UPDATE public.drinks
SET public_status_changed_at = coalesce(public_status_changed_at, created_at, now())
WHERE public_status = 'new'
  AND public_status_changed_at IS NULL;

CREATE OR REPLACE FUNCTION public.get_public_taplist_new_drinks(p_city text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_city text := coalesce(nullif(trim(p_city), ''), 'Shanghai');
BEGIN
  RETURN jsonb_build_object(
    'ok', true,
    'results', coalesce(
      (
        WITH ranked AS (
          SELECT
            jsonb_build_object(
              'drink_id', d.id,
              'name', CASE
                WHEN d.product_id IS NULL THEN d.name
                ELSE coalesce(nullif(trim(d.display_name), ''), dp.name, d.name)
              END,
              'brand_name', d.brand_name,
              'image_url', CASE
                WHEN d.product_id IS NULL THEN d.image_url
                ELSE coalesce(nullif(trim(d.image_url), ''), dp.image_url)
              END,
              'public_status', public.taplist_public_status_zh(d.public_status),
              'product_id', d.product_id,
              'default_serving', (
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
              ),
              'tenant_id', t.id,
              'tenant_slug', t.slug,
              'tenant_display_name', coalesce(nullif(trim(t.display_name), ''), t.name),
              'tenant_district', t.district,
              'tenant_address', t.address,
              'brewery', coalesce(dp.brewery, dp.brand_name, p.brewery, d.brand_name),
              'beer_style', coalesce(dp.beer_style, p.beer_style),
              'abv', coalesce(dp.abv, p.abv)
            ) AS row_obj,
            d.public_status_changed_at AS status_changed_at,
            d.public_sort_order AS public_sort,
            lower(d.name) AS name_sort,
            row_number() OVER (
              PARTITION BY t.id
              ORDER BY d.public_status_changed_at DESC NULLS LAST, d.public_sort_order, lower(d.name)
            ) AS tenant_rank
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
            AND d.public_status = 'new'
            AND d.public_status_changed_at >= now() - interval '14 days'
            AND c.enabled = true
            AND c.is_public_visible = true
        )
        SELECT jsonb_agg(row_obj ORDER BY status_changed_at DESC NULLS LAST, public_sort, name_sort)
        FROM (
          SELECT row_obj, status_changed_at, public_sort, name_sort
          FROM ranked
          WHERE tenant_rank <= 2
          ORDER BY status_changed_at DESC NULLS LAST, public_sort, name_sort
          LIMIT 10
        ) sub
      ),
      '[]'::jsonb
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_public_taplist_breweries(p_city text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_city text := coalesce(nullif(trim(p_city), ''), 'Shanghai');
BEGIN
  RETURN jsonb_build_object(
    'ok', true,
    'results', coalesce(
      (
        WITH public_drinks AS (
          SELECT
            coalesce(dp.brewery, dp.brand_name, p.brewery, d.brand_name) AS brewery_name,
            d.id AS drink_id,
            t.id AS tenant_id
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
            AND d.public_status IN ('new', 'available', 'low')
            AND c.enabled = true
            AND c.is_public_visible = true
        ),
        counted AS (
          SELECT
            trim(brewery_name) AS brewery_name,
            count(DISTINCT drink_id)::int AS tap_count,
            count(DISTINCT tenant_id)::int AS venue_count
          FROM public_drinks
          WHERE nullif(trim(brewery_name), '') IS NOT NULL
          GROUP BY trim(brewery_name)
        )
        SELECT jsonb_agg(
          jsonb_build_object(
            'brewery_name', brewery_name,
            'tap_count', tap_count
          )
          ORDER BY tap_count DESC, venue_count DESC, lower(brewery_name)
        )
        FROM (
          SELECT brewery_name, tap_count, venue_count
          FROM counted
          ORDER BY tap_count DESC, venue_count DESC, lower(brewery_name)
          LIMIT 12
        ) sub
      ),
      '[]'::jsonb
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_taplist_new_drinks(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_taplist_new_drinks(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_taplist_breweries(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_taplist_breweries(text) TO authenticated;
