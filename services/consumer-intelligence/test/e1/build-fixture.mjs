// Rebuild the local fixture from reviewed artifacts. Review the digest before updating the loader pin.
import fs from 'node:fs'
import { digest } from '../../src/model.js'

const outputs = new URL('../../../../outputs/', import.meta.url)
const read = path => JSON.parse(fs.readFileSync(new URL(path, outputs), 'utf8'))
const base = 'recommendation-v2-replay-20261105/'
const manifest = read(base + 'recommendation-v2-replay-manifest.json')
const audit = read('style-compatibility-audit-round1-20261106/style-compatibility-proposal.json').relations
const permit = read('recommendation-v2-conservative-replay-20261106/offline-whitelist.json').relations
const bridges = permit.filter(e => e.tier === 1).map(edge => {
  const { history_style_key: history, candidate_style_key: candidate } = edge
  const relation = audit.find(r => r.history_style_key === history && r.candidate_style_key === candidate)
  if (!edge.offline_experiment_authorized || edge.production_approved !== false ||
      relation?.proposed_decision !== 'allow_generic_bridge') throw Error('Missing offline bridge authorization')
  return { history, candidate, relation: relation.relationship_type }
})
const payload = {
  scope: 'local-offline', production_approved: false, taxonomy: manifest.taxonomy_version,
  rules: 'e1-phase1-v1', generic_keys: manifest.generic_keys,
  vocabulary: read('taxonomy-v2-full-library-round3-20261105/round3-vocabulary.json'),
  mappings: read(base + 'effective-style-mapping.json').map(({raw_style, acceptance, style_key}) => [raw_style, acceptance, style_key]),
  bridges
}
const sha256 = digest(payload)
fs.writeFileSync(new URL('offline-bundle.json', import.meta.url),
  JSON.stringify({ sha256, model_version: 'rules-v2-e1:' + sha256, payload }, null, 2) + '\n')
console.log(sha256, digest(bridges))
