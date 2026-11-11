const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const vm = require('node:vm')
const ts = require('typescript')

const source = fs.readFileSync(path.join(__dirname, '../components/taplist/HomeBeerFeed.tsx'), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX,
} }).outputText

function render(personal, latest) {
  const calls = [], measured = []
  const module = { exports: {} }
  const mocks = {
    react: { useEffect() {}, useRef: value => ({ current: value }), useState: value => [value, () => {}] },
    'react/jsx-runtime': require('react/jsx-runtime'),
    'react-native': { StyleSheet: { create: value => value }, useWindowDimensions: () => ({ width: 390 }),
      Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', View: 'View' },
    '@react-navigation/native': { useIsFocused: () => true },
    'expo-router': { router: {} },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    '@/constants/design': { palette: {}, typography: {} },
    '@/lib/i18n': { useLanguage: () => ({ language: 'en', localized: value => value }), tr: (_, zh, en) => en },
    '@/lib/styleLocalization': { localizeBeerStyle: value => value },
    '@/components/taplist/CachedImage': { CachedImage: 'Image' },
    '@/components/taplist/FeedExplanation': { FeedExplanation: 'Explanation' },
    '@/components/taplist/FeedBeerCard': { openFeedBeer() {} },
    '@/lib/useBeerFeed': { useBeerFeed: (city, mode, surface, enabled) => {
      calls.push({ mode, enabled }); return mode === 'for_you' ? personal : latest
    } },
    '@/lib/useFeedExposure': { useFeedExposure: result => {
      measured.push(result); return { viewport: {}, register() {}, invalidate() {} }
    } },
  }
  vm.runInNewContext(compiled, { exports: module.exports, module, require: key => {
    if (!(key in mocks)) throw Error(`Unexpected import: ${key}`)
    return mocks[key]
  } })
  const view = module.exports.HomeBeerFeed({ city: 'Shanghai' })
  return { view, calls, measured }
}
const latest = { data: { feed_instance_id: 'latest', items: [{ item_id: 'public' }] } }
const personal = { identity: { ready: true, owner: 'consumer', revision: 1 } }

test('Latest starts alongside For You but cannot render or enter exposure before personal resolution', () => {
  const result = render(personal, latest)
  assert.equal(result.calls.find(call => call.mode === 'latest').enabled, true)
  assert.equal(result.view, null)
  assert.equal(result.measured[0], undefined)
})

test('personal results take priority over a ready Latest preload', () => {
  const data = { feed_instance_id: 'personal', items: [{ item_id: 'matched' }] }
  const result = render({ ...personal, data }, latest)
  assert.ok(result.view)
  assert.equal(result.measured[0], data)
})

test('cold start, empty results, failure and anonymous visits can immediately use Latest', () => {
  for (const state of [
    { ...personal, data: { items: [], personalization: { status: 'cold_start', unique_tap_count: 2, required_tap_count: 5 } } },
    { ...personal, data: { items: [] } },
    { ...personal, isError: true },
    { identity: { ready: true, owner: null, revision: 2 } },
  ]) {
    const result = render(state, latest)
    assert.ok(result.view)
    assert.equal(result.measured[0], latest.data)
  }
})
