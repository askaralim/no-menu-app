import test from 'node:test'
import assert from 'node:assert/strict'
import { fixture } from './validation.js'
import { reconcileIdentity, resolveIdentity } from './reference/identity.js'

const id = n => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`
const original = fixture('identity link')
function operation(n, action, time, subject = 'A', session = original.session_id) {
  return { trusted: true, subject, effective_at: time, received_at: '2026-11-01T10:00:00Z', operation: { ...original, operation_id: id(n), action, session_id: session, occurred_at: time } }
}
function permutations(items) {
  if (!items.length) return [[]]
  return items.flatMap((item, i) => permutations(items.filter((_, j) => j !== i)).map(rest => [item, ...rest]))
}
const link = operation(20, 'link', '2026-10-31T09:00:00Z')
const unlink = operation(21, 'unlink', '2026-10-31T10:00:00Z')
const event = { ...fixture('beer_opened'), occurred_at: '2026-10-31T09:30:00Z' }
const resolve = (records, e = event) => resolveIdentity(reconcileIdentity(records), original.installation_id, e)

test('property: 120 permutations of the same trusted operations converge', () => {
  const records = [link, unlink, operation(22, 'link', '2026-10-31T10:10:00Z', 'B', id(30)), operation(23, 'unlink', '2026-10-31T10:40:00Z', 'B', id(30)), operation(24, 'unlink', '2026-10-31T09:20:00Z', 'C', id(31))]
  const expected = reconcileIdentity(records)
  const orders = permutations(records)
  assert.equal(orders.length, 120)
  for (const order of orders) {
    assert.deepEqual(reconcileIdentity(order), expected)
    assert.deepEqual(resolve(order), { identity_state: 'resolved', user_key: 'A' })
  }
})

test('event before link is unresolved, then reconciles identically to link before event', () => {
  assert.deepEqual(resolve([]), { identity_state: 'unresolved', user_key: null })
  assert.deepEqual(resolve([link]), resolve([link, { ...link, received_at: '2026-11-02T10:00:00Z' }]))
  assert.equal(resolve([link]).user_key, 'A')
})

test('unlink-before-link retains closing boundary and delayed event resolves correctly', () => {
  assert.equal(resolve([unlink]).user_key, null)
  assert.deepEqual(resolve([unlink, link]), resolve([link, unlink]))
  assert.equal(resolve([unlink, link]).user_key, 'A')
  assert.equal(resolve([unlink, link], { ...event, occurred_at: unlink.effective_at }).user_key, null)
  assert.equal(resolve([unlink, link], { ...event, occurred_at: link.effective_at }).user_key, 'A')
})

test('account switch uses a different session; upload account cannot relabel A events', () => {
  const b = operation(25, 'link', '2026-10-31T10:10:00Z', 'B', id(30))
  assert.equal(resolve([link, unlink, b], { ...event, upload_user: 'B' }).user_key, 'A')
  assert.equal(resolve([link, unlink, b], { ...event, session_id: id(30), occurred_at: '2026-10-31T10:20:00Z' }).user_key, 'B')
})

test('same operation retry is idempotent; different content/subject/effective time conflicts', () => {
  assert.deepEqual(reconcileIdentity([link, link]), reconcileIdentity([link]))
  for (const changed of [{ ...link, subject: 'B' }, { ...link, effective_at: '2026-10-31T09:01:00Z' }, { ...link, operation: { ...link.operation, action: 'unlink' } }]) {
    assert.throws(() => reconcileIdentity([link, changed]), { code: 'OPERATION_ID_CONFLICT', status: 409 })
  }
})

test('overlapping authenticated identities quarantine the session in every order', () => {
  const other = operation(26, 'link', '2026-10-31T09:10:00Z', 'B')
  for (const order of permutations([link, unlink, other])) {
    assert.deepEqual(resolve(order), { identity_state: 'integrity_error', user_key: null })
  }
})

test('raw client operations/timestamps do not establish trusted identity', () => {
  assert.throws(() => reconcileIdentity([{ operation: original }]), { code: 'UNTRUSTED_OPERATION' })
  assert.throws(() => reconcileIdentity([{ ...link, trusted: false }]), { code: 'UNTRUSTED_OPERATION' })
  assert.throws(() => reconcileIdentity([{ ...link, effective_at: '2026-10-30T09:00:00Z' }]), { code: 'INVALID_EFFECTIVE_TIME' })
  assert.equal(resolve([link], { ...event, occurred_at: '2026-10-31T08:59:59Z' }).user_key, null)
})
