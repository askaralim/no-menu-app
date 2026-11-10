import { join } from 'node:path'
import { frozenVersion, internalVersion, internalTrust, offlineTrust } from './trust.js'
import { readFileSync, statSync } from 'node:fs'
import { loadE1Bundle } from './bundle.js'
import { e1Evidence, rankE1, rankE1Coverage } from './rank.js'
import { e1Reason, REASON_VERSION } from './reason.js'
import { beerIdentity, digest, eligible, publicItem, recentOrder, venueBeer } from '../model.js'
import { fail } from '../errors.js'

// File locations are configuration. Only the version pinned by this reader is authorized.
export function configureE1(env, db, source) {
  const mode = env.CI_E1_MODE ?? 'off'
  if (!['off', 'shadow', 'serve'].includes(mode)) throw Error('Invalid CI_E1_MODE')
  const internal = env.NODE_ENV === 'production'
  const trusted = key => Object.hasOwn(internal ? internalTrust : offlineTrust,key)
  if (internal && (mode==='shadow' || env.CI_E1_LOCAL_BUNDLE || env.CI_E1_LOCAL_REGISTRY || env.CI_E1_TEST_USERS)) throw Error('Invalid internal Feed configuration')
  const version = env.CI_E1_ACTIVE_VERSION ?? (internal ? internalVersion : frozenVersion)
  if (!trusted(version)) throw Error('Untrusted E1 active version')
  const revoked = new Set((env.CI_E1_REVOKED_VERSION ?? '').split(',').filter(Boolean))
  if ([...revoked].some(v => !trusted(v))) throw Error('Invalid CI_E1_REVOKED_VERSION')
  const directory = internal ? '/etc/nomenu-ci/e1-assets' : env.CI_E1_LOCAL_REGISTRY
  const file = env.CI_E1_LOCAL_BUNDLE
  const users = (env.CI_E1_TEST_USERS ?? '').split(',').filter(Boolean)
  if (users.some(u => !/^[a-f0-9]{64}$/.test(u))) throw Error('Invalid CI_E1_TEST_USERS')
  if (!internal && mode === 'serve' && !users.length) throw Error('Local serve requires an explicit test cohort')
  if (!internal && (mode !== 'off' || file || directory)) {
    if (env.NODE_ENV !== 'test' || process.env.NODE_ENV === 'production' || db.hostname !== '127.0.0.1' ||
        !['55432', '55433'].includes(db.port) || !/^\/nomenu_ci_test(?:_[a-f0-9-]{36})?$/.test(db.pathname) ||
        db.search || source.hostname !== '127.0.0.1') throw Error('E1 fixture requires isolated test endpoints')
  }
  const cache = new Map()
  function readVersion(key) {
    if (!trusted(key)) fail(503, 'E1_BUNDLE_UNAVAILABLE')
    try {
      // A legacy single fixture path is always A. The registry has no network or arbitrary key path.
      const path = directory ? join(directory, key.slice('rules-v2-e1:'.length) + '.json') : key === frozenVersion && file
      const st = statSync(path, {bigint:true})
      const stamp = [st.dev,st.ino,st.size,st.ctimeNs].join(':')
      if (cache.get(key)?.stamp === stamp) return cache.get(key).bundle
      const asset = JSON.parse(readFileSync(path, 'utf8'))
      if (asset.model_version !== key) throw Error('Asset in wrong slot')
      const verified = loadE1Bundle(asset, internal ? 'internal-feed' : 'local-offline')
      const bundle = Object.freeze({ ...verified, familyFor: k => asset.payload.vocabulary[k]?.family,
        generic: k => asset.payload.generic_keys.includes(k) })
      cache.set(key, {stamp,bundle})
      return bundle
    } catch { fail(503, 'E1_BUNDLE_UNAVAILABLE') }
  }
  return Object.freeze({
    mode, activeVersion: version, users: Object.freeze([...new Set(users)].sort()),
    routes: owner => mode === 'serve' && (internal || users.includes(owner)),
    verifyRetained(key) { readVersion(key) }, // verify bytes even for a revoked reference; never return a matcher
    bundle(pinned) {
      const key = pinned ?? version
      if (revoked.has(key)) fail(pinned ? 410 : 503, 'E1_BUNDLE_REVOKED')
      return readVersion(key)
    }
  })
}

export function e1Signature(candidates, profile, bundle, now) {
  return digest({ version: bundle.model_version, reason_version: REASON_VERSION, count: profile.count, counts: Object.fromEntries(profile.counts),
    tapped: [...profile.tapped].sort(), followed: [...profile.followed].sort(),
    candidates: candidates.filter(row => eligible(row, now, {windowDays:14})).sort(recentOrder).map(({ style_en, ...row }) => row) })
}

export function e1Snapshot(candidates, profile, bundle, now) {
  const byId = new Map(candidates.map(row => [row.item_id, row]))
  const evidence = {}
  const ranked = bundle.ranking === 'e1-style-coverage-lambda1-v1'
    ? rankE1Coverage(candidates, profile, bundle, now).items
    : rankE1(candidates, profile, bundle, now)
  const items = ranked.map(match => {
    evidence[match.item_id] = match
    const row = byId.get(match.item_id)
    const item = publicItem({...row, style_family: bundle.familyFor(match.style_key)}, match.rank)
    item.reason = e1Reason(match, profile, bundle)
    return item
  })
  return { items, evidence }
}

export function e1Filter(profile, bundle, now) {
  const matches = e1Evidence(profile, bundle)
  return (row, saved) => {
    if (!row || !saved || !eligible(row, now, {windowDays:14}) || profile.tapped.has(venueBeer(row))) return false
    if (beerIdentity(row) !== saved.canonical_beer || row.tenant_id !== saved.tenant_id ||
        bundle.styleKey(row.style, row) !== saved.style_key) return false
    const current = matches.get(saved.style_key)
    return current?.tier === saved.tier && saved.witnesses.some(h => current.witnesses.includes(h))
  }
}
