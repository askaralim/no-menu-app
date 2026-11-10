import { Platform } from 'react-native'

// The Intelligence API is independent of the business RPCs. Errors never
// trigger a retry of a TAP, follow, or other business mutation.
export const INTELLIGENCE_ENABLED = process.env.EXPO_PUBLIC_INTELLIGENCE_ENABLED !== 'false'
const ORIGIN = 'https://nomenuapp.com'
function requestOrigin() {
  // Metro forwards only the listed Intelligence routes in local web development.
  // Native builds and hosted web keep using the production HTTPS origin.
  return __DEV__ && Platform.OS === 'web' && typeof window !== 'undefined'
    && ['localhost', '127.0.0.1'].includes(window.location.hostname) ? '/__intelligence' : ORIGIN
}
const retryDeadlines = new Map<string, number>()

export class IntelligenceError extends Error {
  constructor(public status: number, public code: string, public retryAfter = 0) {
    super(code)
  }
}

export async function intelligenceRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const resource = path.split('?')[0]
  const remaining = (retryDeadlines.get(resource) || 0) - Date.now()
  if (remaining > 0) throw new IntelligenceError(429, 'RATE_LIMITED', remaining)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8_000)
  try {
    const response = await fetch(`${requestOrigin()}${path}`, {
      ...init,
      headers: { Accept: 'application/json', ...init.headers },
      signal: controller.signal,
    })
    const body = await response.json().catch(() => null)
    if (!response.ok) {
      const retry = response.headers.get('Retry-After') || ''
      const seconds = Number(retry)
      const delay = Number.isFinite(seconds) ? seconds * 1_000 : Date.parse(retry) - Date.now()
      if (response.status === 429) retryDeadlines.set(resource, Date.now() + Math.max(1_000, delay || 0))
      throw new IntelligenceError(response.status, body?.error?.code || body?.code || 'UNAVAILABLE', Math.max(0, delay || 0))
    }
    return body as T
  } finally {
    clearTimeout(timer)
  }
}
