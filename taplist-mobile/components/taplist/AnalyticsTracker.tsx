import { useLocalSearchParams, usePathname } from 'expo-router'
import { useEffect, useRef, useState } from 'react'

import {
  initializeAnalytics,
  setAnalyticsCity,
  trackScreen,
  type AnalyticsProperties,
  type AnalyticsScreenName,
} from '@/lib/analytics'
import { useTaplistCity } from '@/lib/taplistCity'

export function AnalyticsTracker() {
  const pathname = usePathname()
  const params = useLocalSearchParams<Record<string, string | string[]>>()
  const { selectedCity } = useTaplistCity()
  const previousRouteKey = useRef<string | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    void initializeAnalytics().finally(() => {
      if (!cancelled) setReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    setAnalyticsCity(selectedCity.city)
  }, [selectedCity.city])

  useEffect(() => {
    if (!ready) return
    const route = analyticsRoute(pathname, params)
    if (!route) return
    const routeKey = JSON.stringify([pathname, route.name, route.properties])
    if (routeKey === previousRouteKey.current) return
    previousRouteKey.current = routeKey
    trackScreen(route.name, route.properties)
  }, [params, pathname, ready])

  return null
}

function analyticsRoute(
  pathname: string,
  params: Record<string, string | string[]>,
): { name: AnalyticsScreenName; properties: AnalyticsProperties } | null {
  const value = (key: string) => {
    const raw = params[key]
    return Array.isArray(raw) ? raw[0] : raw
  }
  const tenantSlug = value('slug')

  if (pathname === '/') return { name: 'home', properties: {} }
  if (pathname === '/search') return { name: 'search', properties: {} }
  if (pathname === '/about') return { name: 'about', properties: {} }
  if (pathname === '/mine') return { name: 'drink_log', properties: {} }
  if (pathname === '/events') return { name: 'events', properties: {} }
  if (pathname === '/+not-found') return { name: 'not_found', properties: {} }
  if (/^\/bar\/[^/]+\/beer\/[^/]+$/.test(pathname)) {
    return {
      name: 'beer_detail',
      properties: { tenant_slug: tenantSlug, drink_id: value('drinkId') },
    }
  }
  if (/^\/bar\/[^/]+\/event\/[^/]+$/.test(pathname)) {
    return {
      name: 'event_detail',
      properties: { tenant_slug: tenantSlug, event_id: value('eventId') },
    }
  }
  if (/^\/bar\/[^/]+\/events$/.test(pathname)) {
    return { name: 'bar_events', properties: { tenant_slug: tenantSlug } }
  }
  if (/^\/bar\/[^/]+$/.test(pathname)) {
    return { name: 'bar_detail', properties: { tenant_slug: tenantSlug } }
  }
  if (/^\/drink-log\/[^/]+$/.test(pathname)) {
    return { name: 'drink_log_detail', properties: {} }
  }
  return null
}
