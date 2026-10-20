export class RequestError extends Error {
  constructor(status, code, message, details = null) {
    super(message)
    this.name = 'RequestError'
    this.status = status
    this.code = code
    this.details = details
  }
}

export function parseBearerToken(header) {
  if (typeof header !== 'string') {
    throw new RequestError(401, 'unauthorized', '请先登录')
  }
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  if (!match?.[1]) {
    throw new RequestError(401, 'unauthorized', '登录凭证无效')
  }
  return match[1]
}
