import { createHmac } from 'node:crypto'
import { fail } from './errors.js'

export function userKey(userId, secret) { return createHmac('sha256', secret).update(userId).digest('hex') }
export function createSupabase(config, fetchImpl = fetch) {
  async function call(path, { token, body, service = false, auth = false } = {}) {
    const key = service ? config.serviceRoleKey : config.supabaseAnonKey
    if (!key) fail(503, 'SOURCE_NOT_CONFIGURED')
    let response
    try {
      response = await fetchImpl(config.supabaseUrl + path, { method: body === undefined ? 'GET' : 'POST',
        redirect: 'error', headers: { apikey: key, Authorization: `Bearer ${token ?? key}`, 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(service ? 30000 : 8000) })
    } catch { fail(503, auth ? 'AUTH_UNAVAILABLE' : 'SOURCE_UNAVAILABLE', { phase: 'transport' }) }
    let data
    try { data = await response.json() } catch { fail(503, auth ? 'AUTH_UNAVAILABLE' : 'SOURCE_UNAVAILABLE', { phase: 'response_body', status: response.status }) }
    if (!response.ok) {
      if ([401, 403].includes(response.status)) fail(401, 'UNAUTHORIZED')
      if (auth) fail(503, 'AUTH_UNAVAILABLE', { phase: 'http_status', status: response.status })
      const known = ['USERNAME_TAKEN', 'USERNAME_INVALID', 'USERNAME_RESERVED', 'UNKNOWN_CITY', 'INVALID_PROFILE_PATCH']
      const code = known.find(c => String(data?.message).includes(c))
      if (code) fail(code === 'USERNAME_TAKEN' ? 409 : 400, code)
      fail(503, 'SOURCE_UNAVAILABLE')
    }
    return data
  }
  return {
    async authorize(token) {
      const user = await call('/auth/v1/user', { token, auth: true })
      if (!user?.id || !/^[0-9a-f-]{36}$/i.test(user.id)) fail(503, 'AUTH_UNAVAILABLE', { phase: 'user_shape' })
      // getUser above verifies this exact token with Auth. Claims are only read
      // after verification and never used to authorize metadata-defined roles.
      let claims
      try { claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()) } catch { fail(401, 'UNAUTHORIZED') }
      if (claims.sub !== user.id || claims.role !== 'authenticated' || !Number.isFinite(claims.exp) || claims.exp * 1000 <= Date.now()) fail(401, 'UNAUTHORIZED')
      return { user_key: userKey(user.id, config.userKeySecret), token }
    },
    rpc: (name, body, token) => call('/rest/v1/rpc/' + name, { token, body }),
    export: scope => call('/rest/v1/rpc/intelligence_export_snapshot_v1', { service: true, body: { p_scope: scope } }),
  }
}
