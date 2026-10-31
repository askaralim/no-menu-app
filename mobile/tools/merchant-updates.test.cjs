const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

function loadMerchantUpdates(initial = null, fail = false) {
  const values = new Map()
  if (initial !== null) values.set('nomenu.merchantUpdates.seen.v1', initial)
  const storage = {
    getItem: async (key) => {
      if (fail) throw new Error('storage unavailable')
      return values.get(key) ?? null
    },
    setItem: async (key, value) => {
      if (fail) throw new Error('storage unavailable')
      values.set(key, value)
    },
  }
  const code = ts.transpileModule(
    fs.readFileSync(require.resolve('../lib/merchantUpdates.ts'), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  ).outputText
  const module = { exports: {} }
  vm.runInNewContext(code, {
    module,
    exports: module.exports,
    require: (name) => {
      if (name === '@react-native-async-storage/async-storage') return { default: storage }
      throw new Error(`Unexpected import: ${name}`)
    },
  })
  return module.exports
}

test('latest merchant update is limited to merchant roles', () => {
  const updates = loadMerchantUpdates()
  assert.equal(updates.latestMerchantUpdate('owner').id, 'merchant-2026-10-31-tap-lifecycle')
  assert.equal(updates.latestMerchantUpdate('staff').id, 'merchant-2026-10-31-tap-lifecycle')
  assert.equal(updates.latestMerchantUpdate('super_admin').id, 'merchant-2026-10-31-tap-lifecycle')
  assert.equal(updates.latestMerchantUpdate(null), null)
})

test('seen state is isolated per merchant user', async () => {
  const updates = loadMerchantUpdates()
  const current = await updates.getUnseenMerchantUpdate('user-a', 'owner')
  assert.ok(current)
  assert.equal(await updates.markMerchantUpdateSeen('user-a', current.id), true)
  assert.equal(await updates.getUnseenMerchantUpdate('user-a', 'owner'), null)
  assert.ok(await updates.getUnseenMerchantUpdate('user-b', 'owner'))
})

test('opening an update immediately notifies the tab badge', async () => {
  const updates = loadMerchantUpdates()
  const notifications = []
  const unsubscribe = updates.subscribeMerchantUpdateSeen((userId, updateId) => {
    notifications.push(`${userId}:${updateId}`)
  })

  const current = await updates.getUnseenMerchantUpdate('user-a', 'owner')
  const persistence = updates.markMerchantUpdateSeen('user-a', current.id)
  assert.deepEqual(notifications, [`user-a:${current.id}`])
  assert.equal(await persistence, true)

  unsubscribe()
  await updates.markMerchantUpdateSeen('user-b', current.id)
  assert.equal(notifications.length, 1)
})

test('current guide covers the release behavior and supersedes the old guide', async () => {
  const updates = loadMerchantUpdates(JSON.stringify({
    'user-a': 'merchant-2026-10-29-tap-data',
  }))
  const current = await updates.getUnseenMerchantUpdate('user-a', 'owner')
  assert.equal(current.id, 'merchant-2026-10-31-tap-lifecycle')
  assert.equal(current.ctaHref, '/(tabs)/house/tap-data')
  const copy = [current.summary, ...current.bullets].join(' ')
  assert.match(copy, /售罄/)
  assert.match(copy, /恢复供应/)
  assert.match(copy, /换桶/)
  assert.match(copy, /继续加载/)
})

test('invalid or unavailable storage does not block the guide', async () => {
  const invalid = loadMerchantUpdates('not-json')
  assert.ok(await invalid.getUnseenMerchantUpdate('user-a', 'staff'))

  const unavailable = loadMerchantUpdates(null, true)
  let notified = false
  unavailable.subscribeMerchantUpdateSeen(() => { notified = true })
  assert.ok(await unavailable.getUnseenMerchantUpdate('user-a', 'owner'))
  const persistence = unavailable.markMerchantUpdateSeen('user-a', 'update')
  assert.equal(notified, true)
  assert.equal(await persistence, false)
})
