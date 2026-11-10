import assert from 'node:assert/strict'
import test from 'node:test'
import { buildRequestBody, validateInput } from './campaign-miniprogram-code.mjs'

const campaignId = '4d1da7d9-8b21-4706-b535-355b9ff79388'

test('campaign code targets the isolated campaign page', () => {
  validateInput(campaignId, 'ABC23456', 'trial')
  assert.deepEqual(buildRequestBody('ABC23456', 'trial'), {
    scene: 'ABC23456', page: 'pages/campaign/campaign', check_path: false, env_version: 'trial', width: 430,
  })
  assert.equal(buildRequestBody('ABC23456', 'release').check_path, true)
})

test('campaign code accepts WebAdmin hexadecimal codes and rejects malformed identifiers', () => {
  validateInput(campaignId, '01AB89EF', 'release')
  assert.throws(() => validateInput('campaign', 'ABC23456', 'release'), /campaign id/)
  assert.throws(() => validateInput(campaignId, '1234567!', 'release'), /QR code/)
})

test('prepublication poster code keeps the release environment and stable routing code', () => {
  assert.deepEqual(buildRequestBody('8b60ed3b', 'release', { allowUnpublishedPage: true, poster: true }), {
    scene: 'p_8b60ed3b', page: 'pages/campaign/campaign', check_path: false, env_version: 'release', width: 430,
  })
  assert.equal(buildRequestBody('8b60ed3b', 'release', { poster: true }).check_path, true)
  assert.throws(() => buildRequestBody('p_8b60ed3b', 'release', { poster: true }), /QR code/)
})
