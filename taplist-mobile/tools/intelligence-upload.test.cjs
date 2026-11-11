const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const vm = require('node:vm')
const ts = require('typescript')
const source = fs.readFileSync(path.join(__dirname, '../lib/intelligenceAnalytics.ts'), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true,
} }).outputText
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const settle = async () => { for (let i = 0; i < 50; i++) await Promise.resolve() }
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }

async function harness({ backlog = 0, request } = {}) {
  let now = Date.parse('2026-11-11T12:00:00Z'), serial = 1000, timerId = 0, auth, appChange
  const timers = new Map(), calls = [], storage = new Map()
  const key = '@taplist/intelligence_outbox_v1'
  const original = Array.from({ length: backlog }, (_, n) => ({ event_id: id(n + 1), occurred_at: new Date(now - 1000).toISOString() }))
  if (backlog) storage.set(key, JSON.stringify({ installation: id(999), events: original, operations: [] }))
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])) } static now() { return now } }
  class IntelligenceError extends Error { constructor(status, retryAfter = 0) { super('UNAVAILABLE'); this.status = status; this.retryAfter = retryAfter } }
  const app = { currentState: 'active', addEventListener: (_, cb) => { appChange = cb } }
  const mocks = {
    '@react-native-async-storage/async-storage': { getItem: async k => storage.get(k), setItem: async (k, v) => storage.set(k, v), removeItem: async k => storage.delete(k) },
    'expo-constants': { expoConfig: { version: 'test' } }, 'expo-crypto': { randomUUID: () => id(serial++) },
    react: { useSyncExternalStore() {} }, 'react-native': { AppState: app, Platform: { OS: 'ios' } },
    '@/lib/supabase': { getTaplistSupabase: () => ({ auth: { onAuthStateChange: cb => { auth = cb } } }) },
    '@/lib/intelligenceHttp': { INTELLIGENCE_ENABLED: true, IntelligenceError, intelligenceRequest: async (route, init) => {
      const call = { route, body: JSON.parse(init.body), headers: init.headers, at: now }; calls.push(call)
      if (request) { const result = await request(call, IntelligenceError); if (result !== undefined) return result }
      return { accepted: (call.body.events || []).map(e => e.event_id), duplicates: [], rejected: [] }
    } },
  }
  const module = { exports: {} }
  vm.runInNewContext(compiled, { module, exports: module.exports, require: k => { if (!(k in mocks)) throw Error(k); return mocks[k] },
    Date: Clock, setTimeout: (fn, delay) => { const key = ++timerId; timers.set(key, { fn, at: now + delay }); return key },
    clearTimeout: key => timers.delete(key), setInterval: () => 0,
  })
  const api = module.exports
  await api.initializeIntelligence(true)
  api.setIntelligenceCities([{ source_city: 'Shanghai', city_code: 'shanghai' }])
  await settle()
  async function advance(ms) {
    const end = now + ms
    for (;;) {
      const due = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0]
      if (!due) break
      now = due[1].at; timers.delete(due[0]); due[1].fn(); await settle()
    }
    now = end; await settle()
  }
  return { api, calls, original, advance, storage, key,
    events: () => calls.filter(c => c.body.events), identities: () => calls.filter(c => c.body.operation_id),
    enqueue: () => api.observeIntelligenceClick('city_changed', { to_city: 'Shanghai' }),
    changeApp: async state => { app.currentState = state; appChange(state); await settle() },
    login: async (owner = 'owner-a') => { auth('SIGNED_IN', { user: { id: owner }, access_token: owner, expires_at: now / 1000 + 3600 }); await advance(0) },
  }
}

test('short batch deadline is not postponed by continuing clicks; 20 events flush immediately', async () => {
  const h = await harness()
  h.enqueue(); await h.advance(2000); h.enqueue(); await h.advance(999)
  assert.equal(h.events().length, 0)
  await h.advance(1)
  assert.equal(h.events()[0].body.events.length, 2)
  for (let n = 0; n < 20; n++) h.enqueue()
  await settle()
  assert.equal(h.events()[1].body.events.length, 20)
})

test('cold start drains backlog in sequential batches without interval gaps', async () => {
  const h = await harness({ backlog: 65 })
  assert.deepEqual(h.events().map(c => c.body.events.length), [20, 20, 20, 5])
  assert.equal(new Set(h.events().map(c => c.at)).size, 1)
  assert.deepEqual(h.events().flatMap(c => c.body.events.map(e => e.event_id)), h.original.map(e => e.event_id))
  assert.equal(JSON.parse(h.storage.get(h.key)).events.length, 0)
})

test('background attempts pending delivery and retains events if transport fails', async () => {
  const h = await harness({ request: () => { throw Error('offline') } })
  h.enqueue(); await h.changeApp('background')
  assert.equal(h.events().length, 1)
  assert.equal(JSON.parse(h.storage.get(h.key)).events.length, 1)
  await h.advance(10000)
  assert.equal(h.events().length, 1)
  await h.changeApp('active')
  assert.equal(h.events().length, 2)
  assert.equal(h.events()[0].body.events[0].event_id, h.events()[1].body.events[0].event_id)
})

test('slow identity and identity backoff cannot block raw event delivery', async () => {
  const pending = deferred()
  const h = await harness({ request: c => c.body.operation_id ? pending.promise : undefined })
  await h.login(); h.enqueue(); await h.advance(3000)
  assert.equal(h.identities().length, 1)
  assert.equal(h.events().length, 1)
  pending.reject(Error('503')); await settle()
  h.enqueue(); await h.advance(3000)
  assert.equal(h.identities().length, 1)
  assert.equal(h.events().length, 2)
})

test('partial retryable and failed batch keep IDs, respect retry delays, and remove permanent rejects', async () => {
  let attempt = 0
  const h = await harness({ backlog: 3, request: (c, ErrorType) => {
    if (!c.body.events) return
    attempt++
    if (attempt === 1) return { accepted: [id(1)], duplicates: [], rejected: [
      { event_id: id(2), retryable: true }, { event_id: id(3), retryable: false },
    ] }
    if (attempt === 2) throw new ErrorType(429, 5000)
  } })
  await h.api.flushIntelligenceEvents(); await settle()
  assert.equal(attempt, 1)
  assert.deepEqual(JSON.parse(h.storage.get(h.key)).events.map(e => e.event_id), [id(2)])
  await h.advance(2999); assert.equal(attempt, 1)
  await h.advance(1); assert.equal(attempt, 2)
  await h.api.flushIntelligenceEvents(); assert.equal(attempt, 2)
  await h.advance(5000); assert.equal(attempt, 3)
  assert.equal(h.events()[2].body.events[0].event_id, id(2))
  assert.equal(JSON.parse(h.storage.get(h.key)).events.length, 0)
})

test('revoking consent while a request is in flight cannot restore queue or schedule delivery', async () => {
  const pending = deferred()
  const h = await harness({ request: c => c.body.events ? pending.promise : undefined })
  h.enqueue(); await h.advance(3000)
  await h.api.setIntelligenceConsent(false); await settle()
  pending.reject(Error('offline')); await settle(); await h.advance(30000)
  assert.equal(h.storage.has(h.key), false)
  assert.equal(h.events().length, 1)
  assert.equal(h.api.intelligenceContext().analytics, null)
})

test('account switch never sends an old identity operation under a new account token', async () => {
  const pending = deferred()
  const h = await harness({ request: c => c.body.action === 'link' && c.headers.Authorization === 'Bearer owner-a' ? pending.promise : undefined })
  await h.login('owner-a'); await h.login('owner-b')
  pending.resolve({}); await settle(); await h.advance(3000)
  const links = h.identities().filter(c => c.body.action === 'link')
  assert.deepEqual(links.map(c => c.headers.Authorization), ['Bearer owner-a', 'Bearer owner-b'])
  assert.notEqual(links[0].body.session_id, links[1].body.session_id)
  const unlink = h.identities().find(c => c.body.action === 'unlink')
  assert.equal(unlink.headers.Authorization, 'Bearer owner-a')
})


test('foreground and enqueue triggers do not duplicate an in-flight batch', async () => {
  const pending = deferred()
  let active = 0, peak = 0, attempts = 0
  const h = await harness({ request: async c => {
    if (!c.body.events) return
    active++; peak = Math.max(peak, active); attempts++
    if (attempts === 1) await pending.promise
    active--
  } })
  for (let n = 0; n < 20; n++) h.enqueue()
  await settle()
  for (let n = 0; n < 25; n++) h.enqueue()
  await h.changeApp('active')
  await h.advance(3000)
  assert.equal(h.events().length, 1)
  pending.resolve(); await settle()
  assert.equal(peak, 1)
  assert.deepEqual(h.events().map(c => c.body.events.length), [20, 20, 5])
  assert.equal(new Set(h.events().flatMap(c => c.body.events.map(e => e.event_id))).size, 45)
})
