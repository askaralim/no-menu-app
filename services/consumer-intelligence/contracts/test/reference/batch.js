import { assertEventTime, canonical, fail } from './core.js'
import { enrichFeedEvent } from './feed.js'
import { validate, ajv, base } from '../validation.js'

const names = new Set(ajv.getSchema(base + 'events/event.schema.json').schema.oneOf.map(r => r.$ref.split('/').at(-1).replace('-v1.schema.json', '').replaceAll('-', '_')))
const uuid = ajv.getSchema(base + 'common/primitives.schema.json#/$defs/uuid')

// Models atomic commit and commit-outcome uncertainty. This is a fault-injection
// test store, not evidence of PostgreSQL transaction or concurrency correctness.
export class ContractStore {
  events = new Map()
  receipts = new Map()
  semantics = new Set()
  commits = 0
  commit(next, fault) {
    if (fault === 'before_commit') fail('PERSISTENCE_UNAVAILABLE', 503)
    this.events = next.events
    this.receipts = next.receipts
    this.semantics = next.semantics
    this.commits++
    if (fault === 'after_commit') fail('PERSISTENCE_UNAVAILABLE', 503)
  }
}

export function ingestBatch(batch, { store, now, instances = new Map(), fault = null, resolveUser = () => null }) {
  if (Buffer.byteLength(JSON.stringify(batch)) > 65536) return { status: 413, code: 'PAYLOAD_TOO_LARGE' }
  if (!validate('events/batch.schema.json', batch).ok) return { status: 400, code: 'INVALID_BATCH' }
  const next = { events: new Map(store.events), receipts: new Map(store.receipts), semantics: new Set(store.semantics) }
  const accepted = [], duplicates = [], rejected = []
  const reject = (event, index, code) => rejected.push({ event_index: index, event_id: uuid(event.event_id) ? event.event_id : null, code, retryable: false })
  try {
    for (const [index, event] of batch.events.entries()) {
      try {
        if (!names.has(event.event_name)) fail('UNKNOWN_EVENT_NAME')
        if (event.schema_version !== 1) fail('UNKNOWN_EVENT_VERSION')
        if (Buffer.byteLength(JSON.stringify(event)) > 8192) fail('EVENT_TOO_LARGE')
        if (!validate('events/event.schema.json', event).ok) fail('INVALID_EVENT')
        const fingerprint = canonical({ installation_id: batch.installation_id, event })
        const prior = next.receipts.get(event.event_id)
        // Persisted duplicates remain duplicates even after their time window or
        // instance retention has expired. They were already validated on receipt.
        if (prior) {
          if (prior !== fingerprint) fail('EVENT_ID_CONFLICT')
          if (!accepted.includes(event.event_id) && !duplicates.includes(event.event_id)) duplicates.push(event.event_id)
          continue
        }
        assertEventTime(event, now)
        let enrichment = { away_city: null, user_key: resolveUser(batch.installation_id, event) }
        let semantic = null
        if (event.event_name.startsWith('feed_')) {
          if (fault === 'lookup') fail('PERSISTENCE_UNAVAILABLE', 503)
          const instance = instances.get(event.feed.feed_instance_id)
          if (!instance) fail('INVALID_FEED_INSTANCE')
          enrichment = enrichFeedEvent(instance, batch.installation_id, event, now, enrichment.user_key)
          if (event.event_name === 'feed_shown' || event.event_name === 'feed_item_impression') {
            semantic = canonical([batch.installation_id, event.feed.feed_instance_id, event.event_name, event.feed.item_id ?? null])
          }
        }
        next.receipts.set(event.event_id, fingerprint)
        if (semantic && next.semantics.has(semantic)) { duplicates.push(event.event_id); continue }
        if (semantic) next.semantics.add(semantic)
        next.events.set(event.event_id, { raw: structuredClone(event), enrichment })
        accepted.push(event.event_id)
      } catch (error) {
        if (error.status === 503) throw error
        reject(event, index, error.code ?? 'INVALID_EVENT')
      }
    }
    if (next.receipts.size !== store.receipts.size) store.commit(next, fault)
    return { status: 202, accepted, duplicates, rejected }
  } catch (error) {
    if (error.status !== 503) throw error
    return { status: 503, code: 'PERSISTENCE_UNAVAILABLE' } // no success acknowledgement
  }
}
