import { fail } from './errors.js'
import { configureE1 } from './e1/integration.js'
import { readFileSync } from 'node:fs'

function required(env, name) {
  const value = env[name]?.trim()
  if (!value) throw new Error(`Missing ${name}`)
  return value
}
function integer(env, name, fallback, min, max) {
  const value = env[name] === undefined ? fallback : Number(env[name])
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`Invalid ${name}`)
  return value
}
export function loadConfig(env = process.env) {
  const databaseUrl = required(env, 'CI_DATABASE_URL')
  const db = new URL(databaseUrl)
  if (!['postgres:', 'postgresql:'].includes(db.protocol)) throw new Error('CI_DATABASE_URL must be PostgreSQL')
  if ([...db.searchParams.keys()].some(k => k.startsWith('ssl'))) throw new Error('Configure TLS via CI_DATABASE_CA_FILE, not URL ssl parameters')
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(db.hostname)
  const tls = env.CI_DATABASE_TLS ?? 'verify-full'
  if (!['verify-full', 'disable'].includes(tls) || (tls === 'disable' && (!local || env.NODE_ENV === 'production'))) throw new Error('TLS may be disabled only for local non-production PostgreSQL')
  const supabaseUrl = new URL(required(env, 'SUPABASE_URL'))
  if (supabaseUrl.protocol !== 'https:' && !(supabaseUrl.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(supabaseUrl.hostname))) throw new Error('SUPABASE_URL must use HTTPS')
  const userKeySecret = required(env, 'CI_USER_KEY_SECRET')
  const cursorSecret = required(env, 'CI_CURSOR_SECRET')
  if (Buffer.byteLength(userKeySecret) < 32 || Buffer.byteLength(cursorSecret) < 32 || userKeySecret === cursorSecret) throw new Error('Use distinct CI secrets of at least 32 bytes')
  let e1
  try { e1=configureE1(env,db,supabaseUrl) }
  catch {
    // Isolate invalid E1 config. Published cohort requests fail closed; V1 and Latest stay available.
    const unavailable=()=>fail(503,'E1_BUNDLE_UNAVAILABLE')
    try {
      const reader=configureE1({...env,CI_E1_MODE:'off',CI_E1_ACTIVE_VERSION:undefined,CI_E1_TEST_USERS:''},db,supabaseUrl)
      e1=Object.freeze({...reader,invalid:true})
    } catch { e1=Object.freeze({mode:'off',invalid:true,routes:()=>false,bundle:unavailable,verifyRetained:unavailable}) }
  }
  return {
    e1,
    databaseUrl, databaseSsl: tls === 'disable' ? false : { rejectUnauthorized: true, ...(env.CI_DATABASE_CA_FILE ? { ca: readFileSync(env.CI_DATABASE_CA_FILE, 'utf8') } : {}) },
    poolMax: integer(env, 'CI_DB_POOL_MAX', 5, 2, 20),
    port: integer(env, 'PORT', 8791, 1, 65535), host: env.HOST ?? '127.0.0.1',
    supabaseUrl: supabaseUrl.toString().replace(/\/$/, ''), supabaseAnonKey: required(env, 'SUPABASE_ANON_KEY'),
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY?.trim() || null,
    userKeySecret, cursorSecret,
    windowDays: integer(env, 'RECENT_TAP_WINDOW_DAYS', 14, 1, 90),
    followMultiplier: 1.15, requiredTapCount: 5, modelVersion: 'rules-v1',
    corsOrigins: new Set((env.CORS_ORIGINS ?? '').split(',').map(s => s.trim()).filter(Boolean)),
    requestsPerMinute: integer(env, 'CI_REQUESTS_PER_MINUTE', 120, 1, 10000),
  }
}
