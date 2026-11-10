import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { config, sourceData } from './data.js'
import { prepareExport } from '../src/projections.js'
import { features, rankFeed, rankingSignature, normalizeBeerStyle, DAY, eligible } from '../src/model.js'
import { newInstance, latestPage, enrichFeedEvent } from '../src/instances.js'
import { userKey, createSupabase } from '../src/supabase.js'
import { loadConfig } from '../src/config.js'
import { valid } from '../src/schema.js'
import { projectionStatus, runOpsCheck } from '../src/ops-check.js'

test('V1 uses unique beers and coarse styles, deterministic ranking, no unknown-style recommendations', () => {
  const now = Date.now(), data = sourceData(now)
  const catalog = prepareExport(data.catalog, 'catalog', config, now).payload
  const consumer = prepareExport(data.consumer, 'consumer', config, now).payload
  consumer.user_beers.push({ ...consumer.user_beers[0], id: randomUUID() })
  const profile = features(consumer, userKey(data.user, config.userKeySecret))
  assert.equal(profile.count, 5)
  const items = rankFeed(catalog.active_cycles, profile, now, config)
  assert.equal(items.length, 20)
  assert.equal(items[0].beer_name, '测试酒款 0')
  assert.equal(items[0].beer_name_en, 'Beer 0')
  assert.equal(items[0].brewery_en, 'Test brewery')
  assert.equal(items[0].tenant_name_en, 'Test Bar')
  assert.equal(items[0].style_en, 'IPA')
  assert.equal(items[0].reason.text, '因为你常喝IPA')
  assert.deepEqual(rankFeed([...catalog.active_cycles].reverse(), profile, now, config), items)
  for (const item of items) { assert.ok(valid('feed/item.schema.json', item)); assert.equal(item.score, undefined) }
})
test('follow is a weak multiplier; venue exclusions precede canonical dedupe', () => {
  const now = Date.now(), data = sourceData(now)
  const catalog = prepareExport(data.catalog, 'catalog', config, now).payload
  const consumer = prepareExport(data.consumer, 'consumer', config, now).payload
  const user = userKey(data.user, config.userKeySecret), first = catalog.active_cycles.find(r => r.beer_name_en === 'Beer 0')
  const other = { ...first, item_id: 'different', tenant_id: randomUUID(), current_cycle_started_at: new Date(now - 10 * 3600000).toISOString() }
  consumer.follows.push({ user_key: user, tenant_id: other.tenant_id })
  let profile = features(consumer, user)
  assert.equal(rankFeed([first, other], profile, now, config)[0].tenant_id, other.tenant_id)
  consumer.venue_experiences.push({ user_key: user, product_id: first.product_id, tenant_id: other.tenant_id })
  profile = features(consumer, user)
  assert.equal(rankFeed([first, other], profile, now, config)[0].tenant_id, first.tenant_id)
})
test('only exact active recent cycles qualify; status changes do not change start time', () => {
  const now = Date.now(), data = sourceData(now), row = prepareExport(data.catalog, 'catalog', config, now).payload.active_cycles[0]
  assert.ok(eligible(row, now, config))
  for (const change of [{ public_status: 'sold_out' }, { accuracy: 'partial_start' }, { canceled: true }, { tap_assigned: false }, { public_category: false }, { current_cycle_started_at: new Date(now - 15 * DAY).toISOString() }]) assert.equal(eligible({ ...row, ...change }, now, config), false)
  assert.ok(eligible({ ...row, public_status: 'low' }, now, config))
  const profile = { count: 5, counts: { IPA: 5 }, tapped: new Set(), followed: new Set() }
  assert.equal(rankingSignature([row], profile, now, config), rankingSignature([{ ...row, style_en: 'Changed display only' }], profile, now, config))
  assert.notEqual(rankingSignature([row], profile, now, config), rankingSignature([row], profile, now + 15 * DAY, config))
  assert.equal(normalizeBeerStyle('DDH 浑浊'), 'IPA')
})
test('full export counts/completeness/time must validate before publication; user IDs are HMACed', () => {
  const now = Date.now(), data = sourceData(now)
  const projection = prepareExport(data.consumer, 'consumer', config, now)
  assert.ok(!JSON.stringify(projection).includes(data.user))
  for (const patch of [{ complete: false }, { counts: {} }, { source_as_of: new Date(now + 1).toISOString() }]) assert.throws(() => prepareExport({ ...data.consumer, ...patch }, 'consumer', config, now))
})
test('instance city is historical; anonymous and missing context remain null', () => {
  const now = Date.now(), query = { feed_instance_id: randomUUID(), mode: 'latest', surface: 'feed_page', city_code: 'qingdao' }
  const profile = { user_key: 'U', source_as_of: new Date(now).toISOString(), home_city_code: 'shanghai' }
  const instance = newInstance(query, {}, 'U', profile, [], {}, now, 'Asia/Shanghai')
  profile.home_city_code = 'beijing'
  assert.equal(instance.home_city_code_at_creation, 'shanghai'); assert.equal(instance.away_city_at_creation, true)
  assert.equal(newInstance(query, {}, null, profile, [], {}, now, 'Asia/Shanghai').away_city_at_creation, null)
  assert.equal(newInstance(query, {}, 'U', null, [], {}, now, 'Asia/Shanghai').away_city_at_creation, null)
})
test('pagination expires separately from measurement retention; signed cursors reject tampering', () => {
  const now = Date.now(), installation = randomUUID(), session = randomUUID()
  const query = { feed_instance_id: randomUUID(), mode: 'latest', surface: 'feed_page', city_code: 'qingdao', limit: 1 }
  const instance = newInstance(query, { 'X-Installation-ID': installation, 'X-Analytics-Session-ID': session }, null, null,
    [{ item_id: 'a', current_cycle_started_at: new Date(now).toISOString() }, { item_id: 'b', current_cycle_started_at: new Date(now).toISOString() }], {}, now, 'Asia/Shanghai')
  const page = latestPage(instance, query, now, () => true, config.cursorSecret)
  assert.equal(page.items.length, 1)
  assert.throws(() => latestPage(instance, { ...query, cursor: page.page.next_cursor + 'x' }, now, () => true, config.cursorSecret))
  assert.throws(() => latestPage(instance, query, now + DAY, () => true, config.cursorSecret), e => e.code === 'FEED_INSTANCE_EXPIRED')
  assert.equal(enrichFeedEvent(instance, installation, { event_name: 'feed_shown', session_id: session, occurred_at: new Date(now + 1000).toISOString() }, now + 3 * DAY, null).away_city_at_creation, null)
})
test('remote DB requires verified TLS and secrets must be distinct', () => {
  const env = { CI_DATABASE_URL: 'postgres://u:p@example.com/db', SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'test', CI_USER_KEY_SECRET: config.userKeySecret, CI_CURSOR_SECRET: config.cursorSecret }
  assert.equal(loadConfig(env).databaseSsl.rejectUnauthorized, true)
  assert.throws(() => loadConfig({ ...env, CI_DATABASE_TLS: 'disable' }))
  assert.throws(() => loadConfig({ ...env, CI_CURSOR_SECRET: config.userKeySecret }))
})
test('Supabase auth verifies remotely; service-role tokens are not consumer tokens', async () => {
  const id = randomUUID(), claims = { sub: id, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 600 }
  let calls = 0
  const client = createSupabase({ ...config, supabaseUrl: 'https://test.invalid', supabaseAnonKey: 'anon' }, async () => { calls++; return new Response(JSON.stringify({ id }), { status: 200 }) })
  const token = 'a.' + Buffer.from(JSON.stringify(claims)).toString('base64url') + '.b'
  assert.equal((await client.authorize(token)).user_key, userKey(id, config.userKeySecret)); assert.equal(calls, 1)
  const service = 'a.' + Buffer.from(JSON.stringify({ ...claims, role: 'service_role' })).toString('base64url') + '.b'
  await assert.rejects(client.authorize(service), e => e.code === 'UNAUTHORIZED')
})
test('operational projection checks preserve mode isolation and the exact freshness boundary', () => {
  const now = Date.now(), row = (scope, age) => ({ scope, source_as_of: new Date(now - age) })
  const fresh = projectionStatus([row('catalog', 600000), row('consumer', 600000)], now)
  assert.equal(fresh.latest_available, true); assert.equal(fresh.for_you_available, true)
  const stale = projectionStatus([row('catalog', 1), row('consumer', 600001)], now)
  assert.equal(stale.latest_available, true); assert.equal(stale.for_you_available, false)
  assert.equal(stale.projections.consumer.state, 'stale')
  assert.equal(projectionStatus([row('catalog', -1)], now).projections.catalog.state, 'future_timestamp')
  assert.equal(projectionStatus([], now).projections.consumer.state, 'missing')
})
test('operational failures emit only a safe error code, never connection credentials', async () => {
  const logs = [], unavailable = { connect: async () => { throw new Error('postgres://secret:password@private/database') } }
  assert.equal(await runOpsCheck(unavailable, report => logs.push(report)), 2)
  assert.equal(logs[0].code, 'OPS_CHECK_UNAVAILABLE')
  assert.ok(!JSON.stringify(logs).includes('password'))
})
