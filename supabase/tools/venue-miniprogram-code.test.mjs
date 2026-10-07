import test from 'node:test'
import assert from 'node:assert/strict'
import { buildRequestBody, detectImage, objectPath, validateInput } from './venue-miniprogram-code.mjs'

const tenantId = '4d1da7d9-8b21-4706-b535-355b9ff79388'
const qrCode = 'R6N3V7DX'

test('encodes the permanent QR code as the mini-program scene', () => {
  assert.deepEqual(buildRequestBody(qrCode, 'trial'), {
    scene: qrCode,
    page: 'pages/bar/bar',
    check_path: false,
    env_version: 'trial',
    width: 430,
  })
  assert.equal(buildRequestBody(qrCode, 'release').check_path, true)
})

test('uses an immutable tenant-scoped OSS path', () => {
  assert.equal(
    objectPath({ tenantId, qrCode, envVersion: 'release', version: 1, extension: 'jpg' }),
    `prod/tenants/${tenantId}/qr/weapp/release/no-menu-weapp-v1-${qrCode}.jpg`,
  )
})

test('detects WeChat image buffers and reports JSON API errors', () => {
  assert.deepEqual(
    detectImage(Buffer.from('89504e470d0a1a0a0000', 'hex'), 'application/octet-stream'),
    { extension: 'png', contentType: 'image/png' },
  )
  assert.throws(
    () => detectImage(Buffer.from(JSON.stringify({ errcode: 40013, errmsg: 'invalid appid' })), 'application/json'),
    /40013 invalid appid/,
  )
})

test('rejects invalid routing inputs', () => {
  assert.doesNotThrow(() => validateInput(tenantId, qrCode, 'develop'))
  assert.doesNotThrow(() => validateInput('00000000-0000-0000-0000-000000000001', 'EH7YJ3QS', 'release'))
  assert.throws(() => validateInput(tenantId, 'not-a-code', 'develop'))
  assert.throws(() => validateInput(tenantId, qrCode, 'preview'))
})
