import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { setTimeout as sleep } from 'node:timers/promises'
import { once } from 'node:events'
import pg from 'pg'
import { createPool, transaction } from '../../src/db.js'
import { migrate } from '../../src/migrate.js'
import { runWorker } from '../../src/worker.js'
import { configureE1 } from '../../src/e1/integration.js'
import { publishPolicy, requestRefresh, currentPolicy } from '../../src/e1/routing.js'
import { createServer } from '../../src/server.js'
import { userKey } from '../../src/supabase.js'
import { sourceData, config } from '../data.js'

test('real checked-out backend disconnects, confined to a fresh loopback database', async t => {
  const uri = new URL(process.env.CI_TEST_DATABASE_URL)
  assert.ok(['postgres:','postgresql:'].includes(uri.protocol))
  assert.equal(uri.hostname,'127.0.0.1'); assert.ok(['55432','55433'].includes(uri.port))
  assert.equal(uri.pathname,'/nomenu_ci_test'); assert.equal(uri.search,'')
  const bootstrap = new pg.Pool({connectionString:uri.href})
  uri.pathname = '/nomenu_ci_test_'+randomUUID()
  try { await bootstrap.query('CREATE DATABASE "'+uri.pathname.slice(1)+'"') } finally { await bootstrap.end() }
  const admin = new pg.Pool({connectionString:uri.href,statement_timeout:10000})
  const worker = createPool({databaseUrl:uri.href,poolMax:3}), api = createPool({databaseUrl:uri.href,poolMax:2})
  t.after(async()=>{ await Promise.all([admin.end(),worker.end(),api.end()]) })
  const data = sourceData(Date.now()-100), owner = userKey(data.user,config.userKeySecret)
  const settings = {...config,e1:configureE1({NODE_ENV:'test',CI_E1_MODE:'shadow',
    CI_E1_LOCAL_BUNDLE:fileURLToPath(new URL('offline-bundle.json',import.meta.url))},uri,new URL('http://127.0.0.1'))}
  const source = {export:async scope=>data[scope]}
  const logs = []
  const kill = async pid => assert.equal((await admin.query('SELECT pg_terminate_backend($1) AS killed',[pid])).rows[0].killed,true)
  const eventually = async fn => {
    for (let i=0; i<200; i++) { const value = await fn(); if (value) return value; await sleep(20) }
    throw Error('Expected backend state did not arrive')
  }
  await migrate(admin)
  await t.test('idle checked-out transaction loses backend between queries: rollback and a fresh connection',async()=>{
    await admin.query('CREATE TABLE ci.test_disconnect_marker(n integer)')
    let pid
    await assert.rejects(transaction(worker,async c=>{
      pid=c.processID
      await c.query('INSERT INTO ci.test_disconnect_marker VALUES(1)')
      const ended=new Promise(resolve=>c.once('end',resolve))
      await kill(pid); await ended
      // Even if application code returns normally it must not acknowledge.
      return true
    }),{code:'DATABASE_CONNECTION_LOST'})
    assert.equal((await admin.query('SELECT 1 FROM ci.test_disconnect_marker')).rowCount,0)
    await transaction(worker,async c=>{
      assert.notEqual(c.processID,pid)
      await c.query('INSERT INTO ci.test_disconnect_marker VALUES(2)')
    })
    assert.deepEqual((await admin.query('SELECT * FROM ci.test_disconnect_marker')).rows,[{n:2}])
  })
  await t.test('lease lost during remote fetch stops the pass before publication; next pass reacquires',async()=>{
    const failedSource={async export(scope) {
      assert.equal(scope,'catalog')
      const pid=(await admin.query(`SELECT pid FROM pg_stat_activity WHERE datname=current_database()
        AND state='idle' AND query LIKE 'SELECT pg_try_advisory_lock(%'`)).rows[0].pid
      await kill(pid)
      await eventually(()=>logs.some(l=>l.scope==='worker_lease' && l.phase==='catalog'))
      return data[scope]
    }}
    await assert.rejects(runWorker(worker,config,failedSource,r=>logs.push(r)),{code:'WORKER_LEASE_LOST'})
    assert.equal((await admin.query('SELECT 1 FROM ci.projections')).rowCount,0)
    assert.deepEqual((await runWorker(worker,config,source,r=>logs.push(r))).failures,[])
    assert.equal((await admin.query('SELECT 1 FROM ci.projections')).rowCount,2)
  })
  await t.test('a lost policy observation defers E1 and still runs the V1 pass',async()=>{
    const lock=await admin.connect(), events=[]
    let run
    try {
      await lock.query("SELECT pg_advisory_lock(hashtextextended('ci:e1-policy',0))")
      run=runWorker(worker,settings,source,e=>events.push(e))
      const pid=await eventually(async()=>(await admin.query(`SELECT pid FROM pg_stat_activity WHERE datname=current_database()
        AND wait_event='advisory' AND query LIKE '%ci:e1-policy%' AND application_name='nomenu-consumer-intelligence'`)).rows[0]?.pid)
      await kill(pid)
    } finally {
      await lock.query('SELECT pg_advisory_unlock_all()'); lock.release()
    }
    assert.deepEqual((await run).failures,['e1_policy'])
    assert.ok(events.some(e=>e.event==='e1_worker_unavailable' && e.code==='DATABASE_CONNECTION_LOST'))
    assert.ok(events.some(e=>e.event==='snapshots_refreshed'))
    assert.ok(events.some(e=>e.event==='assisted_visits_refreshed'))
    assert.ok(!events.some(e=>e.event==='e1_snapshots_refreshed'))
  })
  await t.test('E1 transaction killed during real SQL: no partial E1 publication or lost debt, V1 and Latest retain ranks',async()=>{
    const server=createServer({pool:api,config,supabase:{authorize:async()=>({user_key:owner})},log:()=>{}})
    server.listen(0,'127.0.0.1'); await once(server,'listening')
    const routes=['for_you','latest'].map(mode=>({mode,feed_instance_id:randomUUID(),surface:'home',limit:6,city_code:'qingdao'}))
    async function home(q) {
      const res=await fetch('http://127.0.0.1:'+server.address().port+'/api/feed/v1/new-beers?'+new URLSearchParams(q),
        {headers:q.mode==='for_you'?{authorization:'Bearer synthetic'}:{}})
      assert.equal(res.status,200)
      const body=await res.json()
      assert.equal(body.ranking_version,q.mode==='for_you'?'rules-v1':'latest-v1')
      assert.equal(body.items.length,6)
      return body.items.map(i=>[i.rank,i.item_id,i.tenant_id])
    }
    const lock=await admin.connect()
    let running
    try {
      const baseline=await Promise.all(routes.map(home))
      const epoch=await publishPolicy(admin,settings.e1,0)
      await transaction(admin,async c=>requestRefresh(c,owner,'qingdao',await currentPolicy(c),settings.e1.activeVersion))
      // Force a wait during an E1 INSERT only. V1 and both API readers stay live.
      await admin.query(`CREATE FUNCTION ci.test_block_e1() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN IF NEW.model_version <> 'rules-v1' AND NEW.city_code='qingdao' THEN
          PERFORM pg_advisory_xact_lock(829176); END IF; RETURN NEW; END $$;
        CREATE TRIGGER test_block BEFORE INSERT ON ci.feed_snapshots FOR EACH ROW EXECUTE FUNCTION ci.test_block_e1()`)
      await lock.query('SELECT pg_advisory_lock(829176)')
      running=runWorker(worker,settings,source,r=>logs.push(r))
      const pid=await eventually(async()=>(await admin.query(`SELECT pid FROM pg_stat_activity WHERE datname=current_database()
        AND wait_event='advisory' AND query LIKE 'INSERT INTO ci.feed_snapshots%'`)).rows[0]?.pid)
      assert.deepEqual(await Promise.all(routes.map(home)),baseline)
      await kill(pid)
      assert.deepEqual((await running).failures,['e1_snapshots'])
      assert.ok(logs.some(l=>l.event==='e1_snapshot_refresh_failed' && l.code==='DATABASE_CONNECTION_LOST'))
      assert.equal((await admin.query("SELECT 1 FROM ci.feed_snapshots WHERE model_version<>'rules-v1'")).rowCount,0)
      assert.equal((await admin.query("SELECT 1 FROM ci.feed_snapshots WHERE model_version='rules-v1'")).rowCount,3)
      assert.equal((await admin.query('SELECT worker_epoch FROM ci.e1_policy')).rows[0].worker_epoch,null)
      assert.equal((await admin.query('SELECT 1 FROM ci.refresh_requests')).rowCount,1)
      assert.deepEqual((await admin.query('SELECT epoch,model_version FROM ci.e1_refresh_intents')).rows,[{epoch,model_version:settings.e1.activeVersion}])
      assert.deepEqual(await Promise.all(routes.map(home)),baseline)
      // Lose the separate lease while the E1 write transaction is still
      // healthy but blocked. It must roll back before submitting COMMIT.
      running=runWorker(worker,settings,source,r=>logs.push(r))
      await eventually(async()=>(await admin.query(`SELECT pid FROM pg_stat_activity WHERE datname=current_database()
        AND wait_event='advisory' AND query LIKE 'INSERT INTO ci.feed_snapshots%'`)).rowCount)
      const leasePid=(await admin.query(`SELECT pid FROM pg_stat_activity WHERE datname=current_database()
        AND state='idle' AND query LIKE 'SELECT pg_try_advisory_lock(%'`)).rows[0].pid
      await kill(leasePid)
      await eventually(()=>logs.some(l=>l.scope==='worker_lease' && l.phase==='e1'))
      await lock.query('SELECT pg_advisory_unlock(829176)')
      await assert.rejects(running,{code:'WORKER_LEASE_LOST'}); running=null
      assert.equal((await admin.query("SELECT 1 FROM ci.feed_snapshots WHERE model_version<>'rules-v1'")).rowCount,0)
      assert.equal((await admin.query('SELECT 1 FROM ci.e1_refresh_intents')).rowCount,1)
      assert.deepEqual((await runWorker(worker,settings,source,r=>logs.push(r))).failures,[])
      assert.equal((await admin.query('SELECT 1 FROM ci.e1_refresh_intents')).rowCount,0)
      assert.equal((await admin.query('SELECT 1 FROM ci.refresh_requests')).rowCount,0)
      assert.equal((await admin.query("SELECT 1 FROM ci.feed_snapshots WHERE model_version<>'rules-v1'")).rowCount,3)
      assert.equal((await admin.query('SELECT worker_epoch FROM ci.e1_policy')).rows[0].worker_epoch,epoch)
      assert.deepEqual(await Promise.all(routes.map(home)),baseline)
    } finally {
      await lock.query('SELECT pg_advisory_unlock_all()'); lock.release()
      if (running) await running
      await new Promise(resolve=>server.close(resolve))
    }
  })
})
