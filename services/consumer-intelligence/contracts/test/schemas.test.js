import test from 'node:test'
import assert from 'node:assert/strict'
import { ajv, base, fixture, invalid, readJson, schemaFiles, valid, validate } from './validation.js'

test('all independent JSON schemas compile', () => assert.equal(schemaFiles.length, 29))
for (const row of valid) test(`valid fixture: ${row.name}`, () => {
  const result = validate(row.schema, row.data)
  assert.equal(result.ok, true, JSON.stringify(result.errors))
})
for (const row of invalid) test(`invalid fixture: ${row.name}`, () => assert.equal(validate(row.schema, row.data).ok, false))

test('OpenAPI examples and inline schemas use the same validation registry', async () => {
  const doc = await readJson('openapi.json')
  let count = 0
  function visit(value) {
    if (!value || typeof value !== 'object') return
    if (value.schema) {
      const schema = value.schema.$ref?.startsWith('./schemas/') ? { $ref: base + value.schema.$ref.slice('./schemas/'.length) } : value.schema
      const check = ajv.compile(schema)
      const examples = value.examples ? Object.values(value.examples).map(e => e.value) : []
      if (Object.hasOwn(value, 'example')) examples.push(value.example)
      if (Object.hasOwn(schema, 'default')) examples.push(schema.default)
      for (const data of examples) {
        assert.equal(check(data), true, JSON.stringify(check.errors))
        count++
      }
    }
    for (const child of Object.values(value)) visit(child)
  }
  visit(doc)
  assert.ok(count >= 15, `only ${count} OpenAPI examples validated`)
})

test('ten event-name/version branches are mutually exclusive', () => {
  const union = ajv.getSchema(base + 'events/event.schema.json').schema
  assert.equal(union.oneOf.length, 10)
  for (const row of valid.filter(r => r.schema === 'events/event.schema.json')) {
    const matches = union.oneOf.filter(r => ajv.getSchema(new URL(r.$ref, base + 'events/event.schema.json').href)(row.data))
    assert.equal(matches.length, 1)
  }
})

test('internal Feed state cannot leak; new harmless optional response fields are compatible', () => {
  const item = fixture('for_you').items[0]
  assert.equal(validate('feed/item.schema.json', { ...item, public_status: 'new' }).ok, false)
  assert.equal(validate('feed/item.schema.json', { ...item, score: 1 }).ok, false)
  assert.equal(validate('feed/response.schema.json', { ...fixture('for_you'), away_city_at_creation: true }).ok, false)
  assert.equal(validate('feed/response.schema.json', { ...fixture('for_you'), future_metadata: {} }).ok, true)
})

test('Unicode length is neither UTF-8 bytes nor UTF-16 code units', () => {
  assert.equal(validate('feed/reason.schema.json', { code: 'future', text: '🍺'.repeat(60) }).ok, true)
  assert.equal(validate('feed/reason.schema.json', { code: 'future', text: '🍺'.repeat(61) }).ok, false)
})

test('server reason text excludes markup and URL payloads', () => {
  for (const text of ['<b>IPA</b>', '**IPA**', '[IPA](https://example.com)', 'https://example.com', '`IPA`', '# Heading']) {
    assert.equal(validate('feed/reason.schema.json', { code: 'future', text }).ok, false)
  }
})

test('page continuation flag and nullable cursor cannot contradict each other', () => {
  const latest = fixture('latest')
  assert.equal(validate('feed/response.schema.json', { ...latest, page: { ...latest.page, has_more: true } }).ok, false)
  assert.equal(validate('feed/response.schema.json', { ...latest, page: { ...latest.page, next_cursor: 'not-null' } }).ok, false)
})

test('cold start, building and computed states cannot be mixed', () => {
  assert.equal(validate('feed/response.schema.json', { ...fixture('cold start'), items: fixture('for_you').items }).ok, false)
  assert.equal(validate('feed/snapshot.schema.json', { ...fixture('for_you').snapshot, state: 'building' }).ok, false)
})
