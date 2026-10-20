const required = (env, name) => {
  const value = env[name]?.trim()
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

const integer = (value, fallback, min, max) => {
  const parsed = Number.parseInt(value ?? '', 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

export function loadConfig(env = process.env) {
  return {
    port: integer(env.PORT, 8790, 1, 65535),
    supabaseUrl: required(env, 'SUPABASE_URL').replace(/\/+$/, ''),
    supabaseAnonKey: required(env, 'SUPABASE_ANON_KEY'),
    dashscopeApiKey: required(env, 'DASHSCOPE_API_KEY'),
    dashscopeBaseUrl: required(env, 'DASHSCOPE_BASE_URL').replace(/\/+$/, ''),
    dashscopeModel: env.DASHSCOPE_MODEL?.trim() || 'qwen3.8-flash',
    modelTimeoutMs: integer(env.MODEL_TIMEOUT_MS, 60_000, 5_000, 120_000),
    maxImageBytes: integer(env.MAX_IMAGE_BYTES, 5 * 1024 * 1024, 64 * 1024, 20 * 1024 * 1024),
    maxTotalImageBytes: integer(
      env.MAX_TOTAL_IMAGE_BYTES,
      15 * 1024 * 1024,
      64 * 1024,
      20 * 1024 * 1024,
    ),
    maxImages: integer(env.MAX_IMAGES, 5, 1, 10),
    maxRequestsPerMinute: integer(env.MAX_REQUESTS_PER_MINUTE, 10, 1, 120),
    corsOrigins: new Set(
      (env.CORS_ORIGINS || 'https://nomenuapp.com')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
  }
}
