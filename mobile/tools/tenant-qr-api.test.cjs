const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

function client(row, error = null) {
  let legacyReads = 0
  const supabase = {
    rpc: async () => ({ data: row, error }),
    storage: { from: () => ({ getPublicUrl: path => {
      legacyReads += 1
      return { data: { publicUrl: `https://legacy.example/${path}` } }
    } }) },
  }
  const code = ts.transpileModule(fs.readFileSync(require.resolve('../lib/tenantQrApi.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText
  const exports = {}
  vm.runInNewContext(code, { exports, require: name => name === './supabase' ? { supabase } : { TAPLIST_MEDIA_BUCKET: 'taplist-media' } })
  return { api: exports, legacyReads: () => legacyReads }
}
const row = { qr_code: 'AGSH3YNG', image_path: 'tenant/qr/original.png' }
test('uses original OSS URL without image transformations or legacy URL construction', async () => {
  const url = 'https://img.nomenuapp.com/prod/tenants/tenant/qr/original.png'
  const c = client({ ...row, image_url: url })
  const result = await c.api.getMyTenantQr('tenant')
  assert.equal(result.image_url, url)
  assert.equal(result.short_url, 'https://nomenuapp.com/q/AGSH3YNG')
  assert.equal(c.legacyReads(), 0)
})
test('preserves old RPC and unmigrated row compatibility', async () => {
  for (const image_url of [undefined, null, '']) {
    const c = client({ ...row, image_url })
    assert.equal((await c.api.getMyTenantQr('tenant')).image_url, 'https://legacy.example/tenant/qr/original.png')
  }
})
test('keeps absent QR and authorization errors distinct', async () => {
  assert.equal(await client(null).api.getMyTenantQr('tenant'), null)
  await assert.rejects(client(null, { message: 'Forbidden' }).api.getMyTenantQr('tenant'), /Forbidden/)
})
