import 'react-native-url-polyfill/auto'

import AsyncStorage from '@react-native-async-storage/async-storage'
import Constants from 'expo-constants'
import { createClient } from '@supabase/supabase-js'

type Extra = { supabaseUrl?: string; supabaseAnonKey?: string }
const extra = Constants.expoConfig?.extra as Extra | undefined

const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL || extra?.supabaseUrl || ''
const supabaseAnonKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || extra?.supabaseAnonKey || ''

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '[taplist-mobile] Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. Copy .env.example to .env and fill values.'
  )
}

/** Anon client: Tap List MVP reads via public RPCs (`get_public_taplist_*`). */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})
