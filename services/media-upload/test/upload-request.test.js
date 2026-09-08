import assert from 'node:assert/strict'
import test from 'node:test'
import { MAX_IMAGE_BYTES, parseBearerToken, validateUploadRequest } from '../src/upload-request.js'

const tenantId = '1cff208a-1234-4abc-8def-1234567890ab'
const drinkId = '831db2a1-5678-4abc-8def-1234567890ab'

test('accepts a valid tenant drink image request', () => {
  assert.deepEqual(validateUploadRequest({
    tenantId,
    objectPath: `${tenantId}/drinks/${drinkId}/beer.jpg`,
    contentType: 'image/jpeg',
    contentLength: MAX_IMAGE_BYTES,
  }), {
    tenantId,
    objectPath: `${tenantId}/drinks/${drinkId}/beer.jpg`,
    contentType: 'image/jpeg',
    contentLength: MAX_IMAGE_BYTES,
  })
})

test('accepts sanitized non-ASCII filenames that begin with underscores', () => {
  assert.equal(validateUploadRequest({
    tenantId,
    objectPath: `${tenantId}/cover/____.png`,
    contentType: 'image/png',
    contentLength: 10,
  }).objectPath, `${tenantId}/cover/____.png`)
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
