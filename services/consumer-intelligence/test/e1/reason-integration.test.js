import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { migrate } from '../../src/migrate.js'
import { getFeed } from '../../src/feed.js'
import { prepareExport, publishProjection, refreshSnapshots } from '../../src/projections.js'
import { configureE1, e1Snapshot } from '../../src/e1/integration.js'
import { e1Profile } from '../../src/e1/rank.js'
import { publishPolicy } from '../../src/e1/routing.js'
import { newInstance } from '../../src/instances.js'
import { digest, eligible, recentOrder, iso } from '../../src/model.js'
import { userKey } from '../../src/supabase.js'
import { valid } from '../../src/schema.js'
import { config, sourceData } from '../data.js'

const url = new URL(process.env.CI_TEST_DATABASE_URL)
if (url.hostname !== '127.0.0.1' || !['55432','55433'].includes(url.port) ||
    url.pathname !== '/nomenu_ci_test' || url.search) throw Error('Dedicated local test PostgreSQL required')

test('Reason snapshot upgrade and historical Instance immutability in real PostgreSQL',async t=>{
  const admin=new pg.Pool({connectionString:url.href}),db='nomenu_ci_test_'+randomUUID()
  try { await admin.query('CREATE DATABASE "'+db+'"') } finally { await admin.end() }
  const local=new URL(url);local.pathname='/'+db
  const pool=new pg.Pool({connectionString:local.href});t.after(()=>pool.end())
  await migrate(pool)
  const now=Date.now()-2000,data=sourceData(now),owner=userKey(data.user,config.userKeySecret)
  data.consumer.user_beers[4].style=null
  data.catalog.active_cycles.forEach((r,i)=>{r.style=i<2?'IPA':'浑浊IPA'})
  const serve={...config,e1:configureE1({NODE_ENV:'test',CI_E1_MODE:'serve',CI_E1_TEST_USERS:owner,
    CI_E1_LOCAL_BUNDLE:fileURLToPath(new URL('offline-bundle.json',import.meta.url))},local,new URL('http://127.0.0.1'))}
  const bundle=serve.e1.bundle()
  const catalog=prepareExport(data.catalog,'catalog',config,now),consumer=prepareExport(data.consumer,'consumer',config,now)
  await publishProjection(pool,catalog);await publishProjection(pool,consumer)
  await publishPolicy(pool,serve.e1,0)
  const candidates=catalog.payload.active_cycles,p=e1Profile(consumer.payload,owner,bundle)
  // Seed the format produced before this change, without running or rewriting an old reader.
  const signature=digest({version:bundle.model_version,count:p.count,counts:Object.fromEntries(p.counts),
    tapped:[...p.tapped].sort(),followed:[...p.followed].sort(),
    candidates:candidates.filter(r=>eligible(r,now,{windowDays:14})).sort(recentOrder)})
  const legacy={snapshot_id:randomUUID(),model_version:bundle.model_version,signature,generated_at:iso(now),
    data_as_of:iso(now),...e1Snapshot(candidates,p,bundle,now)}
  for(const item of legacy.items) item.reason={code:item.reason.code,text:item.reason.code==='style_exact'?
    '你TAP过同一风格的酒':'参考你喝过的风格，提供一个相关选择'}
  await pool.query(`INSERT INTO ci.feed_snapshots(snapshot_id,user_key,city_code,model_version,signature,generated_at,data_as_of,payload)
    VALUES($1,$2,'qingdao',$3,$4,$5,$5,$6)`,[legacy.snapshot_id,owner,bundle.model_version,signature,iso(now),legacy])
  const query=(limit=20,mode='for_you')=>({mode,surface:limit===6?'home':'feed_page',city_code:'qingdao',limit,feed_instance_id:randomUUID()})
  const read=(q,at=now)=>getFeed(pool,serve,q,{},q.mode==='latest'?null:owner,at)
  const saved=id=>pool.query('SELECT payload FROM ci.feed_instances WHERE instance_id=$1',[id]).then(r=>r.rows[0].payload)
  const oldQuery=query()
  const oldInstance=newInstance(oldQuery,{},owner,null,legacy.items,{ranking_version:bundle.model_version,
    model_version:bundle.model_version,snapshot_id:legacy.snapshot_id,snapshot_generated_at:legacy.generated_at,
    snapshot_signature:signature,data_as_of:iso(now),evidence:legacy.evidence,total_items:legacy.items.length,
    initial_personalization:{status:'eligible',unique_tap_count:5,required_tap_count:5},empty_reason:null},now,'Asia/Shanghai')
  await pool.query('INSERT INTO ci.feed_instances(instance_id,created_at,retention_until,payload) VALUES($1,$2,$3,$4)',
    [oldQuery.feed_instance_id,oldInstance.created_at,oldInstance.record_retention_until,oldInstance])
  const oldResponse=await read(oldQuery),oldStored=await saved(oldQuery.feed_instance_id)
  assert.deepEqual(oldResponse.items,legacy.items)
  assert.equal(oldResponse.snapshot.state,'stale')
  await refreshSnapshots(pool,serve,now+1)
  const fullQuery=query(),full=await read(fullQuery,now+1),home=await read(query(6),now+1)
  assert.notEqual(full.snapshot.snapshot_id,legacy.snapshot_id)
  assert.equal(full.snapshot.snapshot_id,home.snapshot.snapshot_id)
  assert.deepEqual(home.items,full.items.slice(0,6))
  const strip=items=>items.map(({reason,...item})=>item)
  assert.deepEqual(strip(full.items),strip(legacy.items))
  const fullStored=await saved(fullQuery.feed_instance_id)
  assert.deepEqual(fullStored.evidence,oldStored.evidence)
  assert.ok(full.items.some(i=>i.reason.code==='style_bridge'))
  for(const item of full.items) {
    assert.equal(item.reason.version,'e1-reason-v2')
    assert.equal(item.reason.evidence.matched_unique_taps,4)
    assert.equal(item.reason.evidence.total_unique_taps,5)
    assert.equal(item.reason.evidence.matched_percentage,80)
  }
  assert.ok(valid('feed/response.schema.json',{...full,api_version:'1',requestId:randomUUID(),server_time:iso(now+1)}))
  assert.deepEqual((await read(oldQuery,now+1)).items,oldResponse.items)
  const countBefore=(await pool.query('SELECT count(*) n FROM ci.feed_snapshots')).rows[0].n
  await refreshSnapshots(pool,serve,now+1)
  assert.equal((await pool.query('SELECT count(*) n FROM ci.feed_snapshots')).rows[0].n,countBefore)
  // Two new canonical beers and a duplicate of an existing beer: 5 -> 7, IPA 4 -> 5.
  const template=data.consumer.user_beers[0]
  data.consumer.user_beers.push({...template,id:randomUUID(),product_id:randomUUID()},
    {...template,id:randomUUID(),product_id:randomUUID(),style:null},{...template,id:randomUUID()})
  data.consumer.source_as_of=iso(now+2);data.consumer.export_id=randomUUID()
  data.consumer.counts.user_beers=data.consumer.user_beers.length
  await publishProjection(pool,prepareExport(data.consumer,'consumer',config,now+2))
  await refreshSnapshots(pool,serve,now+2)
  const next=await read(query(),now+2)
  assert.equal(next.personalization.unique_tap_count,7)
  for(const item of next.items) {
    assert.equal(item.reason.evidence.matched_unique_taps,5)
    assert.equal(item.reason.evidence.total_unique_taps,7)
    assert.equal(item.reason.evidence.matched_percentage,5/7*100)
  }
  assert.deepEqual((await read(fullQuery,now+2)).items,full.items)
  assert.deepEqual((await read(oldQuery,now+2)).items,oldResponse.items)
  assert.deepEqual(await saved(fullQuery.feed_instance_id),fullStored)
  assert.deepEqual(await saved(oldQuery.feed_instance_id),oldStored)
  const latest=await read(query(20,'latest'),now+2)
  assert.equal(latest.personalization,null)
  assert.ok(latest.items.length>0)
  assert.ok(latest.items.every(i=>i.reason===null && !('evidence' in i)))
})
