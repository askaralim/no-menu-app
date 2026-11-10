import { canonical, fail, ms } from './core.js'

// Admission/authentication is deliberately NOT simulated. Tests supply trusted
// records from a hypothetical validated admission boundary; raw wire operations
// cannot establish identity simply by asserting a user or a timestamp.
export function reconcileIdentity(records) {
  const operations = new Map()
  for (const record of records) {
    if (record.trusted !== true || !record.subject || !Number.isFinite(ms(record.effective_at))) fail('UNTRUSTED_OPERATION')
    const { operation, subject, effective_at } = record
    if (ms(effective_at) < ms(operation.session_started_at)) fail('INVALID_EFFECTIVE_TIME')
    const fingerprint = canonical({ operation, subject, effective_at })
    const old = operations.get(operation.operation_id)
    if (old && old.fingerprint !== fingerprint) fail('OPERATION_ID_CONFLICT', 409)
    operations.set(operation.operation_id, { ...record, fingerprint })
  }
  const groups = new Map()
  for (const record of operations.values()) {
    const key = canonical([record.operation.installation_id, record.operation.session_id])
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(record)
  }
  const intervals = []
  const conflicts = []
  for (const [key, group] of groups) {
    // A session is never reusable by another account. Rotating it is a producer
    // invariant; quarantining violations is safer than choosing an arrival order.
    const subjects = new Set(group.map(r => r.subject))
    const starts = new Set(group.map(r => r.operation.session_started_at))
    if (subjects.size !== 1 || starts.size !== 1) { conflicts.push(key); continue }
    const links = group.filter(r => r.operation.action === 'link')
    const closes = group.filter(r => r.operation.action === 'unlink')
    if (!links.length) continue // close-only tombstone remains in source operations
    const from = Math.min(...links.map(r => ms(r.effective_at)))
    const until = closes.length ? Math.min(...closes.map(r => ms(r.effective_at))) : null
    if (until !== null && links.some(r => ms(r.effective_at) >= until)) { conflicts.push(key); continue }
    intervals.push({ key, subject: group[0].subject, from, until })
  }
  return { intervals: intervals.sort((a, b) => a.key.localeCompare(b.key)), conflicts: conflicts.sort() }
}

export function resolveIdentity(model, installation, event) {
  const key = canonical([installation, event.session_id])
  if (model.conflicts.includes(key)) return { identity_state: 'integrity_error', user_key: null }
  const time = ms(event.occurred_at)
  const matches = model.intervals.filter(r => r.key === key && r.from <= time && (r.until === null || time < r.until))
  if (matches.length > 1) return { identity_state: 'integrity_error', user_key: null }
  return matches.length ? { identity_state: 'resolved', user_key: matches[0].subject } : { identity_state: 'unresolved', user_key: null }
}
