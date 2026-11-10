const { getDefaultConfig } = require('expo/metro-config')
const https = require('node:https')

const config = getDefaultConfig(__dirname)
const enhance = config.server.enhanceMiddleware
const routes = new Map([
  ['/api/consumer/v1/cities', ['GET']],
  ['/api/consumer/v1/profile', ['GET', 'PATCH']],
  ['/api/feed/v1/new-beers', ['GET']],
  ['/api/analytics/v1/identity-operations', ['POST']],
  ['/api/analytics/v1/events/batch', ['POST']],
])

config.server.enhanceMiddleware = (middleware, server) => {
  const next = enhance ? enhance(middleware, server) : middleware
  return (req, res, done) => {
    if (!req.url?.startsWith('/__intelligence/')) return next(req, res, done)
    const fail = (status) => {
      if (res.headersSent) { res.destroy(); return }
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
      res.end(JSON.stringify({ error: { code: 'LOCAL_PROXY_UNAVAILABLE' } }))
    }
    // This is a loopback-only developer proxy, not a production CORS bypass or
    // an arbitrary upstream relay. Never forward cookies, Origin or client IPs.
    let local, target
    try {
      local = new URL(`http://${req.headers.host}`)
      target = new URL(req.url.slice('/__intelligence'.length), 'https://nomenuapp.com')
      if (!['localhost', '127.0.0.1'].includes(local.hostname)
        || !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)
        || req.headers.origin && req.headers.origin !== local.origin) return fail(403)
      if (target.origin !== 'https://nomenuapp.com' || !routes.get(target.pathname)?.includes(req.method)) return fail(404)
    } catch { return fail(400) }
    const chunks = []
    let size = 0
    req.on('data', (chunk) => { size += chunk.length; if (size <= 65536) chunks.push(chunk) })
    req.on('error', () => fail(502))
    req.on('end', () => {
      if (size > 65536) return fail(413)
      const headers = { Accept: 'application/json' }
      for (const key of ['authorization', 'content-type', 'accept-language', 'x-installation-id', 'x-analytics-session-id']) {
        if (req.headers[key]) headers[key] = req.headers[key]
      }
      const upstream = https.request(target, { method: req.method, headers, timeout: 8000 }, (response) => {
        const output = { 'Cache-Control': 'no-store' }
        for (const key of ['content-type', 'x-request-id', 'retry-after']) {
          if (response.headers[key]) output[key] = response.headers[key]
        }
        res.writeHead(response.statusCode, output)
        response.on('error', () => res.destroy())
        response.pipe(res)
      })
      upstream.on('timeout', () => upstream.destroy())
      upstream.on('error', () => fail(502))
      upstream.end(Buffer.concat(chunks))
    })
  }
}

module.exports = config
