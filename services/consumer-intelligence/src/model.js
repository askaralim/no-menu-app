import { createHash } from 'node:crypto'
import { fail } from './errors.js'

export const MINUTE = 60000
export const DAY = 24 * 60 * MINUTE
export const iso = value => new Date(value).toISOString()
export function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}'
  return JSON.stringify(value)
}
export const digest = value => createHash('sha256').update(canonical(value)).digest('hex')
export function assertEventTime(event, now) {
  const time = Date.parse(event.occurred_at), start = Date.parse(event.session_started_at)
  if (!Number.isFinite(time) || !Number.isFinite(start) || time < start || time < now - 7 * DAY || time > now + 5 * MINUTE) fail(400, 'INVALID_EVENT_TIME')
}

// Same coarse taxonomy as the current drink-log product, intentionally not BJCP.
// Bump this version if matching semantics change; never import a client bundle.
export const STYLE_VERSION = 'coarse-v1'
export function normalizeBeerStyle(style) {
  const s = (style ?? '').trim().toLowerCase()
  if (!s || s === '其他') return '其他'
  for (const [pattern, family] of [
    [/ipa|印度淡色|西海岸|新英格兰|浑浊|ddh/, 'IPA'],
    [/酸|sour|gose|古斯|柏林酸/, '酸啤'],
    [/拉格|lager|pils|皮尔森|博克|helles/, '拉格'],
    [/小麦|白啤|wheat|weizen|witbier/, '小麦'],
    [/世涛|波特|stout|porter/, '世涛 / 波特'],
    [/赛松|农舍|saison|farmhouse/, '赛松 / 农舍'],
    [/比利时|修道院|三料|四料|belgian|tripel|dubbel|quadrupel/, '比利时艾尔'],
    [/西打|苹果酒|cider/, '西打'], [/蜂蜜酒|mead/, '蜂蜜酒'],
    [/淡色艾尔|金色艾尔|琥珀艾尔|pale ale|amber ale|golden ale/, '艾尔'],
  ]) if (pattern.test(s)) return family
  return '其他'
}
export const beerIdentity = row => row.product_id ? `product:${row.product_id}` : `drink:${row.provisional_drink_id ?? row.source_drink_id}`
export const venueBeer = row => canonical([beerIdentity(row), row.tenant_id])
export function features(consumer, user) {
  const beers = new Map()
  for (const row of consumer.user_beers.filter(r => r.user_key === user).sort((a, b) => a.id.localeCompare(b.id))) {
    const id = beerIdentity(row)
    if (!beers.has(id)) beers.set(id, normalizeBeerStyle(row.style))
  }
  const counts = {}
  for (const family of beers.values()) if (family !== '其他') counts[family] = (counts[family] ?? 0) + 1
  const tapped = new Set(consumer.venue_experiences.filter(r => r.user_key === user).map(venueBeer))
  const followed = new Set(consumer.follows.filter(r => r.user_key === user).map(r => r.tenant_id))
  return { count: beers.size, counts, tapped, followed }
}
export function eligible(row, now, config, profile = null) {
  const start = Date.parse(row.current_cycle_started_at)
  return row.public_tenant === true && row.public_category === true && row.public_drink === true && row.tap_assigned === true
    && row.accuracy === 'exact' && row.canceled === false && row.ended_at === null
    && ['new', 'available', 'low'].includes(row.public_status)
    && Number.isFinite(start) && start <= now && start >= now - config.windowDays * DAY
    && (!profile || (profile.counts[row.style_family] > 0 && !profile.tapped.has(venueBeer(row))))
}
export const recentOrder = (a, b) => Date.parse(b.current_cycle_started_at) - Date.parse(a.current_cycle_started_at) || a.item_id.localeCompare(b.item_id)
export function publicItem(row, rank, evidence = null) {
  return {
    item_id: row.item_id, rank, tenant_id: row.tenant_id, tenant_slug: row.tenant_slug, tenant_name: row.tenant_name,
    tenant_name_en: row.tenant_name_en ?? null,
    source_drink_id: row.source_drink_id, product_id: row.product_id, beer_name: row.beer_name,
    beer_name_en: row.beer_name_en ?? null,
    brewery: row.brewery, brewery_en: row.brewery_en ?? null,
    style: row.style, style_en: row.style_en ?? null,
    style_family: row.style_family === '其他' ? null : row.style_family,
    image_url: row.image_url, current_cycle_started_at: row.current_cycle_started_at,
    reason: evidence ? { code: 'style_affinity', text: evidence >= 3 ? `因为你常喝${row.style_family}` : `和你喝过的${row.style_family}风格相近`, params: { style_family: row.style_family, evidence_count: evidence } } : null,
    deep_link: `nomenu://bars/${encodeURIComponent(row.tenant_slug)}/drinks/${row.source_drink_id}`,
  }
}
export function rankFeed(candidates, profile, now, config) {
  const max = Math.max(0, ...Object.values(profile.counts))
  if (profile.count < config.requiredTapCount || max === 0) return []
  const scored = candidates.filter(r => eligible(r, now, config, profile)).map(row => ({ row,
    score: profile.counts[row.style_family] / max * (profile.followed.has(row.tenant_id) ? config.followMultiplier : 1),
  })).sort((a, b) => b.score - a.score || recentOrder(a.row, b.row))
  const seen = new Set(), result = []
  for (const { row } of scored) {
    const id = beerIdentity(row)
    if (seen.has(id)) continue
    seen.add(id)
    result.push(publicItem(row, result.length + 1, profile.counts[row.style_family]))
    if (result.length === 20) break
  }
  return result
}
export function rankingSignature(candidates, profile, now, config) {
  return digest({ taxonomy: STYLE_VERSION, model: config.modelVersion, window: config.windowDays, threshold: config.requiredTapCount,
    multiplier: config.followMultiplier, count: profile.count, counts: profile.counts,
    follows: [...profile.followed].sort(), tapped: [...profile.tapped].sort(),
    // Window expiry itself invalidates a snapshot, even with unchanged source data.
    candidates: candidates.filter(r => eligible(r, now, config)).sort(recentOrder).map(({ style_en, ...row }) => row),
  })
}
