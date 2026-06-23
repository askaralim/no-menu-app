export const LEG_MAX_DISTANCE_M = 1200

export type EligibleTenant = {
  tenantId: string
  tenantSlug: string
  displayName: string
  district: string | null
  address: string | null
  latitude: number
  longitude: number
  taplistVerifiedAt: string
  qualifyingNewTapCount: number
  newTapNames: string[]
}

export type RankedRoute = {
  stops: [EligibleTenant, EligibleTenant, EligibleTenant]
  totalDistanceM: number
}

const EARTH_RADIUS_M = 6_371_000

export function haversineDistanceM(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(toLat - fromLat)
  const dLng = toRad(toLng - fromLng)
  const lat1 = toRad(fromLat)
  const lat2 = toRad(toLat)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a))
}

function distanceBetween(a: EligibleTenant, b: EligibleTenant): number {
  return haversineDistanceM(a.latitude, a.longitude, b.latitude, b.longitude)
}

function destinationNewTapScore(stop: EligibleTenant): number {
  return stop.qualifyingNewTapCount > 0 ? 1 : 0
}

function routeFreshnessMs(stopB: EligibleTenant, stopC: EligibleTenant): number {
  const bMs = Date.parse(stopB.taplistVerifiedAt)
  const cMs = Date.parse(stopC.taplistVerifiedAt)
  return Math.min(bMs, cMs)
}

function compareRoutes(a: RankedRoute, b: RankedRoute): number {
  if (a.totalDistanceM !== b.totalDistanceM) {
    return a.totalDistanceM - b.totalDistanceM
  }

  const aNewTapDestCount =
    destinationNewTapScore(a.stops[1]) + destinationNewTapScore(a.stops[2])
  const bNewTapDestCount =
    destinationNewTapScore(b.stops[1]) + destinationNewTapScore(b.stops[2])
  if (aNewTapDestCount !== bNewTapDestCount) {
    return bNewTapDestCount - aNewTapDestCount
  }

  const aFreshness = routeFreshnessMs(a.stops[1], a.stops[2])
  const bFreshness = routeFreshnessMs(b.stops[1], b.stops[2])
  if (aFreshness !== bFreshness) {
    return bFreshness - aFreshness
  }

  const aB = a.stops[1].tenantId
  const aC = a.stops[2].tenantId
  const bB = b.stops[1].tenantId
  const bC = b.stops[2].tenantId
  if (aB !== bB) return aB < bB ? -1 : 1
  if (aC !== bC) return aC < bC ? -1 : 1
  return 0
}

export function rankRoutes(
  start: EligibleTenant,
  destinations: EligibleTenant[],
): RankedRoute | null {
  const candidates = destinations.filter((d) => d.tenantId !== start.tenantId)
  if (candidates.length < 2) return null

  const valid: RankedRoute[] = []

  for (let i = 0; i < candidates.length; i += 1) {
    for (let j = 0; j < candidates.length; j += 1) {
      if (i === j) continue
      const stopB = candidates[i]
      const stopC = candidates[j]
      const leg1 = distanceBetween(start, stopB)
      const leg2 = distanceBetween(stopB, stopC)
      if (leg1 > LEG_MAX_DISTANCE_M || leg2 > LEG_MAX_DISTANCE_M) continue

      valid.push({
        stops: [start, stopB, stopC],
        totalDistanceM: leg1 + leg2,
      })
    }
  }

  if (valid.length === 0) return null

  valid.sort(compareRoutes)
  return valid[0] ?? null
}
