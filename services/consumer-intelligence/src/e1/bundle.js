import { digest } from '../model.js'
import { verify } from 'node:crypto'

// Local experiment trust anchors. No production bundle or approval path exists in Phase 1.
import { internalTrust, internalSigningKeys, offlineTrust, offlineSigningKeys } from './trust.js'
const bridgePin = '17e188c4d9255899ea0a006bbae854f61b0fdf30cfb8905231111c2f830605cf'
const accepted = new Set(['inherited_frozen', 'auto_high', 'accepted_reviewed_mapping', 'accepted_base_descriptor_unparsed'])
const sqlTrim = raw => raw === null ? null : raw.replace(/^ +| +$/g, '') || null

export function loadE1Bundle(bundle, purpose) {
  const internal = purpose === 'internal-feed'
  if (!internal && (purpose !== 'local-offline' || process.env.NODE_ENV === 'production')) throw Error('E1 has no production authorization')
  const { payload, sha256, model_version } = bundle
  if (payload.scope !== purpose || payload.production_approved !== internal) throw Error('Invalid bundle scope')
  if (digest(payload) !== sha256 || model_version !== 'rules-v2-e1:' + sha256) throw Error('Bundle checksum/version mismatch')
  const signingKey = (internal ? internalSigningKeys : offlineSigningKeys)[model_version]
  if (signingKey && (!bundle.signature || !verify(null, Buffer.from(sha256, 'hex'), signingKey,
      Buffer.from(bundle.signature, 'base64')))) throw Error('Invalid bundle signature')

  const products = new Map()
  if (payload.product_overrides && !signingKey) throw Error('Unauthorized product overrides')
  for (const [identity, state, key] of payload.product_overrides ?? []) {
    if (!/^product:[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(identity) || products.has(identity)) {
      throw Error('Invalid or duplicate canonical product override')
    }
    if (state !== 'accepted_reviewed_mapping' || key === 'unknown' || !Object.hasOwn(payload.vocabulary, key)) {
      throw Error('Invalid accepted product override')
    }
    products.set(identity, key)
  }

  const { vocabulary, generic_keys, bridges } = payload
  const generic = new Set(generic_keys)
  if (generic.size !== generic_keys.length || generic_keys.some(k => k === 'unknown' || !Object.hasOwn(vocabulary, k))) {
    throw Error('Invalid explicit generic key list')
  }
  const mappings = new Map()
  for (const [raw, state, key] of payload.mappings) {
    if (!Object.hasOwn(vocabulary, key)) throw Error('Unknown referenced style key')
    if (!accepted.has(state) && !['frozen_unknown', 'pending_review'].includes(state)) throw Error('Unknown acceptance state')
    const normalized = sqlTrim(raw)
    if (mappings.has(normalized)) throw Error('Duplicate effective raw mapping')
    if (accepted.has(state) && (!normalized || key === 'unknown')) throw Error('Invalid accepted mapping')
    if (state === 'frozen_unknown' && key !== 'unknown') throw Error('Invalid frozen unknown')
    mappings.set(normalized, accepted.has(state) ? key : null)
  }

  const incoming = new Map()
  for (const { history, candidate, relation } of bridges) {
    const h = vocabulary[history], c = vocabulary[candidate]
    if (!h || !c || history === 'unknown' || candidate === 'unknown' || h.family !== c.family || h.beverage !== c.beverage ||
        generic.has(history) === generic.has(candidate)) throw Error('Invalid bridge endpoints')
    const expected = generic.has(history) ? 'parent_to_child' : 'child_to_parent_unspecified'
    if (relation !== expected) throw Error('Invalid parent/child direction')
    if (!incoming.has(candidate)) incoming.set(candidate, [])
    const histories = incoming.get(candidate)
    if (histories.includes(history)) throw Error('Duplicate directed bridge')
    histories.push(history)
  }
  // Matching a family or a parent label cannot authorize an edge. The exact reviewed
  // directional list (including its hierarchy) must match the external trust anchor.
  if (digest(bridges) !== bridgePin) throw Error('Unauthorized directed bridge set')
  if (!Object.hasOwn(internal ? internalTrust : offlineTrust, model_version)) throw Error(internal ? 'Unrecognized internal bundle' : 'Unrecognized offline bundle')
  for (const histories of incoming.values()) Object.freeze(histories)
  const none = Object.freeze([])
  return Object.freeze({
    model_version,
    ranking: payload.rules,
    // Source projections have already resolved canonical identity. Never resolve by beer name.
    styleKey: (raw, row = null) => (row?.product_id && row.identity_valid !== false &&
      (row.product_status === undefined || row.product_status === 'active')
      ? products.get('product:' + row.product_id) : null) ?? mappings.get(sqlTrim(raw ?? null)) ?? null,
    bridgeTargets: Object.freeze([...incoming.keys()]),
    historiesFor: candidate => incoming.get(candidate) ?? none
  })
}
