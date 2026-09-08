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
  const cdnBaseUrl = required(env, 'OSS_CDN_BASE_URL').replace(/\/+$/, '')
  const supabaseUrl = required(env, 'SUPABASE_URL').replace(/\/+$/, '')

  return {
    port: integer(env.PORT, 8787, 1, 65535),
    supabaseUrl,
    supabaseAnonKey: required(env, 'SUPABASE_ANON_KEY'),
    ossBucket: required(env, 'OSS_BUCKET'),
    ossRegion: required(env, 'OSS_REGION'),
    ossCdnBaseUrl: cdnBaseUrl,
    ossRamRoleName: required(env, 'OSS_RAM_ROLE_NAME'),
    uploadUrlTtlSeconds: integer(env.UPLOAD_URL_TTL_SECONDS, 300, 60, 900),
    corsOrigins: new Set(
      (env.CORS_ORIGINS || 'https://nomenuapp.com')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
  }
}
