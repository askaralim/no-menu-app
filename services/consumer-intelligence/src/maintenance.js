import { randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { createPool, transaction } from './db.js'
import { loadConfig } from './config.js'
import { DAY, digest, iso } from './model.js'
import { userKey } from './supabase.js'
import { withoutSubjects } from './privacy.js'
import { fail, ServiceError } from './errors.js'

export const EVENT_RETENTION_DAYS = 90
const count = async (client, sql, params = []) => Number((await client.query(sql, params)).rows[0].n)

// Operator-only commands. Default is a preview; no scheduler or runtime role
// gains DELETE privileges. Reports contain counts, never user/event payloads.
export async function pruneData(pool, { apply = false, now = Date.now() } = {}) {
  return transaction(pool, async client => {
    const cutoff = iso(now - EVENT_RETENTION_DAYS * DAY), at = iso(now)
    const counts = {
      events: await count(client, 'SELECT count(*) AS n FROM ci.events WHERE received_at<=$1', [cutoff]),
      receipts: await count(client, 'SELECT count(*) AS n FROM ci.event_receipts WHERE received_at<=$1', [cutoff]),
      instances: await count(client, 'SELECT count(*) AS n FROM ci.feed_instances WHERE retention_until<=$1', [at]),
    }
    if (apply) {
      await client.query('DELETE FROM ci.events WHERE received_at<=$1', [cutoff])
      await client.query('DELETE FROM ci.event_receipts WHERE received_at<=$1', [cutoff])
      await client.query('DELETE FROM ci.feed_instances WHERE retention_until<=$1', [at])
      // The worker rebuilds this private projection from retained evidence.
      // Do not leave removed evidence embedded in an apparently current result.
      if (counts.events) await client.query('DELETE FROM ci.assisted_visit_projection')
    }
    return { command: 'retention', applied: apply, event_retention_days: EVENT_RETENTION_DAYS,
      received_at_cutoff: cutoff, counts, assisted_projection_invalidated: apply && counts.events > 0 }
  }, 'READ COMMITTED', true)
}

export async function eraseUser(pool, user, { apply = false, now = Date.now() } = {}) {
  if (typeof user !== 'string' || !user) fail(400, 'INVALID_ERASURE_SUBJECT')
  return transaction(pool, async client => {
    // Scope by exact session, never the whole installation: another account on
    // the same device must survive. Include unresolved rows in known sessions.
    await client.query(`CREATE TEMP TABLE erasure_sessions ON COMMIT DROP AS
      SELECT installation_id,session_id FROM ci.analytics_sessions WHERE owner_user_key=$1
      UNION SELECT installation_id,session_id FROM ci.identity_operations WHERE user_key=$1
      UNION SELECT installation_id,session_id FROM ci.events WHERE resolved_user_key=$1
      UNION SELECT (payload->>'analytics_installation_id')::uuid,(payload->>'analytics_session_id')::uuid
        FROM ci.feed_instances WHERE payload->>'owner_user_key'=$1 AND payload->>'analytics_installation_id' IS NOT NULL`, [user])
    const ambiguous = await count(client, `SELECT count(*) AS n FROM (
      SELECT 1 FROM ci.analytics_sessions a JOIN erasure_sessions s USING(installation_id,session_id)
        WHERE a.owner_user_key<>$1 OR a.integrity_error
      UNION ALL SELECT 1 FROM ci.identity_operations a JOIN erasure_sessions s USING(installation_id,session_id) WHERE a.user_key<>$1
      UNION ALL SELECT 1 FROM ci.events a JOIN erasure_sessions s USING(installation_id,session_id) WHERE a.resolved_user_key<>$1
      UNION ALL SELECT 1 FROM ci.feed_instances a JOIN erasure_sessions s
        ON a.payload->>'analytics_installation_id'=s.installation_id::text AND a.payload->>'analytics_session_id'=s.session_id::text
        WHERE a.payload->>'owner_user_key'<>$1
    ) conflicts`, [user])
    if (ambiguous) fail(409, 'ERASURE_AMBIGUOUS_SESSION')
    await client.query(`CREATE TEMP TABLE erasure_events ON COMMIT DROP AS
      SELECT e.event_id FROM ci.events e WHERE e.resolved_user_key=$1 OR EXISTS
      (SELECT 1 FROM erasure_sessions s WHERE s.installation_id=e.installation_id AND s.session_id=e.session_id)`, [user])
    const consumer = (await client.query("SELECT payload FROM ci.projections WHERE scope='consumer'")).rows[0]?.payload
    const filtered = consumer ? withoutSubjects(consumer, new Set([user])) : null
    const counts = {
      sessions: await count(client, 'SELECT count(*) AS n FROM erasure_sessions'),
      events: await count(client, 'SELECT count(*) AS n FROM erasure_events'),
      receipts: await count(client, `SELECT count(*) AS n FROM ci.event_receipts r WHERE r.event_id IN(SELECT event_id FROM erasure_events)
        OR EXISTS(SELECT 1 FROM erasure_sessions s WHERE s.installation_id=r.installation_id AND s.session_id=r.session_id)`),
      identity_operations: await count(client, `SELECT count(*) AS n FROM ci.identity_operations a WHERE a.user_key=$1 OR EXISTS
        (SELECT 1 FROM erasure_sessions s WHERE s.installation_id=a.installation_id AND s.session_id=a.session_id)`, [user]),
      instances: await count(client, `SELECT count(*) AS n FROM ci.feed_instances a WHERE a.payload->>'owner_user_key'=$1 OR EXISTS
        (SELECT 1 FROM erasure_sessions s WHERE a.payload->>'analytics_installation_id'=s.installation_id::text AND a.payload->>'analytics_session_id'=s.session_id::text)`, [user]),
      snapshots: await count(client, 'SELECT count(*) AS n FROM ci.feed_snapshots WHERE user_key=$1', [user]),
      refresh_requests: await count(client, 'SELECT count(*) AS n FROM ci.refresh_requests WHERE user_key=$1', [user]),
      consumer_rows: consumer ? Object.keys(consumer).reduce((n, k) => n + consumer[k].length - filtered[k].length, 0) : 0,
    }
    if (apply) {
      await client.query('INSERT INTO ci.erased_subjects(user_key,erased_at) VALUES($1,$2) ON CONFLICT DO NOTHING', [user, iso(now)])
      await client.query('INSERT INTO ci.erased_sessions SELECT installation_id,session_id,$1::timestamptz FROM erasure_sessions ON CONFLICT DO NOTHING', [iso(now)])
      await client.query(`DELETE FROM ci.event_receipts r WHERE r.event_id IN(SELECT event_id FROM erasure_events)
        OR EXISTS(SELECT 1 FROM erasure_sessions s WHERE s.installation_id=r.installation_id AND s.session_id=r.session_id)`)
      await client.query('DELETE FROM ci.events WHERE event_id IN(SELECT event_id FROM erasure_events)')
      await client.query(`DELETE FROM ci.identity_operations a WHERE a.user_key=$1 OR EXISTS
        (SELECT 1 FROM erasure_sessions s WHERE s.installation_id=a.installation_id AND s.session_id=a.session_id)`, [user])
      await client.query(`DELETE FROM ci.analytics_sessions a USING erasure_sessions s
        WHERE s.installation_id=a.installation_id AND s.session_id=a.session_id`)
      await client.query(`DELETE FROM ci.feed_instances a WHERE a.payload->>'owner_user_key'=$1 OR EXISTS
        (SELECT 1 FROM erasure_sessions s WHERE a.payload->>'analytics_installation_id'=s.installation_id::text AND a.payload->>'analytics_session_id'=s.session_id::text)`, [user])
      await client.query('DELETE FROM ci.feed_snapshots WHERE user_key=$1', [user])
      await client.query('UPDATE ci.e1_policy SET cohort=array_remove(cohort,$1) WHERE $1=ANY(cohort)', [user])
      await client.query('DELETE FROM ci.e1_refresh_intents WHERE user_key=$1', [user])
      await client.query('DELETE FROM ci.refresh_requests WHERE user_key=$1', [user])
      if (filtered) await client.query(`UPDATE ci.projections SET payload=$1,digest=$2,generation=$3,published_at=$4 WHERE scope='consumer'`,
        [filtered, digest(filtered), randomUUID(), iso(now)])
      await client.query('DELETE FROM ci.assisted_visit_projection')
    }
    return { command: 'erase-user', applied: apply, counts, assisted_projection_invalidated: apply }
  }, 'READ COMMITTED', true)
}

export function parseMaintenanceArgs(args) {
  const [command, ...flags] = args
  if (!['retention', 'erase-user'].includes(command) || flags.some(f => f !== '--apply') || flags.length > 1) {
    throw new Error('Usage: maintenance.js retention|erase-user [--apply]; erase-user reads CI_ERASE_USER_ID')
  }
  return { command, apply: flags.includes('--apply') }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let pool
  try {
    const options = parseMaintenanceArgs(process.argv.slice(2)), config = loadConfig()
    const id = process.env.CI_ERASE_USER_ID
    if (options.command === 'erase-user' && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id ?? '')) fail(400, 'INVALID_ERASURE_SUBJECT')
    pool = createPool(config)
    const report = options.command === 'retention' ? await pruneData(pool, options) : await eraseUser(pool, userKey(id, config.userKeySecret), options)
    console.log(JSON.stringify(report))
  } catch (error) {
    // SQL errors can contain values/connection details; only intentional codes
    // are safe to print. Uncertain commits are retried with the same subject.
    console.error(JSON.stringify({ code: error instanceof ServiceError ? error.code : 'MAINTENANCE_FAILED' }))
    process.exitCode = 1
  } finally { if (pool) await pool.end() }
}
