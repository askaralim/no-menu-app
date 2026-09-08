import assert from 'node:assert/strict'
import test from 'node:test'
import { MAX_IMAGE_BYTES, parseBearerToken, validateUploadRequest } from '../src/upload-request.js'

const tenantId = '1cff208a-1234-4abc-8def-1234567890ab'
const drinkId = '831db2a1-5678-4abc-8def-1234567890ab'

test('accepts a canonical tenant drink image request', () => {
  assert.deepEqual(validateUploadRequest({
    tenantId,
    objectPath: `prod/tenants/${tenantId}/drinks/${drinkId}/upload-id.jpg`,
    contentType: 'image/jpeg',
    contentLength: MAX_IMAGE_BYTES,
  }), {
    tenantId,
    objectPath: `prod/tenants/${tenantId}/drinks/${drinkId}/upload-id.jpg`,
    contentType: 'image/jpeg',
    contentLength: MAX_IMAGE_BYTES,
  })
})

test('accepts canonical cover and event image requests', () => {
  assert.equal(validateUploadRequest({
    tenantId,
    objectPath: `prod/tenants/${tenantId}/covers/upload-id.webp`,
    contentType: 'image/webp',
    contentLength: 10,
  }).tenantId, tenantId)
  assert.equal(validateUploadRequest({
    tenantId,
    objectPath: `prod/events/${tenantId}/${drinkId}/upload-id.png`,
    contentType: 'image/png',
    contentLength: 10,
  }).tenantId, tenantId)
})

test('keeps accepting legacy paths during rollout', () => {
  assert.equal(validateUploadRequest({
    tenantId,
    objectPath: `${tenantId}/cover/____.png`,
    contentType: 'image/png',
    contentLength: 10,
  }).objectPath, `${tenantId}/cover/____.png`)
})

test('accepts deterministic legacy tenant UUID-shaped identifiers', () => {
  const legacyTenantId = '00000000-0000-0000-0000-000000000001'
  assert.equal(validateUploadRequest({
    tenantId: legacyTenantId,
    objectPath: `${legacyTenantId}/drinks/${drinkId}/_________.png`,
    contentType: 'image/png',
    contentLength: 1_823_938,
  }).tenantId, legacyTenantId)
})

test('rejects another tenant prefix and traversal-like paths', () => {
  assert.throws(() => validateUploadRequest({
    tenantId,
    objectPath: `${drinkId}/cover/../secret.jpg`,
    contentType: 'image/jpeg',
    contentLength: 10,
  }), /图片路径无效/)
})

test('rejects oversized images and mismatched extensions', () => {
  assert.throws(() => validateUploadRequest({
    tenantId,
    objectPath: `${tenantId}/cover/bar.png`,
    contentType: 'image/png',
    contentLength: MAX_IMAGE_BYTES + 1,
  }), /2MB/)
  assert.throws(() => validateUploadRequest({
    tenantId,
    objectPath: `${tenantId}/cover/bar.jpg`,
    contentType: 'image/webp',
    contentLength: 10,
  }), /扩展名/)
})

test('requires a strict bearer token', () => {
  assert.equal(parseBearerToken('Bearer abc.def'), 'abc.def')
  assert.throws(() => parseBearerToken('Basic abc'), /登录凭证/)
})
