import { useEffect, useState } from 'react'

import { isTaplistSupabaseConfigured } from '@/lib/supabase'

const MAX_ATTEMPTS = 50
const RETRY_MS = 100

/**
 * `Constants.expoConfig.extra` may be empty on the first paint after cold start.
 * Poll briefly so queries enable only after the native config bridge is ready.
 */
export function useTaplistSupabaseReady(): boolean {
  const [ready, setReady] = useState(() => isTaplistSupabaseConfigured())

  useEffect(() => {
    if (ready) return

    let attempts = 0
    const id = setInterval(() => {
      attempts += 1
      if (isTaplistSupabaseConfigured()) {
        setReady(true)
        clearInterval(id)
        return
      }
      if (attempts >= MAX_ATTEMPTS) {
        clearInterval(id)
      }
    }, RETRY_MS)

    return () => clearInterval(id)
  }, [ready])

  return ready
}
