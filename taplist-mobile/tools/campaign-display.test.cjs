const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const vm = require('node:vm')
const ts = require('typescript')
const React = require('react')

const root = path.resolve(__dirname, '..')
function load(file, overrides = {}) {
  const module = { exports: {} }
  const native = new Proxy({
    StyleSheet: { create: styles => styles, absoluteFillObject: {} },
    useWindowDimensions: () => ({ width: 390, height: 844 }),
  }, { get: (target, name) => target[name] || name })
  const compiled = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText
  vm.runInNewContext(compiled, {
    exports: module.exports, module, Date, setTimeout, clearTimeout, AbortController,
    require(name) {
      if (name in overrides) return overrides[name]
      if (name === 'react/jsx-runtime') return require(name)
      if (name === 'react') return { useState: value => [value, () => {}] }
      if (name === 'react-native') return native
      if (name === 'react-native-safe-area-context') return { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) }
      if (name === '@/lib/useTaplistSupabaseReady') return { useTaplistSupabaseReady: () => true }
      if (name === '@/lib/i18n') return { useLanguage: () => ({ language: 'zh' }), tr: (_, zh) => zh }
      if (name === '@/lib/analytics') return { trackEvent() {} }
      if (name === '@/constants/design') return { palette: {}, spacing: {}, typography: {} }
      if (name === '@/lib/types') return {}
      if (name === '@/components/taplist/EventCards') return { compactEventDateLabel: () => '', eventDateLabel: () => '' }
      if (name === '@expo/vector-icons/FontAwesome') return 'Icon'
      if (name === 'expo-linear-gradient') return { LinearGradient: 'Gradient' }
      if (name === '@/components/taplist/CachedImage') return { CachedImage: 'Image', CachedImageBackground: 'ImageBackground' }
      if (name === '@/components/taplist/railCardStyle') return {}
      throw new Error(`Unexpected import: ${name}`)
    },
  }, { filename: file })
  return module.exports
}

function nodes(element) {
  if (Array.isArray(element)) return element.flatMap(nodes)
  if (!React.isValidElement(element)) return []
  return [element, ...nodes(element.props.children)]
}

test('campaign public API uses the existing read-only RPCs and keeps errors separate from ordinary events', async () => {
  const calls = []
  const api = load('lib/api/taplist.ts', {
    '@/lib/supabase': { getTaplistSupabase: () => ({ rpc: async (name, args) => {
      calls.push({ name, args })
      if (name === 'list_public_campaigns') return { error: new Error('campaign unavailable') }
      if (name === 'get_public_campaign') return { data: { ok: true, campaign: { id: args.p_id_or_slug } } }
      return { data: { ok: true, results: [{ id: 'ordinary-event' }] } }
    } }) },
  })
  const results = await Promise.allSettled([api.fetchPublicCampaigns('Shanghai'), api.fetchPublicEvents('Shanghai')])
  assert.equal(results[0].status, 'rejected')
  assert.equal(results[1].value[0].id, 'ordinary-event')
  assert.equal((await api.fetchPublicCampaign('campaign-id')).campaign.id, 'campaign-id')
  assert.equal(calls[0].args.p_city, 'Shanghai')
  assert.equal(calls[2].name, 'get_public_campaign')
})

test('home banner routes campaigns independently and preserves ordinary event navigation', () => {
  const pushed = []
  const { HomeEventBanner } = load('components/taplist/HomeEventBanner.tsx', {
    'expo-router': { useRouter: () => ({ push: route => pushed.push(route) }) },
  })
  const campaign = { kind: 'campaign', id: 'joint', title: 'Joint event', start_at: '2026-11-13', card_image_url: 'main.jpg' }
  const joint = HomeEventBanner({ event: campaign, width: 340, index: 0, total: 1 })
  joint.props.onPress()
  assert.equal(pushed[0].pathname, '/campaign/[id]')
  assert.equal(pushed[0].params.id, 'joint')
  assert.equal(nodes(joint).find(node => node.type === 'ImageBackground').props.source, 'main.jpg')
  HomeEventBanner({ event: { id: 'single', tenant_slug: 'bar', display_state: 'UPCOMING', image_url: 'old.jpg' }, width: 340, index: 0, total: 1 }).props.onPress()
  assert.equal(pushed[1].pathname, '/bar/[slug]/event/[eventId]')
  assert.equal(pushed[1].params.slug, 'bar')
})

function detail(data, isError = false) {
  const { default: Screen } = load('app/campaign/[id].tsx', {
    'expo-router': { Stack: { Screen: 'StackScreen' }, router: {}, useLocalSearchParams: () => ({ id: 'joint' }) },
    '@tanstack/react-query': { useQuery: () => ({ data, isError, isLoading: false }) },
    '@/lib/api/taplist': { fetchPublicCampaign() {} },
  })
  return nodes(Screen())
}

test('detail renders the main image and all three details in order; main-only remains a single image', () => {
  const campaign = { title: 'Joint', card_image_url: 'main.jpg', detail_image_urls: ['one.jpg', 'two.jpg', 'three.jpg'], stops: [] }
  const images = detail({ ok: true, campaign }).filter(node => typeof node.type === 'function' && node.props.url)
  assert.deepEqual(images.map(node => node.props.url), ['main.jpg', 'one.jpg', 'two.jpg', 'three.jpg'])
  assert.ok(images.every(node => typeof node.props.onOpen === 'function'))
  assert.equal(detail({ ok: true, campaign: { ...campaign, detail_image_urls: [] } }).filter(node => node.props.url).length, 1)
})

test('hidden campaigns and failed refreshes do not render stale activity contents', () => {
  assert.equal(detail({ ok: false, code: 'NOT_PUBLIC' }).filter(node => node.props.url).length, 0)
  assert.equal(detail({ ok: true, campaign: { card_image_url: 'stale.jpg' } }, true).filter(node => node.props.url).length, 0)
})
