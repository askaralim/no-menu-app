import assert from 'node:assert/strict'
import test from 'node:test'
import { createOssSigner } from '../src/oss-signer.js'

test('initializes the ECS RAM role signer under native Node ESM', () => {
  const signer = createOssSigner({
    ossRamRoleName: 'nomenu-media-ecs',
    ossBucket: 'nomenuapp-media-prod',
    ossRegion: 'oss-cn-shanghai',
    uploadUrlTtlSeconds: 300,
  })
  assert.equal(typeof signer, 'function')
})
