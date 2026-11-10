-- Operator-only, read-only query for the SUPABASE BUSINESS database, not ECS.
-- Bind $1 = explicit campaign UUID, $2 = inclusive start, $3 = exclusive end.
-- Use the full activity window for final progress; revoked records never count.
-- No new RPC/view/grant is needed. Keep user identifiers inside the aggregates.
WITH scope AS (
  SELECT id,title FROM public.campaign_events WHERE id=$1::uuid
), stops AS (
  SELECT s.id,s.tenant_id,s.drink_id,s.brewery_label,s.sort_order,
    coalesce(nullif(t.display_name,''),t.name) AS tenant_name,d.name AS drink_name
  FROM public.campaign_stops s
  JOIN scope c ON c.id=s.campaign_id
  JOIN public.tenants t ON t.id=s.tenant_id
  JOIN public.drinks d ON d.id=s.drink_id
), active AS (
  SELECT c.user_id,c.stop_id,c.completed_at,c.verification_method
  FROM public.user_campaign_stop_completions c
  JOIN scope s ON s.id=c.campaign_id
  WHERE c.undone_at IS NULL AND c.completed_at >= $2::timestamptz AND c.completed_at < $3::timestamptz
), progress AS (
  SELECT user_id,count(DISTINCT stop_id)::int AS completed_stops
  FROM active GROUP BY user_id
), venue_totals AS (
  SELECT s.*,count(DISTINCT a.user_id)::int AS participants
  FROM stops s LEFT JOIN active a ON a.stop_id=s.id
  GROUP BY s.id,s.tenant_id,s.drink_id,s.brewery_label,s.sort_order,s.tenant_name,s.drink_name
), distribution AS (
  SELECT completed_stops,count(*)::int AS participants FROM progress GROUP BY completed_stops
), daily AS (
  SELECT to_char(completed_at AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD') AS day,
    count(*)::int AS completions,count(DISTINCT user_id)::int AS participants
  FROM active GROUP BY day
)
SELECT jsonb_build_object(
  'campaign_id',$1::uuid,'generated_at',now(),'from',$2::timestamptz,'until',$3::timestamptz,
  'campaign_exists',EXISTS(SELECT 1 FROM scope),
  'total_stops',(SELECT count(*) FROM stops),
  'active_completions',(SELECT count(*) FROM active),
  'participants',(SELECT count(*) FROM progress),
  'multi_venue_participants',(SELECT count(*) FROM progress WHERE completed_stops>=2),
  'finished_participants',(SELECT count(*) FROM progress WHERE completed_stops=(SELECT count(*) FROM stops)),
  'progress_distribution',coalesce((SELECT jsonb_agg(to_jsonb(d) ORDER BY completed_stops) FROM distribution d),'[]'::jsonb),
  'venues',coalesce((SELECT jsonb_agg(to_jsonb(v) ORDER BY sort_order) FROM venue_totals v),'[]'::jsonb),
  'daily',coalesce((SELECT jsonb_agg(to_jsonb(d) ORDER BY day) FROM daily d),'[]'::jsonb),
  'meaning','Effective online self-confirmed records, not verified visits, purchases or redemption. No zero-check-in visitors are present in this dataset.'
) AS report;
