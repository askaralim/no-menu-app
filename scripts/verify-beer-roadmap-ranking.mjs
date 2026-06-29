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

function rankRoutes(start, destinations) {
  const candidates = destinations.filter((d) => d.tenantId !== start.tenantId)
  if (candidates.length < 2) return null

  const valid = []
  for (let i = 0; i < candidates.length; i += 1) {
    for (let j = 0; j < candidates.length; j += 1) {
      if (i === j) continue
      const stopB = candidates[i]
      const stopC = candidates[j]
      const leg1 = haversineDistanceM(
        start.latitude,
        start.longitude,
        stopB.latitude,
        stopB.longitude,
      )
      const leg2 = haversineDistanceM(
        stopB.latitude,
        stopB.longitude,
        stopC.latitude,
        stopC.longitude,
      )
      if (leg1 > LEG_MAX_DISTANCE_M || leg2 > LEG_MAX_DISTANCE_M) continue
      valid.push({ stops: [start, stopB, stopC], totalDistanceM: leg1 + leg2 })
    }
  }
  if (valid.length === 0) return null
  valid.sort((a, b) => a.totalDistanceM - b.totalDistanceM)
  return valid[0]
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const start = tenant('start', 31.2304, 121.4737)
const near = tenant('near', 31.2310, 121.4740)
const far = tenant('far', 31.2500, 121.5000)
assert(rankRoutes(start, [near, far]) === null, 'over-cap legs should yield no route')

const d = haversineDistanceM(31.2304, 121.4737, 31.2310, 121.4740)
assert(d > 0 && d < 500, 'haversine sanity check')

console.log('verify-beer-roadmap-ranking: OK')
