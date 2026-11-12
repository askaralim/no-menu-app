import test from 'node:test'
import assert from 'node:assert/strict'
import pg from 'pg'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { migrate } from '../src/migrate.js'
import { adminReport, reportScope } from '../src/admin-report.js'

const url=new URL(process.env.CI_TEST_DATABASE_URL)
if(url.hostname!=='127.0.0.1'||!['55432','55433'].includes(url.port)||url.pathname!=='/nomenu_ci_test')throw new Error('Dedicated local test DB only')
test('real SQL: event scope, ordered exposure, same-beer TAP, global visits and private output',async()=>{
  const admin=new pg.Pool({connectionString:url.toString()})
  const database='nomenu_ci_test_'+randomUUID().replaceAll('-','')
  await admin.query(`CREATE DATABASE "${database}"`);await admin.end();url.pathname='/'+database
  const pool=new pg.Pool({connectionString:url.toString()})
  try{
    await migrate(pool)
    const now=Date.now(),at=ms=>new Date(now+ms).toISOString(),install=randomUUID(),session=randomUUID(),tenant=randomUUID(),product=randomUUID(),instance=randomUUID(),item='card'
    const consumer={venue_experiences:[1,2].map(i=>({id:randomUUID(),user_key:'secret-user',tenant_id:tenant,product_id:product,source_drink_id:randomUUID(),created_at:at(-2000+i),first_drank_at:at(-2000+i)}))}
    for(const [scope,payload] of [['catalog',{active_cycles:[{tenant_id:tenant,tenant_name:'Test bar'}]}],['consumer',consumer]])await pool.query('INSERT INTO ci.projections(scope,generation,source_as_of,digest,payload) VALUES($1,$2,$3,$4,$5)',[scope,randomUUID(),at(-1000),'digest',payload])
    async function event(name,offset,application='taplist'){
      await pool.query(`INSERT INTO ci.events(event_id,installation_id,session_id,occurred_at,received_at,raw,enrichment,identity_state,resolved_user_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[randomUUID(),install,session,at(offset),at(offset+1000),{event_name:name,feed:{feed_instance_id:instance,item_id:item}}, {client:{application},mode:'for_you',surface:'home',ranking_version:'test',tenant_id:tenant,product_id:product},'resolved','secret-user'])
    }
    await event('feed_item_impression',-10000);await event('feed_item_opened',-8000);await event('beer_opened',-5000,'miniprogram')
    const scope=reportScope(new URLSearchParams('days=7&application=taplist'),now)
    const report=await adminReport(pool,scope)
    assert.equal(report.summary.events,2);assert.equal(report.feed[0].impressions,1);assert.equal(report.feed[0].opened_after_impression,1)
    assert.equal(report.feed_taps[0].identified_clicks,1);assert.equal(report.feed_taps[0].matched_taps,2);assert.equal(report.feed_taps[0].clicks_with_tap,1)
    assert.equal(report.business.taps.records,2);assert.equal(report.business.assisted,null)
    assert.equal(report.venues[0].name,'Test bar')
    for(const secret of [install,session,'secret-user',instance])assert.ok(!JSON.stringify(report).includes(secret))
    assert.equal(report.beers[0].product_id,product)
    assert.equal(report.cities[0].city,'unknown')
    await pool.query('INSERT INTO ci.assisted_visit_projection VALUES(true,$1,$2,$1,$3)',[at(-1000),randomUUID(),{visits:[{user_key:'secret-user',evidence:[{event_id:'secret-evidence'}],tenant_id:tenant,first_tap_created_at:at(-2000),tap_count:2,matched_windows:{'24h':false,'48h':true,'72h':true}}]}])
    await pool.query(`DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='ci_api') THEN CREATE ROLE ci_api; END IF; IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='ci_worker') THEN CREATE ROLE ci_worker; END IF; END $$`)
    await pool.query(await readFile(new URL('../db/runtime-grants.sql',import.meta.url),'utf8'))
    const client=await pool.connect()
    try {
      await client.query('SET ROLE ci_api')
      await assert.rejects(client.query('SELECT * FROM ci.assisted_visit_projection'),e=>e.code==='42501')
      const restrictedPool={connect:async()=>({query:(...args)=>client.query(...args),release:()=>{}})}
      const restricted=await adminReport(restrictedPool,scope)
      assert.deepEqual(restricted.business.assisted,{'24':0,'48':1,'72':1})
      assert.equal(restricted.business.venues[0].taps,2)
      assert.ok(!JSON.stringify(restricted).includes('secret-user'))
      assert.ok(!JSON.stringify(restricted).includes('secret-evidence'))
    } finally { await client.query('RESET ROLE');client.release() }
    // Click before impression is not an exposed-item conversion.
    await pool.query("UPDATE ci.events SET occurred_at=$1 WHERE raw->>'event_name'='feed_item_impression'",[at(-7000)])
    assert.equal((await adminReport(pool,scope)).feed[0].opened_after_impression,0)
    const empty=await adminReport(pool,reportScope(new URLSearchParams('application=unknown'),now))
    assert.equal(empty.summary.events,0);assert.equal(empty.summary.delay_p95,null);assert.equal(empty.feed.length,0)
  }finally{await pool.end()}
})
