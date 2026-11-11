import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { randomUUID } from 'node:crypto'
import { createServer } from '../src/server.js'
import { createSupabase } from '../src/supabase.js'
import { config } from './data.js'

test('identity failures log fixed stages and SQLSTATE without personal/error content', async t => {
  for (const failure of ['auth', 'insert', 'commit']) await t.test(failure, async () => {
    const logs = [], queries = []
    const client = { release() {}, async query(sql) {
      queries.push(sql)
      if ((failure === 'insert' && sql.startsWith('INSERT INTO ci.identity_operations')) || (failure === 'commit' && sql === 'COMMIT')) {
        throw Object.assign(new Error('private-token private-user SQL private-payload'), { code: '23514', detail: 'private-detail' })
      }
      return { rows: [], rowCount: 0 }
    } }
    const supabase = failure === 'auth'
      ? createSupabase({ supabaseUrl: 'https://source.invalid', supabaseAnonKey: 'private-key' }, async () => new Response('{}', { status: 503 }))
      : { authorize: async () => ({ user_key: 'private-user' }) }
    const server = createServer({ pool: { connect: async () => client }, config, supabase, log: value => logs.push(value) })
    server.listen(0, '127.0.0.1'); await once(server, 'listening')
    try {
      const operation = { operation_id: randomUUID(), installation_id: randomUUID(), session_id: randomUUID(), action: 'link',
        occurred_at: new Date().toISOString(), session_started_at: new Date(Date.now() - 1000).toISOString() }
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/analytics/v1/identity-operations`, {
        method: 'POST', headers: { Authorization: 'Bearer private-token', 'Content-Type': 'application/json' }, body: JSON.stringify(operation),
      })
      const body = await response.json()
      assert.equal(response.status, 503)
      assert.equal(body.retryable, true)
      const entry = logs.at(-1)
      assert.equal(entry.requestId, body.requestId)
      assert.equal(entry.failure.stage, failure === 'auth' ? 'authorize' : `identity_${failure}`)
      if (failure === 'auth') {
        assert.equal(entry.failure.error_code, 'AUTH_UNAVAILABLE')
        assert.equal(entry.failure.upstream_phase, 'http_status')
        assert.equal(entry.failure.upstream_status, 503)
      } else {
        assert.equal(entry.failure.sqlstate, '23514')
        assert.ok(queries.includes('ROLLBACK'))
      }
      const serialized = JSON.stringify({ logs, body })
      for (const secret of ['private-', operation.operation_id, operation.installation_id, operation.session_id]) assert.ok(!serialized.includes(secret))
    } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
  })
})
