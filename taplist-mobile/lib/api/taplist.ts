import { getTaplistSupabase } from '@/lib/supabase'
import type {
  BeerRoadmapResponse,
  MiniProductSearchRpc,
  MiniProductDetailRpc,
  MiniBreweryRpc,
  PublicBarRow,
  PublicTaplistCitiesRpc,
  PublicTaplistBreweriesRpc,
  PublicTaplistBreweryRpc,
  PublicTaplistEventRpc,
  PublicTaplistEventsRpc,
  PublicTaplistNewDrinksRpc,
  PublicTaplistDrinkRpc,
  PublicTaplistDrinksRpc,
  PublicTaplistSearchRpc,
  PublicTaplistTenantRpc,
} from '@/lib/types'
import { partitionPublicDrinks } from '@/lib/types'

const PUBLIC_DRINKS_TIMEOUT_MS = 10_000

export async function fetchPublicCities() {
  const { data, error } = await getTaplistSupabase().rpc('get_public_taplist_cities')
  if (error) throw error
  const payload = data as PublicTaplistCitiesRpc
  if (!payload || payload.ok !== true) return []
  return payload.cities ?? []
}

export async function fetchPublicBars(city?: string | null) {
  const { data, error } = await getTaplistSupabase().rpc('get_public_taplist_bars', {
    p_city: city ?? null,
  })
  if (error) throw error
  return (data ?? []) as PublicBarRow[]
}

export async function fetchPublicTenantBySlug(slug: string) {
  const client = getTaplistSupabase()
  const { data, error } = await client.rpc('get_public_taplist_tenant', {
    p_slug: slug,
  })
  if (error) throw error
  const payload = data as PublicTaplistTenantRpc
  if (payload?.ok && !payload.tenant.qr_image_url && payload.tenant.qr_image_path) {
    payload.tenant.qr_image_url = client.storage
      .from('taplist-media')
      .getPublicUrl(payload.tenant.qr_image_path).data.publicUrl
  }
  return payload
}

export async function fetchPublicDrinks(tenantId: string, signal?: AbortSignal) {
  const controller = new AbortController()
  const abortRequest = () => controller.abort()
  const timeout = setTimeout(abortRequest, PUBLIC_DRINKS_TIMEOUT_MS)
  signal?.addEventListener('abort', abortRequest, { once: true })

  try {
    const { data, error } = await getTaplistSupabase()
      .rpc('get_public_taplist_drinks', { p_tenant_id: tenantId })
      .abortSignal(controller.signal)
    if (error) throw error
    return data as PublicTaplistDrinksRpc
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', abortRequest)
  }
}

function isMissingPublicDrinkRpc(error: { code?: string; message?: string }) {
  return error.code === 'PGRST202' || error.code === '42883'
}

/**
 * Prefer the additive single-drink RPC. During a staggered backend rollout only,
 * fall back to the existing public RPCs when PostgREST reports that function missing.
 */
export async function fetchPublicDrink(slug: string, drinkId: string): Promise<PublicTaplistDrinkRpc> {
  const client = getTaplistSupabase()
  const { data, error } = await client.rpc('get_public_taplist_drink', {
    p_slug: slug,
    p_drink_id: drinkId,
  })

  if (!error) return data as PublicTaplistDrinkRpc
  if (!isMissingPublicDrinkRpc(error)) throw error

  const tenantResult = await fetchPublicTenantBySlug(slug)
  if (!tenantResult.ok) {
    return { ...tenantResult, code: `tenant_${tenantResult.code}` }
  }

  const drinksResult = await fetchPublicDrinks(tenantResult.tenant.id)
  if (!drinksResult.ok) return drinksResult
  const drink = partitionPublicDrinks(drinksResult).allForLookup.find((item) => item.id === drinkId)
  if (!drink) return { ok: false, code: 'not_found' }
  return { ok: true, tenant: tenantResult.tenant, drink }
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

export async function fetchPublicTaplistBreweries(city?: string | null) {
  const { data, error } = await getTaplistSupabase().rpc('get_mini_breweries', {
    p_city: city ?? null,
  })
  if (error) throw error
  const payload = data as PublicTaplistBreweriesRpc
  if (!payload || payload.ok !== true) return []
  return (payload.results ?? []).map((brewery) => ({
    brewery_name: brewery.brewery,
    tap_count: brewery.product_count,
    logo_url: brewery.logo_url,
  }))
}

export async function fetchPublicBrewery(brewery: string, city?: string | null) {
  const { data, error } = await getTaplistSupabase().rpc('get_public_taplist_brewery', {
    p_city: city ?? null,
    p_brewery: brewery,
  })
  if (error) throw error
  return data as PublicTaplistBreweryRpc
}

export async function fetchMiniBrewery(name: string) {
  const { data, error } = await getTaplistSupabase().rpc('get_mini_brewery', {
    p_name: name,
  })
  if (error) throw error
  return data as MiniBreweryRpc
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

export async function searchMiniProducts({
  city,
  query = '',
  style = null,
  brewery = null,
  offset = 0,
  signal,
}: {
  city: string | null
  query?: string
  style?: string | null
  brewery?: string | null
  offset?: number
  signal?: AbortSignal
}) {
  let request = getTaplistSupabase().rpc('search_mini_products', {
    p_city: city ?? null,
    p_query: query,
    p_style: style,
    p_brewery: brewery,
    p_offset: offset,
  })
  if (signal) request = request.abortSignal(signal)
  const { data, error } = await request
  if (error) throw error
  const payload = data as MiniProductSearchRpc
  if (!payload || payload.ok !== true) {
    return { results: [], nextOffset: null }
  }
  return {
    results: payload.results ?? [],
    nextOffset: payload.next_offset ?? null,
  }
}

export async function fetchMiniProduct(key: string, city: string | null) {
  const separator = key.indexOf(':')
  const kind = separator > 0 ? key.slice(0, separator) : ''
  const id = separator > 0 ? key.slice(separator + 1) : ''
  if (!id || (kind !== 'product' && kind !== 'drink')) {
    return { ok: false, code: 'invalid_key' } as const
  }
  const { data, error } = await getTaplistSupabase().rpc('get_mini_product', {
    p_product_id: kind === 'product' ? id : null,
    p_drink_id: kind === 'drink' ? id : null,
    p_city: city,
    p_source_slug: null,
  })
  if (error) throw error
  return data as MiniProductDetailRpc
}

export async function fetchPublicBeerRoadmap(startTenantId: string) {
  const { data, error } = await getTaplistSupabase().functions.invoke('public-beer-roadmap', {
    body: { startTenantId },
  })
  if (error) throw error
  return data as BeerRoadmapResponse
}
