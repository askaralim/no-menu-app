import { RequestError } from './errors.js'

export function createUserRateLimiter(maxRequests, windowMs = 60_000, now = Date.now) {
  const buckets = new Map()

  return function check(userId) {
    const current = now()
    const existing = buckets.get(userId)
    if (!existing || current >= existing.resetAt) {
      buckets.set(userId, { count: 1, resetAt: current + windowMs })
      return
    }
    if (existing.count >= maxRequests) {
      throw new RequestError(429, 'rate_limited', '操作过于频繁，请稍后重试')
    }
    existing.count += 1

    if (buckets.size > 10_000) {
      for (const [key, bucket] of buckets) {
        if (current >= bucket.resetAt) buckets.delete(key)
      }
    }
  }
}
