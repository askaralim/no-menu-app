import 'react-native-url-polyfill/auto'

import Constants from 'expo-constants'
import { createClient } from '@supabase/supabase-js'
import { Platform } from 'react-native'

/** Same defaults as Supabase CLI `supabase start` (issuer `supabase-demo`). */
const LOCAL_DEFAULT_URL = 'http://127.0.0.1:54321'
const LOCAL_DEFAULT_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

type Extra = { supabaseUrl?: string; supabaseAnonKey?: string }
const extra = Constants.expoConfig?.extra as Extra | undefined

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
    !u ||
    /^http:\/\/(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)/i.test(u)
  if (looksLikeLanOrMissing) {
    return LOCAL_DEFAULT_URL
  }
  return u
}

const rawUrlFromEnv = (process.env.EXPO_PUBLIC_SUPABASE_URL || extra?.supabaseUrl || '').trim()
const rawKey = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || extra?.supabaseAnonKey || '').trim()
const urlAfterWebLocalhostFix = resolveUrlForWebLocalhost(rawUrlFromEnv)

const useDevFallback = __DEV__ && (!rawUrlFromEnv || !rawKey)
const supabaseUrl =
  urlAfterWebLocalhostFix || (useDevFallback ? LOCAL_DEFAULT_URL : '')
const supabaseAnonKey = rawKey || (useDevFallback ? LOCAL_DEFAULT_ANON_KEY : '')

if (
  __DEV__ &&
  Platform.OS === 'web' &&
  rawUrlFromEnv &&
  rawUrlFromEnv !== supabaseUrl
) {
  console.info(
    `[taplist-mobile] Web on ${typeof window !== 'undefined' ? window.location.origin : 'localhost'}: Supabase URL "${rawUrlFromEnv}" → "${supabaseUrl}" (use loopback for API on the same machine).`
  )
}

/** Tap List MVP uses anon RPCs only — no persisted auth session. Avoids AsyncStorage native module in Expo Go. */
const noopAuthStorage = {
  getItem: async () => null,
  setItem: async () => undefined,
  removeItem: async () => undefined,
}

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '[taplist-mobile] Missing Supabase URL/key. For local: copy .env.local.example to .env and paste Publishable key from `supabase status`.'
  )
} else if (useDevFallback) {
  console.warn(
    '[taplist-mobile] Using default local Supabase (127.0.0.1:54321). For another device on the network, set EXPO_PUBLIC_SUPABASE_URL to this computer\'s LAN IP (port 54321), run `npm run db:start`, and ensure Docker is up (connection refused usually means nothing is listening on that host:port).'
  )
}

/** Anon client: Tap List MVP reads via public RPCs (`get_public_taplist_*`). */
export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      storage: noopAuthStorage,
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: { 'X-Client-Info': 'taplist-mobile' },
    },
  }
)

const INVALID_SUPABASE_KEYS = new Set(['', 'missing-anon-key', 'sb_publishable_REPLACE_ME_FROM_supabase_status'])

/** True when URL + anon key are set (from `.env` or `app.config` `extra`). */
export function isTaplistSupabaseConfigured(): boolean {
  const e = Constants.expoConfig?.extra as Extra | undefined
  const u = (process.env.EXPO_PUBLIC_SUPABASE_URL || e?.supabaseUrl || '').trim()
  const k = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || e?.supabaseAnonKey || '').trim()
  if (__DEV__ && (!u || !k)) return true
  return !!u && !!k && !INVALID_SUPABASE_KEYS.has(k)
}
