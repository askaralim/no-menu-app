import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { migrate } from '../src/migrate.js'
import { transaction } from '../src/db.js'
import { prepareExport, publishProjection, refreshSnapshots } from '../src/projections.js'
import { userKey } from '../src/supabase.js'
import { getFeed } from '../src/feed.js'
import { ingestBatch } from '../src/collector.js'
import { acceptIdentity } from '../src/identity.js'
import { createServer } from '../src/server.js'
import { valid } from '../src/schema.js'
import { config, sourceData, event, batch } from './data.js'
import { DAY } from '../src/model.js'
import { readFile } from 'node:fs/promises'
import { ServiceError } from '../src/errors.js'
import { runWorker } from '../src/worker.js'
import { inspectOperations, runOpsCheck } from '../src/ops-check.js'
import { refreshAssistedVisits } from '../src/assisted-visits.js'

// Refuse every remote endpoint and the existing Supabase development port.
// A new database per run avoids erasing another run's data or touching business
// databases. Retained databases are intentionally not automatically dropped.
const connection = process.env.CI_TEST_DATABASE_URL
if (!connection) throw new Error('Set CI_TEST_DATABASE_URL to the isolated local test PostgreSQL')
const parsed = new URL(connection)
if (parsed.hostname !== '127.0.0.1' || !['55432', '55433'].includes(parsed.port) || parsed.pathname !== '/nomenu_ci_test') throw new Error('Integration tests require the dedicated local test database')

test('real PostgreSQL backend contract integration', async t => {
  const admin = new pg.Pool({ connectionString: connection, max: 2 })
  const database = 'nomenu_ci_test_' + randomUUID().replaceAll('-', '')
  await admin.query(`CREATE DATABASE "${database}"`)
  await admin.end()
  parsed.pathname = '/' + database
  const pool = new pg.Pool({ connectionString: parsed.toString(), max: 8, statement_timeout: 10000 })
  t.after(() => pool.end())
  await migrate(pool); await migrate(pool)
  const now = Date.now() - 10000, data = sourceData(now), user = userKey(data.user, config.userKeySecret)
  const publish = async (raw, scope, at = now) => publishProjection(pool, prepareExport(raw, scope, config, at))
  await publish(data.catalog, 'catalog'); await publish(data.consumer, 'consumer')
  await t.test('operational inspection is read-only and reports stale modes without leaking payloads', async () => {
    const report = await inspectOperations(pool, now)
    assert.equal(report.status, 'ok'); assert.equal(report.for_you_available, true)
    assert.equal(report.retention.cleanup_enabled, false)
    assert.ok(!JSON.stringify(report).includes(user))
    const logs = []
    assert.equal(await runOpsCheck(pool, value => logs.push(value), now + 600001), 1)
    assert.equal(logs[0].latest_available, false)
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM ci.projections')).rows[0].n, 2)
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM ci.events')).rows[0].n, 0)
  })
  const query = (mode = 'latest', extra = {}) => ({ city_code: 'qingdao', mode, surface: 'feed_page', feed_instance_id: randomUUID(), limit: 20, ...extra })
  const envelope = response => ({ api_version: '1', requestId: randomUUID(), server_time: new Date(now).toISOString(), ...response })

  await t.test('cold start and building are distinct; worker publishes, API only reads', async () => {
    const cold = await getFeed(pool, config, query('for_you'), {}, 'unknown-user', now)
    assert.equal(cold.personalization.status, 'cold_start')
    const building = await getFeed(pool, config, query('for_you'), {}, user, now)
    assert.equal(building.snapshot.state, 'building')
    assert.equal(building.empty_reason, 'refresh_pending')
    assert.ok((await refreshSnapshots(pool, config, now)).generated > 0)
    assert.equal((await refreshSnapshots(pool, config, now)).generated, 0)
    const stored = (await pool.query('SELECT snapshot_id,payload FROM ci.feed_snapshots WHERE user_key=$1 ORDER BY generated_at DESC LIMIT 1', [user])).rows[0]
    for (const item of stored.payload.items) {
      delete item.tenant_name_en
      delete item.beer_name_en
      delete item.brewery_en
      delete item.style_en
    }
    await pool.query('UPDATE ci.feed_snapshots SET payload=$2 WHERE snapshot_id=$1', [stored.snapshot_id, stored.payload])
    const ready = await getFeed(pool, config, query('for_you'), {}, user, now)
    assert.equal(ready.snapshot.state, 'fresh'); assert.equal(ready.items.length, 20)
    assert.equal(ready.items[0].tenant_name_en, 'Test Bar')
    assert.match(ready.items[0].beer_name_en, /^Beer /)
    assert.equal(ready.items[0].brewery_en, 'Test brewery')
    assert.equal(ready.items[0].style_en, 'IPA')
    assert.ok(valid('feed/response.schema.json', envelope(ready)))
    const retryBuilding = await getFeed(pool, config, { ...query('for_you'), feed_instance_id: building.feed_instance_id }, {}, user, now)
    assert.equal(retryBuilding.snapshot.state, 'building')
  })
  await t.test('concurrent instance retries bind one immutable owner and delivered prefix', async () => {
    const q = query('for_you', { limit: 2, surface: 'home' })
    const results = await Promise.all(Array.from({ length: 5 }, () => getFeed(pool, config, q, {}, user, now)))
    assert.ok(results.every(r => r.items.length === 2 && r.snapshot.snapshot_id === results[0].snapshot.snapshot_id))
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM ci.feed_instances WHERE instance_id=$1', [q.feed_instance_id])).rows[0].n, 1)
    await assert.rejects(getFeed(pool, config, { ...q, limit: 20 }, {}, user, now), e => e.code === 'INSTANCE_CONTEXT_CONFLICT')
    await assert.rejects(getFeed(pool, config, q, {}, 'another-user', now), e => e.code === 'INSTANCE_CONTEXT_CONFLICT')
  })
  await t.test('Latest cursor fixed manifest, expiry, historical home city and anonymous ownership', async () => {
    const installation = randomUUID(), session = randomUUID(), q = query('latest', { limit: 2 })
    const headers = { 'X-Installation-ID': installation, 'X-Analytics-Session-ID': session }
    const first = await getFeed(pool, config, q, headers, user, now)
    assert.equal(first.summary.total_items, 25)
    assert.ok(valid('feed/response.schema.json', envelope(first)))
    const second = await getFeed(pool, config, { ...q, cursor: first.page.next_cursor }, headers, user, now)
    assert.equal(second.summary, null); assert.notEqual(second.items[0].item_id, first.items[0].item_id)
    const changed = structuredClone(data.consumer)
    changed.consumer_profiles[0].home_city_code = 'beijing'; changed.source_as_of = new Date(now + 1).toISOString()
    await publish(changed, 'consumer', now + 1)
    const saved = (await pool.query('SELECT payload FROM ci.feed_instances WHERE instance_id=$1', [q.feed_instance_id])).rows[0].payload
    assert.equal(saved.home_city_code_at_creation, 'shanghai'); assert.equal(saved.away_city_at_creation, true)
    const anonQuery = query(), anon = await getFeed(pool, config, anonQuery, headers, null, now + 1)
    await assert.rejects(getFeed(pool, config, anonQuery, headers, user, now + 1), e => e.code === 'INSTANCE_CONTEXT_CONFLICT')
    const rawAnon = (await pool.query('SELECT payload FROM ci.feed_instances WHERE instance_id=$1', [anon.feed_instance_id])).rows[0].payload
    assert.equal(rawAnon.home_city_code_at_creation, null)
    const impression = { event_id: randomUUID(), event_name: 'feed_item_impression', schema_version: 1,
      occurred_at: new Date(now + 1000).toISOString(), session_id: session, session_started_at: new Date(now - 10000).toISOString(),
      feed: { feed_instance_id: first.feed_instance_id, item_id: first.items[0].item_id, display_position: 1 }, properties: { visible_duration_ms: 800, visibility_threshold: 0.5 } }
    const accepted = await ingestBatch(pool, batch(installation, [impression]), now + 3 * DAY)
    assert.deepEqual(accepted.accepted, [impression.event_id])
    const enrichment = (await pool.query('SELECT enrichment FROM ci.events WHERE event_id=$1', [impression.event_id])).rows[0].enrichment
    assert.equal(enrichment.home_city_code_at_creation, 'shanghai')
    assert.equal(enrichment.away_city_at_creation, true)
    assert.deepEqual(enrichment.client, batch(installation, []).client)
    const semanticRetry = { ...impression, event_id: randomUUID() }
    assert.deepEqual((await ingestBatch(pool, batch(installation, [semanticRetry]), now + 3 * DAY)).duplicates, [semanticRetry.event_id])
    assert.equal((await ingestBatch(pool, batch(randomUUID(), [{ ...impression, event_id: randomUUID() }]), now + 3 * DAY)).rejected[0].code, 'INSTANCE_ANALYTICS_CONTEXT_MISMATCH')
  })
  await t.test('concurrent event delivery deduplicates, partial rejection does not lose good events', async () => {
    const installation = randomUUID(), session = randomUUID(), good = event(now, session)
    const input = batch(installation, [good, { ...event(now, session), schema_version: 99 }])
    const results = await Promise.all(Array.from({ length: 6 }, () => ingestBatch(pool, input, now)))
    assert.equal(results.reduce((n, r) => n + r.accepted.length, 0), 1)
    assert.equal(results.reduce((n, r) => n + r.duplicates.length, 0), 5)
    assert.ok(results.every(r => r.rejected[0].code === 'UNKNOWN_EVENT_VERSION'))
    assert.equal((await ingestBatch(pool, batch(installation, [{ ...good, source: 'changed' }]), now)).rejected[0].code, 'EVENT_ID_CONFLICT')
  })
  await t.test('real rollback and uncertain COMMIT return no success; retry gets durable duplicate', async () => {
    const installation = randomUUID(), good = event(now, randomUUID()), input = batch(installation, [good])
    const faultyPool = after => ({ async connect() {
      const client = await pool.connect()
      return { release: error => client.release(error), async query(sql, args) {
        if (sql === 'COMMIT') { if (after) await client.query(sql, args); throw new Error('Injected lost commit acknowledgement') }
        return client.query(sql, args)
      } }
    } })
    await assert.rejects(ingestBatch(faultyPool(false), input, now))
    assert.equal((await pool.query('SELECT 1 FROM ci.event_receipts WHERE event_id=$1', [good.event_id])).rowCount, 0)
    await assert.rejects(ingestBatch(faultyPool(true), input, now))
    assert.deepEqual((await ingestBatch(pool, input, now)).duplicates, [good.event_id])
    assert.deepEqual((await pool.query('SELECT enrichment FROM ci.events WHERE event_id=$1', [good.event_id])).rows[0].enrichment.client, input.client)
  })
  await t.test('client context persists across channels; retries and legacy duplicates never rewrite it', async () => {
    for (const application of ['ios', 'miniprogram', 'taplist']) {
      const installation = randomUUID(), good = event(now, randomUUID())
      const input = { ...batch(installation, [good]), client: { application, platform: 'test-platform', app_version: 'first-upload' } }
      assert.deepEqual((await ingestBatch(pool, input, now)).accepted, [good.event_id])
      const read = async () => (await pool.query('SELECT raw,enrichment FROM ci.events WHERE event_id=$1', [good.event_id])).rows[0]
      const saved = await read()
      assert.deepEqual(saved.raw, good)
      assert.deepEqual(saved.enrichment, { away_city: null, client: input.client })
      const retry = { ...input, batch_id: randomUUID(), client: { application: 'ios', platform: 'changed', app_version: 'new-upload-version' } }
      assert.deepEqual((await ingestBatch(pool, retry, now + 1000)).duplicates, [good.event_id])
      assert.deepEqual(await read(), saved)
      // Rows accepted by the old collector have no trustworthy client context.
      await pool.query("UPDATE ci.events SET enrichment=enrichment-'client' WHERE event_id=$1", [good.event_id])
      assert.deepEqual((await ingestBatch(pool, retry, now + 2000)).duplicates, [good.event_id])
      assert.deepEqual((await read()).enrichment, { away_city: null })
    }
  })
  await t.test('identity never uses uploader or backfills past home city; account conflict quarantines', async () => {
    const installation = randomUUID(), session = randomUUID(), start = new Date(now - 10000).toISOString()
    const before = event(now - 1000, session, 'bar_opened', { session_started_at: start })
    await ingestBatch(pool, batch(installation, [before]), now)
    const operation = { operation_id: randomUUID(), action: 'link', installation_id: installation, session_id: session, session_started_at: start, occurred_at: new Date(now - 5000).toISOString() }
    await acceptIdentity(pool, operation, user, now)
    const after = event(now + 1000, session, 'bar_opened', { session_started_at: start })
    await ingestBatch(pool, batch(installation, [after]), now + 1000)
    assert.equal((await pool.query('SELECT resolved_user_key FROM ci.events WHERE event_id=$1', [before.event_id])).rows[0].resolved_user_key, null)
    assert.equal((await pool.query('SELECT resolved_user_key FROM ci.events WHERE event_id=$1', [after.event_id])).rows[0].resolved_user_key, user)
    assert.deepEqual((await pool.query('SELECT enrichment FROM ci.events WHERE event_id=$1', [before.event_id])).rows[0].enrichment, { away_city: null, client: batch(installation, []).client })
    await acceptIdentity(pool, { ...operation, operation_id: randomUUID() }, 'other-account', now + 2000)
    const quarantined = (await pool.query('SELECT identity_state,resolved_user_key FROM ci.events WHERE event_id=$1', [after.event_id])).rows[0]
    assert.equal(quarantined.identity_state, 'integrity_error'); assert.equal(quarantined.resolved_user_key, null)
  })
  await t.test('projection staleness is mode-specific; stale snapshot filters removed candidates', async () => {
    const at = now + 2000
    const changed = structuredClone(data.catalog)
    changed.active_cycles = changed.active_cycles.slice(1); changed.counts.active_cycles--
    changed.source_as_of = new Date(at).toISOString()
    await publish(changed, 'catalog', at)
    const result = await getFeed(pool, config, query('for_you'), {}, user, at)
    assert.equal(result.snapshot.state, 'stale')
    assert.ok(!result.items.some(i => i.source_drink_id === data.catalog.active_cycles[0].source_drink_id))
    assert.equal(result.data_as_of, data.catalog.source_as_of)
    await pool.query("UPDATE ci.projections SET source_as_of=$1 WHERE scope='consumer'", [new Date(now - 700000)])
    assert.ok((await getFeed(pool, config, query(), {}, null, at)).items.length)
    await assert.rejects(getFeed(pool, config, query('for_you'), {}, user, at), e => e.code === 'PROJECTION_STALE')
    await assert.rejects(publish(data.catalog, 'catalog', at), e => e.code === 'SOURCE_EXPORT_REGRESSION')
  })
  await t.test('HTTP validates actual requests/responses, errors, auth, and size limits', async () => {
    const logs = []
    const server = createServer({ pool, config, clock: () => now + 2000, log: entry => logs.push(entry), supabase: {
      authorize: async token => { if (token !== 'valid-token') throw new ServiceError(401, 'UNAUTHORIZED'); return { user_key: user, token } },
      rpc: async () => ({ consumer_username: 'Askar', is_default: false, home_city_code: null }),
    } })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) }))
    const url = `http://127.0.0.1:${server.address().port}`
    assert.equal((await fetch(url + '/healthz')).status, 200)
    assert.equal((await fetch(url + '/readyz')).status, 200)
    const feed = await fetch(url + '/api/feed/v1/new-beers?' + new URLSearchParams(query()))
    assert.equal(feed.status, 200); assert.ok(valid('feed/response.schema.json', await feed.json()))
    const incomplete = await fetch(url + '/api/feed/v1/new-beers?' + new URLSearchParams(query()), { headers: { 'X-Installation-ID': randomUUID() } })
    assert.equal(incomplete.status, 400)
    const unauthorized = await fetch(url + '/api/consumer/v1/profile')
    assert.equal(unauthorized.status, 401)
    assert.equal((await fetch(url + '/api/feed/v1/new-beers?' + new URLSearchParams(query()), { headers: { Authorization: 'Bearer invalid-token' } })).status, 401)
    const patch = await fetch(url + '/api/consumer/v1/profile', { method: 'PATCH', headers: { Authorization: 'Bearer valid-token', 'Content-Type': 'application/merge-patch+json' }, body: '{"home_city_code":null}' })
    assert.equal(patch.status, 200); assert.ok(valid('consumer/profile.schema.json', await patch.json()))
    const oversized = await fetch(url + '/api/analytics/v1/events/batch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'x'.repeat(65537) })
    assert.equal(oversized.status, 413)
    assert.ok(!JSON.stringify(logs).includes('valid-token'))
  })
  await t.test('database transaction rolls back all writes on ordinary SQL failure', async () => {
    const id = randomUUID()
    await assert.rejects(transaction(pool, async client => {
      await client.query('INSERT INTO ci.refresh_requests(user_key,city_code) VALUES($1,$2)', [id, 'qingdao'])
      await client.query('SELECT * FROM ci.deliberately_missing_table')
    }))
    assert.equal((await pool.query('SELECT 1 FROM ci.refresh_requests WHERE user_key=$1', [id])).rowCount, 0)
  })
  await t.test('overlapping cron workers skip; independent source failure does not stop catalog sync', async () => {
    const lease = await pool.connect()
    await lease.query("SELECT pg_advisory_lock(hashtextextended('ci:worker',0))")
    try {
      const skipped = await runWorker(pool, config, { export: () => { throw new Error('Must not call') } }, () => {})
      assert.equal(skipped.skipped, true)
    } finally { await lease.query("SELECT pg_advisory_unlock(hashtextextended('ci:worker',0))"); lease.release() }
    const next = structuredClone(data.catalog); next.source_as_of = new Date(Date.now()).toISOString()
    const result = await runWorker(pool, config, { export: async scope => {
      if (scope === 'consumer') throw new Error('Source unavailable')
      return next
    } }, () => {})
    assert.ok(result.failures.includes('consumer'))
    assert.equal(new Date((await pool.query("SELECT source_as_of FROM ci.projections WHERE scope='catalog'")).rows[0].source_as_of).toISOString(), next.source_as_of)
  })
  await t.test('runtime database roles cannot mutate source projections or immutable instance history', async () => {
    await pool.query(`DO $$ BEGIN
      IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='ci_api') THEN CREATE ROLE ci_api; END IF;
      IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='ci_worker') THEN CREATE ROLE ci_worker; END IF;
    END $$`)
    await pool.query('GRANT ci_api,ci_worker TO CURRENT_USER')
    await pool.query(await readFile(new URL('../db/runtime-grants.sql', import.meta.url), 'utf8'))
    await transaction(pool, async client => {
      await client.query('SET LOCAL ROLE ci_api')
      assert.ok((await client.query('SELECT 1 FROM ci.projections')).rowCount)
    })
    await assert.rejects(transaction(pool, async client => {
      await client.query('SET LOCAL ROLE ci_api')
      await client.query("UPDATE ci.projections SET digest='forged'")
    }), e => e.code === '42501')
    await assert.rejects(transaction(pool, async client => {
      await client.query('SET LOCAL ROLE ci_api')
      await client.query("UPDATE ci.feed_instances SET payload='{}'::jsonb")
    }), e => e.code === '42501')
    await assert.rejects(transaction(pool, async client => {
      await client.query('SET LOCAL ROLE ci_api')
      await client.query("UPDATE ci.events SET enrichment='{}'::jsonb")
    }), e => e.code === '42501')
    await assert.rejects(transaction(pool, async client => {
      await client.query('SET LOCAL ROLE ci_api')
      await client.query('SELECT * FROM ci.assisted_visit_projection')
    }), e => e.code === '42501')
    await assert.rejects(transaction(pool, async client => {
      await client.query('SET LOCAL ROLE ci_worker')
      await client.query("UPDATE ci.events SET resolved_user_key='forged'")
    }), e => e.code === '42501')
  })
  await t.test('Assisted Visit publishes atomically, includes late events, retracts conflicts and removed TAPs under worker grants', async () => {
    const at = Date.now(), input = sourceData(at), subject = userKey(input.user, config.userKeySecret)
    const installation = randomUUID(), session = randomUUID(), started = new Date(at - 120000).toISOString()
    const taps = Array.from({ length: 3 }, (_, i) => ({ id: randomUUID(), user_id: input.user,
      tenant_id: input.tenant, product_id: input.catalog.active_cycles[i].product_id, provisional_drink_id: null,
      source_drink_id: input.catalog.active_cycles[i].source_drink_id, style: null,
      created_at: new Date(at - 30000 + i * 1000).toISOString(), first_drank_at: new Date(at - DAY).toISOString() }))
    input.consumer.venue_experiences = taps; input.consumer.counts.venue_experiences = taps.length
    await publish(input.consumer, 'consumer', at)
    const workerPool = { async connect() {
      const client = await pool.connect()
      return { release: error => client.release(error), async query(sql, args) {
        const result = await client.query(sql, args)
        if (sql.startsWith('BEGIN ')) await client.query('SET LOCAL ROLE ci_worker')
        return result
      } }
    } }
    const saved = async () => (await pool.query('SELECT * FROM ci.assisted_visit_projection')).rows[0]
    await refreshAssistedVisits(workerPool, at)
    assert.equal((await saved()).payload.visits.length, 0)
    const link = { operation_id: randomUUID(), action: 'link', installation_id: installation, session_id: session,
      session_started_at: started, occurred_at: new Date(at - 90000).toISOString() }
    await acceptIdentity(pool, link, subject, at - 90000)
    // Occurred before TAP, but uploaded after the initial aggregation.
    const click = event(at - 60000, session, 'beer_opened', { session_started_at: started,
      tenant_id: input.tenant, product_id: taps[0].product_id, source_drink_id: taps[0].source_drink_id })
    await ingestBatch(pool, batch(installation, [click]), at)
    const counts = await refreshAssistedVisits(workerPool, at)
    assert.deepEqual(counts.observed_assisted_visits, { '24h': 1, '48h': 1, '72h': 1 })
    const published = await saved()
    assert.equal(published.payload.visits[0].tap_count, 3)
    assert.equal(published.consumer_generation, input.consumer.export_id)
    await refreshAssistedVisits(workerPool, at)
    assert.deepEqual((await saved()).payload, published.payload)
    await assert.rejects(refreshAssistedVisits(workerPool, at + 600001), e => e.code === 'PROJECTION_STALE')
    assert.deepEqual((await saved()).payload, published.payload)
    const brokenPool = { async connect() {
      const client = await pool.connect()
      return { release: error => client.release(error), async query(sql, args) {
        if (sql.startsWith('INSERT INTO ci.assisted_visit_projection')) throw new Error('Injected projection publication failure')
        return client.query(sql, args)
      } }
    } }
    await assert.rejects(refreshAssistedVisits(brokenPool, at))
    assert.deepEqual((await saved()).payload, published.payload)
    await acceptIdentity(pool, { ...link, operation_id: randomUUID() }, 'conflicting-account', at)
    await refreshAssistedVisits(workerPool, at)
    assert.equal((await saved()).payload.visits.length, 0)
    assert.equal((await saved()).payload.candidates.length, 3)
    assert.equal((await pool.query('SELECT 1 FROM ci.events WHERE event_id=$1', [click.event_id])).rowCount, 1)
    input.consumer.venue_experiences = []; input.consumer.counts.venue_experiences = 0
    input.consumer.source_as_of = new Date(at + 1).toISOString()
    await publish(input.consumer, 'consumer', at + 1)
    await refreshAssistedVisits(workerPool, at + 1)
    assert.equal((await saved()).payload.candidates.length, 0)
  })
  await t.test('Assisted Visit failure does not roll back successful projection sync or Feed refresh', async () => {
    const at = Date.now(), input = sourceData(at), logs = []
    const failedVisitPool = { async connect() {
      const client = await pool.connect()
      return { release: error => client.release(error), async query(sql, args) {
        if (sql.startsWith('INSERT INTO ci.assisted_visit_projection')) throw new Error('Injected analytical failure')
        return client.query(sql, args)
      } }
    } }
    const result = await runWorker(failedVisitPool, config, { export: async scope => input[scope] }, entry => logs.push(entry))
    assert.deepEqual(result.failures, ['assisted_visits'])
    assert.ok(logs.some(l => l.event === 'snapshots_refreshed' && l.generated > 0))
    assert.equal((await pool.query("SELECT generation FROM ci.projections WHERE scope='consumer'")).rows[0].generation, input.consumer.export_id)
  })
  await t.test('prepared Supabase migration executes against an isolated schema fixture; profile patches and export grants', async () => {
    await pool.query(await readFile(new URL('./source-schema.sql', import.meta.url), 'utf8'))
    // Execute the repository's real username RPC definitions, not a JS mock.
    await pool.query(await readFile(new URL('../../../supabase/migrations/20260811120000_consumer_usernames.sql', import.meta.url), 'utf8'))
    const original = (await pool.query("SELECT pg_get_functiondef('public.get_my_consumer_profile()'::regprocedure) AS body")).rows[0].body
    // Reproduce Supabase's direct role defaults, not only PostgreSQL PUBLIC grants.
    await pool.query('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon,authenticated,service_role')
    await pool.query(await readFile(new URL('../../../supabase/migrations/20261103175104_consumer_intelligence_backend_v1.sql', import.meta.url), 'utf8'))
    await pool.query(await readFile(new URL('../../../supabase/migrations/20261103175309_consumer_intelligence_profile_grants.sql', import.meta.url), 'utf8'))
    await pool.query(await readFile(new URL('../../../supabase/migrations/20261109110251_add_consumer_intelligence_feed_i18n_fields.sql', import.meta.url), 'utf8'))
    for (const signature of ['public.ci_get_profile_v1()', 'public.ci_patch_profile_v1(jsonb)']) {
      const privileges = (await pool.query(`SELECT
        has_function_privilege('anon',$1,'EXECUTE') AS anon,
        has_function_privilege('authenticated',$1,'EXECUTE') AS authenticated,
        has_function_privilege('service_role',$1,'EXECUTE') AS service`, [signature])).rows[0]
      assert.deepEqual(privileges, { anon: false, authenticated: true, service: false })
    }
    assert.equal((await pool.query("SELECT pg_get_functiondef('public.get_my_consumer_profile()'::regprocedure) AS body")).rows[0].body, original)
    const caller = randomUUID()
    const patch = value => transaction(pool, async client => {
      await client.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [caller])
      return (await client.query('SELECT public.ci_patch_profile_v1($1) AS profile', [value])).rows[0].profile
    })
    let result = await patch({ consumer_username: 'BackendTest', home_city_code: 'shanghai' })
    assert.equal(result.home_city_code, 'shanghai')
    result = await patch({ consumer_username: 'BackendTest2' })
    assert.equal(result.home_city_code, 'shanghai')
    const oldTime = (await pool.query('SELECT updated_at FROM public.user_profiles WHERE user_id=$1', [caller])).rows[0].updated_at
    await patch({})
    assert.deepEqual((await pool.query('SELECT updated_at FROM public.user_profiles WHERE user_id=$1', [caller])).rows[0].updated_at, oldTime)
    await assert.rejects(patch({ consumer_username: 'BackendTest3', home_city_code: 'unknown_city' }))
    assert.equal((await patch({})).consumer_username, 'BackendTest2')
    assert.equal((await patch({ home_city_code: null })).home_city_code, null)
    await assert.rejects(patch({ consumer_username: null }))
    await assert.rejects(pool.query('SELECT public.ci_get_profile_v1()'))
    const venue = randomUUID(), category = randomUUID(), drink = randomUUID(), product = randomUUID(), company = randomUUID(), light = randomUUID()
    await pool.query("INSERT INTO public.tenants(id,name,display_name,slug,city,status,is_public_visible,display_name_en) VALUES($1,'酒吧','测试酒吧','bar','Qingdao','active',true,'Test Bar')", [venue])
    await pool.query('INSERT INTO public.categories VALUES($1,$2,true,true)', [category, venue])
    await pool.query("INSERT INTO public.drink_companies VALUES($1,'Test Brewery','active')", [company])
    await pool.query("INSERT INTO public.drink_products(id,name,brewery,brand_name,beer_style,image_url,status,name_en,company_id) VALUES($1,'测试酒款','测试酒厂',null,'IPA',null,'active','Test Beer',$2)", [product, company])
    await pool.query("INSERT INTO public.drinks VALUES($1,$2,$3,$4,'测试酒款',null,null,null,true,true,1,'available')", [drink, venue, category, product])
    await pool.query("INSERT INTO public.test_cycles VALUES($1,$2,$3,now()-interval '1 day',null,'exact',false)", [venue, randomUUID(), drink])
    await pool.query('INSERT INTO public.user_drink_lights VALUES($1,$2,$3,null)', [light, caller, product])
    await pool.query('INSERT INTO public.user_drink_venues VALUES($1,$2,$3,$4,$5,now(),now())', [randomUUID(), light, caller, venue, drink])
    const exported = (await pool.query("SELECT public.intelligence_export_snapshot_v1('catalog') AS value")).rows[0].value
    assert.equal(exported.complete, true); assert.equal(exported.counts.cities, 15)
    assert.deepEqual(exported.cities.find(city => city.source_city === 'Linxi'), { city_code: 'linxi', source_city: 'Linxi', display_name: '临沂', timezone: 'Asia/Shanghai' })
    assert.equal(exported.counts.active_cycles, 1)
    assert.equal(exported.active_cycles[0].public_status, 'available')
    assert.equal(exported.active_cycles[0].tenant_name_en, 'Test Bar')
    assert.equal(exported.active_cycles[0].beer_name_en, 'Test Beer')
    assert.equal(exported.active_cycles[0].brewery_en, 'Test Brewery')
    assert.ok(prepareExport(exported, 'catalog', config, Date.now()))
    const people = (await pool.query("SELECT public.intelligence_export_snapshot_v1('consumer') AS value")).rows[0].value
    assert.equal(people.counts.consumer_profiles, 1)
    assert.equal(people.counts.venue_experiences, 1)
    assert.ok(prepareExport(people, 'consumer', config, Date.now()))
    await assert.rejects(transaction(pool, async client => {
      await client.query('SET LOCAL ROLE anon')
      await client.query("SELECT public.intelligence_export_snapshot_v1('consumer')")
    }), e => e.code === '42501')
    await transaction(pool, async client => {
      await client.query('SET LOCAL ROLE service_role')
      assert.ok((await client.query("SELECT public.intelligence_export_snapshot_v1('catalog') AS value")).rows[0].value.complete)
    })
    await pool.query("INSERT INTO public.taplist_public_cities(city,label) VALUES('UnmappedTestCity','Test')")
    await assert.rejects(pool.query("SELECT public.intelligence_export_snapshot_v1('catalog')"), e => e.message.includes('CITY_MAPPING_INCOMPLETE'))
  })
})
