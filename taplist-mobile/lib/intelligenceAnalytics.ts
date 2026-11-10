import AsyncStorage from '@react-native-async-storage/async-storage'
import type { Session } from '@supabase/supabase-js'
import Constants from 'expo-constants'
import { randomUUID } from 'expo-crypto'
import { useSyncExternalStore } from 'react'
import { AppState, Platform } from 'react-native'

import { INTELLIGENCE_ENABLED, IntelligenceError, intelligenceRequest } from '@/lib/intelligenceHttp'
import { getTaplistSupabase } from '@/lib/supabase'

const STORAGE = '@taplist/intelligence_outbox_v1'
const MAX_AGE = 7 * 86400_000
const IDLE = 30 * 60_000
type Payload = Record<string, unknown>
type Event = Payload & { event_id: string; occurred_at: string }
type Operation = {
  owner: string
  payload: { operation_id: string; action: 'link' | 'unlink'; installation_id: string; session_id: string; session_started_at: string; occurred_at: string }
}
export type AnalyticsContext = { installation_id: string; session_id: string; session_started_at: string }
type State = { ready: boolean; owner: string | null; revision: number; analytics: AnalyticsContext | null }
let state: State = { ready: false, owner: null, revision: 0, analytics: null }
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
export const useIntelligenceContext = () => useSyncExternalStore(subscribe, () => state, () => state)
export const intelligenceContext = () => state
let consent = false
let installation: string | null = null
let authSession: Session | null = null
let events: Event[] = []
let operations: Operation[] = []
let started = false
let initializing: Promise<void> | null = null
let lastActivity = 0
let saving = Promise.resolve()
let flushing = false
let retryAt = 0
let identityRetryAt = 0
let failures = 0
let consentEpoch = 0
const seen = new Set<string>()

function publish(update: Partial<State>) {
  state = { ...state, ...update }
  listeners.forEach((listener) => listener())
}

function persist() {
  const value = consent && installation ? JSON.stringify({ installation, events, operations }) : null
  saving = saving.catch(() => {}).then(async () => {
    if (value) await AsyncStorage.setItem(STORAGE, value)
    else await AsyncStorage.removeItem(STORAGE)
  }).catch(() => {})
}

function newSession() {
  const analytics = consent && installation ? {
    installation_id: installation, session_id: randomUUID(), session_started_at: new Date().toISOString(),
  } : null
  lastActivity = Date.now()
  seen.clear()
  pendingNavigation = []
  publish({ analytics, revision: state.revision + 1 })
  if (analytics && state.owner) {
    operations.push({ owner: state.owner, payload: {
      operation_id: randomUUID(), action: 'link', ...analytics, occurred_at: analytics.session_started_at,
    } })
    persist()
    void flushIntelligenceEvents()
  }
}

function acceptAuth(session: Session | null) {
  const owner = session?.user.id || null
  const previous = authSession
  authSession = session
  if (owner !== state.owner) {
    const context = state.analytics
    // Close the old interval with the old account's token only. Never reuse an
    // operation under the next account. Session rotation also bounds producers.
    if (context && previous && consent) {
      const operation: Operation = { owner: previous.user.id, payload: {
        operation_id: randomUUID(), action: 'unlink', ...context, occurred_at: new Date().toISOString(),
      } }
      operations.push(operation)
      void intelligenceRequest('/api/analytics/v1/identity-operations', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${previous.access_token}` },
        body: JSON.stringify(operation.payload),
      }).then(() => {
        operations = operations.filter((item) => item !== operation)
        persist()
      }).catch(() => {})
    }
    state = { ...state, owner }
    newSession()
  }
  publish({ ready: true })
}

export async function initializeIntelligence(enabled: boolean) {
  if (initializing) return initializing
  initializing = (async () => {
    if (!INTELLIGENCE_ENABLED) { publish({ ready: true }); return }
    await setIntelligenceConsent(enabled)
    if (started) return
    started = true
    getTaplistSupabase().auth.onAuthStateChange((_event, session) => {
      // Do not call Supabase again inside its auth callback.
      setTimeout(() => acceptAuth(session), 0)
    })
    AppState.addEventListener('change', (status) => {
      if (status === 'active') { touchIntelligenceSession(); void flushIntelligenceEvents() }
      else persist()
    })
    setInterval(() => {
      if (AppState.currentState === 'active') void flushIntelligenceEvents()
    }, 15_000)
  })().catch(() => { publish({ ready: true }) })
  return initializing
}

export async function setIntelligenceConsent(enabled: boolean) {
  const epoch = ++consentEpoch
  consent = enabled && INTELLIGENCE_ENABLED
  if (!consent) {
    installation = null
    events = []
    operations = []
    retryAt = 0
    newSession()
    persist()
    return
  }
  if (!installation) {
    try {
      const stored = JSON.parse(await AsyncStorage.getItem(STORAGE) || 'null')
      if (epoch !== consentEpoch) return
      if (stored && isUUID(stored.installation)) {
        installation = stored.installation
        events = Array.isArray(stored.events) ? stored.events.filter((event: Event) => isUUID(event.event_id) && Date.parse(event.occurred_at) > Date.now() - MAX_AGE).slice(-200) : []
        operations = Array.isArray(stored.operations) ? stored.operations.filter((op: Operation) => op.payload?.installation_id === installation && Date.parse(op.payload.occurred_at) > Date.now() - MAX_AGE).slice(-200) : []
      }
    } catch { /* Corrupt or unavailable storage must not affect browsing. */ }
    if (epoch !== consentEpoch) return
    installation ||= randomUUID()
  }
  newSession()
  persist()
}

export function touchIntelligenceSession() {
  if (consent && Date.now() - lastActivity > IDLE) newSession()
  lastActivity = Date.now()
  return state.analytics
}

function enqueue(payload: Payload, context = touchIntelligenceSession()): boolean {
  if (!consent || !context || context.session_id !== state.analytics?.session_id) return false
  const event: Event = {
    ...payload, event_id: randomUUID(), schema_version: 1, occurred_at: new Date().toISOString(),
    session_id: context.session_id, session_started_at: context.session_started_at,
  }
  // Every producer below has bounded identifiers, never user-entered text.
  if (JSON.stringify(event).length > 2000) return false
  events = [...events.filter((item) => Date.parse(item.occurred_at) > Date.now() - MAX_AGE), event].slice(-200)
  persist()
  return true
}

export async function flushIntelligenceEvents() {
  if (!consent || !installation || flushing || Date.now() < retryAt) return
  flushing = true
  const epoch = consentEpoch
  try {
    events = events.filter((event) => Date.parse(event.occurred_at) > Date.now() - MAX_AGE)
    operations = operations.filter((operation) => Date.parse(operation.payload.occurred_at) > Date.now() - MAX_AGE).slice(-200)
    const session = authSession
    if (session && session.expires_at && session.expires_at * 1000 > Date.now() && Date.now() >= identityRetryAt) {
      for (const operation of operations.filter((op) => op.owner === session.user.id)) {
        if (epoch !== consentEpoch || authSession?.user.id !== session.user.id) return
        try {
          await intelligenceRequest('/api/analytics/v1/identity-operations', {
            method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
            body: JSON.stringify(operation.payload),
          })
          operations = operations.filter((item) => item !== operation)
        } catch (error) {
          if (error instanceof IntelligenceError && [400, 403, 409, 422].includes(error.status)) {
            operations = operations.filter((item) => item !== operation)
          } else {
            // Keep the immutable operation for reconciliation, but allow raw
            // events to arrive even while the identity endpoint is unavailable.
            identityRetryAt = Date.now() + Math.max(30_000, error instanceof IntelligenceError ? error.retryAfter : 0)
            break
          }
        }
      }
    }
    if (epoch !== consentEpoch || !events.length) return
    const batch = events.slice(0, 20)
    const result = await intelligenceRequest<{
      accepted: string[]; duplicates: string[]; rejected: { event_id: string | null; event_index: number; retryable: boolean }[]
    }>('/api/analytics/v1/events/batch', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batch_id: randomUUID(), installation_id: installation,
        client: { application: 'taplist', platform: Platform.OS, app_version: Constants.expoConfig?.version || 'unknown' }, events: batch }),
    })
    if (epoch !== consentEpoch) return
    const removed = new Set([...(result.accepted || []), ...(result.duplicates || [])])
    for (const rejection of result.rejected || []) {
      const id = rejection.event_id || batch[rejection.event_index]?.event_id
      if (!rejection.retryable && id) removed.add(id)
    }
    events = events.filter((event) => !removed.has(event.event_id))
    failures = 0
    retryAt = Date.now() + 1_000
  } catch (error) {
    failures++
    retryAt = Date.now() + Math.max(Math.min(300_000, 2 ** Math.min(failures, 8) * 1_000), error instanceof IntelligenceError ? error.retryAfter : 0)
  } finally {
    flushing = false
    persist()
  }
}

export function isUUID(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

let cityDirectory = new Map<string, string>()
let selectedCity: string | null = null
export function setIntelligenceCities(cities: { source_city: string; city_code: string }[]) {
  cityDirectory = new Map(cities.map((city) => [city.source_city, city.city_code]))
}
export function setIntelligenceCity(city: string | null) { selectedCity = city }
const cityCode = (city: unknown) => typeof city === 'string' ? cityDirectory.get(city) || null : null

type Navigation = { name: string; ids: Record<string, string>; source: string; at: number }
let pendingNavigation: Navigation[] = []
const validIds = (properties: Payload) => Object.fromEntries(Object.entries(properties).filter(([, value]) => isUUID(value))) as Record<string, string>

// Existing PostHog click sites supply navigation context. Detail pages emit the
// first-party opened event only after the resource actually loads.
export function observeIntelligenceClick(name: string, properties: Payload) {
  if (!consent) return
  touchIntelligenceSession()
  const source = typeof properties.source === 'string' ? properties.source : 'direct'
  const ids = validIds({ tenant_id: properties.tenant_id, product_id: properties.product_id,
    source_drink_id: properties.drink_id, activity_id: properties.event_id })
  if (['beer_opened', 'bar_opened', 'event_opened'].includes(name)) {
    pendingNavigation = [...pendingNavigation.filter((nav) => Date.now() - nav.at < 30_000), { name: name === 'event_opened' ? 'activity_opened' : name, ids, source, at: Date.now() }].slice(-10)
    if (name === 'beer_opened' && source === 'search_result' && Number.isInteger(properties.display_position)
      && (ids.product_id || ids.source_drink_id)) {
      enqueue({ event_name: 'search_result_opened', source, selected_city_code: cityCode(selectedCity),
        result: { type: 'beer', ...ids }, display_position: properties.display_position })
    }
  } else if (name === 'apple_maps_opened' && isUUID(properties.destination_tenant_id || properties.tenant_id)) {
    enqueue({ event_name: 'map_navigation_clicked', source, selected_city_code: cityCode(selectedCity),
      tenant_id: properties.destination_tenant_id || properties.tenant_id, provider: 'apple_maps' })
  } else if (name === 'city_changed') {
    const to = cityCode(properties.to_city)
    if (to) enqueue({ event_name: 'city_changed', source: 'city_picker', selected_city_code: to,
      from_city_code: cityCode(properties.from_city), to_city_code: to })
  }
}

export function recordDetailOpened(name: 'beer_opened' | 'bar_opened' | 'activity_opened', properties: Payload, source = 'direct') {
  if (!consent) return
  touchIntelligenceSession()
  const ids = validIds(properties)
  if (name === 'beer_opened' ? !ids.product_id && !ids.source_drink_id : name === 'bar_opened' ? !ids.tenant_id : !ids.activity_id) return
  const match = [...pendingNavigation].reverse().find((nav) => nav.name === name && Date.now() - nav.at < 30_000 && (
    name === 'bar_opened' ? nav.ids.tenant_id === ids.tenant_id : name === 'activity_opened' ? nav.ids.activity_id === ids.activity_id
      : (ids.source_drink_id && nav.ids.source_drink_id === ids.source_drink_id) || (ids.product_id && nav.ids.product_id === ids.product_id)
  ))
  if (match) pendingNavigation = pendingNavigation.filter((nav) => nav !== match)
  enqueue({ event_name: name, ...ids, source: match?.source || source, selected_city_code: cityCode(selectedCity) })
}

export function recordFeedEvent(name: 'feed_shown' | 'feed_item_impression' | 'feed_item_opened',
  instance: string, context: AnalyticsContext | null, itemId?: string, position?: number, duration?: number) {
  touchIntelligenceSession()
  if (!context || context.session_id !== state.analytics?.session_id) return
  const dedup = `${instance}:${name}:${itemId || ''}`
  if (name !== 'feed_item_opened' && seen.has(dedup)) return
  const queued = enqueue({ event_name: name,
    feed: { feed_instance_id: instance, ...(itemId ? { item_id: itemId, display_position: position } : {}) },
    ...(name === 'feed_item_impression' ? { properties: { visible_duration_ms: Math.max(750, Math.floor(duration || 750)), visibility_threshold: 0.5 } } : {}),
  }, context)
  if (queued && name !== 'feed_item_opened') seen.add(dedup)
}
