import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateAssistedVisits, consumptionDay } from '../src/assisted-visits.js'

const HOUR = 3600000
const anchor = Date.parse('2026-11-01T13:10:00.500Z')
const iso = n => new Date(n).toISOString()
const tap = (id = 'T1', time = anchor, extra = {}) => ({
  id, user_key: 'U', tenant_id: 'X', product_id: 'A', source_drink_id: 'drink-A', provisional_drink_id: null,
  created_at: iso(time), first_drank_at: iso(time - 24 * HOUR), ...extra,
})
const event = (id = 'E1', time = anchor - HOUR, extra = {}) => ({
  event_id: id, occurred_at: iso(time), resolved_user_key: 'U', identity_state: 'resolved',
  raw: { event_name: 'beer_opened', product_id: 'A', tenant_id: 'X', source: 'search' }, enrichment: {}, ...extra,
})
const compute = (taps, events) => calculateAssistedVisits(taps, events, anchor + 10 * HOUR)

test('Assisted Visit uses created_at, groups three TAPs into one visit, and is deterministic', () => {
  const taps = [tap(), tap('T2', anchor + HOUR, { product_id: 'B' }), tap('T3', anchor + 2 * HOUR, { product_id: 'C' })]
  const events = [event(), event('bar', anchor - 2 * HOUR, { raw: { event_name: 'bar_opened', tenant_id: 'X' } })]
  const result = compute(taps, events)
  assert.equal(result.candidates.length, 3)
  assert.equal(result.visits.length, 1)
  assert.equal(result.visits[0].tap_count, 3)
  assert.equal(result.visits[0].consumption_day, '2026-11-01')
  assert.equal(result.visits[0].strongest_evidence.kind, 'beer_at_venue')
  assert.equal(result.visits[0].evidence.length, 2)
  assert.deepEqual(result.counts.observed_assisted_visits, { '24h': 1, '48h': 1, '72h': 1 })
  assert.deepEqual(compute([...taps].reverse(), [...events].reverse()), result)
  assert.deepEqual(compute(taps.map(t => ({ ...t, first_drank_at: iso(anchor - 100 * HOUR) })), events).visits, result.visits)
})

test('06:00 China-time boundary joins midnight TAPs but separates the next recording day', () => {
  assert.equal(consumptionDay('2026-11-01T15:40:00Z'), '2026-11-01') // 23:40
  assert.equal(consumptionDay('2026-11-01T16:30:00Z'), '2026-11-01') // 00:30
  assert.equal(consumptionDay('2026-11-01T21:59:59.999Z'), '2026-11-01')
  assert.equal(consumptionDay('2026-11-01T22:00:00Z'), '2026-11-02')
  const taps = [tap('late', Date.parse('2026-11-01T15:40:00Z')), tap('midnight', Date.parse('2026-11-01T16:30:00Z')), tap('morning', Date.parse('2026-11-01T22:00:00Z'))]
  assert.deepEqual(compute(taps, [event()]).visits.map(v => v.tap_count).sort(), [1, 2])
})

test('24/48/72 hour lower bounds are inclusive; same-time/after-TAP and beyond-window events are excluded', () => {
  for (const hours of [24, 48, 72]) {
    const exact = compute([tap()], [event('exact', anchor - hours * HOUR)])
    assert.equal(exact.candidates[0].matched_windows[`${hours}h`], true)
    const outside = compute([tap()], [event('outside', anchor - hours * HOUR - 1)])
    assert.equal(outside.candidates[0].matched_windows[`${hours}h`], false)
  }
  assert.equal(compute([tap()], [event('same', anchor), event('after', anchor + 1)]).visits.length, 0)
  // pg returns Date objects; do not lose milliseconds via Date.parse(Date).
  assert.equal(compute([tap()], [event('pg', anchor, { occurred_at: new Date(anchor) })]).visits.length, 0)
})

test('unresolved/conflicted/other-account events and global or other-venue opens cannot attribute a visit', () => {
  const excluded = [
    event('anonymous', undefined, { resolved_user_key: null }),
    event('conflict', undefined, { identity_state: 'integrity_error' }),
    event('other-user', undefined, { resolved_user_key: 'V' }),
    event('global', undefined, { raw: { event_name: 'beer_opened', product_id: 'A' } }),
    event('other-venue', undefined, { raw: { event_name: 'beer_opened', product_id: 'A', tenant_id: 'Y' } }),
  ]
  assert.equal(compute([tap()], excluded).visits.length, 0)
  assert.equal(compute([tap()], excluded).candidates[0].evidence.length, 0)
})

test('explicit beer/bar/search/activity opens qualify; feed uses immutable enrichment, not current catalog', () => {
  const rows = [
    { event_name: 'beer_opened', product_id: 'A', tenant_id: 'X' },
    { event_name: 'bar_opened', tenant_id: 'X' },
    { event_name: 'search_result_opened', result: { type: 'beer', product_id: 'A', tenant_id: 'X' } },
    { event_name: 'search_result_opened', result: { type: 'bar', tenant_id: 'X' } },
    { event_name: 'activity_opened', activity_id: 'activity', tenant_id: 'X' },
  ]
  for (const raw of rows) assert.equal(compute([tap()], [event('open', undefined, { raw })]).visits.length, 1)
  const opened = event('feed', undefined, { raw: { event_name: 'feed_item_opened' },
    enrichment: { tenant_id: 'X', product_id: 'A', mode: 'for_you', surface: 'home', away_city_at_creation: true } })
  assert.equal(compute([tap()], [opened]).visits[0].strongest_evidence.kind, 'beer_at_venue')
  assert.equal(compute([tap()], [event('activity', undefined, { raw: { event_name: 'search_result_opened', result: { type: 'activity', activity_id: 'activity' } } })]).visits.length, 0)
  assert.equal(compute([tap()], [event('activity', undefined, { raw: { event_name: 'activity_opened', activity_id: 'activity' } })]).visits.length, 0)
})

test('navigation and item impressions are auxiliary, never sufficient on their own', () => {
  const events = [
    event('nav', undefined, { raw: { event_name: 'map_navigation_clicked', tenant_id: 'X' } }),
    event('impression', undefined, { raw: { event_name: 'feed_item_impression' }, enrichment: { tenant_id: 'X', product_id: 'A' } }),
    event('shown', undefined, { raw: { event_name: 'feed_shown' }, enrichment: { tenant_id: 'X' } }),
  ]
  const result = compute([tap()], events)
  assert.equal(result.visits.length, 0)
  assert.equal(result.candidates[0].auxiliary.length, 2)
  assert.equal(compute([tap()], [...events, event()]).visits.length, 1)
})

test('a click between TAPs cannot manufacture an assisted visit already in progress', () => {
  const result = compute([tap(), tap('T2', anchor + 2 * HOUR)], [event('during', anchor + HOUR)])
  assert.equal(result.candidates.find(c => c.tap_venue_experience_id === 'T2').matched_windows['24h'], true)
  assert.equal(result.visits.length, 0)
  assert.equal(result.counts.venue_recording_groups, 1)
})

test('provisional drink identity matches only in the same venue and conflicting canonical IDs do not prove same beer', () => {
  const provisional = tap('T1', anchor, { product_id: null, provisional_drink_id: 'drink-A' })
  const opened = event('source', undefined, { raw: { event_name: 'beer_opened', source_drink_id: 'drink-A', tenant_id: 'X' } })
  assert.equal(compute([provisional], [opened]).visits[0].strongest_evidence.kind, 'beer_at_venue')
  const conflict = event('conflict', undefined, { raw: { ...opened.raw, product_id: 'B' } })
  assert.equal(compute([tap()], [conflict]).visits[0].strongest_evidence.kind, 'venue')
  assert.equal(compute([tap('future', anchor + 20 * HOUR)], [event()]).candidates.length, 0)
})
