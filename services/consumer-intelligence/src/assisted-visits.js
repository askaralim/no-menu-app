import { transaction, lock } from './db.js'
import { digest, iso, MINUTE } from './model.js'
import { fail } from './errors.js'

const HOUR = 60 * MINUTE
export const ASSISTED_VISIT_VERSION = 'observed-created-at-v1'
// V1's business cities are in China. This is an explicit reporting timezone,
// not a timezone inferred from a user's device, profile or selected Feed city.
export const VISIT_TIMEZONE = 'Asia/Shanghai'
const windows = [24, 48, 72]
const localDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: VISIT_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
})

export function consumptionDay(createdAt) {
  const parts = Object.fromEntries(localDate.formatToParts(new Date(Date.parse(createdAt) - 6 * HOUR)).map(p => [p.type, p.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}

function target(row) {
  const raw = row.raw
  switch (raw.event_name) {
    case 'beer_opened': return { ...raw, beer: true, primary: true }
    case 'bar_opened':
    case 'activity_opened': return { ...raw, primary: true }
    case 'search_result_opened':
      return ['bar', 'beer'].includes(raw.result.type) ? { ...raw.result, beer: raw.result.type === 'beer', primary: true } : null
    case 'feed_item_opened': return { ...row.enrichment, beer: true, primary: true }
    case 'feed_item_impression': return { ...row.enrichment, primary: false }
    case 'map_navigation_clicked': return { ...raw, primary: false }
    default: return null
  }
}

function sameBeer(tap, opened) {
  if (!opened.beer) return false
  if (tap.product_id && opened.product_id) return tap.product_id === opened.product_id
  return Boolean(opened.source_drink_id && [tap.source_drink_id, tap.provisional_drink_id].includes(opened.source_drink_id))
}

const evidenceOrder = (a, b) => Number(b.kind === 'beer_at_venue') - Number(a.kind === 'beer_at_venue')
  || Date.parse(b.occurred_at) - Date.parse(a.occurred_at) || a.event_id.localeCompare(b.event_id)
const within = (evidence, anchor, hours) => {
  const delta = Date.parse(anchor) - new Date(evidence.occurred_at).getTime()
  return delta > 0 && delta <= hours * HOUR
}
const windowFlags = (evidence, anchor) => Object.fromEntries(windows.map(hours => [`${hours}h`, evidence.some(e => within(e, anchor, hours))]))

// Recomputable analytical output, never a claim of physical presence or causal
// lift. No current catalog/profile lookup can manufacture historical evidence.
export function calculateAssistedVisits(taps, events, now = Date.now()) {
  const indexed = new Map()
  for (const row of events) {
    if (!row.resolved_user_key || row.identity_state !== 'resolved') continue
    const opened = target(row)
    if (!opened?.tenant_id) continue // Global beer opens do not prove a venue.
    const key = `${row.resolved_user_key}:${opened.tenant_id}`
    if (!indexed.has(key)) indexed.set(key, [])
    indexed.get(key).push({ row, opened })
  }
  const candidates = [], groups = new Map()
  for (const tap of taps) {
    if (!Number.isFinite(Date.parse(tap.created_at)) || Date.parse(tap.created_at) > now) continue
    const evidence = [], auxiliary = []
    for (const { row, opened } of indexed.get(`${tap.user_key}:${tap.tenant_id}`) ?? []) {
      if (!within(row, tap.created_at, 72)) continue
      const entry = { event_id: row.event_id, event_name: row.raw.event_name, occurred_at: iso(row.occurred_at),
        kind: opened.primary ? sameBeer(tap, opened) ? 'beer_at_venue' : 'venue' : 'auxiliary',
        source: row.raw.source ?? null, mode: row.enrichment?.mode ?? null, surface: row.enrichment?.surface ?? null }
      ;(opened.primary ? evidence : auxiliary).push(entry)
    }
    evidence.sort(evidenceOrder); auxiliary.sort(evidenceOrder)
    const day = consumptionDay(tap.created_at)
    const visitId = digest([ASSISTED_VISIT_VERSION, tap.user_key, tap.tenant_id, day, VISIT_TIMEZONE])
    const candidate = { tap_venue_experience_id: tap.id, visit_id: visitId, user_key: tap.user_key,
      tenant_id: tap.tenant_id, created_at: iso(tap.created_at), first_drank_at: iso(tap.first_drank_at),
      consumption_day: day, matched_windows: windowFlags(evidence, tap.created_at), evidence, auxiliary }
    candidates.push(candidate)
    if (!groups.has(visitId)) groups.set(visitId, [])
    groups.get(visitId).push(candidate)
  }
  candidates.sort((a, b) => a.tap_venue_experience_id.localeCompare(b.tap_venue_experience_id))
  const visits = []
  for (const [visitId, entries] of groups) {
    entries.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.tap_venue_experience_id.localeCompare(b.tap_venue_experience_id))
    const first = entries[0], unique = new Map()
    // A click after the first recorded TAP must not turn an already-started
    // venue recording group into a discovery-assisted visit via its later TAPs.
    for (const entry of entries) for (const evidence of entry.evidence) {
      if (!within(evidence, first.created_at, 72)) continue
      const prior = unique.get(evidence.event_id)
      if (!prior || evidenceOrder(evidence, prior) < 0) unique.set(evidence.event_id, evidence)
    }
    const evidence = [...unique.values()].sort(evidenceOrder)
    if (!evidence.length) continue
    visits.push({ visit_id: visitId, user_key: first.user_key, tenant_id: first.tenant_id,
      consumption_day: first.consumption_day, timezone: VISIT_TIMEZONE,
      first_tap_created_at: first.created_at, last_tap_created_at: entries.at(-1).created_at,
      tap_count: entries.length, tap_venue_experience_ids: entries.map(e => e.tap_venue_experience_id),
      matched_windows: windowFlags(evidence, first.created_at), strongest_evidence: evidence[0], evidence })
  }
  visits.sort((a, b) => a.visit_id.localeCompare(b.visit_id))
  return { version: ASSISTED_VISIT_VERSION, anchor: 'venue_experience.created_at', timezone: VISIT_TIMEZONE,
    counts: { tap_records: candidates.length, venue_recording_groups: groups.size,
      observed_assisted_visits: Object.fromEntries(windows.map(hours => [`${hours}h`, visits.filter(v => v.matched_windows[`${hours}h`]).length])) },
    candidates, visits }
}

export async function refreshAssistedVisits(pool, now = Date.now()) {
  return transaction(pool, async client => {
    await lock(client, 'refresh-assisted-visits')
    const source = (await client.query("SELECT generation,source_as_of,payload FROM ci.projections WHERE scope='consumer'")).rows[0]
    const sourceTime = source ? new Date(source.source_as_of).getTime() : NaN
    if (!Number.isFinite(sourceTime) || sourceTime > now || now - sourceTime > 10 * MINUTE) fail(503, 'PROJECTION_STALE')
    const taps = source.payload.venue_experiences
    const times = taps.map(t => Date.parse(t.created_at)).filter(t => t <= now)
    const events = times.length ? (await client.query(`SELECT event_id,occurred_at,raw,enrichment,resolved_user_key,identity_state
      FROM ci.events WHERE resolved_user_key IS NOT NULL AND identity_state='resolved'
        AND occurred_at >= $1 AND occurred_at < $2`,
    [iso(Math.min(...times) - 72 * HOUR), iso(Math.max(...times))])).rows : []
    const result = calculateAssistedVisits(taps, events, now)
    await client.query(`INSERT INTO ci.assisted_visit_projection(singleton,computed_at,consumer_generation,consumer_source_as_of,payload)
      VALUES(true,$1,$2,$3,$4) ON CONFLICT(singleton) DO UPDATE SET computed_at=EXCLUDED.computed_at,
      consumer_generation=EXCLUDED.consumer_generation,consumer_source_as_of=EXCLUDED.consumer_source_as_of,payload=EXCLUDED.payload`,
    [iso(now), source.generation, iso(source.source_as_of), result])
    return result.counts
  }, 'REPEATABLE READ')
}
