import { focusManager } from '@tanstack/react-query'
import { AppState, type AppStateStatus } from 'react-native'

import { resetTaplistSupabaseCache } from '@/lib/supabase'

let installed = false

/**
 * React Query treats refetch-on-focus as window focus. On iOS, the system
 * "allow wireless data?" sheet leaves the app inactive; refetch when active again.
 */
export function setupTaplistQueryFocusManager(): void {
  if (installed) return
  installed = true

  focusManager.setEventListener((onFocus) => {
    const onChange = (status: AppStateStatus) => {
      const active = status === 'active'
      if (active) {
        resetTaplistSupabaseCache()
      }
      onFocus(active)
    }
    onChange(AppState.currentState)
    const sub = AppState.addEventListener('change', onChange)
    return () => sub.remove()
  })
}
