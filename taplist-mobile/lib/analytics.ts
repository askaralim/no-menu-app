import AsyncStorage from '@react-native-async-storage/async-storage'
import Constants from 'expo-constants'
import { Platform } from 'react-native'
import PostHog, { PostHogPersistedProperty } from 'posthog-react-native'

const ANALYTICS_ENABLED_KEY = '@taplist/analytics_enabled_v1'
const DEFAULT_POSTHOG_HOST = 'https://us.i.posthog.com'

export type AnalyticsSource =
  | 'home_bar'
  | 'home_new_tap'
  | 'home_event'
  | 'search_result'
  | 'search_discovery'
  | 'bar_taplist'
  | 'bar_event'
  | 'beer_route'
  | 'direct'

export type AnalyticsScreenName =
  | 'home'
  | 'search'
  | 'about'
  | 'drink_log'
  | 'drink_log_detail'
  | 'events'
  | 'bar_detail'
  | 'bar_events'
  | 'event_detail'
  | 'beer_detail'
  | 'not_found'

type AnalyticsPrimitive = string | number | boolean
export type AnalyticsProperties = Record<string, AnalyticsPrimitive | null | undefined>

export type AnalyticsEventName =
  | 'screen_viewed'
  | 'city_changed'
  | 'bar_opened'
  | 'beer_opened'
  | 'event_opened'
  | 'search_completed'
  | 'taplist_image_save_succeeded'
  | 'taplist_image_save_failed'
  | 'beer_image_save_succeeded'
  | 'beer_image_save_failed'
  | 'apple_maps_opened'
  | 'drink_light_started'
  | 'drink_light_succeeded'
  | 'drink_light_failed'
  | 'drink_venue_added'
  | 'drink_unlit'
  | 'drink_log_opened'
  | 'drink_share_generated'
  | 'drink_tonight_share_generated'
  | 'apple_link_started'
  | 'apple_link_succeeded'
  | 'apple_link_failed'
  | 'consumer_profile_edit_opened'
  | 'consumer_username_updated'
  | 'consumer_username_update_failed'

type AnalyticsExtra = {
  posthogApiKey?: string
  posthogHost?: string
  posthogDebug?: boolean
}

let client: PostHog | null = null
let analyticsEnabled: boolean | null = null
let currentCity: string | null = null

function analyticsConfig() {
  const extra = Constants.expoConfig?.extra as AnalyticsExtra | undefined
  const apiKey = (process.env.EXPO_PUBLIC_POSTHOG_API_KEY || extra?.posthogApiKey || '').trim()
  const host =
    (process.env.EXPO_PUBLIC_POSTHOG_HOST || extra?.posthogHost || DEFAULT_POSTHOG_HOST).trim() ||
    DEFAULT_POSTHOG_HOST
  const debug =
    process.env.EXPO_PUBLIC_POSTHOG_DEBUG === 'true' || extra?.posthogDebug === true

  return { apiKey, host, debug }
}

function canCreateClient() {
  const { apiKey, debug } = analyticsConfig()
  return Boolean(apiKey) && (!__DEV__ || debug)
}

function getClient() {
  if (!canCreateClient()) return null
  if (client) return client

  const { apiKey, host, debug } = analyticsConfig()
  client = new PostHog(apiKey, {
    host,
    customStorage: AsyncStorage,
    captureAppLifecycleEvents: true,
    disableGeoip: true,
    enableSessionReplay: false,
    errorTracking: { autocapture: false },
    disableSurveys: true,
    disableRemoteConfig: true,
    disabled: false,
    defaultOptIn: analyticsEnabled === true,
  })
  client.debug(debug)
  return client
}

function commonProperties(): AnalyticsProperties {
  const { debug } = analyticsConfig()
  return {
    platform: Platform.OS,
    app_version: Constants.nativeAppVersion || Constants.expoConfig?.version || null,
    build_number:
      Constants.nativeBuildVersion || Constants.expoConfig?.ios?.buildNumber || null,
    city: currentCity,
    is_internal: __DEV__ || debug,
  }
}

function cleanProperties(properties: AnalyticsProperties = {}) {
  return Object.fromEntries(
    Object.entries({ ...commonProperties(), ...properties }).filter(
      ([, value]) => value !== undefined && value !== null,
    ),
  ) as Record<string, AnalyticsPrimitive>
}

export async function initializeAnalytics(): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(ANALYTICS_ENABLED_KEY)
    analyticsEnabled = stored === '1'
    if (!analyticsEnabled) return
    const posthog = getClient()
    if (!posthog) return
    await posthog.ready()
    await posthog.optIn()
  } catch {
    // Analytics must never block the consumer app.
  }
}

export function setAnalyticsCity(city: string | null | undefined): void {
  currentCity = city?.trim() || null
}

export function trackScreen(
  name: AnalyticsScreenName,
  properties: AnalyticsProperties = {},
): void {
  trackEvent('screen_viewed', { screen: name, ...properties })
}

export function trackEvent(
  name: AnalyticsEventName,
  properties: AnalyticsProperties = {},
): void {
  if (analyticsEnabled !== true) return
  try {
    getClient()?.capture(name, cleanProperties(properties))
  } catch {
    // Analytics failures are intentionally soft.
  }
}

export async function identifyUser(
  userId: string,
  properties: AnalyticsProperties = {},
): Promise<void> {
  if (!userId.trim() || analyticsEnabled !== true) return
  try {
    const posthog = getClient()
    if (!posthog) return
    await posthog.ready()
    posthog.identify(userId.trim(), cleanProperties(properties))
  } catch {
    // Identification must not affect authentication.
  }
}

export async function resetUser(): Promise<void> {
  try {
    const posthog = getClient()
    if (!posthog) return
    await posthog.ready()
    posthog.reset()
    if (analyticsEnabled === false) await posthog.optOut()
  } catch {
    // Reset is best-effort.
  }
}

export async function setAnalyticsEnabled(enabled: boolean): Promise<void> {
  analyticsEnabled = enabled
  try {
    await AsyncStorage.setItem(ANALYTICS_ENABLED_KEY, enabled ? '1' : '0')
    if (enabled) {
      const posthog = getClient()
      if (!posthog) return
      await posthog.ready()
      await posthog.optIn()
      return
    }

    const existingClient = client
    if (existingClient) {
      await existingClient.ready()
      await existingClient.optOut()
      existingClient.reset([
        PostHogPersistedProperty.OptedOut,
        PostHogPersistedProperty.InstalledAppBuild,
        PostHogPersistedProperty.InstalledAppVersion,
      ])
      existingClient.setPersistedProperty(PostHogPersistedProperty.Queue, null)
      existingClient.setPersistedProperty(PostHogPersistedProperty.AiQueue, null)
      existingClient.setPersistedProperty(PostHogPersistedProperty.LogsQueue, null)
    }
  } catch {
    // The persisted preference remains the source of truth on the next launch.
  }
}

export async function isAnalyticsEnabled(): Promise<boolean> {
  if (analyticsEnabled !== null) return analyticsEnabled
  try {
    analyticsEnabled = (await AsyncStorage.getItem(ANALYTICS_ENABLED_KEY)) === '1'
    return analyticsEnabled
  } catch {
    return false
  }
}

export async function getAnalyticsDistinctId(): Promise<string | null> {
  if (analyticsEnabled !== true) return null
  try {
    const posthog = getClient()
    if (!posthog) return null
    await posthog.ready()
    return posthog.getDistinctId()
  } catch {
    return null
  }
}
