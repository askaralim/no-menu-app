import { transaction } from './db.js'
import { fail } from './errors.js'

export function reportScope(params, now = Date.now()) {
  for (const key of params.keys()) if (!['days', 'application'].includes(key) || params.getAll(key).length !== 1) fail(400, 'INVALID_REPORT_SCOPE')
  const days = Number(params.get('days') ?? 7), application = params.get('application') ?? 'all'
  if (![1, 7, 30].includes(days) || !['all', 'ios', 'taplist', 'miniprogram', 'unknown'].includes(application)) fail(400, 'INVALID_REPORT_SCOPE')
  return { days, application, from: new Date(now - days * 86400000).toISOString(), until: new Date(now).toISOString(), timezone: 'Asia/Shanghai' }
}

// Bounded, read-only aggregate queries. No account, device or session IDs leave this endpoint.
export async function adminReport(pool, scope) {
  return transaction(pool, async db => {
    await db.query('SET TRANSACTION READ ONLY')
    await db.query("SET LOCAL statement_timeout = '5000ms'")
    const args = [scope.from, scope.until, scope.application]
    const base = `WITH selected AS (
      SELECT *, raw->>'event_name' AS name,
        COALESCE(enrichment#>>'{client,application}','unknown') AS application,
        COALESCE(enrichment->>'tenant_id',raw->>'tenant_id',raw#>>'{result,tenant_id}') AS venue
      FROM ci.events WHERE occurred_at >= $1::timestamptz AND occurred_at < $2::timestamptz
      AND ($3='all' OR COALESCE(enrichment#>>'{client,application}','unknown')=$3)
    ) `
    const query = async sql => (await db.query(base + sql, args)).rows
    const summary = (await query(`SELECT count(*)::int AS events, count(DISTINCT installation_id)::int AS installations,
      count(DISTINCT (installation_id,session_id))::int AS sessions,
      count(DISTINCT resolved_user_key) FILTER (WHERE identity_state='resolved')::int AS accounts,
      max(received_at) AS last_received_at,
      count(*) FILTER (WHERE received_at < occurred_at)::int AS clock_skew_events,
      count(*) FILTER (WHERE received_at-occurred_at > interval '1 hour')::int AS late_events,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM received_at-occurred_at)) FILTER (WHERE received_at>=occurred_at) AS delay_p50,
      percentile_cont(0.95) WITHIN GROUP (ORDER BY extract(epoch FROM received_at-occurred_at)) FILTER (WHERE received_at>=occurred_at) AS delay_p95
      FROM selected`))[0]
    const daily = await query(`SELECT to_char(occurred_at AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD') AS day,
      count(*)::int AS events, count(DISTINCT installation_id)::int AS installations,
      count(*) FILTER(WHERE name='beer_opened')::int AS beer_opens,
      count(*) FILTER(WHERE name='bar_opened')::int AS bar_opens FROM selected GROUP BY day ORDER BY day`)
    const events = await query(`SELECT application,name,count(*)::int AS events,
      count(DISTINCT installation_id)::int AS installations FROM selected GROUP BY application,name ORDER BY events DESC`)
    const identity = await query(`SELECT identity_state,count(*)::int AS events FROM selected GROUP BY identity_state ORDER BY events DESC`)
    const sources = await query(`SELECT name,COALESCE(raw->>'source',enrichment->>'surface','unknown') AS source,
      count(*)::int AS events FROM selected WHERE name IN ('beer_opened','bar_opened','search_result_opened','feed_item_opened','activity_opened') GROUP BY name,source ORDER BY events DESC LIMIT 50`)
    const venues = await query(`SELECT venue AS tenant_id,
      count(*) FILTER(WHERE name='bar_opened')::int AS bar_opens,
      count(*) FILTER(WHERE name='beer_opened')::int AS beer_opens,
      count(*) FILTER(WHERE name='feed_item_opened')::int AS feed_opens,
      count(DISTINCT installation_id)::int AS installations
      FROM selected WHERE venue IS NOT NULL AND name IN ('bar_opened','beer_opened','feed_item_opened')
      GROUP BY venue ORDER BY count(*) DESC LIMIT 50`)
    const cities = await query(`SELECT COALESCE(enrichment->>'city_code',raw->>'selected_city_code','unknown') AS city,
      count(*)::int AS events,count(DISTINCT installation_id)::int AS installations FROM selected GROUP BY city ORDER BY events DESC`)
    const beers = await query(`SELECT venue AS tenant_id,
      COALESCE(enrichment->>'source_drink_id',raw->>'source_drink_id',raw#>>'{result,source_drink_id}') AS source_drink_id,
      COALESCE(enrichment->>'product_id',raw->>'product_id',raw#>>'{result,product_id}') AS product_id,
      count(*) FILTER(WHERE name='beer_opened')::int AS detail_opens,
      count(*) FILTER(WHERE name='feed_item_opened')::int AS feed_opens,
      count(DISTINCT installation_id)::int AS installations
      FROM selected WHERE name IN ('beer_opened','feed_item_opened')
      GROUP BY venue,source_drink_id,product_id ORDER BY count(*) DESC LIMIT 50`)
    const feed = await query(`, items AS (
      SELECT application,enrichment->>'mode' AS mode,enrichment->>'surface' AS surface,
        enrichment->>'ranking_version' AS ranking_version, installation_id,
        raw#>>'{feed,feed_instance_id}' AS instance_id,raw#>>'{feed,item_id}' AS item_id,
        min(occurred_at) FILTER(WHERE name='feed_item_impression') AS impression_at,
        max(occurred_at) FILTER(WHERE name='feed_item_opened') AS open_at
      FROM selected WHERE name IN ('feed_item_impression','feed_item_opened')
      GROUP BY application,mode,surface,ranking_version,installation_id,instance_id,item_id
    ) SELECT application,mode,surface,ranking_version,
      count(*) FILTER(WHERE impression_at IS NOT NULL)::int AS impressions,
      count(*) FILTER(WHERE open_at IS NOT NULL)::int AS opened_items,
      count(*) FILTER(WHERE impression_at IS NOT NULL AND open_at>=impression_at)::int AS opened_after_impression
      FROM items GROUP BY application,mode,surface,ranking_version ORDER BY impressions DESC`)
    const feedTaps = await query(`, clicks AS (
      SELECT * FROM selected WHERE name='feed_item_opened' AND identity_state='resolved'
    ), taps AS (
      SELECT t FROM ci.projections p CROSS JOIN LATERAL jsonb_array_elements(p.payload->'venue_experiences') t WHERE p.scope='consumer'
    ) SELECT c.enrichment->>'mode' AS mode,
      count(DISTINCT c.event_id)::int AS identified_clicks,
      count(DISTINCT c.event_id) FILTER(WHERE c.occurred_at <= $2::timestamptz-interval '72 hours')::int AS mature_clicks,
      count(DISTINCT t.t->>'id')::int AS matched_taps,
      count(DISTINCT c.event_id) FILTER(WHERE t.t IS NOT NULL)::int AS clicks_with_tap
      FROM clicks c LEFT JOIN LATERAL (
        SELECT t FROM taps WHERE t->>'user_key'=c.resolved_user_key AND t->>'tenant_id'=c.venue
        AND (t->>'created_at')::timestamptz>c.occurred_at AND (t->>'created_at')::timestamptz<=c.occurred_at+interval '72 hours'
        AND (t->>'created_at')::timestamptz<$2::timestamptz
        AND ((c.enrichment->>'product_id' IS NOT NULL AND t->>'product_id'=c.enrichment->>'product_id')
          OR ((c.enrichment->>'product_id' IS NULL OR t->>'product_id' IS NULL) AND t->>'source_drink_id'=c.enrichment->>'source_drink_id'))
      ) t ON true GROUP BY mode`)
    const projections = (await db.query('SELECT scope,source_as_of,published_at FROM ci.projections ORDER BY scope')).rows
    const catalog = (await db.query("SELECT payload->'active_cycles' AS venues FROM ci.projections WHERE scope='catalog'")).rows[0]?.venues ?? []
    const beerNames = new Map(catalog.map(v => [`${v.tenant_id}:${v.source_drink_id}`,v.beer_name]))
    const productNames = new Map(catalog.filter(v=>v.product_id).map(v=>[v.product_id,v.beer_name]))
    const names = new Map(catalog.map(v => [v.tenant_id ?? v.id, v.tenant_name ?? v.name ?? v.slug]))
    const assisted = (await db.query('SELECT computed_at,visits FROM ci.admin_assisted_visit_summary')).rows[0]
    const visits = (assisted?.visits ?? []).filter(v => Date.parse(v.first_tap_created_at) >= Date.parse(scope.from) && Date.parse(v.first_tap_created_at) < Date.parse(scope.until))
    const byVenue = new Map()
    for (const v of visits) {
      const row = byVenue.get(v.tenant_id) ?? { tenant_id: v.tenant_id, name: names.get(v.tenant_id) ?? v.tenant_id, visits: 0, taps: 0 }
      row.visits++; row.taps += v.tap_count; byVenue.set(v.tenant_id,row)
    }
    const taps = (await db.query(`SELECT count(*)::int AS records,count(DISTINCT t->>'user_key')::int AS accounts
      FROM ci.projections p CROSS JOIN LATERAL jsonb_array_elements(p.payload->'venue_experiences') t
      WHERE p.scope='consumer' AND (t->>'created_at')::timestamptz >= $1 AND (t->>'created_at')::timestamptz < $2`, args.slice(0,2))).rows[0]
    const queue = (await db.query('SELECT count(*)::int AS pending,min(requested_at) AS oldest_at FROM ci.refresh_requests')).rows[0]
    const consumerAvailable = projections.some(p => p.scope === 'consumer')
    return { generated_at: new Date().toISOString(), scope, summary, daily, events, sources, identity, cities, feed,
      feed_taps: feedTaps.map(row => consumerAvailable ? row : { ...row, matched_taps: null, clicks_with_tap: null }),
      beers: beers.map(b=>({...b,venue_name:names.get(b.tenant_id) ?? b.tenant_id ?? '未指定门店',
        beer_name:beerNames.get(`${b.tenant_id}:${b.source_drink_id}`) ?? productNames.get(b.product_id) ?? '历史酒款（当前目录无名称）'})),
      venues: venues.map(v => ({ ...v, name: names.get(v.tenant_id) ?? v.tenant_id })),
      business: { scope: 'all_channels', taps: projections.some(p=>p.scope==='consumer') ? taps : { records: null, accounts: null }, assisted_computed_at: assisted?.computed_at ?? null,
        assisted: assisted ? Object.fromEntries([24,48,72].map(h => [h,visits.filter(v => v.matched_windows[`${h}h`]).length])) : null,
        venues: [...byVenue.values()].sort((a,b)=>b.visits-a.visits).slice(0,50) },
      health: { projections, queue, request_errors: null, rejected_events: null, duplicate_deliveries: null } }
  }, 'REPEATABLE READ')
}

// One in-flight report across scopes, 60-second cache; keep analytics from occupying the API pool.
export function createAdminReports(pool, clock = Date.now) {
  const cache = new Map(); let busy = false
  return async scope => {
    const key = `${scope.days}:${scope.application}`, now = clock(), prior = cache.get(key)
    if (prior && now-prior.at<60000) return prior.value
    if (busy) fail(503,'REPORT_BUSY')
    busy=true
    try { const value = await adminReport(pool,scope); cache.set(key,{at:clock(),value}); return value }
    finally { busy=false }
  }
}
