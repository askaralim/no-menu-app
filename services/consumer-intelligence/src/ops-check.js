import { createPool, transaction } from './db.js'
import { loadConfig } from './config.js'
import { MINUTE, iso } from './model.js'

export function projectionStatus(rows, now) {
  const projections = {}
  for (const scope of ['catalog', 'consumer']) {
    const row = rows.find(r => r.scope === scope)
    const timestamp = row ? new Date(row.source_as_of).getTime() : NaN
    const age = now - timestamp
    projections[scope] = {
      state: !Number.isFinite(timestamp) ? 'missing' : age < 0 ? 'future_timestamp' : age > 10 * MINUTE ? 'stale' : 'fresh',
      source_as_of: Number.isFinite(timestamp) ? iso(timestamp) : null,
      age_seconds: Number.isFinite(timestamp) ? Math.floor(age / 1000) : null,
    }
  }
  const latest = projections.catalog.state === 'fresh'
  return { projections, latest_available: latest, for_you_available: latest && projections.consumer.state === 'fresh' }
}

// Internal read-only command, not a public API and not a readiness replacement.
// No raw events, user IDs, instance IDs, database URL or tokens in its output.
export async function inspectOperations(pool, now = Date.now()) {
  return transaction(pool, async client => {
    await client.query('SET TRANSACTION READ ONLY')
    const version = await client.query("SELECT 1 FROM ci.schema_migrations WHERE version='005_e1_routing'")
    if (!version.rowCount) return { status: 'unavailable', code: 'SCHEMA_NOT_READY', checked_at: iso(now) }
    const rows = (await client.query('SELECT scope,source_as_of,published_at FROM ci.projections')).rows
    const state = projectionStatus(rows, now)
    const queue = (await client.query('SELECT count(*)::int AS pending,min(requested_at) AS oldest FROM ci.refresh_requests')).rows[0]
    const expired = (await client.query('SELECT count(*)::int AS expired FROM ci.feed_instances WHERE retention_until<=$1', [iso(now)])).rows[0].expired
    const pendingAge = queue.oldest ? Math.max(0, Math.floor((now - new Date(queue.oldest).getTime()) / 1000)) : null
    return {
      status: state.for_you_available ? 'ok' : 'degraded', checked_at: iso(now), ...state,
      refresh_queue: { pending: queue.pending, oldest_age_seconds: pendingAge, attention_required: pendingAge !== null && pendingAge > 600 },
      retention: { expired_feed_instances: expired, cleanup_enabled: false },
    }
  }, 'REPEATABLE READ')
}

export async function runOpsCheck(pool, log = report => console.log(JSON.stringify(report)), now = Date.now()) {
  try {
    const report = await inspectOperations(pool, now)
    log(report)
    return report.status === 'ok' ? 0 : report.status === 'degraded' ? 1 : 2
  } catch {
    // Do not dump driver errors: they can include connection details or SQL.
    log({ status: 'unavailable', code: 'OPS_CHECK_UNAVAILABLE', checked_at: iso(now) })
    return 2
  }
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  let pool
  try {
    pool = createPool(loadConfig())
    process.exitCode = await runOpsCheck(pool)
  } catch {
    console.error(JSON.stringify({ status: 'unavailable', code: 'OPS_CHECK_CONFIG_INVALID' }))
    process.exitCode = 2
  } finally { if (pool) await pool.end() }
}
