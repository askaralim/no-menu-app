import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { valid } from '../../src/schema.js'
import { reportOptions } from '../../src/campaign-report.js'

const campaign = { campaign_id: randomUUID(), visit_id: randomUUID(), entry_source: 'home_banner', environment: 'release' }
function event(extra = {}) {
  return { event_id: randomUUID(), event_name: 'campaign_interaction', schema_version: 1,
    occurred_at: new Date().toISOString(), session_id: randomUUID(), session_started_at: new Date().toISOString(),
    source: 'campaign', selected_city_code: null, campaign, action: 'purchase_handoff_result', result: 'success', ...extra }
}
test('campaign contract is bounded: no payment claim, coordinates, account ID or untyped payload', () => {
  assert.equal(valid('events/event.schema.json', event()), true)
  for (const extra of [{ action: 'purchase_success' }, { latitude: 31.2 }, { user_id: randomUUID() }, { properties: { phone: 'test' } },
    { result: undefined }, { campaign: { ...campaign, environment: 'production' } }, { error_code: 'raw server response' }]) {
    assert.equal(valid('events/event.schema.json', event(extra)), false)
  }
})
test('existing detail/navigation events accept optional campaign context; old payloads still work', () => {
  for (const [name, business] of [['activity_opened', { activity_id: campaign.campaign_id }],
    ['beer_opened', { tenant_id: randomUUID(), source_drink_id: randomUUID() }],
    ['map_navigation_clicked', { tenant_id: randomUUID(), provider: 'wechat' }]]) {
    const { action, result, ...payload } = event({ event_name: name, ...business })
    assert.equal(valid('events/event.schema.json', payload), true)
    delete payload.campaign
    assert.equal(valid('events/event.schema.json', payload), true)
  }
})
test('impressions require real visibility evidence; check-in repeats and revocations remain distinguishable', () => {
  assert.equal(valid('events/event.schema.json', event({ action: 'banner_impression' })), false)
  assert.equal(valid('events/event.schema.json', event({ action: 'banner_impression', visibility_threshold: 0.5, visible_duration_ms: 750 })), true)
  for (const result of ['success', 'failure', 'already_completed']) {
    assert.equal(valid('events/event.schema.json', event({ action: 'checkin_result', result, completed_count: 6, completion_id: randomUUID() })), true)
  }
})
test('report scope requires explicit campaign/time window and isolates release from trial', () => {
  const scope = { campaignId: campaign.campaign_id, from: '2026-11-13T00:00:00+08:00', until: '2026-11-27T00:00:00+08:00' }
  assert.equal(reportOptions(scope).environment, 'release')
  assert.equal(reportOptions({ ...scope, environment: 'trial' }).environment, 'trial')
  assert.throws(() => reportOptions({ ...scope, campaignId: 'all' }))
  assert.throws(() => reportOptions({ ...scope, until: scope.from }))
})
test('actual mini-program captured batches satisfy the production contract', { skip: !process.env.CI_CAMPAIGN_FIXTURES }, async () => {
  const batches = JSON.parse(await readFile(process.env.CI_CAMPAIGN_FIXTURES, 'utf8'))
  assert.ok(batches.flatMap(b => b.events).length >= 8)
  for (const batch of batches) {
    assert.equal(valid('events/batch.schema.json', batch), true)
    for (const event of batch.events) assert.equal(valid('events/event.schema.json', event), true, JSON.stringify(event))
  }
})
