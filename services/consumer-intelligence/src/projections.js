import { assertNotRevoked, policyTargets, currentPolicy, observeWorker, requireWorkerPolicy } from './e1/routing.js'
import { e1Profile } from './e1/rank.js'
import { e1Signature, e1Snapshot } from './e1/integration.js'
import { withoutSubjects } from './privacy.js'
import { randomUUID } from 'node:crypto'
import { transaction, lock } from './db.js'
import { digest, normalizeBeerStyle, publicItem, features, rankFeed, rankingSignature, MINUTE, iso } from './model.js'
import { userKey } from './supabase.js'
import { fail } from './errors.js'
import { valid } from './schema.js'

const lists = { catalog: ['cities', 'active_cycles'], consumer: ['user_beers', 'venue_experiences', 'follows', 'consumer_profiles'] }
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
export function prepareExport(raw, scope, config, now) {
  if (!lists[scope] || raw.schema_version !== 1 || raw.scope !== scope || raw.complete !== true || !uuid(raw.export_id)
    || !Number.isFinite(Date.parse(raw.source_as_of)) || Date.parse(raw.source_as_of) > now || now - Date.parse(raw.source_as_of) > 10 * MINUTE) fail(503, 'INVALID_SOURCE_EXPORT')
  for (const list of lists[scope]) if (!Array.isArray(raw[list]) || raw.counts?.[list] !== raw[list].length) fail(503, 'INVALID_SOURCE_EXPORT')
  const payload = Object.fromEntries(lists[scope].map(k => [k, structuredClone(raw[k])]))
  if (scope === 'catalog') {
    if (!valid('consumer/cities.schema.json', { api_version: '1', requestId: raw.export_id, server_time: iso(now), cities: payload.cities })) fail(503, 'INVALID_SOURCE_EXPORT')
    const cities = new Set(payload.cities.map(c => c.city_code)), ids = new Set()
    if (cities.size !== payload.cities.length) fail(503, 'INVALID_SOURCE_EXPORT')
    for (const row of payload.active_cycles) {
      if (!uuid(row.session_id) || !uuid(row.source_drink_id) || !uuid(row.tenant_id) || (row.product_id !== null && !uuid(row.product_id)) || !cities.has(row.city_code)) fail(503, 'INVALID_SOURCE_EXPORT')
      row.item_id = digest([row.tenant_id, row.source_drink_id, row.session_id])
      row.style_family = normalizeBeerStyle(row.style)
      if (!Number.isFinite(Date.parse(row.current_cycle_started_at))) fail(503, 'INVALID_SOURCE_EXPORT')
      row.current_cycle_started_at = iso(row.current_cycle_started_at)
      if (ids.has(row.item_id) || !valid('feed/item.schema.json', publicItem(row, 1))) fail(503, 'INVALID_SOURCE_EXPORT')
      ids.add(row.item_id)
      if (['public_tenant', 'public_category', 'public_drink', 'tap_assigned', 'canceled'].some(k => typeof row[k] !== 'boolean') || row.accuracy !== 'exact' || row.ended_at !== null) fail(503, 'INVALID_SOURCE_EXPORT')
    }
    payload.active_cycles.sort((a, b) => a.item_id.localeCompare(b.item_id))
    payload.cities.sort((a, b) => a.city_code.localeCompare(b.city_code))
  } else {
    const fields = {
      user_beers: ['id', 'user_id', 'product_id', 'provisional_drink_id', 'style'],
      venue_experiences: ['id', 'user_id', 'product_id', 'provisional_drink_id', 'tenant_id', 'source_drink_id', 'first_drank_at', 'created_at', 'style'],
      follows: ['user_id', 'tenant_id'], consumer_profiles: ['user_id', 'home_city_code'],
    }
    for (const list of lists.consumer) {
      const identities = new Set()
      for (const row of payload[list]) {
        if (!row || Object.keys(row).some(k => !fields[list].includes(k))) fail(503, 'INVALID_SOURCE_EXPORT')
        if (!uuid(row.user_id)) fail(503, 'INVALID_SOURCE_EXPORT')
        row.user_key = userKey(row.user_id, config.userKeySecret)
        delete row.user_id
        if (['user_beers', 'venue_experiences'].includes(list)) {
          if (!uuid(row.id) || (!uuid(row.product_id) && !uuid(row.provisional_drink_id))) fail(503, 'INVALID_SOURCE_EXPORT')
          if (row.style !== null && typeof row.style !== 'string') fail(503, 'INVALID_SOURCE_EXPORT')
        }
        if (['venue_experiences', 'follows'].includes(list) && !uuid(row.tenant_id)) fail(503, 'INVALID_SOURCE_EXPORT')
        if (list === 'venue_experiences' && (!Number.isFinite(Date.parse(row.first_drank_at)) || !Number.isFinite(Date.parse(row.created_at)))) fail(503, 'INVALID_SOURCE_EXPORT')
        if (list === 'consumer_profiles' && row.home_city_code !== null && (typeof row.home_city_code !== 'string' || !/^[a-z][a-z0-9_-]{0,63}$/.test(row.home_city_code))) fail(503, 'INVALID_SOURCE_EXPORT')
        const id = list === 'consumer_profiles' ? row.user_key : list === 'follows' ? `${row.user_key}:${row.tenant_id}` : row.id
        if (identities.has(id)) fail(503, 'INVALID_SOURCE_EXPORT')
        identities.add(id)
      }
      payload[list].sort((a, b) => digest(a).localeCompare(digest(b)))
    }
  }
  return { scope, payload, generation: raw.export_id, source_as_of: iso(raw.source_as_of), digest: digest(payload) }
}
export async function publishProjection(pool, projection) {
  return transaction(pool, async client => {
    await lock(client, 'projection:' + projection.scope)
    if (projection.scope === 'consumer') {
      const subjects = new Set((await client.query('SELECT user_key FROM ci.erased_subjects')).rows.map(r => r.user_key))
      const payload = withoutSubjects(projection.payload, subjects)
      projection = { ...projection, payload, digest: digest(payload) }
    }
    const old = (await client.query('SELECT source_as_of,digest FROM ci.projections WHERE scope=$1', [projection.scope])).rows[0]
    if (old && (new Date(old.source_as_of).getTime() > Date.parse(projection.source_as_of) || (new Date(old.source_as_of).getTime() === Date.parse(projection.source_as_of) && old.digest !== projection.digest))) fail(503, 'SOURCE_EXPORT_REGRESSION')
    await client.query(`INSERT INTO ci.projections(scope,generation,source_as_of,digest,payload) VALUES($1,$2,$3,$4,$5)
      ON CONFLICT(scope) DO UPDATE SET generation=EXCLUDED.generation,source_as_of=EXCLUDED.source_as_of,digest=EXCLUDED.digest,payload=EXCLUDED.payload,published_at=now()`,
    [projection.scope, projection.generation, projection.source_as_of, projection.digest, projection.payload])
    return { counts: Object.fromEntries(Object.entries(projection.payload).map(([key, rows]) => [key, rows.length])) }
  })
}
export async function readProjections(client, mode, now) {
  const rows = (await client.query('SELECT scope,generation,source_as_of,payload FROM ci.projections')).rows
  const result = Object.fromEntries(rows.map(r => [r.scope, { ...r.payload, generation:r.generation, source_as_of: iso(r.source_as_of) }]))
  for (const scope of mode === 'latest' ? ['catalog'] : ['catalog', 'consumer']) {
    const time = Date.parse(result[scope]?.source_as_of)
    if (!Number.isFinite(time) || time > now || now - time > 10 * MINUTE) fail(503, 'PROJECTION_STALE')
  }
  return result
}
// Bound the number of ranked payloads held at once. All batches share the
// caller's repeatable-read transaction, maintenance lock and policy epoch.
const E1_BATCH_SIZE = 32
async function publishE1Batch(client, pairs, bundle, catalog, consumer, now, samePass) {
  const version = bundle.model_version, cutoff = iso(now)
  const { rows } = await client.query(`SELECT k.n::int AS n, s.snapshot_id IS NULL AS missing,
      debt.child_due, r.requested_at <= $5 AND NOT coalesce(debt.keep_parent,false) AS parent_due
    FROM unnest($1::text[],$2::text[],$3::text[]) WITH ORDINALITY AS k(user_key,city_code,signature,n)
    LEFT JOIN ci.feed_snapshots s ON (s.user_key,s.city_code,s.model_version,s.signature)
      = (k.user_key,k.city_code,$4,k.signature)
    LEFT JOIN ci.refresh_requests r ON $6::boolean AND (r.user_key,r.city_code)=(k.user_key,k.city_code)
    LEFT JOIN LATERAL (
      SELECT bool_or(i.model_version=$4 AND i.requested_at <= $5) AS child_due,
        bool_or(i.model_version<>$4 OR i.requested_at > $5) AS keep_parent
      FROM ci.e1_refresh_intents i WHERE (i.user_key,i.city_code)=(r.user_key,r.city_code)
    ) debt ON true`, [pairs.map(p=>p.user), pairs.map(p=>p.city), pairs.map(p=>p.signature), version, cutoff, samePass])
  const inserts = [], children = [], parents = []
  const dataAsOf = iso(Math.min(Date.parse(catalog.source_as_of), Date.parse(consumer.source_as_of)))
  for (const row of rows) {
    const pair = pairs[row.n - 1]
    if (row.missing) {
      const payload = { snapshot_id: randomUUID(), model_version: version, generated_at: cutoff,
        data_as_of: dataAsOf, signature: pair.signature, ...e1Snapshot(pair.candidates, pair.profile, bundle, now),
        catalog_generation:catalog.generation, consumer_generation:consumer.generation }
      inserts.push({ user_key:pair.user, city_code:pair.city, payload })
    }
    if (row.child_due) children.push(pair)
    if (row.parent_due) parents.push(pair)
  }
  let generated = 0
  if (inserts.length) {
    const result = await client.query(`INSERT INTO ci.feed_snapshots(snapshot_id,user_key,city_code,model_version,signature,generated_at,data_as_of,payload)
      SELECT (payload->>'snapshot_id')::uuid,user_key,city_code,$2,payload->>'signature',$3,$4,payload
      FROM jsonb_to_recordset($1::jsonb) AS v(user_key text,city_code text,payload jsonb)
      ON CONFLICT(user_key,city_code,model_version,signature) DO NOTHING`, [JSON.stringify(inserts),version,cutoff,dataAsOf])
    generated = result.rowCount
  }
  // Separate statements: parent NOT EXISTS must see the completed child deletes.
  if (children.length) {
    await client.query(`DELETE FROM ci.e1_refresh_intents i USING unnest($1::text[],$2::text[]) AS k(u,c)
      WHERE (i.user_key,i.city_code)=(k.u,k.c) AND i.model_version=$3 AND i.requested_at<=$4`,
    [children.map(p=>p.user),children.map(p=>p.city),version,cutoff])
  }
  if (parents.length) {
    await client.query(`DELETE FROM ci.refresh_requests r USING unnest($1::text[],$2::text[]) AS k(u,c)
      WHERE (r.user_key,r.city_code)=(k.u,k.c) AND r.requested_at<=$3
      AND NOT EXISTS (SELECT 1 FROM ci.e1_refresh_intents i WHERE (i.user_key,i.city_code)=(r.user_key,r.city_code))`,
    [parents.map(p=>p.user),parents.map(p=>p.city),cutoff])
  }
  return generated
}

async function refreshModel(pool, config, now, bundle, v1, retired=false) {
  return transaction(pool, async client => {
    await lock(client, 'refresh-snapshots')
    const policy = await currentPolicy(client)
    if (bundle) {
      requireWorkerPolicy(policy,config.e1)
      await assertNotRevoked(client,bundle.model_version)
    }
    const owed = (await client.query('SELECT * FROM ci.e1_refresh_intents')).rows
    const { catalog, consumer } = await readProjections(client, 'for_you', now)
    const users = new Set(consumer.user_beers.map(r => r.user_key))
    const samePass = Boolean(v1 && v1.epoch===policy.epoch && catalog.generation===v1.catalog && consumer.generation===v1.consumer)
    const pairs = []
    let generated = 0
    for (const user of users) {
      if (bundle && !retired && config.e1.mode === 'serve' && !config.e1.routes(user) && !owed.some(i=>i.user_key===user && i.model_version===bundle.model_version)) continue
      const profile = bundle ? e1Profile(consumer, user, bundle) : features(consumer, user)
      if (profile.count < config.requiredTapCount) continue
      for (const city of catalog.cities) {
        if (bundle && (retired || (policy.mode==='serve' && !policyTargets(policy,user))) && !owed.some(i=>i.user_key===user && i.city_code===city.city_code && i.model_version===bundle.model_version)) continue
        const candidates = catalog.active_cycles.filter(c => c.city_code === city.city_code)
        const signature = bundle ? e1Signature(candidates, profile, bundle, now) : rankingSignature(candidates, profile, now, config)
        if (bundle) {
          pairs.push({user,city:city.city_code,signature,candidates,profile})
          if (pairs.length === E1_BATCH_SIZE) {
            generated += await publishE1Batch(client,pairs,bundle,catalog,consumer,now,samePass)
            pairs.length = 0
          }
          continue
        }
        const snapshot = { snapshot_id: randomUUID(), model_version: config.modelVersion, generated_at: iso(now),
          data_as_of: iso(Math.min(Date.parse(catalog.source_as_of), Date.parse(consumer.source_as_of))), signature,
          items:rankFeed(candidates, profile, now, config) }
        const result = await client.query(`INSERT INTO ci.feed_snapshots(snapshot_id,user_key,city_code,model_version,signature,generated_at,data_as_of,payload)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(user_key,city_code,model_version,signature) DO NOTHING`,
        [snapshot.snapshot_id, user, city.city_code, snapshot.model_version, signature, snapshot.generated_at, snapshot.data_as_of, snapshot])
        generated += result.rowCount
        const args=[user,city.city_code,iso(now)]
        if (policyTargets(policy,user)) {
          // Also upgrade pre-migration V1-only hints, under the elected policy (never local flags).
          await client.query(`INSERT INTO ci.e1_refresh_intents(user_key,city_code,requested_at,epoch,model_version)
            SELECT user_key,city_code,requested_at,$4::bigint,$5 FROM ci.refresh_requests
            WHERE user_key=$1 AND city_code=$2 AND requested_at<=$3 ON CONFLICT DO NOTHING`,[...args,policy.epoch,policy.model_version])
        }
        await client.query(`DELETE FROM ci.refresh_requests r WHERE user_key=$1 AND city_code=$2 AND requested_at<=$3
          AND NOT EXISTS (SELECT 1 FROM ci.e1_refresh_intents i WHERE (i.user_key,i.city_code)=(r.user_key,r.city_code))`,args)
      }
    }
    if (pairs.length) generated += await publishE1Batch(client,pairs,bundle,catalog,consumer,now,samePass)
    if (bundle && !retired && samePass)
      await client.query("UPDATE ci.e1_policy SET worker_epoch=epoch,worker_fingerprint=fingerprint,worker_until=clock_timestamp()+interval '10 minutes' WHERE singleton")
    return { generated, epoch:policy.epoch, catalog:catalog.generation, consumer:consumer.generation }
  }, 'REPEATABLE READ')
}

export async function refreshV1Snapshots(pool, config, now) {
  return refreshModel(pool, config, now, null, null)
}

export async function refreshE1Snapshots(pool, config, now, v1) {
  const policy = config.e1
  if (!policy || policy.mode === 'off') throw Error('E1 refresh disabled')
  const bundle=policy.bundle()
  const result=await refreshModel(pool,config,now,bundle,v1)
  const pending=await transaction(pool,c=>c.query('SELECT DISTINCT model_version FROM ci.e1_refresh_intents'))
  for (const {model_version} of pending.rows) {
    if (model_version!==bundle.model_version) await refreshModel(pool,config,now,policy.bundle(model_version),v1,true)
  }
  return result
}

export async function refreshSnapshots(pool, config, now = Date.now()) {
  await observeWorker(pool,config.e1)
  const v1 = await refreshV1Snapshots(pool, config, now)
  if (!config.e1 || config.e1.mode === 'off') return { generated:v1.generated }
  // Start a fresh maintenance-locked transaction. An E1 failure cannot roll back V1.
  const e1 = await refreshE1Snapshots(pool, config, now, v1)
  return { generated:v1.generated, e1_generated:e1.generated }
}
