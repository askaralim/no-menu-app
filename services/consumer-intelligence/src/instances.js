import { createHmac, timingSafeEqual } from 'node:crypto'
import { DAY, MINUTE, iso } from './model.js'
import { fail } from './errors.js'

export function summarize(items, now, timezone) {
  const counts = new Map()
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' })
  for (const item of items) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(item.current_cycle_started_at)).map(p => [p.type, p.value]))
    const date = `${parts.year}-${parts.month}-${parts.day}`
    counts.set(date, (counts.get(date) ?? 0) + 1)
  }
  return { as_of: iso(now), timezone, total_items: items.length, days: [...counts].sort(([a], [b]) => b.localeCompare(a)).map(([date, count]) => ({ date, count })) }
}
export function newInstance(query, analytics, owner, profile, items, metadata, now, timezone) {
  const trusted = owner && profile?.user_key === owner && Date.parse(profile.source_as_of) <= now && now - Date.parse(profile.source_as_of) <= 10 * MINUTE
  const home = trusted ? profile.home_city_code : null
  return {
    feed_instance_id: query.feed_instance_id, mode: query.mode, city_code: query.city_code, surface: query.surface,
    owner_user_key: owner, analytics_installation_id: analytics['X-Installation-ID'] ?? null,
    analytics_session_id: analytics['X-Analytics-Session-ID'] ?? null,
    created_at: iso(now), pagination_expires_at: iso(now + 30 * MINUTE), record_retention_until: iso(now + 30 * DAY),
    home_city_code_at_creation: home, away_city_at_creation: home === null ? null : home !== query.city_code,
    home_city_source_as_of: trusted ? profile.source_as_of : null,
    initial_limit: query.limit ?? 20, ...metadata,
    items: structuredClone(query.mode === 'for_you' ? items.slice(0, query.limit ?? 20) : items),
    summary: query.mode === 'latest' ? summarize(items, now, timezone) : null,
  }
}
export function checkInstance(instance, query, analytics, owner) {
  if (['feed_instance_id', 'city_code', 'mode', 'surface'].some(k => query[k] !== instance[k])
    || owner !== instance.owner_user_key
    || (analytics['X-Installation-ID'] ?? null) !== instance.analytics_installation_id
    || (analytics['X-Analytics-Session-ID'] ?? null) !== instance.analytics_session_id
    || (query.mode === 'for_you' && (query.limit ?? 20) > instance.initial_limit)) fail(409, 'INSTANCE_CONTEXT_CONFLICT')
}
function encodeCursor(instance, offset, secret) {
  const body = Buffer.from(JSON.stringify({ id: instance.feed_instance_id, city: instance.city_code, mode: instance.mode, surface: instance.surface, offset })).toString('base64url')
  return body + '.' + createHmac('sha256', secret).update(body).digest('base64url')
}
function decodeCursor(cursor, instance, secret) {
  try {
    const [body, sig, extra] = cursor.split('.')
    if (!sig || extra) throw new Error()
    const expected = createHmac('sha256', secret).update(body).digest(), actual = Buffer.from(sig, 'base64url')
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error()
    const value = JSON.parse(Buffer.from(body, 'base64url').toString())
    if (value.id !== instance.feed_instance_id || value.city !== instance.city_code || value.mode !== instance.mode || value.surface !== instance.surface || !Number.isInteger(value.offset) || value.offset < 0 || value.offset > instance.items.length) throw new Error()
    return value.offset
  } catch { fail(400, 'INVALID_CURSOR') }
}
export function latestPage(instance, query, now, isEligible, secret) {
  if (now >= Date.parse(instance.pagination_expires_at)) fail(410, 'FEED_INSTANCE_EXPIRED')
  let offset = query.cursor ? decodeCursor(query.cursor, instance, secret) : 0
  const items = []
  while (offset < instance.items.length && items.length < (query.limit ?? 20)) {
    const item = instance.items[offset++]
    if (isEligible(item)) items.push(item)
  }
  const hasMore = offset < instance.items.length
  return { items, summary: query.cursor ? null : instance.summary,
    page: { as_of: instance.created_at, has_more: hasMore, next_cursor: hasMore ? encodeCursor(instance, offset, secret) : null, expires_at: instance.pagination_expires_at } }
}
export function enrichFeedEvent(instance, installation, event, now, resolvedUser) {
  if (!instance) fail(400, 'INVALID_FEED_INSTANCE')
  if (now >= Date.parse(instance.record_retention_until)) fail(400, 'FEED_INSTANCE_NOT_RETAINED')
  if (!instance.analytics_installation_id || !instance.analytics_session_id) fail(400, 'ANALYTICS_NOT_ENABLED_FOR_INSTANCE')
  if (installation !== instance.analytics_installation_id || event.session_id !== instance.analytics_session_id) fail(400, 'INSTANCE_ANALYTICS_CONTEXT_MISMATCH')
  if (Date.parse(event.occurred_at) < Date.parse(instance.created_at)) fail(400, 'EVENT_PRECEDES_INSTANCE')
  if (resolvedUser && instance.owner_user_key && resolvedUser !== instance.owner_user_key) fail(400, 'INSTANCE_IDENTITY_CONFLICT')
  const item = event.event_name === 'feed_shown' ? null : instance.items.find(i => i.item_id === event.feed.item_id)
  if (event.event_name !== 'feed_shown' && !item) fail(400, 'ITEM_NOT_IN_INSTANCE')
  return { mode: instance.mode, surface: instance.surface, city_code: instance.city_code,
    ranking_version: instance.ranking_version, snapshot_id: instance.snapshot_id, model_version: instance.model_version,
    original_rank: item?.rank ?? null, tenant_id: item?.tenant_id ?? null, source_drink_id: item?.source_drink_id ?? null, product_id: item?.product_id ?? null,
    home_city_code_at_creation: instance.home_city_code_at_creation, away_city_at_creation: instance.away_city_at_creation,
    home_city_source_as_of: instance.home_city_source_as_of,
  }
}
