import assert from 'node:assert/strict'
import test from 'node:test'
import { createSupabaseAuthorizer, createSupabaseProductService } from '../src/supabase-auth.js'

const tenantId = '00000000-0000-0000-0000-000000000001'
const config = {
  supabaseUrl: 'https://project.supabase.co',
  supabaseAnonKey: 'anon-key',
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

test('authorizes a directly assigned tenant through get_my_tenants', async () => {
  const urls = []
  const authorize = createSupabaseAuthorizer(config, async (url) => {
    urls.push(url)
    if (url.endsWith('/auth/v1/user')) return jsonResponse({ id: 'user-id' })
    return jsonResponse([{ tenant_id: tenantId, role: 'owner' }])
  })

  assert.deepEqual(await authorize('token', tenantId), { userId: 'user-id' })
  assert.equal(urls.length, 2)
})

test('uses taplist_can_view_tenant for a platform super admin', async () => {
  const calls = []
  const authorize = createSupabaseAuthorizer(config, async (url, options = {}) => {
    calls.push([url, options])
    if (url.endsWith('/auth/v1/user')) return jsonResponse({ id: 'admin-id' })
    if (url.endsWith('/rpc/get_my_tenants')) return jsonResponse([])
    return jsonResponse(true)
  })

  assert.deepEqual(await authorize('token', tenantId), { userId: 'admin-id' })
  assert.equal(calls.length, 3)
  assert.equal(calls[2][0].endsWith('/rpc/taplist_can_view_tenant'), true)
  assert.equal(calls[2][1].body, JSON.stringify({ p_tenant_id: tenantId }))
})

test('rejects when neither membership nor the authorization helper allows access', async () => {
  const authorize = createSupabaseAuthorizer(config, async (url) => {
    if (url.endsWith('/auth/v1/user')) return jsonResponse({ id: 'user-id' })
    if (url.endsWith('/rpc/get_my_tenants')) return jsonResponse([])
    return jsonResponse(false)
  })

  await assert.rejects(() => authorize('token', tenantId), /没有该门店/)
})

test('authorizes a product admin and persists the canonical product image URL', async () => {
  const calls = []
  const productService = createSupabaseProductService(config, async (url, options = {}) => {
    calls.push([url, options])
    if (url.endsWith('/rpc/is_super_admin')) return jsonResponse(true)
    return jsonResponse({ ok: true })
  })
  const imageUrl = `https://img.nomenuapp.com/prod/products/${tenantId}/upload.jpg`

  await productService.authorizeAdmin('token')
  await productService.setProductImage('token', tenantId, imageUrl)

  assert.equal(calls.length, 2)
  assert.equal(calls[1][1].body, JSON.stringify({ p_product_id: tenantId, p_image_url: imageUrl }))
})
