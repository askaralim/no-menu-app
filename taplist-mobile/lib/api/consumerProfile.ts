import { getTaplistSupabase } from '@/lib/supabase'
import type { ConsumerProfile } from '@/lib/types'

export type ConsumerUsernameErrorCode =
  | 'USERNAME_TAKEN'
  | 'USERNAME_INVALID'
  | 'USERNAME_RESERVED'
  | 'UNKNOWN'

export class ConsumerUsernameError extends Error {
  constructor(public readonly code: ConsumerUsernameErrorCode) {
    super(code)
    this.name = 'ConsumerUsernameError'
  }
}

function usernameErrorCode(error: { message?: string } | null): ConsumerUsernameErrorCode {
  const message = error?.message ?? ''
  if (message.includes('USERNAME_TAKEN')) return 'USERNAME_TAKEN'
  if (message.includes('USERNAME_INVALID')) return 'USERNAME_INVALID'
  if (message.includes('USERNAME_RESERVED')) return 'USERNAME_RESERVED'
  return 'UNKNOWN'
}

export async function getMyConsumerProfile() {
  const { data, error } = await getTaplistSupabase().rpc('get_my_consumer_profile')
  if (error) throw error
  return data as ConsumerProfile
}

export async function updateMyConsumerUsername(username: string) {
  const { data, error } = await getTaplistSupabase().rpc('update_my_consumer_username', {
    p_username: username,
  })
  if (error) throw new ConsumerUsernameError(usernameErrorCode(error))
  return data as ConsumerProfile
}
