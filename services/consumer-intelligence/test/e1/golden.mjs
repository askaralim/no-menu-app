// Run explicitly from the workspace; only the new Phase 1 output directory is writable here.
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import { digest } from '../../src/model.js'
import { loadE1Bundle } from '../../src/e1/bundle.js'
import { e1Profile, rankE1 } from '../../src/e1/rank.js'

const root = new URL('../../../../', import.meta.url)
const phase = process.argv.includes('--phase26') ? 'phase26' : process.argv.includes('--phase25') ? 'phase25' : process.argv.includes('--phase2') ? 'phase2' : 'phase1'
const output = new URL('outputs/recommendation-v2-e1-'+phase+'-20261106/', root)
const old = 'outputs/recommendation-v2-conservative-replay-20261106/'
const read = path => JSON.parse(fs.readFileSync(new URL(path, root)))
const sha = path => createHash('sha256').update(fs.readFileSync(path)).digest('hex')
const manifest = read(old + 'recommendation-v2-conservative-manifest.json')
for (const path of ['services/consumer-intelligence/src/model.js','outputs/recommendation-v2-replay-20261105/source-snapshot.json',
  'outputs/recommendation-v2-replay-20261105/effective-style-mapping.json']) {
  assert.equal(sha(new URL(path, root)), manifest.source_files_sha256[path], path)
}
assert.equal(sha(new URL(old+'replay-results.json', root)), manifest.output_files_sha256['replay-results.json'])
assert.equal(sha(new URL(old+'tier-audit.json', root)), 'ffcbdb51d0eca59a67cba224446ee390d5d8bb39d9301dccab9b0fcc17882d7d')
const source = read('outputs/recommendation-v2-replay-20261105/source-snapshot.json')
const now = Date.parse(source.source_as_of)
const bundle = loadE1Bundle(JSON.parse(fs.readFileSync(new URL('offline-bundle.json', import.meta.url))), 'local-offline')
const candidates = source.candidates.map(row => ({ ...row, item_id: digest([row.tenant_id, row.source_drink_id, row.session_id]) }))
const cities = new Map(source.cities.map(c => [c.city_code, candidates.filter(r => r.city_code === c.city_code)]))
const expected = new Map(read(old + 'replay-results.json').map(r => [r.user_key + '/' + r.city_code, r.results]))
const evidence = new Map(read(old + 'tier-audit.json').map(r => [r.user_key + '/' + r.item_id, r]))
const stats = { pairs: 0, eligibleSupplied: 0, atLeast1: 0, atLeast2: 0, atLeast20: 0,
  homeExact: 0, homeBridge: 0, feedExact: 0, feedBridge: 0, home6Slots: 0, home6Full: 0, coldPairs: 0, emptyCityPairs: 0, zero: 0, one: 0 }
const diffs = []
function compare(pair, field, actual, expected) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) diffs.push({ pair, field, actual, expected })
}
const mapping = read('outputs/recommendation-v2-replay-20261105/effective-style-mapping.json')
const acceptedStates = new Set(['inherited_frozen','auto_high','accepted_reviewed_mapping','accepted_base_descriptor_unparsed'])
for (const row of mapping) {
  const expectedKey = acceptedStates.has(row.acceptance) && row.style_key !== 'unknown' ? row.style_key : null
  compare(row.raw_style,'effective_style_key',bundle.styleKey(row.raw_style),expectedKey)
}
stats.mappingsChecked = mapping.length
for (const user of source.users) {
  const profile = e1Profile(source, user.user_key, bundle)
  for (const [city, rows] of cities) {
    stats.pairs++
    const pair = user.user_key + '/' + city, baseline = expected.get(pair)
    const feed = rankE1(rows, profile, bundle, now)
    const home = rankE1(rows, profile, bundle, now, 2)
    const six = rankE1(rows, profile, bundle, now, 6)
    compare(pair, 'home6 prefix', six, feed.slice(0, 6))
    compare(pair, 'C exact prefix', feed.filter(r => r.tier === 0).map(r => r.item_id), baseline.C)
    for (const [mode, items] of [['E1-home2', home], ['E1-feed20', feed]]) {
      compare(pair, mode + ' length', items.length, baseline[mode].length)
      for (const [i, item] of items.entries()) {
        const expectedId = baseline[mode][i]
        const audit = evidence.get(user.user_key + '/' + expectedId)
        compare(pair, mode + ' rank ' + (i+1), [item.rank,item.item_id,item.canonical_beer,item.tenant_id,item.tier,
          item.style_key,item.evidence_count,item.witnesses,item.denominator,item.score],
          [audit?.[mode+'_rank'],expectedId,audit?.canonical_beer,audit?.tenant_id,audit?.match_tier,
            audit?.candidate_style_key,audit?.evidence_count,audit?.matched_style_keys,audit?.normalization_denominator,audit?.score])
      }
    }
    if (profile.count < 5) stats.coldPairs++
    if (!rows.length) stats.emptyCityPairs++
    if (profile.count < 5 || !rows.length) { compare(pair,'ineligible feed',feed,[]); continue }
    stats.eligibleSupplied++
    stats.atLeast1 += feed.length >= 1
    stats.atLeast2 += feed.length >= 2
    stats.atLeast20 += feed.length === 20
    stats.zero += feed.length === 0
    stats.one += feed.length === 1
    stats.home6Slots += six.length
    stats.home6Full += six.length === 6
    for (const [prefix, items] of [['feed',feed],['home',home]]) {
      for (const item of items) stats[prefix + (item.tier === 0 ? 'Exact' : 'Bridge')]++
    }
  }
}
for (const [key,value] of Object.entries({pairs:4560,eligibleSupplied:224,atLeast1:220,atLeast2:207,atLeast20:53,homeExact:390,homeBridge:37,feedExact:1650,feedBridge:292})) {
  compare('all',key,stats[key],value)
}
fs.mkdirSync(output,{recursive:true})
fs.writeFileSync(new URL('golden-verification.json',output),JSON.stringify({status:diffs.length?'failed':'passed',model_version:bundle.model_version,stats,diffs},null,2)+'\n')
console.log(JSON.stringify(stats))
assert.equal(diffs.length,0,'See golden-verification.json for item-level differences')
