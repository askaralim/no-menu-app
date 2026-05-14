import { supabase } from '@/lib/supabase'
import type { PublicBarRow, PublicDrinkRow, PublicTenantDetail } from '@/lib/types'

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
  return data as
    | { ok: true; tenant: PublicTenantDetail }
    | { ok: false; code: string; name?: string }
}

export async function fetchPublicDrinks(tenantId: string) {
  const { data, error } = await supabase.rpc('get_public_taplist_drinks', {
    p_tenant_id: tenantId,
  })
  if (error) throw error
  return data as
    | { ok: true; drinks: PublicDrinkRow[] }
    | { ok: false; code: string }
}
