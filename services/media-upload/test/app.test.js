import assert from 'node:assert/strict'
import test from 'node:test'
import { once } from 'node:events'
import { createMediaUploadServer } from '../src/app.js'

const tenantId = '1cff208a-1234-4abc-8def-1234567890ab'
const config = {
  ossCdnBaseUrl: 'https://img.nomenuapp.com',
  uploadUrlTtlSeconds: 300,
  corsOrigins: new Set(['https://nomenuapp.com']),
}

async function withServer(dependencies, run) {
  const server = createMediaUploadServer({ config, logger: { error() {} }, ...dependencies })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  try {
    const address = server.address()
    await run(`http://127.0.0.1:${address.port}`)
  } finally {
    server.close()
    await once(server, 'close')
  }
}

test('authorizes tenant and returns PUT/CDN URLs', async () => {
  let authorized
  await withServer({
    authorizeTenant: async (token, requestedTenant) => { authorized = [token, requestedTenant] },
    signPutUrl: async () => 'https://bucket.oss-cn-shanghai.aliyuncs.com/signed',
  }, async (baseUrl) => {
    const objectPath = `${tenantId}/cover/store.webp`
    const response = await fetch(`${baseUrl}/api/media/upload-url`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer access-token',
        'Content-Type': 'application/json',
        Origin: 'https://nomenuapp.com',
      },
      body: JSON.stringify({ tenantId, objectPath, contentType: 'image/webp', contentLength: 100 }),
    })
    assert.equal(response.status, 200)
    assert.deepEqual(authorized, ['access-token', tenantId])
    assert.deepEqual(await response.json(), {
      uploadUrl: 'https://bucket.oss-cn-shanghai.aliyuncs.com/signed',
      cdnUrl: `https://img.nomenuapp.com/${objectPath}`,
      objectPath,
      expiresIn: 300,
      requiredHeaders: { 'Content-Type': 'image/webp' },
    })
  })
})

test('rejects unapproved browser origins before authorization', async () => {
  let called = false
  await withServer({
    authorizeTenant: async () => { called = true },
    signPutUrl: async () => 'unused',
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/media/upload-url`, {
      method: 'POST',
      headers: { Authorization: 'Bearer token', Origin: 'https://evil.example' },
      body: '{}',
    })
    assert.equal(response.status, 403)
    assert.equal(called, false)
  })
})

test('serves the public health check path', async () => {
  await withServer({
    authorizeTenant: async () => {},
    signPutUrl: async () => 'unused',
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/media/healthz`)
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { ok: true })
  })
})

test('promotes a product image after admin authorization and persists its CDN URL', async () => {
  const calls = []
  await withServer({
    authorizeTenant: async () => {},
    signPutUrl: async () => 'unused',
    authorizeProductAdmin: async (token) => { calls.push(['authorize', token]) },
    promoteProductImage: async (input) => {
      calls.push(['promote', input])
      return {
        objectPath: `prod/products/${tenantId}/upload.jpg`,
        cdnUrl: `https://img.nomenuapp.com/prod/products/${tenantId}/upload.jpg`,
      }
    },
    setProductImage: async (...args) => { calls.push(['persist', ...args]) },
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/media/promote-product-image`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer access-token',
        'Content-Type': 'application/json',
        Origin: 'https://nomenuapp.com',
      },
      body: JSON.stringify({
        productId: tenantId,
        sourceImageUrl: 'https://img.nomenuapp.com/prod/tenants/a/drinks/b/source.jpg',
      }),
    })
    assert.equal(response.status, 200)
    assert.equal(calls[0][0], 'authorize')
    assert.equal(calls[1][0], 'promote')
    assert.equal(calls[2][0], 'persist')
    assert.equal(calls[2][2], tenantId)
  })
})

test('promotes a tenant cover after admin authorization and persists its CDN URL', async () => {
  const calls = []
  await withServer({
    authorizeTenant: async () => {},
    signPutUrl: async () => 'unused',
    authorizeProductAdmin: async (token) => { calls.push(['authorize', token]) },
    promoteTenantCover: async (input) => {
      calls.push(['promote', input])
      return {
        objectPath: `prod/tenants/${tenantId}/covers/upload.jpg`,
        cdnUrl: `https://img.nomenuapp.com/prod/tenants/${tenantId}/covers/upload.jpg`,
      }
    },
    setTenantCover: async (...args) => { calls.push(['persist', ...args]) },
  }, async (baseUrl) => {
    const sourceImageUrl = `https://project.supabase.co/storage/v1/object/public/taplist-media/${tenantId}/cover/source.jpg`
    const response = await fetch(`${baseUrl}/api/media/promote-tenant-cover`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer access-token',
        'Content-Type': 'application/json',
        Origin: 'https://nomenuapp.com',
      },
      body: JSON.stringify({ tenantId, sourceImageUrl }),
    })
    assert.equal(response.status, 200)
    assert.deepEqual(calls.map((call) => call[0]), ['authorize', 'promote', 'persist'])
    assert.equal(calls[2][2], tenantId)
  })
})
