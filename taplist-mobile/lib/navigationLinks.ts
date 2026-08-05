import type { BeerRoadmapLeg, BeerRoadmapStop } from '@/lib/types'

const APPLE_MAPS_BASE = 'http://maps.apple.com/'

export function buildAppleMapsPlaceUrl({
  latitude,
  longitude,
  label,
}: {
  latitude: number
  longitude: number
  label: string
}) {
  const coordinate = `${formatCoordinate(latitude)},${formatCoordinate(longitude)}`
  const params = new URLSearchParams({ ll: coordinate, q: label })
  return `${APPLE_MAPS_BASE}?${params.toString()}`
}

export function buildAppleMapsWalkingUrl({
  from,
  to,
}: {
  from: BeerRoadmapStop
  to: BeerRoadmapStop
}) {
  const params = new URLSearchParams({
    saddr: `${formatCoordinate(from.latitude)},${formatCoordinate(from.longitude)}`,
    daddr: `${formatCoordinate(to.latitude)},${formatCoordinate(to.longitude)}`,
    dirflg: 'w',
  })
  return `${APPLE_MAPS_BASE}?${params.toString()}`
}

export function navigationUrlForLeg(stops: BeerRoadmapStop[], leg: BeerRoadmapLeg) {
  const from = stops[leg.fromStopIndex]
  const to = stops[leg.toStopIndex]
  if (!from || !to) return null
  return buildAppleMapsWalkingUrl({ from, to })
}

function formatCoordinate(value: number) {
  return value.toFixed(6).replace(/\.?0+$/, '')
}
