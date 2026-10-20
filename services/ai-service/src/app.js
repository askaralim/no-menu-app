import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { parseBearerToken, RequestError } from './errors.js'
import { readImages } from './image-request.js'
import { toPublicBeerLabelResults } from './result.js'

function json(response, status, body, extraHeaders = {}) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders,
  })
  response.end(JSON.stringify(body))
}

function corsHeaders(origin, allowedOrigins) {
  if (!origin) return {}
  if (!allowedOrigins.has(origin)) return null
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

export function createAiServiceServer({
  config,
  authorizeUser,
  recognizeBeerLabels,
  checkRateLimit = () => {},
  logger = console,
}) {
  return createServer(async (request, response) => {
    const requestId = randomUUID()
    const startedAt = Date.now()
    const url = new URL(request.url || '/', 'http://localhost')

    if (request.method === 'GET' && (url.pathname === '/healthz' || url.pathname === '/api/ai/healthz')) {
      return json(response, 200, { ok: true })
    }

    if (url.pathname !== '/api/ai/images/beer-labels') {
      return json(response, 404, { error: 'not_found', message: '接口不存在', requestId })
    }

    const cors = corsHeaders(request.headers.origin, config.corsOrigins)
    if (cors === null) {
      return json(response, 403, { error: 'origin_forbidden', message: '来源不允许', requestId })
    }
    if (request.method === 'OPTIONS') {
      response.writeHead(204, cors)
      return response.end()
    }
    if (request.method !== 'POST') {
      return json(response, 405, { error: 'method_not_allowed', message: '请求方法不允许', requestId }, {
        Allow: 'POST, OPTIONS',
        ...cors,
      })
    }

    let userId = null
    let imageCount = 0
    try {
      const accessToken = parseBearerToken(request.headers.authorization)
      const user = await authorizeUser(accessToken)
      userId = user.userId
      checkRateLimit(userId)

      const images = await readImages(request, config)
      imageCount = images.length
      const result = await recognizeBeerLabels(images)

      logger.info('ai image recognition completed', {
        requestId,
        userId,
        imageCount,
        itemCount: result.items.length,
        model: result.model,
        durationMs: Date.now() - startedAt,
        usage: result.usage,
      })

      return json(response, 200, {
        requestId,
        results: toPublicBeerLabelResults(result.items),
      }, cors)
    } catch (error) {
      if (error instanceof RequestError) {
        logger.warn?.('ai image recognition rejected', {
          requestId,
          userId,
          imageCount,
          code: error.code,
          providerStatus: error.details?.providerStatus,
          providerCode: error.details?.providerCode,
          durationMs: Date.now() - startedAt,
        })
        return json(response, error.status, { error: error.code, message: error.message, requestId }, cors)
      }
      logger.error('ai image recognition failed', {
        requestId,
        userId,
        imageCount,
        durationMs: Date.now() - startedAt,
        error,
      })
      return json(response, 500, { error: 'internal_error', message: '图片识别暂时不可用', requestId }, cors)
    }
  })
}
