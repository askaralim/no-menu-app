import * as Location from 'expo-location'

import { findSupportedCity, type Coordinates } from '@/lib/nearbyBars'
import type { PublicTaplistCity } from '@/lib/types'

const LOCATION_TIMEOUT_MS = 10_000

export type NearbyPermissionState = 'granted' | 'undetermined' | 'denied'

export async function getNearbyPermissionState(): Promise<NearbyPermissionState> {
  const permission = await Location.getForegroundPermissionsAsync()
  if (permission.granted) return 'granted'
  return permission.status === Location.PermissionStatus.UNDETERMINED ? 'undetermined' : 'denied'
}

export async function requestNearbyPermission(): Promise<'granted' | 'denied'> {
  const permission = await Location.requestForegroundPermissionsAsync()
  return permission.granted ? 'granted' : 'denied'
}

export async function fetchNearbyLocation(cities: PublicTaplistCity[]) {
  const location = await withTimeout(
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
    LOCATION_TIMEOUT_MS,
  )
  const coordinates: Coordinates = {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
  }

  let detectedCity: PublicTaplistCity | null = null
  try {
    const [address] = await Location.reverseGeocodeAsync(coordinates)
    if (address) {
      detectedCity = findSupportedCity(
        [address.city, address.region, address.subregion, address.district],
        cities,
      )
    }
  } catch {
    // Distance sorting still works when Apple's reverse geocoder is unavailable.
  }

  return { coordinates, detectedCity }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('LOCATION_TIMEOUT')), timeoutMs)
    promise.then(
      (value) => {
        clearTimeout(timeout)
        resolve(value)
      },
      (error) => {
        clearTimeout(timeout)
        reject(error)
      },
    )
  })
}
