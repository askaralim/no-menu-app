-- Ops reference: manual Product Pool backfill (super_admin via Web Tap List admin).
-- Do NOT run as a blind migration. Use admin UI or RPCs after foundation migration is applied.
--
-- Recommended flow per duplicate cluster:
--   1. Open Tap List admin for bar A → expand drink → 「从当前酒款创建」 (super_admin)
--   2. Open bar B sibling drink → search product → 「复用此酒款」
--   3. Enrich canonical description/image in super_admin create/edit if needed
--
-- Known public duplicate clusters (2026-06-09 audit):
--   饼干 / Alus (2 bars)
--   果味满满 / 回头客 (2 bars)
--   本劫 / 本末特伦 (2 bars)
--   白天使 / 玄水屋 (2 bars)
--   业劫 / 本末特伦|本末·特伦 (2 bars — add spelling variants to aliases)
--
-- Report: find multi-bar name+brewery clusters among public drinks (read-only diagnostic)
SELECT
  lower(trim(d.name)) AS drink_name,
  lower(trim(coalesce(p.brewery, d.brand_name, ''))) AS brewery_key,
  count(DISTINCT d.tenant_id) AS bar_count,
  array_agg(DISTINCT d.id ORDER BY d.id) AS drink_ids,
  array_agg(DISTINCT t.slug ORDER BY t.slug) AS bar_slugs
FROM public.drinks d
INNER JOIN public.tenants t ON t.id = d.tenant_id
LEFT JOIN public.drink_beer_profiles p ON p.drink_id = d.id
WHERE d.enabled = true
  AND d.is_public_visible = true
  AND t.is_public_visible = true
  AND t.status = 'active'
GROUP BY 1, 2
HAVING count(DISTINCT d.tenant_id) > 1
ORDER BY bar_count DESC, drink_name;
