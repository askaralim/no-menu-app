import { observeWorker } from './e1/routing.js'
import { createPool, watchConnection } from './db.js'
import { loadConfig } from './config.js'
import { createSupabase } from './supabase.js'
import { prepareExport, publishProjection, refreshV1Snapshots, refreshE1Snapshots } from './projections.js'
import { refreshAssistedVisits } from './assisted-visits.js'

export async function runWorker(pool, config, supabase, log = value => console.log(JSON.stringify(value))) {
  // Session advisory lock holds across remote fetches; overlapping cron runs
  // exit instead of racing generations. Always release it before pool reuse.
  const lease = await pool.connect()
  const connection = watchConnection(lease, 'worker_lease', log)
  const workPool = { connect: () => pool.connect(), checkWorkerLease: () => connection.check() }
  let locked = false
  try {
    connection.setPhase('worker_lock')
    locked = (await lease.query("SELECT pg_try_advisory_lock(hashtextextended('ci:worker',0)) AS locked")).rows[0].locked
    if (!locked) return { skipped: true }
    const failures = []
    connection.setPhase('policy')
    let aligned, policyFailed = false
    try { aligned = await observeWorker(workPool,config.e1) }
    catch (error) {
      policyFailed = true
      failures.push('e1_policy')
      log({event:'e1_worker_unavailable',code:error.code ?? 'PERSISTENCE_UNAVAILABLE'})
    }
    if (!aligned && !policyFailed) {
      log({event:'e1_worker_unavailable',code:'E1_POLICY_OR_ASSET_MISMATCH'})
      if (!config.e1 || config.e1.mode==='off') failures.push('e1_policy')
    }
    for (const scope of ['catalog', 'consumer']) {
      connection.check()
      connection.setPhase(scope)
      try {
        const projection = prepareExport(await supabase.export(scope), scope, config, Date.now())
        connection.check()
        const published = await publishProjection(workPool, projection)
        log({ event: 'projection_published', scope, source_as_of: projection.source_as_of,
          counts: published.counts })
      } catch (error) { failures.push(scope); log({ event: 'projection_failed', scope, code: error.code ?? 'SOURCE_UNAVAILABLE' }) }
    }
    const now = Date.now()
    let v1
    connection.check()
    connection.setPhase('v1')
    try {
      v1 = await refreshV1Snapshots(workPool, config, now)
      log({ event: 'snapshots_refreshed', generated: v1.generated })
    }
    catch (error) { failures.push('snapshots'); log({ event: 'snapshot_refresh_failed', code: error.code ?? 'PERSISTENCE_UNAVAILABLE' }) }
    connection.check()
    if (v1 && !policyFailed && config.e1 && config.e1.mode !== 'off') {
      connection.setPhase('e1')
      try {
        const e1 = await refreshE1Snapshots(workPool, config, now, v1)
        log({ event: 'e1_snapshots_refreshed', mode: config.e1.mode, generated: e1.generated })
      } catch (error) {
        failures.push('e1_snapshots')
        log({ event: 'e1_snapshot_refresh_failed', code: error.code ?? 'PERSISTENCE_UNAVAILABLE' })
      }
    }
    connection.check()
    connection.setPhase('assisted_visits')
    try { log({ event: 'assisted_visits_refreshed', ...await refreshAssistedVisits(workPool) }) }
    catch (error) { failures.push('assisted_visits'); log({ event: 'assisted_visit_refresh_failed', code: error.code ?? 'PERSISTENCE_UNAVAILABLE' }) }
    return { skipped: false, failures }
  } finally {
    let broken = false
    try {
      connection.check()
      connection.setPhase('unlock')
      if (locked) await lease.query("SELECT pg_advisory_unlock(hashtextextended('ci:worker',0))")
    }
    catch { broken = true }
    finally { connection.release(broken) }
    if (broken) throw Object.assign(new Error('Worker lease lost'), { code: 'WORKER_LEASE_LOST' })
  }
}
if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  const config = loadConfig(), pool = createPool(config)
  try { const result = await runWorker(pool, config, createSupabase(config)); if (result.failures?.length) process.exitCode = 1 }
  catch (error) { console.error(JSON.stringify({event:'worker_failed',code:error.code ?? 'PERSISTENCE_UNAVAILABLE'})); process.exitCode = 1 }
  finally { await pool.end() }
}
