import type { PublicBarRow, PublicTaplistCity } from '@/lib/types'

export type Coordinates = {
  latitude: number
  longitude: number
}

export type BarDistance = {
  bar: PublicBarRow
  distanceMeters: number | null
}

const EARTH_RADIUS_METERS = 6_371_000

export function publicBarCoordinates(bar: PublicBarRow): Coordinates | null {
  if (
    typeof bar.latitude !== 'number' ||
    !Number.isFinite(bar.latitude) ||
    bar.latitude < -90 ||
    bar.latitude > 90 ||
    typeof bar.longitude !== 'number' ||
    !Number.isFinite(bar.longitude) ||
    bar.longitude < -180 ||
    bar.longitude > 180
  ) {
    return null
  }

  return { latitude: bar.latitude, longitude: bar.longitude }
}

export function haversineDistanceMeters(from: Coordinates, to: Coordinates) {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180
  const latitudeDelta = toRadians(to.latitude - from.latitude)
  const longitudeDelta = toRadians(to.longitude - from.longitude)
  const fromLatitude = toRadians(from.latitude)
  const toLatitude = toRadians(to.latitude)

  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDelta / 2) ** 2

  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function sortBarsByDistance(bars: PublicBarRow[], origin: Coordinates): BarDistance[] {
  return bars
    .map((bar, originalIndex) => {
      const coordinates = publicBarCoordinates(bar)
      return {
        bar,
        originalIndex,
        distanceMeters: coordinates ? haversineDistanceMeters(origin, coordinates) : null,
      }
    })
    .sort((a, b) => {
      if (a.distanceMeters === null && b.distanceMeters === null) {
        return a.originalIndex - b.originalIndex
      }
      if (a.distanceMeters === null) return 1
      if (b.distanceMeters === null) return -1
      return a.distanceMeters - b.distanceMeters || a.originalIndex - b.originalIndex
    })
    .map(({ bar, distanceMeters }) => ({ bar, distanceMeters }))
}

export function formatDistance(distanceMeters: number | null) {
  if (distanceMeters === null || !Number.isFinite(distanceMeters) || distanceMeters < 0) return null
  if (distanceMeters < 1_000) return `${Math.max(10, Math.round(distanceMeters / 10) * 10)} m`
  return `${(distanceMeters / 1_000).toFixed(1)} km`
}

export function findSupportedCity(
  addressParts: Array<string | null | undefined>,
  cities: PublicTaplistCity[],
) {
  const candidates = addressParts.map(normalizeCityKey).filter(Boolean)
  return cities.find((city) => {
    const cityKeys = [normalizeCityKey(city.city), normalizeCityKey(city.label)]
    return candidates.some((candidate) => cityKeys.includes(candidate))
  }) ?? null
}

function normalizeCityKey(value: string | null | undefined) {
  return value
    ?.normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[\s·・-]/g, '')
    .replace(/(city|市)$/u, '') ?? ''
}
