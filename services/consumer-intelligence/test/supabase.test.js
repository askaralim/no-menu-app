import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createSupabase, userKey } from '../src/supabase.js'
import { config } from './data.js'

// Transport substitutes exercise our adapter, not Supabase's JWT verifier.
// No real keys, user data or production requests belong in this test suite.
const settings = { ...config, supabaseUrl: 'https://source.invalid', supabaseAnonKey: 'test-anon', serviceRoleKey: 'test-worker-secret' }
const claimsFor = id => ({ sub: id, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })
const tokenFor = claims => 'test.' + Buffer.from(JSON.stringify(claims)).toString('base64url') + '.signature'
const json = (value, status = 200) => new Response(JSON.stringify(value), { status })
const errorIs = (status, code) => error => {
  assert.equal(error.status, status)
  assert.equal(error.code, code)
  assert.equal(error.message, code)
  return true
}

test('Supabase adapter separates caller/anonymous RPC credentials from worker export credentials', async () => {
  const calls = [], id = randomUUID(), token = tokenFor(claimsFor(id))
  const client = createSupabase(settings, async (url, options) => {
    calls.push({ url, ...options })
    return json(url.endsWith('/auth/v1/user') ? { id } : {})
  })
  assert.equal((await client.authorize(token)).user_key, userKey(id, config.userKeySecret))
  await client.rpc('ci_patch_profile_v1', { p_patch: { home_city_code: null } }, token)
  await client.rpc('ci_get_cities_v1', {})
  await client.export('consumer')
  assert.deepEqual(calls.map(c => [c.url, c.method, c.headers.apikey, c.headers.Authorization]), [
    ['https://source.invalid/auth/v1/user', 'GET', 'test-anon', `Bearer ${token}`],
    ['https://source.invalid/rest/v1/rpc/ci_patch_profile_v1', 'POST', 'test-anon', `Bearer ${token}`],
    ['https://source.invalid/rest/v1/rpc/ci_get_cities_v1', 'POST', 'test-anon', 'Bearer test-anon'],
    ['https://source.invalid/rest/v1/rpc/intelligence_export_snapshot_v1', 'POST', 'test-worker-secret', 'Bearer test-worker-secret'],
  ])
  assert.equal(calls[0].body, undefined)
  assert.deepEqual(JSON.parse(calls[1].body), { p_patch: { home_city_code: null } })
  assert.deepEqual(JSON.parse(calls[3].body), { p_scope: 'consumer' })
  for (const call of calls) {
    assert.equal(call.redirect, 'error') // Never forward credentials to a redirected host.
    assert.ok(call.signal instanceof AbortSignal)
  }
})

test('missing worker key cannot silently fall back to anonymous export', async () => {
  let calls = 0
  const client = createSupabase({ ...settings, serviceRoleKey: null }, async () => { calls++; return json({}) })
  await assert.rejects(client.export('catalog'), errorIs(503, 'SOURCE_NOT_CONFIGURED'))
  assert.equal(calls, 0)
  await client.rpc('ci_get_cities_v1', {})
  assert.equal(calls, 1)
})

test('remote Auth rejection is authoritative; transport failures are not invalid-login responses', async () => {
  const token = tokenFor(claimsFor(randomUUID()))
  for (const status of [401, 403, 429, 500, 503]) {
    const client = createSupabase(settings, async () => json({ message: 'private upstream details' }, status))
    await assert.rejects(client.authorize(token), errorIs(status < 429 ? 401 : 503, status < 429 ? 'UNAUTHORIZED' : 'AUTH_UNAVAILABLE'))
  }
  const unavailable = createSupabase(settings, async () => { throw new Error('private host and credentials') })
  await assert.rejects(unavailable.authorize(token), errorIs(503, 'AUTH_UNAVAILABLE'))
  await assert.rejects(unavailable.export('catalog'), errorIs(503, 'SOURCE_UNAVAILABLE'))
})

test('timeout and response-body failures produce safe retryable upstream errors', async () => {
  const failures = [
    async () => { throw new DOMException('private timeout details', 'TimeoutError') },
    async () => new Response('<html>private gateway error</html>', { status: 502 }),
    async () => ({ ok: true, json: async () => { throw new DOMException('aborted body', 'AbortError') } }),
  ]
  for (const transport of failures) {
    const client = createSupabase(settings, transport)
    await assert.rejects(client.authorize('test'), errorIs(503, 'AUTH_UNAVAILABLE'))
    await assert.rejects(client.rpc('ci_get_profile_v1', {}, 'test'), errorIs(503, 'SOURCE_UNAVAILABLE'))
  }
})

test('verified Auth identity must agree with unexpired authenticated claims, including anonymous consumers', async () => {
  const id = randomUUID(), claims = claimsFor(id)
  const client = createSupabase(settings, async () => json({ id, is_anonymous: true }))
  const anonymous = tokenFor({ ...claims, is_anonymous: true })
  assert.equal((await client.authorize(anonymous)).user_key, userKey(id, config.userKeySecret))
  for (const changed of [
    { sub: randomUUID() }, { role: 'service_role' }, { role: 'anon' },
    { exp: 0 }, { exp: String(claims.exp) }, { exp: null },
  ]) await assert.rejects(client.authorize(tokenFor({ ...claims, ...changed })), errorIs(401, 'UNAUTHORIZED'))
  await assert.rejects(client.authorize('malformed'), errorIs(401, 'UNAUTHORIZED'))
  for (const response of [null, {}, { id: 'invalid' }]) {
    const broken = createSupabase(settings, async () => json(response))
    await assert.rejects(broken.authorize(tokenFor(claims)), errorIs(503, 'AUTH_UNAVAILABLE'))
  }
})

test('Profile maps only known business errors and never forwards arbitrary upstream messages', async () => {
  for (const code of ['USERNAME_TAKEN', 'USERNAME_INVALID', 'USERNAME_RESERVED', 'UNKNOWN_CITY', 'INVALID_PROFILE_PATCH']) {
    const client = createSupabase(settings, async () => json({ message: code, details: 'private database details' }, 400))
    await assert.rejects(client.rpc('ci_patch_profile_v1', { p_patch: {} }, 'test'), errorIs(code === 'USERNAME_TAKEN' ? 409 : 400, code))
  }
  const unknown = createSupabase(settings, async () => json({ message: 'connection postgres://private:secret@db failed' }, 500))
  await assert.rejects(unknown.rpc('ci_patch_profile_v1', { p_patch: {} }, 'test'), errorIs(503, 'SOURCE_UNAVAILABLE'))
})
