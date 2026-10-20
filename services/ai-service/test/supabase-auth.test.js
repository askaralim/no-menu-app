import assert from 'node:assert/strict'
import test from 'node:test'
import { createSupabaseUserAuthorizer } from '../src/supabase-auth.js'

const config = {
  supabaseUrl: 'https://project.supabase.co',
  supabaseAnonKey: 'anon-key',
}

test('validates the user and venue membership, then caches the authorization', async () => {
  const requests = []
  const authorize = createSupabaseUserAuthorizer(config, async (url, options) => {
    requests.push({ url, options })
    if (url.endsWith('/rest/v1/rpc/get_my_tenants')) {
      return new Response(JSON.stringify([{ tenant_id: 'tenant-1', role: 'owner' }]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    return new Response(JSON.stringify({ id: 'user-1' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  })

  assert.deepEqual(await authorize('access-token'), { userId: 'user-1' })
  assert.deepEqual(await authorize('access-token'), { userId: 'user-1' })
  assert.equal(requests.length, 2)
  assert.equal(requests[0].url, 'https://project.supabase.co/auth/v1/user')
  assert.equal(requests[1].url, 'https://project.supabase.co/rest/v1/rpc/get_my_tenants')
  assert.equal(requests[1].options.headers.Authorization, 'Bearer access-token')
})

test('rejects an expired access token', async () => {
  const authorize = createSupabaseUserAuthorizer(config, async () => new Response('{}', { status: 401 }))
  await assert.rejects(
    () => authorize('expired'),
    (error) => error.code === 'unauthorized' && error.status === 401,
  )
})

test('rejects a current user without a manageable venue', async () => {
  const authorize = createSupabaseUserAuthorizer(config, async (url) => {
    const body = url.endsWith('/auth/v1/user') ? { id: 'user-1' } : []
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  })

  await assert.rejects(
    () => authorize('access-token'),
    (error) => error.code === 'forbidden' && error.status === 403,
  )
})

test('does not cache authorization beyond the JWT expiry', async () => {
  let currentTime = 1_000_000
  let requestCount = 0
  const token = `header.${Buffer.from(JSON.stringify({ exp: (currentTime + 1_000) / 1000 })).toString('base64url')}.signature`
  const authorize = createSupabaseUserAuthorizer(config, async (url) => {
    requestCount += 1
    const body = url.endsWith('/auth/v1/user') ? { id: 'user-1' } : [{ tenant_id: 'tenant-1' }]
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }, { now: () => currentTime })

  await authorize(token)
  currentTime += 1_001
  await authorize(token)
  assert.equal(requestCount, 4)
})
