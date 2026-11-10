import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { readFile } from 'node:fs/promises'
import { migrate } from '../src/migrate.js'
import { ingestBatch } from '../src/collector.js'
import { campaignReport } from '../src/campaign-report.js'
import { batch } from './data.js'

const connection = process.env.CI_TEST_DATABASE_URL
if (!connection) throw new Error('Set CI_TEST_DATABASE_URL to isolated local PostgreSQL')
const url = new URL(connection)
if (url.hostname !== '127.0.0.1' || !['55432', '55433'].includes(url.port) || url.pathname !== '/nomenu_ci_test') throw new Error('Dedicated local database required')

test('campaign ingestion persists, deduplicates, rejects bad siblings and reports only scoped aggregates', async t => {
  const admin = new pg.Pool({ connectionString: connection })
  const database = `nomenu_ci_campaign_${randomUUID().replaceAll('-', '')}`
  await admin.query(`CREATE DATABASE "${database}"`); await admin.end()
  url.pathname = `/${database}`
  const pool = new pg.Pool({ connectionString: url.toString(), max: 3 })
  t.after(() => pool.end())
  await migrate(pool)
  const now = Date.now() - 1000, campaignId = randomUUID(), installation = randomUUID(), session = randomUUID()
  const make = (action, extra = {}) => ({ event_id: randomUUID(), event_name: 'campaign_interaction', schema_version: 1,
    occurred_at: new Date(now).toISOString(), session_id: session, session_started_at: new Date(now - 5000).toISOString(),
    source: 'campaign', selected_city_code: null,
    campaign: { campaign_id: campaignId, visit_id: randomUUID(), entry_source: 'share_card', environment: 'release' }, action, ...extra })
  const opened = make('unused', { event_name: 'activity_opened', activity_id: campaignId }); delete opened.action
  const purchase = make('purchase_handoff_result', { result: 'success' })
  const qa = make('purchase_clicked'); qa.campaign.environment = 'trial'
  const another = make('purchase_clicked'); another.campaign.campaign_id = randomUUID()
  const bad = make('purchase_success')
  const mismatch = { ...opened, event_id: randomUUID(), activity_id: randomUUID() }
  const response = await ingestBatch(pool, batch(installation, [opened, purchase, qa, another, bad, mismatch]), now)
  assert.equal(response.accepted.length, 4); assert.equal(response.rejected.length, 2)
  const retry = await ingestBatch(pool, batch(installation, [opened, purchase]), now)
  assert.equal(retry.duplicates.length, 2)
  const report = await campaignReport(pool, { campaignId, from: new Date(now - 10000).toISOString(), until: new Date(now + 10000).toISOString() })
  assert.equal(report.summary.events, 2)
  assert.equal(report.summary.observed_installations, 1)
  assert.equal(report.summary.resolved_accounts, 0)
  assert.equal(report.summary.first_observed_during_window_installations, 1)
  assert.equal(report.summary.repeat_detail_installations, 0)
  assert.equal(report.journeys.detail_visits, 1)
  assert.equal(report.actions.find(a => a.action === 'purchase_handoff_result').events, 1)
  assert.equal(report.actions.some(a => a.action === 'purchase_clicked'), false)
  assert.ok(!JSON.stringify(report).includes(installation))
  assert.ok(!JSON.stringify(report).includes(session))
  assert.equal((await pool.query('SELECT count(*)::int n FROM ci.events')).rows[0].n, 4)
  const earlier = { ...opened, event_id: randomUUID(), session_id: randomUUID(),
    occurred_at: new Date(now-20000).toISOString(), session_started_at: new Date(now-30000).toISOString() }
  delete earlier.campaign
  await ingestBatch(pool, batch(installation, [earlier]), now)
  const revised = await campaignReport(pool, { campaignId, from: new Date(now-10000).toISOString(), until: new Date(now+10000).toISOString() })
  assert.equal(revised.summary.first_observed_during_window_installations, 0)
  assert.equal(revised.summary.events, 2)
  await t.test('business counts exclude revoked records and include zero-count venues', async () => {
    // Minimal fixtures in this new isolated DB; no business environment is accessed.
    await pool.query(`CREATE TABLE public.campaign_events(id uuid,title text);
      CREATE TABLE public.tenants(id uuid,display_name text,name text);
      CREATE TABLE public.drinks(id uuid,name text);
      CREATE TABLE public.campaign_stops(id uuid,campaign_id uuid,tenant_id uuid,drink_id uuid,brewery_label text,sort_order int);
      CREATE TABLE public.user_campaign_stop_completions(user_id uuid,campaign_id uuid,stop_id uuid,completed_at timestamptz,undone_at timestamptz,verification_method text);`)
    await pool.query('INSERT INTO public.campaign_events VALUES($1,$2)', [campaignId, 'Fixture campaign'])
    const users = [randomUUID(), randomUUID(), randomUUID()], stopIds = []
    for (let i = 0; i < 6; i++) {
      const stop = randomUUID(), tenant = randomUUID(), drink = randomUUID(); stopIds.push(stop)
      await pool.query('INSERT INTO public.tenants VALUES($1,$2,$2)', [tenant, `Venue ${i}`])
      await pool.query('INSERT INTO public.drinks VALUES($1,$2)', [drink, `Beer ${i}`])
      await pool.query('INSERT INTO public.campaign_stops VALUES($1,$2,$3,$4,$5,$6)', [stop,campaignId,tenant,drink,'Brewery',i])
      for (const user of i < 2 ? users.slice(0,2) : users.slice(0,1)) {
        await pool.query("INSERT INTO public.user_campaign_stop_completions VALUES($1,$2,$3,$4,NULL,'self_confirmed')", [user,campaignId,stop,new Date(now)])
      }
    }
    await pool.query("INSERT INTO public.user_campaign_stop_completions VALUES($1,$2,$3,$4,$4,'self_confirmed')", [users[2],campaignId,stopIds[0],new Date(now)])
    const query = await readFile(new URL('../campaign-business-report.sql', import.meta.url), 'utf8')
    const params = [campaignId, new Date(now-10000), new Date(now+10000)]
    let business = (await pool.query(query,params)).rows[0].report
    assert.equal(business.participants,2); assert.equal(business.multi_venue_participants,2)
    assert.equal(business.finished_participants,1); assert.equal(business.active_completions,8)
    assert.equal(business.venues.length,6)
    assert.ok(users.every(user => !JSON.stringify(business).includes(user)))
    await pool.query('UPDATE public.user_campaign_stop_completions SET undone_at=now() WHERE user_id=$1 AND stop_id=$2', [users[0],stopIds[5]])
    business = (await pool.query(query,params)).rows[0].report
    assert.equal(business.finished_participants,0); assert.equal(business.active_completions,7)
    assert.equal(business.venues[5].participants,0)
    assert.equal((await pool.query(query,[randomUUID(),params[1],params[2]])).rows[0].report.campaign_exists,false)
  })
})
