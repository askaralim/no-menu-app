import http from 'node:http'
import { reportScope, createAdminReports } from './admin-report.js'
import { randomUUID } from 'node:crypto'
import { loadConfig } from './config.js'
import { createPool } from './db.js'
import { createSupabase } from './supabase.js'
import { getFeed } from './feed.js'
import { acceptIdentity } from './identity.js'
import { ingestBatch } from './collector.js'
import { assertSchema, valid } from './schema.js'
import { fail, ServiceError } from './errors.js'

async function body(req, contentType) {
  if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== contentType) fail(415, 'UNSUPPORTED_MEDIA_TYPE')
  if (req.headers['content-encoding'] && req.headers['content-encoding'] !== 'identity') fail(415, 'UNSUPPORTED_CONTENT_ENCODING')
  if (Number(req.headers['content-length']) > 65536) fail(413, 'PAYLOAD_TOO_LARGE')
  const chunks = []; let bytes = 0
  for await (const chunk of req) { bytes += chunk.length; if (bytes > 65536) fail(413, 'PAYLOAD_TOO_LARGE'); chunks.push(chunk) }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { fail(400, 'INVALID_JSON') }
}
export function createServer({ pool, config, supabase = createSupabase(config), log = line => console.log(JSON.stringify(line)), clock = Date.now }) {
  const reports = createAdminReports(pool, clock)
  const buckets = new Map()
  const server = http.createServer({ requestTimeout: 15000, headersTimeout: 10000, maxHeaderSize: 16384 }, async (req, res) => {
    const requestId = randomUUID(), started = clock()
    let route = 'unknown', stage = 'request', failure = null
    const envelope = () => ({ api_version: '1', requestId, server_time: new Date(clock()).toISOString() })
    const send = (status, value, schema) => {
      if (schema && !valid(schema, value)) fail(500, 'RESPONSE_CONTRACT_VIOLATION')
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Request-ID': requestId, 'X-Content-Type-Options': 'nosniff' })
      res.end(JSON.stringify(value))
    }
    try {
      const url = new URL(req.url, 'http://service.local')
      const known = new Set(['/api/internal/v1/intelligence-report', '/healthz', '/readyz', '/api/feed/v1/new-beers', '/api/consumer/v1/cities', '/api/consumer/v1/profile', '/api/analytics/v1/identity-operations', '/api/analytics/v1/events/batch'])
      if (!known.has(url.pathname)) fail(404, 'NOT_FOUND')
      route = url.pathname
      const origin = req.headers.origin
      if (origin) {
        if (!config.corsOrigins.has(origin)) fail(403, 'ORIGIN_NOT_ALLOWED')
        res.setHeader('Access-Control-Allow-Origin', origin)
        res.setHeader('Vary', 'Origin')
      }
      if (req.method === 'OPTIONS') {
        res.writeHead(204, { 'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS', 'Access-Control-Allow-Headers': 'Authorization,Content-Type,X-Installation-ID,X-Analytics-Session-ID', 'Access-Control-Max-Age': '600' }); res.end(); return
      }
      if (req.method === 'GET' && route === '/healthz') { send(200, { status: 'ok' }); return }
      if (req.method === 'GET' && route === '/readyz') {
        const ready = await pool.query("SELECT 1 FROM ci.schema_migrations WHERE version='005_e1_routing'")
        if (!ready.rowCount) fail(503, 'DATABASE_NOT_READY')
        send(200, { status: 'ready' }); return
      }
      // Never trust arbitrary X-Forwarded-For. Nginx must overwrite X-Real-IP,
      // and only loopback proxy requests can supply it. No raw IP is logged.
      const remote = req.socket.remoteAddress ?? 'unknown'
      const localProxy = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote)
      const key = localProxy && typeof req.headers['x-real-ip'] === 'string' ? req.headers['x-real-ip'] : remote
      for (const [k, bucket] of buckets) if (bucket.until <= started) buckets.delete(k)
      if (!buckets.has(key) && buckets.size >= 10000) fail(429, 'RATE_LIMITED')
      const bucket = buckets.get(key) ?? { until: started + 60000, count: 0 }
      buckets.set(key, bucket)
      if (++bucket.count > config.requestsPerMinute) { res.setHeader('Retry-After', '60'); fail(429, 'RATE_LIMITED') }
      let auth = null
      if (req.headers.authorization !== undefined) {
        const match = /^Bearer ([A-Za-z0-9._~-]+)$/.exec(req.headers.authorization)
        if (!match) fail(401, 'UNAUTHORIZED')
        stage = 'authorize'
        auth = await supabase.authorize(match[1])
        stage = 'handler'
      }
      const requireAuth = () => { if (!auth) fail(401, 'AUTH_REQUIRED'); return auth }
      if (req.method === 'GET' && route === '/api/internal/v1/intelligence-report') {
        const { token } = requireAuth()
        stage = 'admin_authorize'
        if (await supabase.rpc('is_super_admin', {}, token) !== true) fail(403, 'ADMIN_REQUIRED')
        stage = 'admin_report'
        send(200, { ...envelope(), ...await reports(reportScope(url.searchParams, clock())) }); return
      }
      if (req.method === 'GET' && route === '/api/feed/v1/new-beers') {
        const query = {}
        for (const [key, value] of url.searchParams) { if (key in query) fail(400, 'INVALID_FEED_REQUEST'); query[key] = key === 'limit' ? Number(value) : value }
        const analytics = {}
        if (req.headers['x-installation-id'] !== undefined) analytics['X-Installation-ID'] = req.headers['x-installation-id']
        if (req.headers['x-analytics-session-id'] !== undefined) analytics['X-Analytics-Session-ID'] = req.headers['x-analytics-session-id']
        send(200, { ...envelope(), ...await getFeed(pool, config, query, analytics, auth?.user_key ?? null, clock()) }, 'feed/response.schema.json'); return
      }
      if (req.method === 'GET' && route === '/api/consumer/v1/cities') {
        const value = await supabase.rpc('ci_get_cities_v1', {}, auth?.token)
        send(200, { ...envelope(), cities: value.cities }, 'consumer/cities.schema.json'); return
      }
      if (route === '/api/consumer/v1/profile' && ['GET', 'PATCH'].includes(req.method)) {
        const { token } = requireAuth()
        let value
        if (req.method === 'PATCH') {
          const patch = await body(req, 'application/merge-patch+json')
          assertSchema('consumer/profile-patch.schema.json', patch, 'INVALID_PROFILE_PATCH')
          value = await supabase.rpc('ci_patch_profile_v1', { p_patch: patch }, token)
        } else value = await supabase.rpc('ci_get_profile_v1', {}, token)
        send(200, { ...envelope(), consumer_username: value.consumer_username, is_default: value.is_default, home_city_code: value.home_city_code }, 'consumer/profile.schema.json'); return
      }
      if (req.method === 'POST' && route === '/api/analytics/v1/identity-operations') {
        const { user_key } = requireAuth()
        stage = 'identity_body'
        const operation = await body(req, 'application/json')
        stage = 'identity_validate'
        const result = await acceptIdentity(pool, operation, user_key, clock(), value => { stage = value })
        stage = 'identity_response'
        send(202, { ...envelope(), ...result }, 'identity/accepted.schema.json'); return
      }
      if (req.method === 'POST' && route === '/api/analytics/v1/events/batch') {
        // Deliberately do not pass the uploader's account into event attribution.
        send(202, { ...envelope(), ...await ingestBatch(pool, await body(req, 'application/json'), clock()) }, 'events/batch-response.schema.json'); return
      }
      fail(405, 'METHOD_NOT_ALLOWED')
    } catch (error) {
      const known = error instanceof ServiceError
      const status = known ? error.status : 503
      // Fixed categories only: never log messages, stacks, SQL, payloads or identifiers.
      if (status >= 500) failure = { stage, error_code: known ? error.code : 'PERSISTENCE_UNAVAILABLE',
        error_type: ['Error', 'TypeError', 'RangeError', 'SyntaxError'].includes(error?.name) ? error.name : 'Other',
        ...(!known && /^[0-9A-Z]{5}$/.test(error?.code) ? { sqlstate: error.code } : {}),
        ...(known && ['transport', 'response_body', 'http_status', 'user_shape'].includes(error.details?.phase) ? { upstream_phase: error.details.phase } : {}),
        ...(known && Number.isInteger(error.details?.status) ? { upstream_status: error.details.status } : {}) }
      if (!res.headersSent) send(status, { ...envelope(), code: known ? error.code : 'PERSISTENCE_UNAVAILABLE', message: known ? error.code : 'Service temporarily unavailable', retryable: status >= 500 || status === 429 })
      else res.destroy()
    } finally {
      log({ requestId, route, method: req.method, status: res.statusCode, duration_ms: clock() - started, ...(failure && { failure }) })
    }
  })
  server.keepAliveTimeout = 5000
  server.maxRequestsPerSocket = 1000
  return server
}
if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  const config = loadConfig(), pool = createPool(config), server = createServer({ pool, config })
  server.listen(config.port, config.host, () => console.log(JSON.stringify({ event: 'listening', port: config.port })))
  let stopping = false
  const stop = () => {
    if (stopping) return
    stopping = true
    server.close(async () => { await pool.end() })
    setTimeout(() => { server.closeAllConnections(); process.exitCode = 1 }, 20000).unref()
  }
  process.on('SIGTERM', stop); process.on('SIGINT', stop)
}
