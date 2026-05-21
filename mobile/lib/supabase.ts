import 'react-native-url-polyfill/auto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import Constants from 'expo-constants'
import { createClient } from '@supabase/supabase-js'

/** Default local Supabase CLI stack (`supabase start`). Pair URL + anon key. */
const LOCAL_DEFAULT_URL = 'http://127.0.0.1:54321'
const LOCAL_DEFAULT_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

type Extra = { supabaseUrl?: string; supabaseAnonKey?: string }
const extra = Constants.expoConfig?.extra as Extra | undefined

const rawUrl = (
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  extra?.supabaseUrl ||
  ''
).trim()
const rawKey = (
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  extra?.supabaseAnonKey ||
  ''
).trim()

const useDevFallback = __DEV__ && (!rawUrl || !rawKey)
const supabaseUrl = rawUrl || (useDevFallback ? LOCAL_DEFAULT_URL : '')
const supabaseAnonKey = rawKey || (useDevFallback ? LOCAL_DEFAULT_ANON_KEY : '')

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    'Missing Supabase URL/key. Set EXPO_PUBLIC_SUPABASE_* in mobile/.env (see .env.local.example) or EAS env.'
  )
} else if (useDevFallback) {
  console.warn(
    '[mobile] Using default local Supabase (127.0.0.1:54321). Copy .env.local.example → .env for explicit config; physical device needs your Mac LAN IP.'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})
