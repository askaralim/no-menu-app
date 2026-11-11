import { assertNotErased } from './privacy.js'
import { transaction, lock } from './db.js'
import { assertSchema } from './schema.js'
import { assertEventTime, digest, iso } from './model.js'
import { fail } from './errors.js'

// IDs supplied by a device are correlation keys, not authentication proof.
// The earliest independently authenticated server observation is the lower
// bound. We deliberately do not attribute pre-observation anonymous events.
export async function bindSession(client, installation, session, user, now) {
  await assertNotErased(client, user, installation, session)
  await lock(client, `session:${installation}:${session}`)
  const prior = (await client.query('SELECT * FROM ci.analytics_sessions WHERE installation_id=$1 AND session_id=$2', [installation, session])).rows[0]
  if (!prior) {
    await client.query('INSERT INTO ci.analytics_sessions(installation_id,session_id,owner_user_key,authenticated_at) VALUES($1,$2,$3,$4)', [installation, session, user, iso(now)])
    return true
  }
  if (prior.owner_user_key !== user || prior.integrity_error) {
    await client.query('UPDATE ci.analytics_sessions SET integrity_error=true WHERE installation_id=$1 AND session_id=$2', [installation, session])
    return false
  }
  return true
}
export async function identityContext(client, installation, session) {
  const binding = (await client.query('SELECT * FROM ci.analytics_sessions WHERE installation_id=$1 AND session_id=$2', [installation, session])).rows[0]
  const records = (await client.query('SELECT payload,user_key FROM ci.identity_operations WHERE installation_id=$1 AND session_id=$2', [installation, session])).rows
  const subjects = new Set(records.map(r => r.user_key)), starts = new Set(records.map(r => Date.parse(r.payload.session_started_at)))
  const links = records.filter(r => r.payload.action === 'link'), closes = records.filter(r => r.payload.action === 'unlink')
  const from = binding && links.length ? Math.max(new Date(binding.authenticated_at).getTime(), Math.min(...links.map(r => Date.parse(r.payload.occurred_at)))) : null
  const until = closes.length ? Math.min(...closes.map(r => Date.parse(r.payload.occurred_at))) : null
  const bad = binding?.integrity_error || subjects.size > 1 || starts.size > 1 || (until !== null && links.some(r => Date.parse(r.payload.occurred_at) >= until))
  return { binding, bad, from, until, start: starts.size === 1 ? [...starts][0] : null }
}
export function resolveIdentity(context, event) {
  if (context.bad || (context.start !== null && context.start !== Date.parse(event.session_started_at))) return { identity_state: 'integrity_error', user_key: null }
  const time = Date.parse(event.occurred_at)
  if (context.from !== null && time >= context.from && (context.until === null || time < context.until)) return { identity_state: 'resolved', user_key: context.binding.owner_user_key }
  return { identity_state: 'unresolved', user_key: null }
}
export async function reconcileSession(client, installation, session) {
  const context = await identityContext(client, installation, session)
  const rows = (await client.query('SELECT event_id,raw FROM ci.events WHERE installation_id=$1 AND session_id=$2', [installation, session])).rows
  for (const row of rows) {
    const identity = resolveIdentity(context, row.raw)
    // Never touch raw events or historical home/away-city enrichment here.
    await client.query('UPDATE ci.events SET resolved_user_key=$2,identity_state=$3 WHERE event_id=$1', [row.event_id, identity.user_key, identity.identity_state])
  }
}
export async function acceptIdentity(pool, operation, user, now = Date.now(), onStage = () => {}) {
  assertSchema('identity/operation.schema.json', operation, 'INVALID_IDENTITY_OPERATION')
  onStage('identity_acquire')
  return transaction(pool, async client => {
    onStage('identity_erasure_check')
    await assertNotErased(client, user, operation.installation_id, operation.session_id)
    onStage('identity_operation_lock')
    await lock(client, `operation:${operation.operation_id}`)
    const fingerprint = digest({ operation, user })
    onStage('identity_duplicate_check')
    const prior = (await client.query('SELECT fingerprint FROM ci.identity_operations WHERE operation_id=$1', [operation.operation_id])).rows[0]
    if (prior) {
      if (prior.fingerprint !== fingerprint) fail(409, 'OPERATION_ID_CONFLICT')
      return { operation_id: operation.operation_id, status: 'duplicate' }
    }
    assertEventTime(operation, now)
    onStage('identity_bind_session')
    await bindSession(client, operation.installation_id, operation.session_id, user, now)
    onStage('identity_insert')
    await client.query(`INSERT INTO ci.identity_operations(operation_id,installation_id,session_id,user_key,fingerprint,received_at,payload)
      VALUES($1,$2,$3,$4,$5,$6,$7)`, [operation.operation_id, operation.installation_id, operation.session_id, user, fingerprint, iso(now), operation])
    onStage('identity_reconcile')
    await reconcileSession(client, operation.installation_id, operation.session_id)
    onStage('identity_commit')
    return { operation_id: operation.operation_id, status: 'accepted' }
  })
}
