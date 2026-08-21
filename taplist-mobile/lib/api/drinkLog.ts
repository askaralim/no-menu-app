import { getTaplistSupabase } from '@/lib/supabase'
import type {
  LightDrinkResult,
  MyDrinkHistoryRow,
  MyDrinkInsights,
  MyDrinkState,
  MyDrinkSummary,
} from '@/lib/types'

type HistoryResponse = { ok: true; results: MyDrinkHistoryRow[] }

export async function getMyDrinkState(drinkId: string) {
  const client = getTaplistSupabase()
  const { data: sessionData } = await client.auth.getSession()
  if (!sessionData.session) {
    return {
      ok: true,
      light_id: null,
      is_lit: false,
      is_current_venue_lit: false,
      first_lit_at: null,
      venue_count: 0,
    } satisfies MyDrinkState
  }
  const { data, error } = await client.rpc('get_my_drink_state', {
    p_drink_id: drinkId,
  })
  if (error) throw error
  return data as MyDrinkState
}

export async function lightMyDrink(drinkId: string) {
  const { data, error } = await getTaplistSupabase().rpc('light_my_drink', {
    p_drink_id: drinkId,
  })
  if (error) throw error
  return data as LightDrinkResult
}

export async function getMyDrinkHistory(cursor?: string | null, limit = 60) {
  const { data, error } = await getTaplistSupabase().rpc('get_my_drink_history', {
    p_cursor: cursor ?? null,
    p_limit: limit,
  })
  if (error) throw error
  const payload = data as HistoryResponse
  return payload.results ?? []
}

export async function getMyDrinkSummary() {
  const { data, error } = await getTaplistSupabase().rpc('get_my_drink_summary')
  if (error) throw error
  return data as MyDrinkSummary
}

export async function getMyDrinkInsights() {
  const { data, error } = await getTaplistSupabase().rpc('get_my_drink_insights')
  if (error) throw error
  return data as MyDrinkInsights
}

export async function removeMyDrinkVenue(lightId: string, tenantId: string) {
  const { data, error } = await getTaplistSupabase().rpc('remove_my_drink_venue', {
    p_light_id: lightId,
    p_tenant_id: tenantId,
  })
  if (error) throw error
  return data as { ok: true; remaining_venues: number; is_lit: boolean }
}

export async function unlightMyDrink(lightId: string) {
  const { data, error } = await getTaplistSupabase().rpc('unlight_my_drink', {
    p_light_id: lightId,
  })
  if (error) throw error
  return data as { ok: true }
}
