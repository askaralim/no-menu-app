import { assertNotErased } from './privacy.js'
import { transaction, lock } from './db.js'
import { assertSchema, valid } from './schema.js'
import { assertEventTime, digest, iso } from './model.js'
import { identityContext, resolveIdentity } from './identity.js'
import { enrichFeedEvent } from './instances.js'
import { ServiceError, fail } from './errors.js'

const names = new Set(['beer_opened', 'bar_opened', 'search_result_opened', 'activity_opened', 'city_changed', 'map_navigation_clicked', 'feed_shown', 'feed_item_impression', 'feed_item_opened', 'campaign_interaction'])
export async function ingestBatch(pool, batch, now = Date.now()) {
  assertSchema('events/batch.schema.json', batch, 'INVALID_BATCH')
  return transaction(pool, async client => {
    // Small V1 batches serialize the durable idempotency boundary. This also
    // covers semantic duplicates with different event IDs. Bounded DB timeout
    // causes 503 + original-ID retry, never an optimistic acknowledgement.
    await lock(client, 'event-ingestion')
    const accepted = [], duplicates = [], rejected = []
    for (const [index, event] of batch.events.entries()) {
      try {
        if (!names.has(event.event_name)) fail(400, 'UNKNOWN_EVENT_NAME')
        if (event.schema_version !== 1) fail(400, 'UNKNOWN_EVENT_VERSION')
        if (Buffer.byteLength(JSON.stringify(event)) > 8192) fail(400, 'EVENT_TOO_LARGE')
        assertSchema('events/event.schema.json', event, 'INVALID_EVENT')
        if (event.campaign && event.event_name === 'activity_opened' && event.activity_id !== event.campaign.campaign_id) fail(400, 'INVALID_EVENT')
        await assertNotErased(client, null, batch.installation_id, event.session_id)
        const fingerprint = digest({ installation_id: batch.installation_id, event })
        const prior = (await client.query('SELECT fingerprint FROM ci.event_receipts WHERE event_id=$1', [event.event_id])).rows[0]
        if (prior) {
          if (prior.fingerprint !== fingerprint) fail(400, 'EVENT_ID_CONFLICT')
          if (!accepted.includes(event.event_id) && !duplicates.includes(event.event_id)) duplicates.push(event.event_id)
          continue
        }
        assertEventTime(event, now)
        // Same lock as identity admission prevents a close/reconciliation race.
        await lock(client, `session:${batch.installation_id}:${event.session_id}`)
        const identity = resolveIdentity(await identityContext(client, batch.installation_id, event.session_id), event)
        let enrichment = { away_city: null }, semantic = null
        if (event.event_name.startsWith('feed_')) {
          const instance = (await client.query('SELECT payload FROM ci.feed_instances WHERE instance_id=$1', [event.feed.feed_instance_id])).rows[0]?.payload
          enrichment = enrichFeedEvent(instance, batch.installation_id, event, now, identity.user_key)
          if (['feed_shown', 'feed_item_impression'].includes(event.event_name)) semantic = digest([batch.installation_id, event.feed.feed_instance_id, event.event_name, event.feed.item_id ?? null])
        }
        // First accepted upload context, reported by the producer (not identity
        // proof or necessarily the version at occurrence for offline events).
        // Duplicate delivery returns above and never rewrites this context.
        enrichment.client = { application: batch.client.application, platform: batch.client.platform, app_version: batch.client.app_version }
        await client.query('INSERT INTO ci.event_receipts(event_id,fingerprint,received_at,installation_id,session_id) VALUES($1,$2,$3,$4,$5)', [event.event_id, fingerprint, iso(now), batch.installation_id, event.session_id])
        const inserted = await client.query(`INSERT INTO ci.events(event_id,installation_id,session_id,occurred_at,received_at,semantic_key,raw,enrichment,resolved_user_key,identity_state)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(semantic_key) DO NOTHING`,
        [event.event_id, batch.installation_id, event.session_id, event.occurred_at, iso(now), semantic, event, enrichment, identity.user_key, identity.identity_state])
        ;(inserted.rowCount ? accepted : duplicates).push(event.event_id)
      } catch (error) {
        // Only deliberate item-level validation errors are partial failures.
        // SQL errors/lookup outages/unknown exceptions abort the entire batch.
        if (!(error instanceof ServiceError) || error.status >= 500) throw error
        rejected.push({ event_index: index, event_id: valid('common/primitives.schema.json#/$defs/uuid', event.event_id) ? event.event_id : null, code: error.code, retryable: false })
      }
    }
    return { accepted, duplicates, rejected }
  })
}
