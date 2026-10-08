import type { AuthChangeEvent, Session } from '@supabase/supabase-js'

import { identifyUser, resetUser } from '@/lib/analytics'
import { getTaplistSupabase } from '@/lib/supabase'

function identifySession(session: Session | null): void {
  if (!session?.user.id) return
  const hasAppleIdentity = session.user.identities?.some(
    (identity) => identity.provider === 'apple',
  ) === true

  void identifyUser(session.user.id, {
    account_protection: hasAppleIdentity ? 'apple' : 'anonymous',
    is_anonymous_account: session.user.is_anonymous === true,
  })
}

export async function syncCurrentAnalyticsIdentity(): Promise<void> {
  try {
    const { data, error } = await getTaplistSupabase().auth.getSession()
    if (error) return
    identifySession(data.session)
  } catch {
    // Analytics identity must never affect authentication or product flows.
  }
}

export function handleAnalyticsAuthChange(
  event: AuthChangeEvent,
  session: Session | null,
): void {
  if (event === 'SIGNED_OUT') {
    void resetUser()
    return
  }
  if (event !== 'INITIAL_SESSION' && event !== 'SIGNED_IN' && event !== 'USER_UPDATED') {
    return
  }

  // Supabase recommends dispatching work outside the auth callback.
  setTimeout(() => identifySession(session), 0)
}
