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
  console.error(
    'Missing Supabase URL/key. Set EXPO_PUBLIC_SUPABASE_* in .env or NEXT_PUBLIC_SUPABASE_* on EAS (see app.config.js).'
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
