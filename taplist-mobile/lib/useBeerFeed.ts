import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useIsFocused } from '@react-navigation/native'
import { randomUUID } from 'expo-crypto'

import { fetchBeerFeed, type FeedMode, type FeedResult, type FeedSurface } from '@/lib/api/beerFeed'
import { useIntelligenceContext } from '@/lib/intelligenceAnalytics'
import { INTELLIGENCE_ENABLED, IntelligenceError } from '@/lib/intelligenceHttp'

export function useBeerFeed(city: string, mode: FeedMode, surface: FeedSurface, enabled = true) {
  const identity = useIntelligenceContext()
  const focused = useIsFocused()
  const client = useQueryClient()
  const pageScope = useRef<string | null>(null)
  if (!pageScope.current) pageScope.current = randomUUID()
  const key = ['intelligence-feed', city, mode, surface, identity.owner, identity.revision, surface === 'home' ? 'home' : pageScope.current] as const
  const keyString = JSON.stringify(key)
  const currentKey = useRef(keyString)
  currentKey.current = keyString
  const [moreBusy, setMoreBusy] = useState(false)
  const [pageError, setPageError] = useState<unknown>(null)
  const moreLock = useRef(false)
  const query = useQuery({
    queryKey: key,
    queryFn: () => fetchBeerFeed(city, mode, surface),
    enabled: INTELLIGENCE_ENABLED && enabled && identity.ready && (mode !== 'for_you' || !!identity.owner),
    staleTime: Infinity, gcTime: 30 * 60_000, retry: false,
    refetchOnWindowFocus: false, refetchOnMount: false,
  })
  // Re-entering a full list preserves its instance, pages and position. Home
  // revalidates in place; it never replaces populated cards with a spinner.
  useEffect(() => {
    if (!INTELLIGENCE_ENABLED || !focused || !enabled || query.isFetching) return
    if (!query.data) {
      if (query.errorUpdatedAt > 0 && Date.now() - query.errorUpdatedAt > 60_000) void query.refetch()
      return
    }
    if ((surface === 'home' || query.data.items.length === 0) && Date.now() - query.data.fetchedAt > 60_000) {
      void query.refetch()
    }
  }, [focused, enabled, keyString]) // Deliberately entry-driven, not a refetch loop.
  useEffect(() => { setPageError(null); setMoreBusy(false) }, [keyString])

  const refresh = async () => {
    if (!INTELLIGENCE_ENABLED) return
    setPageError(null)
    await query.refetch()
  }
  const loadMore = async () => {
    const prior = query.data
    if (!INTELLIGENCE_ENABLED || moreLock.current || query.isFetching || !prior?.page?.has_more || !prior.page.next_cursor) return
    moreLock.current = true
    setMoreBusy(true)
    setPageError(null)
    try {
      const next = await fetchBeerFeed(city, mode, surface, prior)
      if (currentKey.current !== keyString) return
      client.setQueryData<FeedResult>(key, (current) => {
        if (!current || current.feed_instance_id !== prior.feed_instance_id) return current
        const ids = new Set(current.items.map((item) => item.item_id))
        return { ...next, fetchedAt: current.fetchedAt, summary: current.summary,
          items: [...current.items, ...next.items.filter((item) => !ids.has(item.item_id))] }
      })
    } catch (error) {
      if (currentKey.current === keyString) setPageError(error)
    } finally {
      moreLock.current = false
      if (currentKey.current === keyString) setMoreBusy(false)
    }
  }
  // Explicitly revoked/stale business facts must not remain actionable just
  // because an earlier response is still in the presentation cache.
  const unsafeCache = query.error instanceof IntelligenceError && (
    [401, 403, 409, 410].includes(query.error.status) || ['PROJECTION_STALE', 'E1_BUNDLE_REVOKED'].includes(query.error.code)
  )
  return { ...query, data: unsafeCache ? undefined : query.data, identity, refresh, loadMore, moreBusy, pageError, cacheKey: keyString }
}
