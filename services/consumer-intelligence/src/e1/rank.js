import { beerIdentity, eligible, recentOrder, venueBeer } from '../model.js'

export function e1Profile(consumer, user, bundle) {
  const rows = consumer.user_beers.filter(row => row.user_key === user).sort((a, b) => a.id.localeCompare(b.id))
  const beers = new Set(), counts = new Map()
  for (const row of rows) {
    const id = beerIdentity(row)
    if (beers.has(id)) continue
    beers.add(id)
    const key = bundle.styleKey(row.style, row)
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return {
    count: beers.size, counts,
    followed: new Set(consumer.follows.filter(r => r.user_key === user).map(r => r.tenant_id)),
    tapped: new Set(consumer.venue_experiences.filter(r => r.user_key === user).map(venueBeer))
  }
}

// Precompute authorized evidence once per profile, independently of city supply.
export function e1Evidence(profile, bundle) {
  const matches = new Map()
  const exactMax = Math.max(0, ...profile.counts.values())
  for (const [key, count] of profile.counts) {
    matches.set(key, { tier: 0, witnesses: [key], evidence_count: count, denominator: exactMax })
  }
  let bridgeMax = 0
  for (const target of bundle.bridgeTargets) {
    if (matches.has(target)) continue
    const witnesses = bundle.historiesFor(target).filter(h => profile.counts.has(h))
      .sort((a, b) => profile.counts.get(b) - profile.counts.get(a) || a.localeCompare(b))
    if (!witnesses.length) continue
    const count = witnesses.reduce((sum, key) => sum + profile.counts.get(key), 0)
    matches.set(target, { tier: 1, witnesses, evidence_count: count })
    bridgeMax = Math.max(bridgeMax, count)
  }
  for (const match of matches.values()) if (match.tier === 1) match.denominator = bridgeMax
  return matches
}

// Rows supplied to this pure function are one city's current catalog projection.
function originalOrder(cityCandidates, profile, bundle, now, take) {
  if (profile.count < 5) return []
  const evidence = e1Evidence(profile, bundle)
  const pool = []
  for (const row of cityCandidates) {
    if (!eligible(row, now, { windowDays: 14 }) || profile.tapped.has(venueBeer(row))) continue
    const key = bundle.styleKey(row.style, row)
    const match = evidence.get(key)
    if (!match) continue
    const score = match.evidence_count / match.denominator * (profile.followed.has(row.tenant_id) ? 1.15 : 1)
    pool.push({ row, key, match, score })
  }
  pool.sort((a, b) => a.match.tier - b.match.tier || b.score - a.score || recentOrder(a.row, b.row))
  const seen = new Set(), items = []
  for (const { row, key, match, score } of pool) {
    const canonical = beerIdentity(row)
    if (seen.has(canonical)) continue
    seen.add(canonical)
    items.push({ item_id: row.item_id, tenant_id: row.tenant_id, canonical_beer: canonical,
      rank: items.length + 1, style_key: key, ...match, score })
    if (items.length === take) break
  }
  return items
}

function checkLimit(limit) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw RangeError('Expected limit 1..20')
}

export function rankE1(cityCandidates, profile, bundle, now, limit = 20) {
  checkLimit(limit)
  return originalOrder(cityCandidates, profile, bundle, now, limit)
}

// Input is the full E1 pool in its original order, with the canonical venue already chosen.
// Tied display scores retain that order. The original score remains available as evidence.
export function selectStyleCoverage(pool, limit = 20) {
  checkLimit(limit)
  const remaining = [...pool]
  const selected = []
  const counts = new Map()
  while (selected.length < limit && remaining.length) {
    const tier = remaining[0].tier
    let best = 0
    let bestScore = -Infinity
    for (let i = 0; i < remaining.length && remaining[i].tier === tier; i++) {
      const candidate = remaining[i]
      const score = candidate.score / (1 + (counts.get(candidate.style_key) ?? 0))
      if (score > bestScore) {
        best = i
        bestScore = score
      }
    }
    const [item] = remaining.splice(best, 1)
    counts.set(item.style_key, (counts.get(item.style_key) ?? 0) + 1)
    selected.push({ ...item, rank: selected.length + 1, display_score: bestScore })
  }
  return selected
}

// Offline candidate only. Keep its version separate even when taxonomy bytes are identical.
export function rankE1Coverage(cityCandidates, profile, bundle, now, limit = 20) {
  checkLimit(limit)
  const pool = originalOrder(cityCandidates, profile, bundle, now, Infinity)
  return {
    model_version: bundle.model_version + ':coverage-1',
    items: selectStyleCoverage(pool, limit),
  }
}
