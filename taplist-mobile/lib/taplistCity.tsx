import AsyncStorage from '@react-native-async-storage/async-storage'
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'

import { palette } from '@/constants/design'
import { DEFAULT_TAPLIST_CITY, DEFAULT_TAPLIST_CITY_LABEL } from '@/constants/taplist'
import { fetchPublicCities } from '@/lib/api/taplist'
import { useTaplistSupabaseReady } from '@/lib/useTaplistSupabaseReady'
import type { PublicTaplistCity } from '@/lib/types'

const STORAGE_KEY = '@taplist/selected_city_v1'

const FALLBACK_CITY: PublicTaplistCity = {
  city: DEFAULT_TAPLIST_CITY,
  label: DEFAULT_TAPLIST_CITY_LABEL,
  country: 'China',
  sort_order: 10,
  bar_count: 0,
}

type TaplistCityContextValue = {
  selectedCity: PublicTaplistCity
  cities: PublicTaplistCity[]
  cityCatalogAvailable: boolean
  canSelectCity: boolean
  selectCity: (city: PublicTaplistCity) => Promise<void>
  refreshCities: () => Promise<void>
}

const TaplistCityContext = createContext<TaplistCityContextValue | null>(null)

function normalizeCity(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? ''
}

export function taplistCityMatches(a: string | null | undefined, b: string | null | undefined) {
  return normalizeCity(a) === normalizeCity(b)
}

function pickCity(persistedCity: string | null, cities: PublicTaplistCity[]) {
  if (cities.length === 0) return FALLBACK_CITY

  const persisted = cities.find((city) => taplistCityMatches(city.city, persistedCity))
  if (persisted) return persisted

  const shanghai = cities.find((city) => taplistCityMatches(city.city, DEFAULT_TAPLIST_CITY))
  if (shanghai) return shanghai

  return [...cities].sort((a, b) => {
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order
    return a.label.localeCompare(b.label)
  })[0]
}

export function TaplistCityProvider({ children }: { children: ReactNode }) {
  const configured = useTaplistSupabaseReady()
  const [selectedCity, setSelectedCity] = useState<PublicTaplistCity | null>(null)
  const [cities, setCities] = useState<PublicTaplistCity[]>([])
  const [cityCatalogAvailable, setCityCatalogAvailable] = useState(false)
  const refreshIdRef = useRef(0)

  const refreshCities = useCallback(async () => {
    const refreshId = ++refreshIdRef.current
    let persistedCity: string | null = null
    try {
      persistedCity = await AsyncStorage.getItem(STORAGE_KEY)
    } catch {
      persistedCity = null
    }

    if (refreshId !== refreshIdRef.current) return

    if (!configured) {
      setSelectedCity(FALLBACK_CITY)
      setCities([])
      setCityCatalogAvailable(false)
      return
    }

    try {
      const catalog = await fetchPublicCities()
      const nextCity = pickCity(persistedCity, catalog)

      if (refreshId !== refreshIdRef.current) return

      setSelectedCity(nextCity)
      setCities(catalog)
      setCityCatalogAvailable(catalog.length > 0)

      if (nextCity.city && !taplistCityMatches(nextCity.city, persistedCity)) {
        await AsyncStorage.setItem(STORAGE_KEY, nextCity.city)
      }
    } catch {
      if (refreshId !== refreshIdRef.current) return
      setSelectedCity(FALLBACK_CITY)
      setCities([])
      setCityCatalogAvailable(false)
    }
  }, [configured])

  useEffect(() => {
    void refreshCities()
  }, [refreshCities])

  const selectCity = useCallback(
    async (city: PublicTaplistCity) => {
      const catalogCity = cities.find((candidate) => taplistCityMatches(candidate.city, city.city))
      if (!catalogCity) return

      setSelectedCity(catalogCity)
      await AsyncStorage.setItem(STORAGE_KEY, catalogCity.city)
    },
    [cities],
  )

  const value = useMemo<TaplistCityContextValue | null>(() => {
    if (!selectedCity) return null
    return {
      selectedCity,
      cities,
      cityCatalogAvailable,
      canSelectCity: cityCatalogAvailable && cities.length > 1,
      selectCity,
      refreshCities,
    }
  }, [cities, cityCatalogAvailable, refreshCities, selectCity, selectedCity])

  if (!value) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator color={palette.amber} />
      </View>
    )
  }

  return <TaplistCityContext.Provider value={value}>{children}</TaplistCityContext.Provider>
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    backgroundColor: palette.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
})

export function useTaplistCity() {
  const value = useContext(TaplistCityContext)
  if (!value) {
    throw new Error('useTaplistCity must be used within TaplistCityProvider')
  }
  return value
}
