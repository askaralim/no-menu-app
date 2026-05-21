import { createClient } from '@supabase/supabase-js'

/**
 * Matches the default JWT Supabase CLI uses for `supabase start` (issuer supabase-demo).
 * Use `npm run db:status` after start if yours differ when you customise auth.
 */
const LOCAL_DEFAULT_URL = 'http://127.0.0.1:54321'
const LOCAL_DEFAULT_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

const isDevRuntime = process.env.NODE_ENV === 'development'
const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const rawKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const supabaseUrl =
  rawUrl ??
  (isDevRuntime ? LOCAL_DEFAULT_URL : undefined)

const supabaseAnonKey =
  rawKey ??
  (isDevRuntime ? LOCAL_DEFAULT_ANON_KEY : undefined)

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. See .env.example'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
})

