import { createServer } from 'node:http'
import { parseBearerToken, RequestError, validateUploadRequest } from './upload-request.js'

const MAX_REQUEST_BYTES = 8 * 1024

function json(response, status, body, extraHeaders = {}) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders,
  })
  response.end(JSON.stringify(body))
}

async function readJson(request) {
  const chunks = []
  let length = 0
  for await (const chunk of request) {
    length += chunk.length
    if (length > MAX_REQUEST_BYTES) {
      throw new RequestError(413, 'request_too_large', '请求内容过大')
    }
    chunks.push(chunk)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new RequestError(400, 'invalid_json', '请求格式无效')
  }
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

export function createMediaUploadServer({ config, authorizeTenant, signPutUrl, logger = console }) {
  return createServer(async (request, response) => {
    const url = new URL(request.url || '/', 'http://localhost')

    if (request.method === 'GET' && (url.pathname === '/healthz' || url.pathname === '/api/media/healthz')) {
      return json(response, 200, { ok: true })
    }

    if (url.pathname !== '/api/media/upload-url') {
      return json(response, 404, { error: 'not_found', message: '接口不存在' })
    }

    const cors = corsHeaders(request.headers.origin, config.corsOrigins)
    if (cors === null) {
      return json(response, 403, { error: 'origin_forbidden', message: '来源不允许' })
    }
    if (request.method === 'OPTIONS') {
      response.writeHead(204, cors)
      return response.end()
    }
    if (request.method !== 'POST') {
      return json(response, 405, { error: 'method_not_allowed', message: '请求方法不允许' }, {
        Allow: 'POST, OPTIONS',
        ...cors,
      })
    }

    try {
      const accessToken = parseBearerToken(request.headers.authorization)
      const upload = validateUploadRequest(await readJson(request))
      await authorizeTenant(accessToken, upload.tenantId)
      const uploadUrl = await signPutUrl(upload)
      const cdnUrl = `${config.ossCdnBaseUrl}/${upload.objectPath.split('/').map(encodeURIComponent).join('/')}`

      return json(response, 200, {
        uploadUrl,
        cdnUrl,
        objectPath: upload.objectPath,
        expiresIn: config.uploadUrlTtlSeconds,
        requiredHeaders: { 'Content-Type': upload.contentType },
      }, cors)
    } catch (error) {
      if (error instanceof RequestError) {
        return json(response, error.status, { error: error.code, message: error.message }, cors)
      }
      logger.error('media upload URL generation failed', error)
      return json(response, 500, { error: 'internal_error', message: '暂时无法生成上传地址' }, cors)
    }
  })
}
