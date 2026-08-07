import { getTaplistSupabase } from '@/lib/supabase'
import type { BarFollowState, FollowedBarRow } from '@/lib/types'

const notFollowed: BarFollowState = {
  ok: true,
  followed: false,
  notify_new_taps: false,
  followed_at: null,
}

export async function getMyBarFollowState(tenantId: string) {
  const client = getTaplistSupabase()
  const { data: sessionData } = await client.auth.getSession()
  if (!sessionData.session) return notFollowed
  const { data, error } = await client.rpc('get_my_bar_follow_state', { p_tenant_id: tenantId })
  if (error) throw error
  return data as BarFollowState
}

export async function followBar(tenantId: string) {
  const { data, error } = await getTaplistSupabase().rpc('follow_bar', { p_tenant_id: tenantId })
  if (error) throw error
  return data as BarFollowState
}

export async function unfollowBar(tenantId: string) {
  const { data, error } = await getTaplistSupabase().rpc('unfollow_bar', { p_tenant_id: tenantId })
  if (error) throw error
  return data as { ok: true; followed: false }
}

export async function getMyFollowedBars() {
  const { data, error } = await getTaplistSupabase().rpc('get_my_followed_bars')
  if (error) throw error
  return ((data as { ok: true; results: FollowedBarRow[] }).results ?? [])
}

export async function setBarNewTapNotifications(tenantId: string, enabled: boolean) {
  const { data, error } = await getTaplistSupabase().rpc('set_bar_new_tap_notifications', {
    p_tenant_id: tenantId,
    p_enabled: enabled,
  })
  if (error) throw error
  return data as { ok: true; notify_new_taps: boolean }
}

export async function registerMyPushDevice(expoPushToken: string) {
  const { data, error } = await getTaplistSupabase().rpc('register_my_push_device', {
    p_expo_push_token: expoPushToken,
  })
  if (error) throw error
  return data as { ok: true; device_id: string }
}
