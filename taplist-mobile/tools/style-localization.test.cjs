const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const vm = require('node:vm')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')
const catalog = require(path.join(root, 'assets/data/style-localization-v1.2.json'))
const source = fs.readFileSync(path.join(root, 'lib/styleLocalization.ts'), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    esModuleInterop: true,
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText
const moduleUnderTest = { exports: {} }
vm.runInNewContext(compiled, {
  exports: moduleUnderTest.exports,
  module: moduleUnderTest,
  require(specifier) {
    if (specifier === '@/assets/data/style-localization-v1.2.json') return catalog
    throw new Error(`Unexpected import: ${specifier}`)
  },
}, { filename: 'styleLocalization.js' })

const { localizeBeerStyle, localizeRecommendationReason } = moduleUnderTest.exports

test('style display uses only the server English field and never infers from raw text', () => {
  assert.equal(localizeBeerStyle('Unfiltered IPA', 'en', 'Unfiltered IPA'), 'Unfiltered IPA')
  assert.equal(localizeBeerStyle('柏林酸小麦', 'en', 'Berliner Weisse'), 'Berliner Weisse')
  assert.equal(localizeBeerStyle('酸浑浊IPA', 'en', 'Sour Hazy IPA'), 'Sour Hazy IPA')
  assert.equal(localizeBeerStyle('柏林酸小麦', 'zh'), '柏林酸小麦')
  assert.equal(localizeBeerStyle('Unfiltered IPA', 'en'), 'Unfiltered IPA')
})

test('missing server English falls back to the unchanged raw style', () => {
  assert.equal(localizeBeerStyle('new raw style', 'en'), 'new raw style')
  assert.equal(localizeBeerStyle('酸浑浊IPA', 'en', null), '酸浑浊IPA')
})

test('Reason V2 English is generated only from frozen evidence', () => {
  const exact = {
    code: 'style_exact',
    text: '你记录过13款西海岸IPA',
    version: 'e1-reason-v2',
    evidence: {
      candidate_style_key: 'ipa.west_coast', candidate_style_label: '西海岸IPA', candidate_granularity: 'specific',
      matched_unique_taps: 13, total_unique_taps: 20, matched_percentage: 65,
      witnesses: [{ style_key: 'ipa.west_coast', style_label: '西海岸IPA', granularity: 'specific', unique_taps: 13 }],
    },
  }
  assert.equal(localizeRecommendationReason(exact, 'en'), 'Matches your 13 logged West Coast IPA beers.')
  assert.equal(localizeRecommendationReason(exact, 'zh'), exact.text)

  const broad = {
    ...exact,
    evidence: { ...exact.evidence, candidate_style_key: 'ipa.generic', candidate_granularity: 'broad', witnesses: [
      { style_key: 'ipa.generic', style_label: 'IPA类酒', granularity: 'broad', unique_taps: 13 },
    ] },
  }
  assert.equal(localizeRecommendationReason(broad, 'en'), 'Matches your 13 logged IPA beers.')

  const bridge = {
    ...exact,
    code: 'style_bridge',
    evidence: {
      ...exact.evidence,
      candidate_style_key: 'ipa.sour',
      matched_unique_taps: 5,
      witnesses: [
        { style_key: 'ipa.hazy', style_label: '浑浊IPA', granularity: 'specific', unique_taps: 3 },
        { style_key: 'sour.generic', style_label: '酸艾尔类酒', granularity: 'broad', unique_taps: 2 },
      ],
    },
  }
  assert.equal(localizeRecommendationReason(bridge, 'en'), 'Related to 5 beers you logged: Hazy IPA and Sour Ale.')
  assert.equal(localizeRecommendationReason({ ...exact, evidence: { ...exact.evidence, matched_unique_taps: 99 } }, 'en'), exact.text)
  assert.equal(localizeRecommendationReason({ code: 'style_affinity', text: '旧解释' }, 'en'), '旧解释')
})
