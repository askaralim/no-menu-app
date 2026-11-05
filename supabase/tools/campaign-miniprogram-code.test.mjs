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

test('campaign code rejects guessable or malformed identifiers', () => {
  assert.throws(() => validateInput('campaign', 'ABC23456', 'release'), /campaign id/)
  assert.throws(() => validateInput(campaignId, '12345678', 'release'), /QR code/)
})
