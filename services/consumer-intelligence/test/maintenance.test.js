import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import pg from 'pg'
import { migrate } from '../src/migrate.js'
import { transaction } from '../src/db.js'
import { pruneData, eraseUser, parseMaintenanceArgs } from '../src/maintenance.js'
import { prepareExport, publishProjection, refreshSnapshots } from '../src/projections.js'
import { getFeed } from '../src/feed.js'
import { ingestBatch } from '../src/collector.js'
import { acceptIdentity } from '../src/identity.js'
import { refreshAssistedVisits } from '../src/assisted-visits.js'
import { userKey } from '../src/supabase.js'
import { DAY, iso } from '../src/model.js'
import { config, sourceData, event, batch } from './data.js'
import { createServer } from '../src/server.js'

const connection = process.env.CI_TEST_DATABASE_URL
if (!connection) throw new Error('Set CI_TEST_DATABASE_URL to isolated local PostgreSQL')
const parsed = new URL(connection)
if (parsed.hostname !== '127.0.0.1' || !['55432', '55433'].includes(parsed.port) || parsed.pathname !== '/nomenu_ci_test') throw new Error('Dedicated local test database required')

const query = () => ({ city_code: 'qingdao', mode: 'for_you', surface: 'home', feed_instance_id: randomUUID(), limit: 2 })
const link = (installation, session, at) => ({ operation_id: randomUUID(), action: 'link', installation_id: installation,
  session_id: session, occurred_at: iso(at), session_started_at: iso(at - 10000) })
const scopedPool = (pool, intercept) => ({ async connect() {
  const client = await pool.connect()
  return { release: failed => client.release(failed), query: (sql, args) => intercept(client, sql, args) }
} })

test('operator maintenance against isolated PostgreSQL', async t => {
  const admin = new pg.Pool({ connectionString: connection, max: 2 })
  const database = 'nomenu_ci_test_' + randomUUID().replaceAll('-', '')
  await admin.query(`CREATE DATABASE "${database}"`); await admin.end()
  parsed.pathname = '/' + database
  const pool = new pg.Pool({ connectionString: parsed.toString(), max: 8, statement_timeout: 10000 })
  t.after(() => pool.end())
  await t.test('upgrade preserves legacy receipts and backfills only proven session associations', async () => {
    for (const version of ['001_initial', '002_assisted_visits']) {
      await pool.query(await readFile(new URL(`../db/${version}.sql`, import.meta.url), 'utf8'))
      await pool.query('INSERT INTO ci.schema_migrations(version) VALUES($1)', [version])
    }
    const id = randomUUID(), orphan = randomUUID(), installation = randomUUID(), session = randomUUID(), at = iso(Date.now())
    await pool.query(`INSERT INTO ci.events(event_id,installation_id,session_id,occurred_at,received_at,raw,enrichment)
      VALUES($1,$2,$3,$4,$4,'{}','{}')`, [id, installation, session, at])
    await pool.query('INSERT INTO ci.event_receipts(event_id,fingerprint,received_at) VALUES($1,$2,$3),($4,$2,$3)', [id, 'legacy', at, orphan])
    const server = createServer({ pool, config, supabase: {}, log: () => {} })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    try {
      const url = `http://127.0.0.1:${server.address().port}/readyz`
      assert.equal((await fetch(url)).status, 503)
      await migrate(pool); await migrate(pool)
      assert.equal((await fetch(url)).status, 200)
    } finally { await new Promise(resolve => server.close(resolve)) }
    const receipts = (await pool.query('SELECT * FROM ci.event_receipts')).rows
    assert.equal(receipts.find(r => r.event_id === id).session_id, session)
    assert.equal(receipts.find(r => r.event_id === orphan).session_id, null)
    assert.equal((await pool.query('SELECT version FROM ci.schema_migrations')).rowCount, 5)
  })
  const n = async (table, where = 'true', args = []) => Number((await pool.query(`SELECT count(*) AS n FROM ci.${table} WHERE ${where}`, args)).rows[0].n)
  const publish = (raw, scope, at) => publishProjection(pool, prepareExport(raw, scope, config, at))

  await t.test('CLI defaults to preview and rejects ambiguous flags', () => {
    assert.deepEqual(parseMaintenanceArgs(['retention']), { command: 'retention', apply: false })
    assert.deepEqual(parseMaintenanceArgs(['erase-user', '--apply']), { command: 'erase-user', apply: true })
    for (const args of [[], ['retention', '--force'], ['retention', '--apply', '--apply'], ['erase-all']]) assert.throws(() => parseMaintenanceArgs(args))
  })

  await t.test('90-day received time, 30-day instances, partial age boundaries and derived evidence invalidation', async () => {
    const initialEvents = await n('events')
    const now = Date.now(), cutoff = now - 90 * DAY, installation = randomUUID(), session = randomUUID()
    const old = event(cutoff, session), delayed = event(cutoff - DAY, session), current = event(now, session)
    await ingestBatch(pool, batch(installation, [old]), cutoff)
    await ingestBatch(pool, batch(installation, [delayed]), cutoff + 1)
    await ingestBatch(pool, batch(installation, [current]), now)
    const orphanReceipt = randomUUID()
    await pool.query('INSERT INTO ci.event_receipts(event_id,fingerprint,received_at) VALUES($1,$2,$3)', [orphanReceipt, 'semantic-duplicate', iso(cutoff)])
    const expired = randomUUID(), retained = randomUUID()
    await pool.query(`INSERT INTO ci.feed_instances VALUES($1,$2,$3,$4),($5,$6,$7,$4)`,
      [expired, iso(now - 30 * DAY), iso(now), {}, retained, iso(now - 30 * DAY + 1), iso(now + 1)])
    await pool.query('INSERT INTO ci.assisted_visit_projection VALUES(true,$1,$2,$1,$3)', [iso(now), randomUUID(), { evidence: old.event_id }])
    const preview = await pruneData(pool, { now })
    assert.equal(preview.applied, false)
    assert.deepEqual(preview.counts, { events: 1, receipts: 2, instances: 1 })
    assert.equal(await n('events'), initialEvents + 3); assert.equal(await n('assisted_visit_projection'), 1)
    const result = await pruneData(pool, { now, apply: true })
    assert.deepEqual(result.counts, preview.counts); assert.equal(result.assisted_projection_invalidated, true)
    assert.equal(await n('events', 'event_id=$1', [old.event_id]), 0)
    assert.equal(await n('events', 'event_id=$1', [delayed.event_id]), 1)
    assert.equal(await n('feed_instances', 'instance_id=$1', [retained]), 1)
    assert.equal(await n('assisted_visit_projection'), 0)
    assert.deepEqual((await pruneData(pool, { now, apply: true })).counts, { events: 0, receipts: 0, instances: 0 })
  })

  await t.test('erase one account, preserve another session on same installation, block re-import and replay', async () => {
    const at = Date.now(), data = sourceData(at), other = sourceData(at)
    for (const list of ['user_beers', 'venue_experiences', 'follows', 'consumer_profiles']) {
      data.consumer[list].push(...other.consumer[list]); data.consumer.counts[list] = data.consumer[list].length
    }
    data.consumer.venue_experiences = [{ id: randomUUID(), user_id: data.user, product_id: data.catalog.active_cycles[0].product_id,
      provisional_drink_id: null, tenant_id: data.tenant, source_drink_id: data.catalog.active_cycles[0].source_drink_id,
      created_at: iso(at + 1), first_drank_at: iso(at), style: 'IPA' }]
    data.consumer.follows = [{ user_id: data.user, tenant_id: data.tenant }]
    data.consumer.counts.venue_experiences = 1; data.consumer.counts.follows = 1
    const original = JSON.stringify(data.consumer)
    await publish(data.catalog, 'catalog', at); await publish(data.consumer, 'consumer', at)
    await refreshSnapshots(pool, config, at)
    const user = userKey(data.user, config.userKeySecret), peer = userKey(other.user, config.userKeySecret)
    const installation = randomUUID(), session = randomUUID(), peerSession = randomUUID()
    await acceptIdentity(pool, link(installation, session, at), user, at)
    await acceptIdentity(pool, link(installation, peerSession, at), peer, at)
    const headers = { 'X-Installation-ID': installation, 'X-Analytics-Session-ID': session }
    const feed = await getFeed(pool, config, query(), headers, user, at)
    const peerFeed = await getFeed(pool, config, query(), { ...headers, 'X-Analytics-Session-ID': peerSession }, peer, at)
    const click = event(at, session, 'bar_opened', { tenant_id: data.tenant })
    const anonymous = event(at - 1, session), peerClick = event(at, peerSession)
    await ingestBatch(pool, batch(installation, [click, anonymous, peerClick]), at)
    const impression = { event_id: randomUUID(), event_name: 'feed_item_impression', schema_version: 1,
      session_id: session, session_started_at: iso(at - 10000), occurred_at: iso(at),
      feed: { feed_instance_id: feed.feed_instance_id, item_id: feed.items[0].item_id, display_position: 1 },
      properties: { visible_duration_ms: 800, visibility_threshold: 0.5 } }
    const duplicate = { ...impression, event_id: randomUUID() }
    const result = await ingestBatch(pool, batch(installation, [impression, duplicate]), at)
    assert.deepEqual(result.duplicates, [duplicate.event_id])
    await refreshAssistedVisits(pool, at + 1)
    assert.equal((await pool.query('SELECT payload FROM ci.assisted_visit_projection')).rows[0].payload.visits.length, 1)
    const preview = await eraseUser(pool, user, { now: at })
    assert.equal(preview.counts.events, 3); assert.equal(preview.counts.receipts, 4)
    assert.equal(preview.counts.consumer_rows, 8); assert.equal(await n('erased_subjects'), 0)
    const erased = await eraseUser(pool, user, { now: at, apply: true })
    assert.deepEqual(erased.counts, preview.counts)
    assert.equal(await n('events', 'session_id=$1', [session]), 0)
    assert.equal(await n('event_receipts', 'session_id=$1', [session]), 0)
    assert.equal(await n('identity_operations', 'user_key=$1', [user]), 0)
    assert.equal(await n('analytics_sessions', 'session_id=$1', [session]), 0)
    assert.equal(await n('feed_snapshots', 'user_key=$1', [user]), 0)
    assert.equal(await n('feed_instances', 'instance_id=$1', [feed.feed_instance_id]), 0)
    assert.equal(await n('events', 'event_id=$1', [peerClick.event_id]), 1)
    assert.equal(await n('feed_instances', 'instance_id=$1', [peerFeed.feed_instance_id]), 1)
    assert.equal(await n('assisted_visit_projection'), 0)
    assert.ok(!JSON.stringify(erased).includes(user))
    // The original source export (including erased rows) can arrive after the
    // command, even with the same source timestamp. It must stay suppressed.
    await publish(data.consumer, 'consumer', at)
    await refreshSnapshots(pool, config, at)
    await refreshAssistedVisits(pool, at + 1)
    assert.equal(await n('feed_snapshots', 'user_key=$1', [user]), 0)
    const stored = (await pool.query("SELECT payload FROM ci.projections WHERE scope='consumer'")).rows[0].payload
    assert.ok(Object.values(stored).every(rows => rows.every(r => r.user_key !== user)))
    assert.equal(JSON.stringify(data.consumer), original)
    const replay = await ingestBatch(pool, batch(installation, [{ ...click, event_id: randomUUID() }, peerClick]), at)
    assert.equal(replay.rejected[0].code, 'SESSION_ERASED'); assert.deepEqual(replay.duplicates, [peerClick.event_id])
    await assert.rejects(acceptIdentity(pool, link(installation, randomUUID(), at), user, at), e => e.code === 'SUBJECT_ERASED')
    await assert.rejects(acceptIdentity(pool, link(installation, session, at), peer, at), e => e.code === 'SESSION_ERASED')
    await assert.rejects(getFeed(pool, config, query(), {}, user, at), e => e.code === 'SUBJECT_ERASED')
    const again = await eraseUser(pool, user, { now: at + 1, apply: true })
    assert.ok(Object.values(again.counts).every(c => c === 0))
  })

  await t.test('mixed-account session refuses erasure without any partial deletion', async () => {
    const now = Date.now(), installation = randomUUID(), session = randomUUID(), user = randomUUID(), peer = randomUUID()
    await acceptIdentity(pool, link(installation, session, now), user, now)
    await acceptIdentity(pool, link(installation, session, now), peer, now)
    for (const apply of [false, true]) await assert.rejects(eraseUser(pool, user, { apply, now }), e => e.code === 'ERASURE_AMBIGUOUS_SESSION')
    assert.equal(await n('identity_operations', 'session_id=$1', [session]), 2)
    assert.equal(await n('erased_subjects', 'user_key=$1', [user]), 0)
  })

  await t.test('failure rolls back markers and deletions; uncertain commit is safe to retry', async () => {
    const now = Date.now(), installation = randomUUID(), session = randomUUID(), user = randomUUID()
    await acceptIdentity(pool, link(installation, session, now), user, now)
    const click = event(now, session)
    await ingestBatch(pool, batch(installation, [click]), now)
    const failBeforeCommit = scopedPool(pool, async (client, sql, args) => {
      if (sql.startsWith('DELETE FROM ci.feed_snapshots')) throw new Error('Injected storage failure')
      return client.query(sql, args)
    })
    await assert.rejects(eraseUser(failBeforeCommit, user, { apply: true, now }))
    assert.equal(await n('erased_subjects', 'user_key=$1', [user]), 0)
    assert.equal(await n('events', 'event_id=$1', [click.event_id]), 1)
    const failAfterCommit = scopedPool(pool, async (client, sql, args) => {
      const result = await client.query(sql, args)
      if (sql === 'COMMIT') throw new Error('Lost acknowledgement')
      return result
    })
    await assert.rejects(eraseUser(failAfterCommit, user, { apply: true, now }))
    assert.equal(await n('erased_subjects', 'user_key=$1', [user]), 1)
    const retry = await eraseUser(pool, user, { apply: true, now })
    assert.equal(retry.counts.events, 0)
  })

  await t.test('REPEATABLE READ establishes snapshot after maintenance releases its exclusive lock', async () => {
    const user = randomUUID(), at = Date.now()
    let signal, resume, waiting
    const acquired = new Promise(resolve => { signal = resolve })
    const proceed = new Promise(resolve => { resume = resolve })
    const waitReached = new Promise(resolve => { waiting = resolve })
    const exclusive = transaction(pool, async client => {
      await client.query('INSERT INTO ci.erased_subjects VALUES($1,$2)', [user, iso(at)])
      signal(); await proceed
    }, 'READ COMMITTED', true)
    await acquired
    const waiter = scopedPool(pool, (client, sql, args) => {
      if (sql.startsWith('SELECT pg_advisory_lock_shared')) waiting()
      return client.query(sql, args)
    })
    const shared = transaction(waiter, async client => (await client.query('SELECT 1 FROM ci.erased_subjects WHERE user_key=$1', [user])).rowCount, 'REPEATABLE READ')
    await waitReached; resume(); await exclusive
    assert.equal(await shared, 1)
    assert.equal(Number((await pool.query("SELECT count(*) AS n FROM pg_locks WHERE locktype='advisory' AND pid IN (SELECT pid FROM pg_stat_activity WHERE datname=current_database())")).rows[0].n), 0)
  })

  await t.test('runtime roles can read suppression, but cannot erase or remove suppression', async () => {
    await pool.query("DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='ci_api') THEN CREATE ROLE ci_api; END IF; IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='ci_worker') THEN CREATE ROLE ci_worker; END IF; END $$")
    await pool.query(await readFile(new URL('../db/runtime-grants.sql', import.meta.url), 'utf8'))
    for (const role of ['ci_api', 'ci_worker']) {
      await transaction(pool, async client => { await client.query(`SET LOCAL ROLE ${role}`); await client.query('SELECT * FROM ci.erased_subjects'); await client.query('SELECT * FROM ci.erased_sessions') })
      for (const sql of ['DELETE FROM ci.events', 'DELETE FROM ci.erased_subjects', 'INSERT INTO ci.erased_subjects VALUES(\'forged\',now())']) {
        await assert.rejects(transaction(pool, async client => { await client.query(`SET LOCAL ROLE ${role}`); await client.query(sql) }), e => e.code === '42501')
      }
    }
  })
})
