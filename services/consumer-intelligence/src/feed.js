import { assertNotRevoked, policyTargets, currentPolicy, newE1Route, requestRefresh } from './e1/routing.js'
import { e1Profile } from './e1/rank.js'
import { e1Filter, e1Signature } from './e1/integration.js'
import { assertNotErased } from './privacy.js'
import { transaction, lock } from './db.js'
import { assertSchema } from './schema.js'
import { fail } from './errors.js'
import { readProjections } from './projections.js'
import { features, eligible, publicItem, recentOrder, rankingSignature, iso } from './model.js'
import { newInstance, checkInstance, latestPage } from './instances.js'
import { bindSession, reconcileSession } from './identity.js'

// Never update the delivered manifest: delayed impressions still refer to its original ranks.
async function visibleE1Items(client, instance, valid) {
  const removed = new Set((await client.query('SELECT item_id FROM ci.e1_instance_withdrawals WHERE instance_id=$1',
    [instance.feed_instance_id])).rows.map(r => r.item_id))
  const newlyRemoved = instance.items.filter(item => !removed.has(item.item_id) && !valid(item))
  if (newlyRemoved.length) {
    await client.query(`INSERT INTO ci.e1_instance_withdrawals(instance_id,item_id)
      SELECT $1,unnest($2::text[]) ON CONFLICT DO NOTHING`, [instance.feed_instance_id, newlyRemoved.map(i => i.item_id)])
    for (const item of newlyRemoved) removed.add(item.item_id)
  }
  return instance.items.filter(i => !removed.has(i.item_id))
}

export async function getFeed(pool, config, query, analytics, owner, now = Date.now()) {
  assertSchema('feed/request.schema.json', query, 'INVALID_FEED_REQUEST')
  assertSchema('feed/analytics-headers.schema.json', analytics, 'INVALID_ANALYTICS_HEADERS')
  if (query.mode === 'for_you' && !owner) fail(401, 'AUTH_REQUIRED')
  return transaction(pool, async client => {
    await assertNotErased(client, owner, analytics['X-Installation-ID'], analytics['X-Analytics-Session-ID'])
    await lock(client, 'instance:' + query.feed_instance_id)
    let instance = (await client.query('SELECT payload FROM ci.feed_instances WHERE instance_id=$1', [query.feed_instance_id])).rows[0]?.payload
    const retry = Boolean(instance)
    if (instance) {
      checkInstance(instance, query, analytics, owner)
      if (now >= Date.parse(instance.record_retention_until)) fail(410, 'FEED_INSTANCE_EXPIRED')
    }
    let bundle = null, policy
    if (query.mode === 'for_you') {
      const pinned = instance?.model_version ?? instance?.ranking_version
      if (instance && pinned !== instance.ranking_version) fail(503, 'SNAPSHOT_MODEL_MISMATCH')
      if (instance && pinned !== config.modelVersion) {
        if (!config.e1) fail(503, 'E1_BUNDLE_UNAVAILABLE')
        policy = await currentPolicy(client)
        await assertNotRevoked(client,pinned,true)
        bundle = config.e1.bundle(pinned)
      } else if (!instance) {
        policy = await currentPolicy(client)
        if (newE1Route(policy,config.e1,owner)) {
          await assertNotRevoked(client,policy.model_version)
          bundle = config.e1.bundle()
        }
      }
    }
    const version = bundle?.model_version ?? config.modelVersion
    // One SQL read obtains both independently published projections together.
    const { catalog, consumer } = await readProjections(client, query.mode, now)
    const city = catalog.cities.find(c => c.city_code === query.city_code)
    if (!city) fail(400, 'UNKNOWN_CITY')
    const candidates = catalog.active_cycles.filter(c => c.city_code === query.city_code)
    const current = new Map(candidates.map(c => [c.item_id, c]))
    const profile = query.mode === 'latest' ? null : bundle ? e1Profile(consumer, owner, bundle) : features(consumer, owner)
    const signature = !profile ? null : bundle ? e1Signature(candidates, profile, bundle, now) : rankingSignature(candidates, profile, now, config)
    const checkE1 = bundle && e1Filter(profile, bundle, now)
    const isEligible = item => current.has(item.item_id) && eligible(current.get(item.item_id), now, config, profile)
    const count = profile?.count ?? 0
    const personalization = profile ? { status: count < config.requiredTapCount ? 'cold_start' : 'eligible', unique_tap_count: count, required_tap_count: config.requiredTapCount } : null
    if (!instance) {
      if (query.cursor) fail(410, 'FEED_INSTANCE_EXPIRED')
      let snapshot = null, items = [], emptyReason = null
      let dataAsOf = query.mode === 'latest' ? catalog.source_as_of : iso(Math.min(Date.parse(catalog.source_as_of), Date.parse(consumer.source_as_of)))
      if (query.mode === 'latest') items = candidates.filter(c => eligible(c, now, config)).sort(recentOrder).map((r, i) => publicItem(r, i + 1))
      else if (count >= config.requiredTapCount) {
        const result = await client.query(`SELECT payload FROM ci.feed_snapshots WHERE user_key=$1 AND city_code=$2 AND model_version=$3
          ORDER BY (signature=$4) DESC,generated_at DESC,snapshot_id LIMIT 1`, [owner, query.city_code, version, signature])
        snapshot = result.rows[0]?.payload ?? null
        if (snapshot) {
          if (snapshot.model_version !== version) fail(503, 'SNAPSHOT_MODEL_MISMATCH')
          items = (bundle ? snapshot.items.filter(i => checkE1(current.get(i.item_id), snapshot.evidence?.[i.item_id])) : snapshot.items.filter(isEligible))
            .map(item => {
              const row = current.get(item.item_id)
              return { ...item,
                tenant_name_en: row?.tenant_name_en ?? item.tenant_name_en ?? null,
                beer_name_en: row?.beer_name_en ?? item.beer_name_en ?? null,
                brewery_en: row?.brewery_en ?? item.brewery_en ?? null,
                style_en: row?.style_en ?? item.style_en ?? null }
            })
          dataAsOf = snapshot.data_as_of
        }
        else emptyReason = 'refresh_pending'
        if (!snapshot || snapshot.signature !== signature) await requestRefresh(client,owner,query.city_code,policy,bundle?.model_version)
      }
      const home = consumer?.consumer_profiles.find(p => p.user_key === owner)
      instance = newInstance(query, analytics, owner, home ? { ...home, source_as_of: consumer.source_as_of } : null, items,
        { ranking_version: query.mode === 'latest' ? 'latest-v1' : snapshot?.model_version ?? version,
          ...(bundle && { evidence:Object.fromEntries(items.slice(0,query.limit ?? 20).map(i => [i.item_id,snapshot.evidence[i.item_id]])) }),
          snapshot_id: snapshot?.snapshot_id ?? null, model_version: snapshot?.model_version ?? null,
          snapshot_generated_at: snapshot?.generated_at ?? null, snapshot_signature: snapshot?.signature ?? null,
          data_as_of: dataAsOf, empty_reason: emptyReason, initial_personalization: personalization, total_items: items.length }, now, city.timezone)
      if (owner && instance.analytics_installation_id) {
        // A conflict is durably quarantined; it never changes instance ownership.
        await bindSession(client, instance.analytics_installation_id, instance.analytics_session_id, owner, now)
        await reconcileSession(client, instance.analytics_installation_id, instance.analytics_session_id)
      }
      await client.query('INSERT INTO ci.feed_instances(instance_id,created_at,retention_until,payload) VALUES($1,$2,$3,$4)', [query.feed_instance_id, instance.created_at, instance.record_retention_until, instance])
    }
    const common = { city_code: instance.city_code, mode: instance.mode, surface: instance.surface, feed_instance_id: instance.feed_instance_id,
      ranking_version: instance.ranking_version, data_as_of: instance.data_as_of }
    if (query.mode === 'latest') {
      const page = latestPage(instance, query, now, isEligible, config.cursorSecret)
      return { ...common, ...page, personalization: null, snapshot: null, total_items: instance.total_items,
        empty_reason: instance.total_items ? null : 'no_recent_candidates' }
    }
    // A cold-start/building instance never acquires a new list on retry.
    const cold = count < config.requiredTapCount || instance.initial_personalization.status === 'cold_start'
    let retained
    if (bundle) {
      retained = retry ? await visibleE1Items(client, instance, i => !cold && checkE1(current.get(i.item_id), instance.evidence?.[i.item_id])) : instance.items
    }
    if (retry && bundle && config.e1.routes(owner) && !cold && signature !== instance.snapshot_signature) {
      if (policy.model_version===version && policyTargets(policy,owner))
        await requestRefresh(client,owner,query.city_code,policy,version)
    }
    if (cold) return { ...common, personalization: instance.initial_personalization.status === 'cold_start' ? instance.initial_personalization : personalization,
      snapshot: null, items: [], total_items: 0, empty_reason: null, summary: null, page: null }
    const items = (retained ?? instance.items.filter(isEligible)).slice(0, query.limit ?? 20)
    const snapshot = instance.snapshot_id ? { state: signature === instance.snapshot_signature ? 'fresh' : 'stale', snapshot_id: instance.snapshot_id,
      model_version: instance.model_version, generated_at: instance.snapshot_generated_at } : { state: 'building', snapshot_id: null, model_version: null, generated_at: null }
    return { ...common, personalization, snapshot, items, total_items: instance.total_items,
      empty_reason: !instance.snapshot_id ? 'refresh_pending' : items.length ? null : !candidates.some(c => eligible(c, now, bundle ? {windowDays:14} : config)) ? 'no_recent_candidates' : (bundle ? profile.counts.size : Object.keys(profile.counts).length) ? 'no_matching_style' : 'insufficient_style_history', summary: null, page: null }
  })
}
