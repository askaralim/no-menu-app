import { randomUUID } from 'expo-crypto'

import { intelligenceContext, setIntelligenceCities, touchIntelligenceSession, type AnalyticsContext } from '@/lib/intelligenceAnalytics'
import { IntelligenceError, intelligenceRequest } from '@/lib/intelligenceHttp'
import type { RecommendationReason } from '@/lib/styleLocalization'
import { getTaplistSupabase } from '@/lib/supabase'

export type FeedMode = 'for_you' | 'latest'
export type FeedSurface = 'home' | 'feed_page'
export type FeedCity = { city_code: string; source_city: string; display_name: string; timezone: string }
export type FeedItem = {
  item_id: string; rank: number; tenant_id: string; tenant_slug: string; tenant_name: string
  source_drink_id: string; product_id: string | null; beer_name: string
  brewery: string | null; style: string | null; style_family: string | null; image_url: string | null
  beer_name_en?: string | null; brewery_en?: string | null; tenant_name_en?: string | null; style_en?: string | null
  current_cycle_started_at: string; reason: RecommendationReason | null; deep_link: string
}
export type FeedResponse = {
  requestId: string; server_time: string; data_as_of: string
  city_code: string; mode: FeedMode; surface: FeedSurface; feed_instance_id: string; ranking_version: string
  personalization: { status: string; unique_tap_count: number; required_tap_count: number } | null
  snapshot: { state: string; snapshot_id: string; model_version: string; generated_at: string } | null
  empty_reason: string | null; total_items: number; items: FeedItem[]
  page: { as_of: string; has_more: boolean; next_cursor: string | null; expires_at: string } | null
  summary: { as_of: string; timezone: string; total_items: number; days: { date: string; count: number }[] } | null
}
export type FeedResult = FeedResponse & { analyticsContext: AnalyticsContext | null; fetchedAt: number; timezone: string }
let citiesPromise: Promise<FeedCity[]> | null = null

export function fetchFeedCities(): Promise<FeedCity[]> {
  if (!citiesPromise) citiesPromise = intelligenceRequest<{ cities: FeedCity[] }>('/api/consumer/v1/cities')
    .then(({ cities }) => { setIntelligenceCities(cities); return cities })
    .catch((error) => { citiesPromise = null; throw error })
  return citiesPromise
}

export async function fetchBeerFeed(sourceCity: string, mode: FeedMode, surface: FeedSurface, prior?: FeedResult): Promise<FeedResult> {
  const cities = await fetchFeedCities()
  const city = cities.find((entry) => entry.source_city === sourceCity)
  if (!city) throw new IntelligenceError(404, 'CITY_NOT_AVAILABLE')
  const { data, error } = await getTaplistSupabase().auth.getSession()
  if (error) throw new IntelligenceError(401, 'SESSION_UNAVAILABLE')
  const token = data.session?.access_token
  const owner = data.session?.user.id || null
  if (owner !== intelligenceContext().owner) throw new IntelligenceError(409, 'IDENTITY_CHANGED')
  if (mode === 'for_you' && !token) throw new IntelligenceError(401, 'AUTH_REQUIRED')
  const context = prior ? prior.analyticsContext : touchIntelligenceSession()
  if (context && context.session_id !== intelligenceContext().analytics?.session_id) throw new IntelligenceError(410, 'FEED_CONTEXT_EXPIRED')
  const instance = prior?.feed_instance_id || randomUUID()
  const query = new URLSearchParams({ city_code: city.city_code, mode, surface, feed_instance_id: instance, limit: surface === 'home' ? '6' : '20' })
  if (prior?.page?.next_cursor) query.set('cursor', prior.page.next_cursor)
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`
  if (context) {
    headers['X-Installation-ID'] = context.installation_id
    headers['X-Analytics-Session-ID'] = context.session_id
  }
  const path = `/api/feed/v1/new-beers?${query}`
  // A transport retry must retain the original instance and ownership headers.
  let response: FeedResponse
  try { response = await intelligenceRequest<FeedResponse>(path, { headers }) }
  catch (error) {
    if (error instanceof IntelligenceError && error.status < 500) throw error
    if (owner !== intelligenceContext().owner || (context && context.session_id !== intelligenceContext().analytics?.session_id)) throw error
    response = await intelligenceRequest<FeedResponse>(path, { headers })
  }
  if (response.feed_instance_id !== instance || response.city_code !== city.city_code || response.mode !== mode || response.surface !== surface || !Array.isArray(response.items)) {
    throw new IntelligenceError(502, 'INVALID_FEED_RESPONSE')
  }
  if (owner !== intelligenceContext().owner || (context && context.session_id !== intelligenceContext().analytics?.session_id)) {
    throw new IntelligenceError(409, 'IDENTITY_CHANGED')
  }
  return { ...response, analyticsContext: context, timezone: city.timezone, fetchedAt: Date.now() }
}
