import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { createServer } from '../../src/server.js'
import { migrate } from '../../src/migrate.js'
import { transaction } from '../../src/db.js'
import { getFeed } from '../../src/feed.js'
import { runWorker } from '../../src/worker.js'
import { requestRefresh, currentPolicy, publishPolicy } from '../../src/e1/routing.js'
import { configureE1 } from '../../src/e1/integration.js'
import { prepareExport, publishProjection, refreshSnapshots, refreshV1Snapshots, refreshE1Snapshots } from '../../src/projections.js'
import { ingestBatch } from '../../src/collector.js'
import { eraseUser, pruneData } from '../../src/maintenance.js'
import { valid } from '../../src/schema.js'
import { DAY, iso } from '../../src/model.js'
import { userKey } from '../../src/supabase.js'
import { config, sourceData, batch } from '../data.js'

const url = new URL(process.env.CI_TEST_DATABASE_URL)
if (url.hostname !== '127.0.0.1' || !['55432','55433'].includes(url.port) ||
    url.pathname !== '/nomenu_ci_test' || url.search) throw Error('Dedicated local test PostgreSQL required')

test('E1 isolated service integration', async t => {
  const admin = new pg.Pool({connectionString:url.href})
  const db = 'nomenu_ci_test_'+randomUUID()
  await admin.query('CREATE DATABASE "'+db+'"')
  await admin.end()
  url.pathname = '/'+db
  const pool = new pg.Pool({connectionString:url.href})
  t.after(()=>pool.end())
  await migrate(pool)
  const now = Date.now()-2000, data = sourceData(now)
  const owner = userKey(data.user,config.userKeySecret)
  const file = fileURLToPath(new URL('offline-bundle.json',import.meta.url))
  const settings = (mode,extra={}) => ({...config,
    e1:configureE1({NODE_ENV:'test',CI_E1_MODE:mode,CI_E1_TEST_USERS:owner,CI_E1_LOCAL_BUNDLE:file,...extra},url,new URL('http://127.0.0.1'))})
  const serve=settings('serve'), shadow=settings('shadow'), off=settings('off')
  let epoch=0
  const elect=async s=>{epoch=await publishPolicy(pool,s.e1,epoch)}
  const version=serve.e1.bundle().model_version
  const installation=randomUUID(), session=randomUUID()
  const headers={'X-Installation-ID':installation,'X-Analytics-Session-ID':session}
  const q=(options={})=>({mode:'for_you',surface:'home',city_code:'qingdao',limit:6,feed_instance_id:randomUUID(),...options})
  const read=(settings,query,at=now)=>getFeed(pool,settings,query,headers,owner,at)
  const count=async table=>Number((await pool.query('SELECT count(*) AS n FROM ci.'+table)).rows[0].n)
  const rePublish=async(raw,scope,time)=> {
    raw.source_as_of=iso(time)
    raw.export_id=randomUUID()
    for (const key of Object.keys(raw.counts)) raw.counts[key]=raw[key].length
    await publishProjection(pool,prepareExport(raw,scope,config,time))
  }
  const rows=data.catalog.active_cycles
  for (const r of rows) r.style='浑浊IPA'
  rows[0].style='棕色艾尔'
  rows[1].style='IPA'
  rows[2].style='新中式花草茶'
  rows[4].product_id=rows[3].product_id
  rows[4].tenant_id=randomUUID()
  data.consumer.user_beers[4].style='棕色艾尔'
  await rePublish(data.catalog,'catalog',now)
  await rePublish(data.consumer,'consumer',now)
  let instanceQuery, initial, bridge, bridgeRow, buildingQuery

  await t.test('off and shadow isolate versions; worker shadow creates no instances or events', async()=>{
    await refreshSnapshots(pool,off,now)
    assert.deepEqual((await pool.query('SELECT DISTINCT model_version FROM ci.feed_snapshots')).rows,[{model_version:'rules-v1'}])
    await elect(shadow)
    const result=await runWorker(pool,shadow,{export:async scope=>data[scope]},()=>{})
    assert.deepEqual(result.failures,[])
    assert.equal(await count('feed_instances'),0);assert.equal(await count('events'),0)
    assert.equal((await pool.query('SELECT DISTINCT model_version FROM ci.feed_snapshots')).rowCount,2)
    const original=q()
    assert.equal((await read(shadow,original)).ranking_version,'rules-v1')
    assert.equal((await read(serve,original)).ranking_version,'rules-v1')
    const logs=[]
    const failed=await runWorker(pool,settings('shadow',{CI_E1_LOCAL_BUNDLE:'/missing'}),{export:async scope=>data[scope]},r=>logs.push(r))
    assert.deepEqual(failed.failures,['e1_snapshots'])
    assert.ok(logs.some(r=>r.event==='snapshots_refreshed'))
    assert.ok(logs.some(r=>r.event==='e1_snapshot_refresh_failed'))
    assert.equal(await count('feed_instances'),1)
    assert.equal(await count('events'),0)
  })
  await t.test('V1 commits first; failed E1 leaves the cohort refresh hint pending; successful retry clears it',async()=>{
    data.catalog.active_cycles[0].beer_name='updated'
    await rePublish(data.catalog,'catalog',now+1)
    await pool.query('INSERT INTO ci.refresh_requests(user_key,city_code,requested_at) VALUES($1,$2,$3)',[owner,'qingdao',iso(now)])
    const n=()=>pool.query("SELECT snapshot_id FROM ci.feed_snapshots WHERE model_version='rules-v1'")
    const before=(await n()).rowCount
    await elect(serve)
    const broken=settings('serve',{CI_E1_LOCAL_BUNDLE:'/missing'})
    await assert.rejects(refreshSnapshots(pool,broken,now+2),e=>e.code==='E1_BUNDLE_UNAVAILABLE')
    assert.ok((await n()).rowCount>before)
    assert.equal(await count('refresh_requests'),1)
    await elect(off)
    assert.equal((await read(off,q(),now+2)).ranking_version,'rules-v1')
    assert.equal((await read(broken,q({mode:'latest'}),now+2)).ranking_version,'latest-v1')
    await assert.rejects(read(broken,q(),now+2),e=>e.status===503)
    await elect(serve)
    await refreshSnapshots(pool,serve,now+2)
    assert.equal(await count('refresh_requests'),0)
  })
  await t.test('changed projection generation keeps the two-model request outstanding',async()=>{
    await pool.query('INSERT INTO ci.refresh_requests(user_key,city_code,requested_at) VALUES($1,$2,$3)',[owner,'qingdao',iso(now)])
    const v1=await refreshV1Snapshots(pool,serve,now+2)
    await rePublish(data.catalog,'catalog',now+2)
    await refreshE1Snapshots(pool,serve,now+2,v1)
    assert.equal(await count('refresh_requests'),1)
    await refreshSnapshots(pool,serve,now+2)
    assert.equal(await count('refresh_requests'),0)
  })
  await t.test('HTTP returns six E1 items; latest is independent; model injection rejected',async()=>{
    const server=createServer({pool,config:serve,supabase:{authorize:async()=>({user_key:owner})},log:()=>{},clock:()=>now+3})
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
    const urlFor=query=>'http://127.0.0.1:'+server.address().port+'/api/feed/v1/new-beers?'+new URLSearchParams(query)
    try {
      const options={headers:{Authorization:'Bearer test'}}
      const response=await fetch(urlFor(q()),options)
      assert.equal(response.status,200)
      const body=await response.json()
      assert.equal(body.items.length,6)
      assert.equal(body.ranking_version,version)
      const latest=await (await fetch(urlFor(q({mode:'latest',limit:40})))).json()
      assert.equal(latest.ranking_version,'latest-v1')
      assert.ok(latest.items.some(i=>i.style==='新中式花草茶'))
      assert.equal(latest.items.filter(i=>i.product_id===rows[3].product_id).length,2)
      assert.equal((await fetch(urlFor({...q(),whitelist:'all'}),options)).status,400)
    } finally { await new Promise(resolve=>server.close(resolve)) }
  })
  await t.test('limits 1/2/6/20, reasons, coarse-unknown exact and bridge evidence sidecar',async()=>{
    instanceQuery=q()
    initial=await read(serve,instanceQuery,now+3)
    assert.equal(initial.ranking_version,version)
    assert.equal(initial.snapshot.state,'fresh')
    assert.equal(initial.total_items,20)
    assert.equal(initial.items.length,6)
    assert.ok(initial.items.some(i=>i.style==='棕色艾尔' && i.reason.code==='style_exact'))
    assert.ok(valid('feed/response.schema.json',{...initial,server_time:iso(now+3),requestId:randomUUID(),api_version:'1'}))
    for(const limit of [1,2,6,20]) {
      const result=await read(serve,q({limit}),now+3)
      assert.equal(result.items.length,limit)
      assert.deepEqual(result.items.slice(0,Math.min(6,limit)),initial.items.slice(0,limit))
      for(const item of result.items) {
        assert.ok(!['tier','score','evidence','witnesses','evidence_count'].some(k=>k in item))
        assert.equal(item.reason.version,'e1-reason-v2')
        assert.equal(item.reason.evidence.total_unique_taps,5)
        assert.equal(item.reason.evidence.matched_unique_taps,item.reason.evidence.witnesses.reduce((n,w)=>n+w.unique_taps,0))
        if(item.reason.code==='style_bridge') assert.match(item.reason.text,/关联风格/)
        assert.notEqual(item.style,'新中式花草茶')
      }
    }
    bridge=initial.items.find(i=>i.product_id===rows[3].product_id)
    bridgeRow=rows.find(r=>r.source_drink_id===bridge?.source_drink_id)
    assert.ok(bridgeRow)
    assert.deepEqual((await read(off,instanceQuery,now+3)).items,initial.items)
    await assert.rejects(read(serve,{...instanceQuery,limit:20},now+3),e=>e.status===409)
    await assert.rejects(read(serve,{...q(),model_version:version},now+3),e=>e.status===400)
  })
  await t.test('same-venue TAP, expiry and canonical change withdraw items without replacing venues; history survives',async()=>{
    const first=initial.items[0]
    const tapped={id:randomUUID(),user_id:data.user,product_id:bridge.product_id,provisional_drink_id:null,tenant_id:bridge.tenant_id,
      source_drink_id:bridge.source_drink_id,first_drank_at:iso(now),created_at:iso(now),style:null}
    data.consumer.venue_experiences.push(tapped)
    await rePublish(data.consumer,'consumer',now+4)
    const changed=await read(off,instanceQuery,now+4)
    assert.equal(changed.snapshot.state,'stale')
    assert.deepEqual(changed.items,initial.items.filter(i=>i.item_id!==bridge.item_id))
    data.consumer.venue_experiences.pop()
    await rePublish(data.consumer,'consumer',now+5)
    assert.deepEqual((await read(off,instanceQuery,now+5)).items,changed.items)
    const firstRow=rows.find(r=>r.source_drink_id===first.source_drink_id)
    firstRow.product_id=randomUUID()
    const reclassified=initial.items.at(-1)
    rows.find(r=>r.source_drink_id===reclassified.source_drink_id).style='IPA'
    rows[1].current_cycle_started_at=iso(now-15*DAY)
    await rePublish(data.catalog,'catalog',now+6)
    const retry=await read(off,instanceQuery,now+6)
    assert.ok(!retry.items.some(i=>i.item_id===first.item_id || i.item_id===reclassified.item_id || i.source_drink_id===rows[1].source_drink_id))
    assert.deepEqual(retry.items,initial.items.filter(i=>retry.items.some(j=>j.item_id===i.item_id)))
    const event={event_id:randomUUID(),event_name:'feed_item_opened',schema_version:1,occurred_at:iso(now+1000),session_id:session,
      session_started_at:iso(now-10000),feed:{feed_instance_id:instanceQuery.feed_instance_id,item_id:bridge.item_id,display_position:bridge.rank}}
    assert.deepEqual((await ingestBatch(pool,batch(installation,[event]),now+DAY)).accepted,[event.event_id])
    const enrichment=(await pool.query('SELECT enrichment FROM ci.events WHERE event_id=$1',[event.event_id])).rows[0].enrichment
    assert.equal(enrichment.original_rank,bridge.rank);assert.equal(enrichment.model_version,version)
    await assert.rejects(read(settings('off',{CI_E1_REVOKED_VERSION:version}),instanceQuery,now+6),e=>e.status===410)
    await assert.rejects(read(settings('off',{CI_E1_LOCAL_BUNDLE:'/missing'}),instanceQuery,now+6),e=>e.status===503)
  })
  await t.test('building is pinned across refresh; empty, single, unknown-only and cold-start contracts',async()=>{
    // A fresh user/city without an E1 snapshot.
    const secondUser=randomUUID(), second=userKey(secondUser,config.userKeySecret)
    const policy=settings('serve',{CI_E1_TEST_USERS:second})
    await elect(policy)
    await refreshSnapshots(pool,policy,now+6)
    data.consumer.user_beers.push(...data.consumer.user_beers.slice(0,5).map(r=>({...r,id:randomUUID(),user_id:secondUser})))
    await rePublish(data.consumer,'consumer',now+7)
    const get=(query,at)=>getFeed(pool,policy,query,{},second,at)
    buildingQuery=q()
    assert.equal((await get(buildingQuery,now+7)).snapshot.state,'building')
    data.catalog.active_cycles=[rows[0],rows[2]]
    await rePublish(data.catalog,'catalog',now+8)
    await refreshSnapshots(pool,policy,now+8)
    assert.equal((await get(buildingQuery,now+8)).snapshot.state,'building')
    const single=await get(q(),now+8)
    assert.equal(single.items.length,1);assert.equal(single.empty_reason,null)
    assert.equal((await get(q({city_code:'shanghai'}),now+8)).empty_reason,'no_recent_candidates')
    for(const row of data.consumer.user_beers.filter(r=>r.user_id===secondUser)) row.style='新中式花草茶'
    await rePublish(data.consumer,'consumer',now+9)
    assert.equal((await get(q(),now+9)).empty_reason,'insufficient_style_history')
    data.consumer.user_beers=data.consumer.user_beers.filter(r=>r.user_id!==secondUser)
    await rePublish(data.consumer,'consumer',now+10)
    assert.equal((await get(q(),now+10)).personalization.status,'cold_start')
  })
  await t.test('005 least privilege, repeated hints and expired worker attestation',async()=>{
    await pool.query(await readFile(new URL('../../db/runtime-grants.sql',import.meta.url),'utf8'))
    const pair=[owner,'shanghai']
    const stamp=async()=> (await pool.query('SELECT requested_at::text t FROM ci.e1_refresh_intents WHERE user_key=$1 AND city_code=$2',pair)).rows[0]?.t
    const hint=()=>transaction(pool,async c=>{
      await c.query('SET LOCAL ROLE ci_api')
      const p=await currentPolicy(c)
      await requestRefresh(c,...pair,p,version)
    })
    await hint();const first=await stamp();await hint()
    assert.ok(await stamp()>first)
    for(const role of ['ci_worker','ci_api']) {
      for(const sql of ["UPDATE ci.e1_policy SET epoch=epoch+1","DELETE FROM ci.e1_revoked_assets"]) {
        await assert.rejects(transaction(pool,async c=>{await c.query('SET LOCAL ROLE '+role);await c.query(sql)}),err=>err.code==='42501')
      }
    }
    await assert.rejects(pool.query('DELETE FROM ci.refresh_requests WHERE user_key=$1 AND city_code=$2',pair),err=>err.code==='23503')
    await elect(serve)
    await refreshSnapshots(pool,serve,Date.now())
    assert.equal(await stamp(),undefined)
    await pool.query("UPDATE ci.e1_policy SET worker_until=now()-interval '1 second'")
    await assert.rejects(read(serve,q(),now+10),err=>err.code==='E1_POLICY_MISMATCH')
    assert.equal((await read(off,q({mode:'latest'}),now+10)).ranking_version,'latest-v1')
  })
  await t.test('withdrawals and E1 history follow existing retention and erase boundaries',async()=>{
    assert.ok(await count('e1_instance_withdrawals'))
    await assert.rejects(read(off,instanceQuery,now+30*DAY+10),e=>e.code==='FEED_INSTANCE_EXPIRED')
    await elect(serve)
    await refreshSnapshots(pool,serve,now+11)
    const young=q()
    assert.equal((await read(serve,young,now+11)).items.length,1)
    data.catalog.active_cycles=[]
    await rePublish(data.catalog,'catalog',now+12)
    assert.equal((await read(off,young,now+12)).items.length,0)
    await pruneData(pool,{apply:true,now:now+30*DAY+4})
    assert.deepEqual((await pool.query('SELECT instance_id FROM ci.e1_instance_withdrawals')).rows,[{instance_id:young.feed_instance_id}])
    await transaction(pool,async c=>{await requestRefresh(c,owner,'qingdao',await currentPolicy(c),version)})
    assert.ok(await count('e1_refresh_intents'))
    await eraseUser(pool,owner,{apply:true,now:now+30*DAY+5})
    assert.equal(await count('e1_instance_withdrawals'),0)
    assert.equal((await pool.query('SELECT 1 FROM ci.e1_refresh_intents WHERE user_key=$1',[owner])).rowCount,0)
    assert.equal((await pool.query('SELECT 1 FROM ci.e1_policy WHERE $1=ANY(cohort)',[owner])).rowCount,0)
    assert.equal((await pool.query("SELECT 1 FROM ci.feed_instances WHERE payload->>'owner_user_key'=$1",[owner])).rowCount,0)
    assert.ok(await count('feed_instances'))
    assert.equal((await pool.query('SELECT 1 FROM ci.feed_snapshots WHERE user_key=$1',[owner])).rowCount,0)
    await assert.rejects(read(off,q(),now+11),e=>e.code==='SUBJECT_ERASED')
  })
})
