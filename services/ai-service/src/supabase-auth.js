import { createHash } from 'node:crypto'
import { RequestError } from './errors.js'

const AUTH_CACHE_TTL_MS = 5 * 60 * 1000

async function parseJson(response) {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function tokenCacheKey(accessToken) {
  return createHash('sha256').update(accessToken).digest('base64url')
}

function tokenExpiresAt(accessToken) {
  try {
    const [, payload] = accessToken.split('.')
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    return Number.isFinite(decoded.exp) ? decoded.exp * 1000 : null
  } catch {
    return null
  }
}

export function createSupabaseUserAuthorizer(
  config,
  fetchImpl = fetch,
  { now = Date.now, cacheTtlMs = AUTH_CACHE_TTL_MS } = {},
) {
  const cache = new Map()

  return async function authorizeUser(accessToken) {
    const cacheKey = tokenCacheKey(accessToken)
    const cached = cache.get(cacheKey)
    const currentTime = now()
    if (cached && cached.expiresAt > currentTime) {
      return { userId: cached.userId }
    }
    cache.delete(cacheKey)

    let userResponse
    try {
      userResponse = await fetchImpl(`${config.supabaseUrl}/auth/v1/user`, {
        headers: {
          apikey: config.supabaseAnonKey,
          Authorization: `Bearer ${accessToken}`,
        },
        signal: AbortSignal.timeout(8_000),
      })
    } catch {
      throw new RequestError(502, 'auth_unavailable', '暂时无法验证登录状态')
    }

    if (!userResponse.ok) {
      throw new RequestError(401, 'unauthorized', '登录已过期，请重新登录')
    }
    const user = await parseJson(userResponse)
    if (!user?.id) {
      throw new RequestError(401, 'unauthorized', '登录凭证无效')
    }

    let membershipResponse
    try {
      membershipResponse = await fetchImpl(`${config.supabaseUrl}/rest/v1/rpc/get_my_tenants`, {
        method: 'POST',
        headers: {
          apikey: config.supabaseAnonKey,
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
        signal: AbortSignal.timeout(8_000),
      })
    } catch {
      throw new RequestError(502, 'auth_unavailable', '暂时无法验证门店权限')
    }

    if (!membershipResponse.ok) {
      if (membershipResponse.status === 401) {
        throw new RequestError(401, 'unauthorized', '登录已过期，请重新登录')
      }
      throw new RequestError(403, 'forbidden', '当前账号没有酒款录入权限')
    }
    const memberships = await parseJson(membershipResponse)
    if (!Array.isArray(memberships) || memberships.length === 0) {
      throw new RequestError(403, 'forbidden', '当前账号没有酒款录入权限')
    }

    const jwtExpiresAt = tokenExpiresAt(accessToken)
    const expiresAt = Math.min(currentTime + cacheTtlMs, jwtExpiresAt || Number.POSITIVE_INFINITY)
    if (expiresAt > currentTime) {
      cache.set(cacheKey, { userId: user.id, expiresAt })
    }
    return { userId: user.id }
  }
}
