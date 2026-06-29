import {
  assertEquals,
  assertNotEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  haversineDistanceM,
  LEG_MAX_DISTANCE_M,
  rankRoutes,
  type EligibleTenant,
} from './ranking.ts'

function tenant(
  id: string,
  lat: number,
  lng: number,
  overrides: Partial<EligibleTenant> = {},
): EligibleTenant {
  return {
    tenantId: id,
    tenantSlug: id,
    displayName: id,
    district: null,
    address: null,
    latitude: lat,
    longitude: lng,
    taplistVerifiedAt: '2026-06-20T12:00:00.000Z',
    qualifyingNewTapCount: 0,
    ...overrides,
  }
}

Deno.test('haversineDistanceM returns positive distance for nearby points', () => {
  const d = haversineDistanceM(31.2304, 121.4737, 31.2310, 121.4740)
  assertEquals(d > 0 && d < 500, true)
})

Deno.test('rankRoutes rejects legs over 1.5km cap', () => {
  const start = tenant('a', 31.2304, 121.4737)
  const near = tenant('b', 31.2310, 121.4740)
  const far = tenant('c', 31.2500, 121.5000)
  const result = rankRoutes(start, [near, far])
  assertEquals(result, null)
})

Deno.test('rankRoutes picks shortest total distance', () => {
  const start = tenant('start', 31.2304, 121.4737)
  const b1 = tenant('b1', 31.2310, 121.4740)
  const b2 = tenant('b2', 31.2312, 121.4742)
  const c1 = tenant('c1', 31.2314, 121.4744)
  const c2 = tenant('c2', 31.2320, 121.4750)

  const result = rankRoutes(start, [b1, b2, c1, c2])
  assertNotEquals(result, null)
  const ids = [result!.stops[1].tenantId, result!.stops[2].tenantId]
  assertEquals(ids.includes('b1'), true)
  assertEquals(ids.includes('c1'), true)
})

Deno.test('rankRoutes prefers more destination bars with qualifying new taps', () => {
  const start = tenant('start', 31.2304, 121.4737)
  const bPlain = tenant('b-plain', 31.2310, 121.4740)
  const bNew = tenant('b-new', 31.2310, 121.4740, {
    qualifyingNewTapCount: 1,
  })
  const cPlain = tenant('c-plain', 31.2312, 121.4742)
  const cNew = tenant('c-new', 31.2312, 121.4742, {
    qualifyingNewTapCount: 1,
  })

  const result = rankRoutes(start, [bPlain, bNew, cPlain, cNew])
  assertNotEquals(result, null)
  assertEquals(result!.stops[1].qualifyingNewTapCount > 0, true)
  assertEquals(result!.stops[2].qualifyingNewTapCount > 0, true)
})

Deno.test('rankRoutes prefers fresher destination taplist verification', () => {
  const start = tenant('start', 31.2304, 121.4737)
  const b1 = tenant('b1', 31.2310, 121.4740, {
    taplistVerifiedAt: '2026-06-19T12:00:00.000Z',
  })
  const b2 = tenant('b2', 31.2310, 121.4740, {
    taplistVerifiedAt: '2026-06-21T12:00:00.000Z',
  })
  const c1 = tenant('c1', 31.2312, 121.4742, {
    taplistVerifiedAt: '2026-06-19T12:00:00.000Z',
  })
  const c2 = tenant('c2', 31.2312, 121.4742, {
    taplistVerifiedAt: '2026-06-21T12:00:00.000Z',
  })

  const result = rankRoutes(start, [b1, b2, c1, c2])
  assertNotEquals(result, null)
  assertEquals(result!.stops[1].tenantId, 'b2')
  assertEquals(result!.stops[2].tenantId, 'c2')
})

Deno.test('rankRoutes tie-breaks on stable tenant IDs', () => {
  const start = tenant('start', 31.2304, 121.4737)
  const bLow = tenant('00000000-0000-4000-8000-000000000002', 31.2310, 121.4740)
  const bHigh = tenant('00000000-0000-4000-8000-000000000003', 31.2310, 121.4740)
  const cLow = tenant('00000000-0000-4000-8000-000000000004', 31.2312, 121.4742)
  const cHigh = tenant('00000000-0000-4000-8000-000000000005', 31.2312, 121.4742)

  const result = rankRoutes(start, [bHigh, bLow, cHigh, cLow])
  assertNotEquals(result, null)
  assertEquals(result!.stops[1].tenantId, bLow.tenantId)
  assertEquals(result!.stops[2].tenantId, cLow.tenantId)
})

Deno.test('LEG_MAX_DISTANCE_M is 1500', () => {
  assertEquals(LEG_MAX_DISTANCE_M, 1500)
})
