import pg from 'pg'

export function createPool(config) {
  const pool = new pg.Pool({ connectionString: config.databaseUrl, ssl: config.databaseSsl, max: config.poolMax,
    connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000, statement_timeout: 10000,
    idle_in_transaction_session_timeout: 15000, application_name: 'nomenu-consumer-intelligence' })
  pool.on('error', () => console.error(JSON.stringify({ level: 'error', code: 'DATABASE_POOL_ERROR' })))
  return pool
}
// pg-pool removes its idle error listener on checkout. Keep ownership until
// release; never release in the event handler while a query/callback is running.
export function watchConnection(client, scope, log = entry => console.error(JSON.stringify(entry))) {
  let lost, phase = 'acquire'
  function record(error) {
    if (lost) return
    lost = Object.assign(new Error('Database connection lost'), { code: 'DATABASE_CONNECTION_LOST' })
    log({ level: 'error', event: 'database_connection_lost', code: lost.code, scope, phase,
      ...(typeof error.code === 'string' && /^[0-9A-Z]{5}$/.test(error.code) && { sqlstate: error.code }) })
  }
  // Some isolated SQL interception tests supply only query/release.
  client.on?.('error', record)
  return {
    setPhase(value) { phase = value },
    check() { if (lost) throw lost },
    get lost() { return Boolean(lost) },
    record,
    release(discard) {
      client.removeListener?.('error', record)
      client.release(Boolean(discard || lost))
    }
  }
}
export async function transaction(pool, fn, isolation = 'READ COMMITTED', maintenance = false) {
  pool.checkWorkerLease?.()
  const client = await pool.connect()
  const connection = watchConnection(client, 'transaction')
  let failed = false, locked = false
  const suffix = maintenance ? '' : '_shared'
  try {
    // Session lock BEFORE BEGIN: a waiting REPEATABLE READ transaction must
    // establish its snapshot after erasure, never before it. Normal work shares
    // the lock; maintenance alone takes it exclusively. No network calls here.
    connection.setPhase('maintenance_lock')
    await client.query(`SELECT pg_advisory_lock${suffix}(hashtextextended('ci:data-maintenance',0))`)
    locked = true
    connection.setPhase('begin')
    await client.query(`BEGIN ISOLATION LEVEL ${isolation === 'REPEATABLE READ' ? 'REPEATABLE READ' : 'READ COMMITTED'}`)
    connection.setPhase('work')
    const result = await fn(client)
    connection.check()
    pool.checkWorkerLease?.() // never submit a new COMMIT once the worker knows it lost ownership
    connection.setPhase('commit')
    await client.query('COMMIT') // uncertain outcome must throw; caller must not acknowledge
    return result
  } catch (error) {
    failed = true
    // A backend killed during an active query may reject before socket 'error'.
    if (/^(08...|57P0[123]|ECONNRESET|EPIPE)$/.test(error.code)) connection.record(error)
    connection.check()
    connection.setPhase('rollback')
    try { await client.query('ROLLBACK') } catch { /* discard the connection */ }
    throw error
  } finally {
    if (locked && !connection.lost) {
      connection.setPhase('unlock')
      try { await client.query(`SELECT pg_advisory_unlock${suffix}(hashtextextended('ci:data-maintenance',0))`) }
      catch { failed = true }
    }
    connection.release(failed)
  }
}
export async function lock(client, key) {
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [key])
}
