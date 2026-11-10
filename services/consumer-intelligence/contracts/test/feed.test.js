import test from 'node:test'
import assert from 'node:assert/strict'
import { fixture, validate } from './validation.js'
import { DAY, MINUTE, canonical, iso, ms } from './reference/core.js'
import { createInstance, checkInstanceContext, currentEligibility, enrichFeedEvent, feedAvailability, pageLatest, personalizedState, summarize } from './reference/feed.js'

const now = ms('2026-10-31T10:00:00Z')
const event = fixture('feed_item_impression')
const installation = fixture('batch').installation_id
const headers = { 'X-Installation-ID': installation, 'X-Analytics-Session-ID': event.session_id }
const query = { ...fixture('feed request'), city_code: 'qingdao' }
const item = fixture('for_you').items[0]
const profile = { subject: 'A', home_city_code: 'shanghai', source_as_of: iso(now - MINUTE) }
const create = (overrides = {}) => createInstance({ query, headers, owner: 'A', profile, now, items: [item], rankingVersion: 'latest-v1', dataAsOf: iso(now - MINUTE), ...overrides })
const projections = { catalog: iso(now - MINUTE), consumer: iso(now - 2 * MINUTE) }
const versions = { catalog: 2, user: 3 }
const snapshot = { ...fixture('for_you').snapshot, versions, data_as_of: iso(now - 8 * MINUTE) }
const secret = 'contract-test-only-not-a-deployment-secret'
const facts = { ...item, beer_identity: 'product:' + item.product_id, public_tenant: true, public_category: true, public_drink: true, tap_assigned: true, accuracy: 'exact', canceled: false, ended_at: null, public_status: 'available' }

test('consent-off latest and authenticated For You work without analytics identifiers', () => {
  const anonymous = create({ owner: null, headers: {} })
  assert.equal(anonymous.owner_user_key, null)
  assert.equal(anonymous.analytics_installation_id, null)
  const personalized = create({ query: { ...query, mode: 'for_you' }, headers: {}, snapshot })
  assert.equal(personalized.owner_user_key, 'A')
  assert.throws(() => enrichFeedEvent(personalized, installation, event, now), { code: 'ANALYTICS_NOT_ENABLED_FOR_INSTANCE' })
  assert.throws(() => create({ query: { ...query, mode: 'for_you' }, owner: null }), { status: 401 })
})

test('analytics headers are an all-or-none valid UUID pair', () => {
  assert.throws(() => create({ headers: { 'X-Installation-ID': installation } }), { code: 'INVALID_FEED_REQUEST' })
  assert.throws(() => create({ headers: { ...headers, 'X-Analytics-Session-ID': 'bad' } }), { code: 'INVALID_FEED_REQUEST' })
})

test('anonymous measurement matches original session, not just item membership', () => {
  const instance = create({ owner: null })
  assert.equal(enrichFeedEvent(instance, installation, event, now).user_key, null)
  assert.throws(() => enrichFeedEvent(instance, item.product_id, event, now), { code: 'INSTANCE_ANALYTICS_CONTEXT_MISMATCH' })
  assert.throws(() => enrichFeedEvent(instance, installation, { ...event, session_id: item.product_id }, now), { code: 'INSTANCE_ANALYTICS_CONTEXT_MISMATCH' })
  assert.throws(() => enrichFeedEvent(instance, installation, { ...event, feed: { ...event.feed, item_id: 'other' } }, now), { code: 'ITEM_NOT_IN_INSTANCE' })
})

test('instance ownership, city, surface and analytics binding cannot change on retry', () => {
  const instance = create()
  assert.doesNotThrow(() => checkInstanceContext(instance, { ...query, limit: 2 }, headers, 'A'))
  assert.throws(() => checkInstanceContext(instance, query, headers, 'B'), { status: 409 })
  assert.throws(() => checkInstanceContext(instance, { ...query, city_code: 'shanghai' }, headers, 'A'), { status: 409 })
  assert.throws(() => checkInstanceContext(instance, query, {}, 'A'), { status: 409 })
  assert.throws(() => checkInstanceContext(create({ headers: {} }), query, headers, 'A'), { status: 409 })
  assert.throws(() => enrichFeedEvent(instance, installation, event, now, 'B'), { code: 'INSTANCE_IDENTITY_CONFLICT' })
})

test('historical enrichment survives pagination expiry and ignores later catalog changes', () => {
  const original = structuredClone(item)
  const instance = create({ items: [original] })
  original.product_id = null
  original.tenant_id = 'changed'
  assert.throws(() => pageLatest(instance, { now: now + 30 * MINUTE, secret, isEligible: () => true }), { status: 410 })
  const enriched = enrichFeedEvent(instance, installation, event, now + 3 * DAY)
  assert.equal(enriched.product_id, item.product_id)
  assert.equal(enriched.tenant_id, item.tenant_id)
  assert.equal(enriched.original_rank, 1)
  assert.throws(() => enrichFeedEvent(instance, installation, event, now + 30 * DAY), { code: 'FEED_INSTANCE_NOT_RETAINED' })
  assert.throws(() => enrichFeedEvent(instance, installation, { ...event, occurred_at: iso(now - 1) }, now), { code: 'EVENT_PRECEDES_INSTANCE' })
})

test('home city at creation is immutable after profile change and identity re-resolution', () => {
  const current = structuredClone(profile)
  const instance = create({ profile: current })
  current.home_city_code = 'beijing'
  current.source_as_of = iso(now + 3 * DAY)
  const enriched = enrichFeedEvent(instance, installation, event, now + 3 * DAY, 'A')
  assert.equal(enriched.home_city_code_at_creation, 'shanghai')
  assert.equal(enriched.away_city_at_creation, true)
  assert.equal(enriched.home_city_source_as_of, profile.source_as_of)
  assert.throws(() => { instance.home_city_code_at_creation = 'beijing' }, TypeError)
})

test('anonymous instance never gains historical home city after login', () => {
  const instance = create({ owner: null })
  const enriched = enrichFeedEvent(instance, installation, event, now + 3 * DAY, 'A')
  assert.equal(enriched.home_city_code_at_creation, null)
  assert.equal(enriched.away_city_at_creation, null)
  assert.equal(enriched.home_city_source_as_of, null)
})

test('unknown/untrusted/stale profile does not block latest and never means local', () => {
  for (const p of [null, { ...profile, subject: 'B' }, { ...profile, source_as_of: iso(now - 11 * MINUTE) }, { ...profile, home_city_code: null }]) {
    assert.equal(create({ profile: p }).away_city_at_creation, null)
  }
  assert.equal(create({ profile: { ...profile, home_city_code: 'qingdao' } }).away_city_at_creation, false)
})

test('same ranking snapshot can back independent home/page instances', () => {
  const a = create({ snapshot, query: { ...query, mode: 'for_you', surface: 'home' } })
  const b = create({ snapshot, query: { ...query, mode: 'for_you', feed_instance_id: item.product_id } })
  assert.equal(a.snapshot_id, b.snapshot_id)
  assert.notEqual(a.feed_instance_id, b.feed_instance_id)
  assert.notEqual(a.surface, b.surface)
})

test('home instance records only its delivered prefix, not unseen snapshot items', () => {
  const items = [1, 2, 3].map(n => ({ ...item, item_id: `item-${n}`, rank: n }))
  const homeQuery = { ...query, mode: 'for_you', surface: 'home', limit: 2 }
  const instance = create({ snapshot, query: homeQuery, items })
  assert.equal(instance.items.length, 2)
  assert.throws(() => enrichFeedEvent(instance, installation, { ...event, feed: { ...event.feed, item_id: 'item-3' } }, now), { code: 'ITEM_NOT_IN_INSTANCE' })
  assert.throws(() => checkInstanceContext(instance, { ...homeQuery, limit: 3 }, headers, 'A'), { status: 409 })
})

test('stale ranking retains original source timestamp; projection staleness is separate', () => {
  assert.deepEqual(feedAvailability('for_you', projections, now, snapshot, versions), { state: 'fresh', data_as_of: snapshot.data_as_of })
  assert.deepEqual(feedAvailability('for_you', projections, now, snapshot, { ...versions, catalog: 3 }), { state: 'stale', data_as_of: snapshot.data_as_of })
  const consumerOld = { ...projections, consumer: iso(now - 10 * MINUTE - 1) }
  assert.doesNotThrow(() => feedAvailability('latest', consumerOld, now))
  assert.throws(() => feedAvailability('for_you', consumerOld, now, snapshot, versions), { code: 'PROJECTION_STALE', status: 503 })
  for (const mode of ['latest', 'for_you']) assert.throws(() => feedAvailability(mode, { ...projections, catalog: iso(now - 11 * MINUTE) }, now), { status: 503 })
  assert.doesNotThrow(() => feedAvailability('for_you', { catalog: iso(now - 10 * MINUTE), consumer: iso(now - 10 * MINUTE) }, now, snapshot, versions))
})

test('cold start, building, computed empty and stale filtering remain distinct', () => {
  const args = { count: 5, now, snapshot, projections, versions, items: [item], isEligible: () => true }
  const cold = personalizedState({ ...args, count: 2 })
  assert.equal(cold.personalization.status, 'cold_start')
  assert.equal(cold.snapshot, null)
  assert.equal(cold.data_as_of, projections.consumer)
  const building = personalizedState({ ...args, snapshot: null })
  assert.equal(building.snapshot.state, 'building')
  assert.equal(building.empty_reason, 'refresh_pending')
  const empty = personalizedState({ ...args, isEligible: () => false })
  assert.equal(empty.snapshot.state, 'fresh')
  assert.equal(empty.empty_reason, 'no_matching_style')
  const stale = personalizedState({ ...args, versions: { ...versions, user: 4 }, isEligible: () => false })
  assert.equal(stale.snapshot.state, 'stale')
  assert.equal(stale.items.length, 0)
  for (const state of [cold, building, empty, stale]) assert.equal(validate('feed/response.schema.json', { ...fixture('for_you'), ...state }).ok, true)
})

test('current eligibility uses exact active recent cycles, not only public_status=new', () => {
  const context = { mode: 'for_you', styles: new Set(['酸啤']) }
  for (const status of ['new', 'available', 'low']) assert.equal(currentEligibility(item, { ...facts, public_status: status }, now, context), true)
  for (const change of [{ public_status: 'sold_out' }, { public_status: 'coming_soon' }, { public_drink: false }, { public_category: false }, { public_tenant: false }, { tap_assigned: false }, { accuracy: 'partial_start' }, { canceled: true }, { ended_at: iso(now) }, { item_id: 'new-cycle' }, { current_cycle_started_at: iso(now - 15 * DAY) }]) {
    assert.equal(currentEligibility(item, { ...facts, ...change }, now, context), false)
  }
  assert.equal(currentEligibility(item, { ...facts, style_family: '其他' }, now, { mode: 'latest' }), true)
  assert.equal(currentEligibility(item, { ...facts, style_family: '其他' }, now, context), false)
  assert.equal(currentEligibility(item, facts, now, { ...context, tapped: new Set([canonical([facts.beer_identity, facts.tenant_id])]) }), false)
  assert.equal(currentEligibility(item, facts, now, { ...context, tapped: new Set([canonical([facts.beer_identity, 'other-venue'])]) }), true)
})

test('pagination uses fixed manifest/summary, skips removed items and excludes new items', () => {
  const items = [1, 2, 3, 4].map(n => ({ ...item, item_id: `item-${n}`, rank: n }))
  const instance = create({ items })
  const eligible = new Set(items.map(i => i.item_id))
  const first = pageLatest(instance, { now, limit: 1, secret, isEligible: i => eligible.has(i.item_id) })
  eligible.delete('item-2')
  eligible.add('new-item-5')
  const second = pageLatest(instance, { now: now + MINUTE, limit: 2, cursor: first.page.next_cursor, secret, isEligible: i => eligible.has(i.item_id) })
  assert.deepEqual(second.items.map(i => i.item_id), ['item-3', 'item-4'])
  assert.deepEqual(second.items.map(i => i.rank), [3, 4])
  assert.equal(second.page.has_more, false)
  assert.equal(second.summary, null)
  assert.equal(first.summary.total_items, 4)
  assert.equal(instance.summary.total_items, 4)
  assert.equal(second.data_as_of, instance.data_as_of)
})

test('cursor tampering and use on another instance are rejected', () => {
  const instance = create({ items: [item, { ...item, item_id: 'second', rank: 2 }] })
  const first = pageLatest(instance, { now, limit: 1, secret, isEligible: () => true })
  for (const cursor of ['x', first.page.next_cursor + 'x']) assert.throws(() => pageLatest(instance, { now, cursor, secret, isEligible: () => true }), { code: 'INVALID_CURSOR' })
  const other = create({ query: { ...query, feed_instance_id: item.product_id }, items: instance.items })
  assert.throws(() => pageLatest(other, { now, cursor: first.page.next_cursor, secret, isEligible: () => true }), { code: 'INVALID_CURSOR' })
})

test('rolling 14-day interval can span 15 city-local calendar dates', () => {
  const items = Array.from({ length: 15 }, (_, i) => ({ ...item, current_cycle_started_at: iso(now - i * DAY) }))
  const summary = summarize(items, now, 'Asia/Shanghai')
  assert.equal(summary.days.length, 15)
  assert.equal(summary.total_items, 15)
  assert.equal(summary.days[0].date, '2026-10-31')
})
