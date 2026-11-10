import { createHmac, timingSafeEqual } from 'node:crypto'
import { DAY, MINUTE, canonical, fail, freeze, iso, ms } from './core.js'
import { validate } from '../validation.js'

export function feedAvailability(mode, projections, now, snapshot, currentVersions) {
  const scopes = mode === 'latest' ? ['catalog'] : ['catalog', 'consumer']
  for (const scope of scopes) {
    const at = ms(projections[scope])
    if (!Number.isFinite(at) || at > now || now - at > 10 * MINUTE) fail('PROJECTION_STALE', 503)
  }
  if (mode === 'latest') return { state: null, data_as_of: projections.catalog }
  if (!snapshot) return { state: 'building', data_as_of: iso(Math.min(...scopes.map(s => ms(projections[s])))) }
  return { state: canonical(snapshot.versions) === canonical(currentVersions) ? 'fresh' : 'stale', data_as_of: snapshot.data_as_of }
}

export function currentEligibility(item, current, now, { mode, styles = new Set(), tapped = new Set(), windowDays = 14 }) {
  if (!current || current.item_id !== item.item_id || !current.public_tenant || !current.public_category || !current.public_drink || !current.tap_assigned || current.accuracy !== 'exact' || current.canceled || current.ended_at !== null) return false
  if (!['new', 'available', 'low'].includes(current.public_status)) return false
  const start = ms(current.current_cycle_started_at)
  if (!Number.isFinite(start) || start > now || start < now - windowDays * DAY) return false
  if (mode === 'for_you' && (!current.style_family || current.style_family === '其他' || !styles.has(current.style_family) || tapped.has(canonical([current.beer_identity, current.tenant_id])))) return false
  return true
}

export function personalizedState({ count, threshold = 5, snapshot, projections, versions, now, items = [], isEligible, emptyReason = 'no_matching_style' }) {
  const freshness = feedAvailability('for_you', projections, now, snapshot, versions)
  const personalization = { status: count < threshold ? 'cold_start' : 'eligible', unique_tap_count: count, required_tap_count: threshold }
  const currentDataAsOf = iso(Math.min(ms(projections.catalog), ms(projections.consumer)))
  if (count < threshold) return { personalization, snapshot: null, data_as_of: currentDataAsOf, items: [], total_items: 0, empty_reason: null }
  if (!snapshot) return { personalization, snapshot: { state: 'building', snapshot_id: null, model_version: null, generated_at: null }, data_as_of: currentDataAsOf, items: [], total_items: 0, empty_reason: 'refresh_pending' }
  const remaining = items.filter(isEligible).map(i => structuredClone(i))
  return { personalization, snapshot: { state: freshness.state, snapshot_id: snapshot.snapshot_id, model_version: snapshot.model_version, generated_at: snapshot.generated_at }, data_as_of: freshness.data_as_of, items: remaining, total_items: remaining.length, empty_reason: remaining.length ? null : emptyReason }
}

export function summarize(items, at, timezone) {
  const counts = new Map()
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' })
  for (const item of items) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(item.current_cycle_started_at)).map(p => [p.type, p.value]))
    const day = `${parts.year}-${parts.month}-${parts.day}`
    counts.set(day, (counts.get(day) ?? 0) + 1)
  }
  return { as_of: iso(at), timezone, total_items: items.length, days: [...counts].sort(([a], [b]) => b.localeCompare(a)).map(([date, count]) => ({ date, count })) }
}

export function createInstance({ query, headers = {}, owner = null, profile = null, items, now, timezone = 'Asia/Shanghai', snapshot = null, rankingVersion, dataAsOf }) {
  if (!validate('feed/request.schema.json', query).ok || !validate('feed/analytics-headers.schema.json', headers).ok) fail('INVALID_FEED_REQUEST')
  if (query.mode === 'for_you' && !owner) fail('AUTH_REQUIRED', 401)
  const installation = headers['X-Installation-ID'] ?? null
  const session = headers['X-Analytics-Session-ID'] ?? null
  const profileTime = ms(profile?.source_as_of)
  const trustedProfile = owner && profile?.subject === owner && Number.isFinite(profileTime) && profileTime <= now && now - profileTime <= 10 * MINUTE
  const home = trustedProfile ? profile.home_city_code ?? null : null
  const initialLimit = query.limit ?? 20
  const delivered = query.mode === 'for_you' ? items.slice(0, initialLimit) : items
  const instance = {
    feed_instance_id: query.feed_instance_id, mode: query.mode, city_code: query.city_code, surface: query.surface,
    owner_user_key: owner, analytics_installation_id: installation, analytics_session_id: session,
    created_at: iso(now), pagination_expires_at: iso(now + 30 * MINUTE), record_retention_until: iso(now + 30 * DAY),
    home_city_code_at_creation: home, away_city_at_creation: home === null ? null : home !== query.city_code,
    home_city_source_as_of: trustedProfile ? profile.source_as_of : null,
    ranking_version: rankingVersion, snapshot_id: snapshot?.snapshot_id ?? null, model_version: snapshot?.model_version ?? null,
    data_as_of: dataAsOf, initial_limit: initialLimit, items: structuredClone(delivered),
    summary: query.mode === 'latest' ? summarize(items, now, timezone) : null,
  }
  return freeze(instance)
}

export function checkInstanceContext(instance, query, headers = {}, owner = null) {
  if (!validate('feed/analytics-headers.schema.json', headers).ok) fail('INVALID_ANALYTICS_HEADERS')
  for (const field of ['feed_instance_id', 'city_code', 'mode', 'surface']) {
    if (query[field] !== instance[field]) fail('INSTANCE_CONTEXT_CONFLICT', 409)
  }
  if (owner !== instance.owner_user_key || (headers['X-Installation-ID'] ?? null) !== instance.analytics_installation_id || (headers['X-Analytics-Session-ID'] ?? null) !== instance.analytics_session_id) fail('INSTANCE_CONTEXT_CONFLICT', 409)
  if (instance.mode === 'for_you' && (query.limit ?? 20) > instance.initial_limit) fail('INSTANCE_CONTEXT_CONFLICT', 409)
}

// Test-only signed cursor oracle. Production key storage/rotation is not implemented.
export function encodeCursor(instance, offset, secret) {
  const body = Buffer.from(JSON.stringify({ id: instance.feed_instance_id, city: instance.city_code, mode: instance.mode, surface: instance.surface, offset })).toString('base64url')
  return body + '.' + createHmac('sha256', secret).update(body).digest('base64url')
}
export function decodeCursor(cursor, instance, secret) {
  try {
    const [body, signature, extra] = cursor.split('.')
    if (extra || !signature) fail('INVALID_CURSOR')
    const expected = createHmac('sha256', secret).update(body).digest()
    const actual = Buffer.from(signature, 'base64url')
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) fail('INVALID_CURSOR')
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString())
    if (payload.id !== instance.feed_instance_id || payload.city !== instance.city_code || payload.mode !== instance.mode || payload.surface !== instance.surface || !Number.isInteger(payload.offset) || payload.offset < 0 || payload.offset > instance.items.length) fail('INVALID_CURSOR')
    return payload.offset
  } catch { fail('INVALID_CURSOR') }
}

export function pageLatest(instance, { now, cursor = null, limit = 20, isEligible, secret }) {
  if (instance.mode !== 'latest' || !Number.isInteger(limit) || limit < 1 || limit > 50) fail('INVALID_PAGE_REQUEST')
  if (now >= ms(instance.pagination_expires_at)) fail('FEED_INSTANCE_EXPIRED', 410)
  let offset = cursor ? decodeCursor(cursor, instance, secret) : 0
  const items = []
  while (offset < instance.items.length && items.length < limit) {
    const item = instance.items[offset++]
    if (isEligible(item)) items.push(structuredClone(item))
  }
  const hasMore = offset < instance.items.length
  return { data_as_of: instance.data_as_of, items, summary: cursor ? null : structuredClone(instance.summary), page: { as_of: instance.created_at, has_more: hasMore, next_cursor: hasMore ? encodeCursor(instance, offset, secret) : null, expires_at: instance.pagination_expires_at } }
}

export function enrichFeedEvent(instance, installation, event, now, resolvedUser = null) {
  if (now >= ms(instance.record_retention_until)) fail('FEED_INSTANCE_NOT_RETAINED')
  if (!instance.analytics_installation_id || !instance.analytics_session_id) fail('ANALYTICS_NOT_ENABLED_FOR_INSTANCE')
  if (installation !== instance.analytics_installation_id || event.session_id !== instance.analytics_session_id) fail('INSTANCE_ANALYTICS_CONTEXT_MISMATCH')
  if (event.feed.feed_instance_id !== instance.feed_instance_id) fail('INVALID_FEED_INSTANCE')
  if (ms(event.occurred_at) < ms(instance.created_at)) fail('EVENT_PRECEDES_INSTANCE')
  if (resolvedUser && instance.owner_user_key && resolvedUser !== instance.owner_user_key) fail('INSTANCE_IDENTITY_CONFLICT')
  const item = event.event_name === 'feed_shown' ? null : instance.items.find(i => i.item_id === event.feed.item_id)
  if (event.event_name !== 'feed_shown' && !item) fail('ITEM_NOT_IN_INSTANCE')
  return {
    mode: instance.mode, surface: instance.surface, city_code: instance.city_code,
    ranking_version: instance.ranking_version, snapshot_id: instance.snapshot_id, model_version: instance.model_version,
    original_rank: item?.rank ?? null, tenant_id: item?.tenant_id ?? null,
    source_drink_id: item?.source_drink_id ?? null, product_id: item?.product_id ?? null,
    // Instance context, NOT a claim about live profile at the time of a later click.
    home_city_code_at_creation: instance.home_city_code_at_creation,
    away_city_at_creation: instance.away_city_at_creation, home_city_source_as_of: instance.home_city_source_as_of,
    user_key: resolvedUser, // ownership/correlation never silently authenticates an event
  }
}
