import { supabase } from '@/lib/supabase'
import type {
  PublicBarRow,
  PublicTaplistDrinksRpc,
  PublicTaplistSearchRpc,
  PublicTaplistTenantRpc,
} from '@/lib/types'

export async function fetchPublicBars(city?: string | null) {
  const { data, error } = await supabase.rpc('get_public_taplist_bars', {
    p_city: city ?? null,
  })
  if (error) throw error
  return (data ?? []) as PublicBarRow[]
}

export async function fetchPublicTenantBySlug(slug: string) {
  const { data, error } = await supabase.rpc('get_public_taplist_tenant', {
    p_slug: slug,
  })
  if (error) throw error
  return data as PublicTaplistTenantRpc
}

export async function fetchPublicDrinks(tenantId: string) {
  const { data, error } = await supabase.rpc('get_public_taplist_drinks', {
    p_tenant_id: tenantId,
  })
  if (error) throw error
  return data as PublicTaplistDrinksRpc
}

export async function searchPublicTaplist(city: string | null, query: string) {
  const { data, error } = await supabase.rpc('search_public_taplist', {
    p_city: city ?? null,
    p_query: query,
  })
  if (error) throw error
  const payload = data as PublicTaplistSearchRpc
  if (!payload || payload.ok !== true) return []
  return payload.results ?? []
}
