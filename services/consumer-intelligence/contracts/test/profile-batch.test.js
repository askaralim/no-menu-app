import test from 'node:test'
import assert from 'node:assert/strict'
import { fixture, validate } from './validation.js'
import { DAY, MINUTE, iso, ms } from './reference/core.js'
import { ContractStore, ingestBatch } from './reference/batch.js'
import { createInstance } from './reference/feed.js'
import { patchProfile } from './reference/profile.js'

const now = ms('2026-10-31T10:00:00Z')
const id = n => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`
const cities = new Set(['shanghai', 'qingdao', 'beijing'])
const profile = { consumer_username: 'Askar', is_default: false, home_city_code: 'shanghai' }
const ordinary = fixture('bar_opened')
const batch = events => ({ ...fixture('batch'), events })
const wrap = result => ({ ...fixture('batch response'), accepted: result.accepted, duplicates: result.duplicates, rejected: result.rejected })

test('Merge Patch preserves omitted fields, clears city with null, and no-ops on {}', () => {
  assert.equal(patchProfile(profile, { consumer_username: 'New_Name' }, { cities }).profile.home_city_code, 'shanghai')
  assert.equal(patchProfile(profile, { home_city_code: 'qingdao' }, { cities }).profile.consumer_username, 'Askar')
  assert.equal(patchProfile(profile, { home_city_code: null }, { cities }).profile.home_city_code, null)
  assert.deepEqual(patchProfile(profile, {}, { cities }), { profile, wrote: false })
  assert.equal(profile.home_city_code, 'shanghai')
})

test('Profile rejects unsupported media, invalid fields and username removal', () => {
  assert.throws(() => patchProfile(profile, {}, { cities, contentType: 'application/json' }), { status: 415 })
  for (const patch of [{ consumer_username: null }, { display_name: 'X' }, { user_id: id(1) }, { home_city_code: 'Shanghai' }, { home_city_code: 'not-enabled' }, { consumer_username: 'admin' }]) {
    assert.throws(() => patchProfile(profile, patch, { cities }))
  }
})

test('combined Profile changes fail atomically and username uniqueness remains enforced', () => {
  const before = structuredClone(profile)
  assert.throws(() => patchProfile(profile, { home_city_code: 'qingdao', consumer_username: 'Taken' }, { cities, taken: new Set(['taken']) }), { code: 'USERNAME_TAKEN', status: 409 })
  assert.deepEqual(profile, before)
  assert.throws(() => patchProfile(profile, { consumer_username: 'New_Name', home_city_code: 'missing' }, { cities }))
  assert.deepEqual(profile, before)
})

test('batch partial validation: 8 committed valid entries and 2 permanent rejections', () => {
  const store = new ContractStore()
  const events = Array.from({ length: 10 }, (_, i) => ({ ...ordinary, event_id: id(100 + i), schema_version: i >= 8 ? 2 : 1 }))
  const result = ingestBatch(batch(events), { store, now })
  assert.equal(result.status, 202)
  assert.equal(result.accepted.length, 8)
  assert.equal(result.rejected.length, 2)
  assert.equal(store.events.size, 8)
  assert.equal(store.commits, 1)
  for (const rejected of result.rejected) assert.equal(rejected.code, 'UNKNOWN_EVENT_VERSION')
  assert.equal(validate('events/batch-response.schema.json', wrap(result)).ok, true)
})

test('rollback confirms no accepted IDs and leaves no stored records', () => {
  const store = new ContractStore()
  const result = ingestBatch(batch([ordinary]), { store, now, fault: 'before_commit' })
  assert.deepEqual(result, { status: 503, code: 'PERSISTENCE_UNAVAILABLE' })
  assert.equal(Object.hasOwn(result, 'accepted'), false)
  assert.equal(store.events.size, 0)
  assert.equal(store.receipts.size, 0)
})

test('uncertain commit returns 503 even when stored; original IDs retry as duplicates', () => {
  const store = new ContractStore()
  const input = batch([ordinary])
  const first = ingestBatch(input, { store, now, fault: 'after_commit' })
  assert.equal(first.status, 503)
  assert.equal(Object.hasOwn(first, 'accepted'), false)
  assert.equal(store.events.size, 1)
  const second = ingestBatch({ ...input, batch_id: id(999) }, { store, now })
  assert.equal(second.status, 202)
  assert.deepEqual(second.accepted, [])
  assert.deepEqual(second.duplicates, [ordinary.event_id])
  assert.equal(store.events.size, 1)
})

test('same ID/content dedupes; changed content rejects without overwriting raw history', () => {
  const store = new ContractStore()
  ingestBatch(batch([ordinary]), { store, now })
  const altered = { ...ordinary, source: 'different' }
  const result = ingestBatch(batch([altered]), { store, now })
  assert.equal(result.rejected[0].code, 'EVENT_ID_CONFLICT')
  assert.equal(store.events.get(ordinary.event_id).raw.source, ordinary.source)
  assert.equal(ingestBatch(batch([ordinary]), { store, now: now + 8 * DAY }).duplicates.length, 1)
})

test('missing event ID and bad business schema reject individual objects only', () => {
  const { event_id, ...missingId } = ordinary
  const result = ingestBatch(batch([ordinary, missingId, { ...ordinary, event_id: id(6), tenant_id: 'wrong' }]), { store: new ContractStore(), now })
  assert.equal(result.accepted.length, 1)
  assert.equal(result.rejected[0].event_id, null)
  assert.equal(result.rejected[0].event_index, 1)
  assert.equal(result.rejected[1].code, 'INVALID_EVENT')
  assert.equal(validate('events/batch-response.schema.json', wrap(result)).ok, true)
})

test('malformed envelope is 400; valid all-invalid batch is 202 with no writes', () => {
  const store = new ContractStore()
  assert.equal(ingestBatch(batch([null]), { store, now }).status, 400)
  const result = ingestBatch(batch([{ ...ordinary, schema_version: 99 }]), { store, now })
  assert.equal(result.status, 202)
  assert.deepEqual(result.accepted, [])
  assert.equal(store.commits, 0)
})

test('event time and UTF-8 body/event sizes are validated at the correct boundary', () => {
  const store = new ContractStore()
  const events = [
    { ...ordinary, event_id: id(1), occurred_at: iso(now - 8 * DAY) },
    { ...ordinary, event_id: id(2), occurred_at: iso(now + 6 * MINUTE) },
    { ...ordinary, event_id: id(3), occurred_at: iso(now - 2 * MINUTE), session_started_at: iso(now - MINUTE) },
  ]
  assert.equal(ingestBatch(batch(events), { store, now }).rejected.length, 3)
  assert.equal(ingestBatch(batch([{ ...ordinary, unexpected: '酸'.repeat(3000) }]), { store, now }).rejected[0].code, 'EVENT_TOO_LARGE')
  assert.equal(ingestBatch(batch([{ ...ordinary, unexpected: '酸'.repeat(22000) }]), { store, now }).status, 413)
})

const feedEvent = fixture('feed_item_impression')
function feedContext() {
  const input = batch([feedEvent])
  const instance = createInstance({ query: fixture('feed request'), headers: { 'X-Installation-ID': input.installation_id, 'X-Analytics-Session-ID': feedEvent.session_id }, owner: null, items: fixture('latest').items, now, rankingVersion: 'latest-v1', dataAsOf: iso(now - MINUTE) })
  return { input, instances: new Map([[instance.feed_instance_id, instance]]) }
}

test('instance lookup outage is retryable 503, not a permanent invalid-event rejection', () => {
  const { input, instances } = feedContext()
  const store = new ContractStore()
  const result = ingestBatch(batch([{ ...ordinary, event_id: id(90) }, ...input.events]), { store, now, instances, fault: 'lookup' })
  assert.equal(result.status, 503)
  assert.equal(Object.hasOwn(result, 'rejected'), false)
  assert.equal(store.events.size, 0)
})

test('impressions dedupe per instance/item, but repeated legitimate opens are retained', () => {
  const { input, instances } = feedContext()
  const store = new ContractStore()
  assert.equal(ingestBatch(input, { store, now, instances }).accepted.length, 1)
  const duplicate = { ...feedEvent, event_id: id(66) }
  assert.deepEqual(ingestBatch(batch([duplicate]), { store, now, instances }).duplicates, [duplicate.event_id])
  assert.equal(store.events.size, 1)
  const open = fixture('feed_item_opened')
  const opens = [{ ...open, event_id: id(67) }, { ...open, event_id: id(68) }]
  assert.equal(ingestBatch(batch(opens), { store, now, instances }).accepted.length, 2)
  assert.equal(store.events.size, 3)
})

test('ordinary delayed history without contemporaneous context never uses current home city', () => {
  const occurred = now - DAY
  const historic = { ...ordinary, occurred_at: iso(occurred), session_started_at: iso(occurred - MINUTE) }
  const store = new ContractStore()
  const current = patchProfile({ ...profile, home_city_code: null }, { home_city_code: 'shanghai' }, { cities }).profile
  assert.equal(current.home_city_code, 'shanghai')
  const result = ingestBatch(batch([historic]), { store, now: now + DAY, resolveUser: () => 'A' })
  assert.equal(result.status, 202)
  assert.equal(store.events.get(historic.event_id).enrichment.away_city, null)
  patchProfile(current, { home_city_code: 'beijing' }, { cities })
  assert.equal(store.events.get(historic.event_id).enrichment.away_city, null)
})
