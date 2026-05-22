import 'react-native-url-polyfill/auto'

import Constants from 'expo-constants'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { Platform } from 'react-native'

/** Same defaults as Supabase CLI `supabase start` (issuer `supabase-demo`). */
const LOCAL_DEFAULT_URL = 'http://127.0.0.1:54321'
const LOCAL_DEFAULT_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

type Extra = { supabaseUrl?: string; supabaseAnonKey?: string }

const INVALID_SUPABASE_KEYS = new Set([
  '',
  'missing-anon-key',
  'sb_publishable_REPLACE_ME_FROM_supabase_status',
])

/** Tap List MVP uses anon RPCs only — no persisted auth session. */
const noopAuthStorage = {
  getItem: async () => null,
  setItem: async () => undefined,
  removeItem: async () => undefined,
}

/**
 * Expo Web at `http://127.0.0.1:8081` cannot use a stale LAN IP in `.env` to reach Supabase on the
 * same machine — the browser must call `http://127.0.0.1:54321`. Hosted URLs are left unchanged.
 */
function resolveUrlForWebLocalhost(urlFromEnv: string): string {
  const u = urlFromEnv.trim()
  if (!__DEV__ || Platform.OS !== 'web' || typeof window === 'undefined') {
    return u
  }
  const pageHost = window.location.hostname
  if (pageHost !== '127.0.0.1' && pageHost !== 'localhost') {
    return u
  }
  const looksLikeLanOrMissing =
    !u || /^http:\/\/(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)/i.test(u)
  if (looksLikeLanOrMissing) {
    return LOCAL_DEFAULT_URL
  }
  return u
}

/** Read config at call time — `Constants.expoConfig` is often unset during module init on cold start. */
export function resolveTaplistConfig(): { url: string; key: string } {
  const extra = Constants.expoConfig?.extra as Extra | undefined
  const rawUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL || extra?.supabaseUrl || '').trim()
  const rawKey = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || extra?.supabaseAnonKey || '').trim()
  const useDevFallback = __DEV__ && (!rawUrl || !rawKey)
  const url = resolveUrlForWebLocalhost(rawUrl) || (useDevFallback ? LOCAL_DEFAULT_URL : '')
  const key = rawKey || (useDevFallback ? LOCAL_DEFAULT_ANON_KEY : '')
  return { url, key }
}

/** True when URL + anon key are set (from `.env` or `app.config` `extra`). */
export function isTaplistSupabaseConfigured(): boolean {
  const { url, key } = resolveTaplistConfig()
  if (__DEV__ && (!url || !key)) return true
  return !!url && !!key && !INVALID_SUPABASE_KEYS.has(key)
}

let cachedClient: SupabaseClient | null = null
let cachedUrl = ''
let cachedKey = ''

/** Lazily create / recreate the client when Expo config becomes available. */
export function getTaplistSupabase(): SupabaseClient {
  const { url, key } = resolveTaplistConfig()

  if (!url || !key) {
    if (!cachedClient) {
      cachedClient = createClient('http://127.0.0.1:54321', 'missing-config', {
        auth: {
          storage: noopAuthStorage,
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false,
        },
        global: { headers: { 'X-Client-Info': 'taplist-mobile' } },
      })
    }
    return cachedClient
  }

  if (!cachedClient || cachedUrl !== url || cachedKey !== key) {
    cachedUrl = url
    cachedKey = key
    cachedClient = createClient(url, key, {
      auth: {
        storage: noopAuthStorage,
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
      global: { headers: { 'X-Client-Info': 'taplist-mobile' } },
    })
  }

  return cachedClient
}

/** Drop cached client so the next RPC picks up freshly available Expo config. */
export function resetTaplistSupabaseCache(): void {
  cachedClient = null
  cachedUrl = ''
  cachedKey = ''
}
