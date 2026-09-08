export const LEG_MAX_DISTANCE_M = 1500

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
  isOpenNow?: boolean
  todayOpensAt?: string | null
  todayClosesAt?: string | null
  closesNextDay?: boolean
  opensLaterToday?: boolean
}

export type RankedRoute = {
  stops: EligibleTenant[]
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

function destinationNewTapScore(stop: EligibleTenant | undefined): number {
  if (!stop) return 0
  return stop.qualifyingNewTapCount > 0 ? 1 : 0
}

function routeFreshnessMs(destinations: EligibleTenant[]): number {
  const times = destinations.map((stop) => Date.parse(stop.taplistVerifiedAt))
  return Math.min(...times)
}

function compareRoutes(a: RankedRoute, b: RankedRoute): number {
  if (a.totalDistanceM !== b.totalDistanceM) {
    return a.totalDistanceM - b.totalDistanceM
  }

  const aDestinations = a.stops.slice(1)
  const bDestinations = b.stops.slice(1)
  const aNewTapDestCount = aDestinations.reduce((sum, stop) => sum + destinationNewTapScore(stop), 0)
  const bNewTapDestCount = bDestinations.reduce((sum, stop) => sum + destinationNewTapScore(stop), 0)
  if (aNewTapDestCount !== bNewTapDestCount) {
    return bNewTapDestCount - aNewTapDestCount
  }

  const aFreshness = routeFreshnessMs(aDestinations)
  const bFreshness = routeFreshnessMs(bDestinations)
  if (aFreshness !== bFreshness) {
    return bFreshness - aFreshness
  }

  const aIds = aDestinations.map((stop) => stop.tenantId).join(':')
  const bIds = bDestinations.map((stop) => stop.tenantId).join(':')
  if (aIds === bIds) return 0
  return aIds < bIds ? -1 : 1
}

function rankThreeStopRoutes(
  start: EligibleTenant,
  candidates: EligibleTenant[],
): RankedRoute | null {
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

function rankTwoStopRoute(
  start: EligibleTenant,
  candidates: EligibleTenant[],
): RankedRoute | null {
  const valid: RankedRoute[] = []

  for (const stopB of candidates) {
    const leg1 = distanceBetween(start, stopB)
    if (leg1 > LEG_MAX_DISTANCE_M) continue
    valid.push({
      stops: [start, stopB],
      totalDistanceM: leg1,
    })
  }

  if (valid.length === 0) return null
  valid.sort(compareRoutes)
  return valid[0] ?? null
}

export function rankRoutes(
  start: EligibleTenant,
  destinations: EligibleTenant[],
): RankedRoute | null {
  const candidates = destinations.filter((d) => d.tenantId !== start.tenantId)
  if (candidates.length < 1) return null

  return rankThreeStopRoutes(start, candidates) ?? rankTwoStopRoute(start, candidates)
}
