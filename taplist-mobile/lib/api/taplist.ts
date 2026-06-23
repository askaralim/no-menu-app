import { getTaplistSupabase } from '@/lib/supabase'
import type {
  BeerRoadmapResponse,
  PublicBarRow,
  PublicTaplistEventRpc,
  PublicTaplistEventsRpc,
  PublicTaplistNewDrinksRpc,
  PublicTaplistDrinksRpc,
  PublicTaplistSearchRpc,
  PublicTaplistTenantRpc,
} from '@/lib/types'

export async function fetchPublicBars(city?: string | null) {
  const { data, error } = await getTaplistSupabase().rpc('get_public_taplist_bars', {
    p_city: city ?? null,
  })
  if (error) throw error
  return (data ?? []) as PublicBarRow[]
}

export async function fetchPublicTenantBySlug(slug: string) {
  const { data, error } = await getTaplistSupabase().rpc('get_public_taplist_tenant', {
    p_slug: slug,
  })
  if (error) throw error
  return data as PublicTaplistTenantRpc
}

export async function fetchPublicDrinks(tenantId: string) {
  const { data, error } = await getTaplistSupabase().rpc('get_public_taplist_drinks', {
    p_tenant_id: tenantId,
  })
  if (error) throw error
  return data as PublicTaplistDrinksRpc
}

export async function fetchPublicNewDrinks(city?: string | null) {
  const { data, error } = await getTaplistSupabase().rpc('get_public_taplist_new_drinks', {
    p_city: city ?? null,
  })
  if (error) throw error
  const payload = data as PublicTaplistNewDrinksRpc
  if (!payload || payload.ok !== true) return []
  return payload.results ?? []
}

export async function fetchPublicEvents(city?: string | null) {
  const { data, error } = await getTaplistSupabase().rpc('get_public_taplist_events', {
    p_city: city ?? null,
    p_tenant_id: null,
    p_limit: 20,
  })
  if (error) throw error
  const payload = data as PublicTaplistEventsRpc
  if (!payload || payload.ok !== true) return []
  return payload.results ?? []
}

export async function fetchPublicTenantEvents(tenantId: string) {
  const { data, error } = await getTaplistSupabase().rpc('get_public_taplist_events', {
    p_city: null,
    p_tenant_id: tenantId,
    p_limit: 30,
  })
  if (error) throw error
  const payload = data as PublicTaplistEventsRpc
  if (!payload || payload.ok !== true) return []
  return payload.results ?? []
}

export async function fetchPublicEvent(eventId: string) {
  const { data, error } = await getTaplistSupabase().rpc('get_public_taplist_event', {
    p_event_id: eventId,
  })
  if (error) throw error
  return data as PublicTaplistEventRpc
}

export async function searchPublicTaplist(city: string | null, query: string) {
  const { data, error } = await getTaplistSupabase().rpc('search_public_taplist', {
    p_city: city ?? null,
    p_query: query,
  })
  if (error) throw error
  const payload = data as PublicTaplistSearchRpc
  if (!payload || payload.ok !== true) return []
  return payload.results ?? []
}

export async function fetchPublicBeerRoadmap(startTenantId: string) {
  const { data, error } = await getTaplistSupabase().functions.invoke('public-beer-roadmap', {
    body: { startTenantId },
  })
  if (error) throw error
  return data as BeerRoadmapResponse
}
