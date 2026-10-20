import assert from 'node:assert/strict'
import { once } from 'node:events'
import test from 'node:test'
import { createAiServiceServer } from '../src/app.js'

const config = {
  corsOrigins: new Set(['https://nomenuapp.com']),
  maxImageBytes: 5 * 1024 * 1024,
  maxTotalImageBytes: 15 * 1024 * 1024,
  maxImages: 5,
}

async function withServer(dependencies, run) {
  const logger = { info() {}, warn() {}, error() {} }
  const server = createAiServiceServer({ config, logger, ...dependencies })
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

test('authenticates and returns the stable product draft for a raw image', async () => {
  const calls = []
  await withServer({
    authorizeUser: async (token) => {
      calls.push(['authorize', token])
      return { userId: 'user-1' }
    },
    recognizeBeerLabels: async (images) => {
      calls.push(['recognize', images])
      return {
        items: [{
          image_order: 1,
          title: 'GREENHOUSE',
          style_cn: null,
          style_en: 'German Pils',
          abv: { value: 5 },
          brewery: 'Evil Twin Brewing',
          collaboration: [],
        }],
        model: 'qwen3.8-flash',
        usage: null,
      }
    },
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/ai/images/beer-labels`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer access-token',
        'Content-Type': 'image/jpeg',
      },
      body: Buffer.from('fake-image'),
    })
    assert.equal(response.status, 200)
    const body = await response.json()
    assert.deepEqual(body.results[0], {
      imageOrder: 1,
      name: 'GREENHOUSE',
      beerStyle: 'German Pils',
      abv: 5,
      brewery: 'Evil Twin Brewing',
      collabBreweries: [],
    })
    assert.equal(body.model, undefined)
    assert.equal(body.usage, undefined)
    assert.equal(typeof body.requestId, 'string')
    assert.equal(calls[0][0], 'authorize')
    assert.equal(calls[1][1][0].mediaType, 'image/jpeg')
  })
})

test('accepts multiple base64 images', async () => {
  let imageCount = 0
  await withServer({
    authorizeUser: async () => ({ userId: 'user-1' }),
    recognizeBeerLabels: async (images) => {
      imageCount = images.length
      return { items: [], model: 'qwen3.8-flash', usage: null }
    },
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/ai/images/beer-labels`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer access-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        images: [
          { mediaType: 'image/jpeg', dataBase64: Buffer.from('one').toString('base64') },
          { mediaType: 'image/png', dataBase64: Buffer.from('two').toString('base64') },
        ],
      }),
    })
    assert.equal(response.status, 200)
    assert.equal(imageCount, 2)
  })
})

test('requires an access token', async () => {
  await withServer({
    authorizeUser: async () => ({ userId: 'unused' }),
    recognizeBeerLabels: async () => ({ items: [] }),
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/ai/images/beer-labels`, {
      method: 'POST',
      headers: { 'Content-Type': 'image/jpeg' },
      body: Buffer.from('fake-image'),
    })
    assert.equal(response.status, 401)
    assert.equal((await response.json()).error, 'unauthorized')
  })
})

test('rejects unsupported image content types', async () => {
  await withServer({
    authorizeUser: async () => ({ userId: 'user-1' }),
    recognizeBeerLabels: async () => ({ items: [] }),
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/ai/images/beer-labels`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer token',
        'Content-Type': 'image/gif',
      },
      body: Buffer.from('gif'),
    })
    assert.equal(response.status, 415)
  })
})

test('serves the public health check', async () => {
  await withServer({
    authorizeUser: async () => ({ userId: 'unused' }),
    recognizeBeerLabels: async () => ({ items: [] }),
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/ai/healthz`)
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { ok: true })
  })
})
