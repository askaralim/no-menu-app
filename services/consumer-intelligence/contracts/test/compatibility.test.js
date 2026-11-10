import test from 'node:test'
import assert from 'node:assert/strict'
import { fixture, validate } from './validation.js'

// Minimal old-client reader: plain text only, no model/reason/style switch.
// Actual Swift/mini-program adapters are outside this contract-only delivery.
function oldClientView(response) {
  if (response.personalization?.status === 'cold_start') return { kind: 'cold_start', cards: [] }
  if (response.snapshot?.state === 'building') return { kind: 'building', cards: [] }
  return { kind: response.items.length ? 'list' : 'empty', cards: response.items.map(i => ({ name: i.beer_name, explanation: i.reason?.text ?? null })) }
}

test('old client renders unknown ranking/model/reason/style values and optional fields', () => {
  const input = fixture('future ranking and reason')
  input.snapshot.model_version = 'neural-future'
  input.items[0].style_family = 'new-server-taxonomy'
  const view = oldClientView(input)
  assert.equal(view.kind, 'list')
  assert.equal(view.cards[0].explanation, '和你喜欢的风格相近')
  assert.equal(validate('feed/response.schema.json', input).ok, true)
})

test('unknown empty reason uses generic empty state; null reason hides explanation', () => {
  assert.equal(oldClientView(fixture('future empty reason')).kind, 'empty')
  const input = fixture('for_you')
  input.items[0].reason = null
  assert.equal(oldClientView(input).cards[0].explanation, null)
  assert.equal(oldClientView(fixture('cold start')).kind, 'cold_start')
  assert.equal(oldClientView(fixture('building')).kind, 'building')
})
