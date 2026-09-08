#!/usr/bin/env node
/**
 * Unit tests for Beer Route straight-line ranking (mirrors ranking.ts).
 * Usage: node scripts/verify-beer-roadmap-ranking.mjs
 */

const LEG_MAX_DISTANCE_M = 1500
const EARTH_RADIUS_M = 6_371_000

function haversineDistanceM(fromLat, fromLng, toLat, toLng) {
  const toRad = (deg) => (deg * Math.PI) / 180
  const dLat = toRad(toLat - fromLat)
  const dLng = toRad(toLng - fromLng)
  const lat1 = toRad(fromLat)
  const lat2 = toRad(toLat)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a))
}

function tenant(id, lat, lng, overrides = {}) {
  return {
    tenantId: id,
    latitude: lat,
    longitude: lng,
    qualifyingNewTapCount: 0,
    taplistVerifiedAt: '2026-06-20T12:00:00.000Z',
    ...overrides,
  }
}

function distanceBetween(a, b) {
  return haversineDistanceM(a.latitude, a.longitude, b.latitude, b.longitude)
}

function compareRoutes(a, b) {
  if (a.totalDistanceM !== b.totalDistanceM) return a.totalDistanceM - b.totalDistanceM
  const aDest = a.stops.slice(1)
  const bDest = b.stops.slice(1)
  const aNew = aDest.reduce((sum, stop) => sum + (stop.qualifyingNewTapCount > 0 ? 1 : 0), 0)
  const bNew = bDest.reduce((sum, stop) => sum + (stop.qualifyingNewTapCount > 0 ? 1 : 0), 0)
  if (aNew !== bNew) return bNew - aNew
  const aFresh = Math.min(...aDest.map((stop) => Date.parse(stop.taplistVerifiedAt)))
  const bFresh = Math.min(...bDest.map((stop) => Date.parse(stop.taplistVerifiedAt)))
  if (aFresh !== bFresh) return bFresh - aFresh
  const aIds = aDest.map((stop) => stop.tenantId).join(':')
  const bIds = bDest.map((stop) => stop.tenantId).join(':')
  if (aIds === bIds) return 0
  return aIds < bIds ? -1 : 1
}

function rankThreeStop(start, candidates) {
  if (candidates.length < 2) return null
  const valid = []
  for (let i = 0; i < candidates.length; i += 1) {
    for (let j = 0; j < candidates.length; j += 1) {
      if (i === j) continue
      const stopB = candidates[i]
      const stopC = candidates[j]
      const leg1 = distanceBetween(start, stopB)
      const leg2 = distanceBetween(stopB, stopC)
      if (leg1 > LEG_MAX_DISTANCE_M || leg2 > LEG_MAX_DISTANCE_M) continue
      valid.push({ stops: [start, stopB, stopC], totalDistanceM: leg1 + leg2 })
    }
  }
  if (valid.length === 0) return null
  valid.sort(compareRoutes)
  return valid[0]
}

function rankTwoStop(start, candidates) {
  const valid = []
  for (const stopB of candidates) {
    const leg1 = distanceBetween(start, stopB)
    if (leg1 > LEG_MAX_DISTANCE_M) continue
    valid.push({ stops: [start, stopB], totalDistanceM: leg1 })
  }
  if (valid.length === 0) return null
  valid.sort(compareRoutes)
  return valid[0]
}

function rankRoutes(start, destinations) {
  const candidates = destinations.filter((d) => d.tenantId !== start.tenantId)
  if (candidates.length < 1) return null
  return rankThreeStop(start, candidates) ?? rankTwoStop(start, candidates)
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const start = tenant('start', 31.2304, 121.4737)
const near = tenant('near', 31.2310, 121.4740)
const far = tenant('far', 31.2500, 121.5000)
const twoStop = rankRoutes(start, [near, far])
assert(twoStop && twoStop.stops.length === 2 && twoStop.stops[1].tenantId === 'near', 'one nearby neighbor should yield two stops')

const farOnly = rankRoutes(start, [far, tenant('far2', 31.2600, 121.5100)])
assert(farOnly === null, 'over-cap legs should yield no route')

const three = rankRoutes(start, [near, tenant('near2', 31.2312, 121.4742)])
assert(three && three.stops.length === 3, 'two nearby neighbors should prefer three stops')

const d = haversineDistanceM(31.2304, 121.4737, 31.2310, 121.4740)
assert(d > 0 && d < 500, 'haversine sanity check')

console.log('verify-beer-roadmap-ranking: OK')
