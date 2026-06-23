import type { BeerRoadmapLeg, BeerRoadmapStop } from '@/lib/types'

const AMAP_URI_BASE = 'https://uri.amap.com/navigation'
const AMAP_SOURCE = 'NoMenu'

export function buildAmapWalkingNavigationUrl({
  from,
  to,
}: {
  from: BeerRoadmapStop
  to: BeerRoadmapStop
}) {
  const params = [
    ['from', formatWaypoint(from)],
    ['to', formatWaypoint(to)],
    ['mode', 'walk'],
    ['coordinate', 'gaode'],
    ['callnative', '1'],
    ['src', AMAP_SOURCE],
  ]

  return `${AMAP_URI_BASE}?${params
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&')}`
}

export function navigationUrlForLeg(stops: BeerRoadmapStop[], leg: BeerRoadmapLeg) {
  const from = stops[leg.fromStopIndex]
  const to = stops[leg.toStopIndex]
  if (!from || !to) return null
  return buildAmapWalkingNavigationUrl({ from, to })
}

function formatWaypoint(stop: BeerRoadmapStop) {
  return `${formatCoordinate(stop.longitude)},${formatCoordinate(stop.latitude)},${stop.displayName}`
}

function formatCoordinate(value: number) {
  return value.toFixed(6).replace(/\.?0+$/, '')
}
