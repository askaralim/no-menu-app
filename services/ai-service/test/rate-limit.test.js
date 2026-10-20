import assert from 'node:assert/strict'
import test from 'node:test'
import { createUserRateLimiter } from '../src/rate-limit.js'

test('limits each user independently within a fixed window', () => {
  let current = 1_000
  const check = createUserRateLimiter(2, 60_000, () => current)

  check('user-1')
  check('user-1')
  check('user-2')
  assert.throws(
    () => check('user-1'),
    (error) => error.code === 'rate_limited' && error.status === 429,
  )

  current += 60_000
  assert.doesNotThrow(() => check('user-1'))
})
