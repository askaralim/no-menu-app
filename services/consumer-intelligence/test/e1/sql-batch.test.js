import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { setTimeout as sleep } from 'node:timers/promises'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { config, sourceData } from '../data.js'
import { migrate } from '../../src/migrate.js'
import { configureE1 } from '../../src/e1/integration.js'
import { currentPolicy, publishPolicy, requestRefresh } from '../../src/e1/routing.js'
import { prepareExport, publishProjection, refreshV1Snapshots, refreshE1Snapshots } from '../../src/projections.js'
import { userKey } from '../../src/supabase.js'

test('E1 batches publish and acknowledge atomically across a concurrent re-request',async t=>{
  const uri=new URL(process.env.CI_TEST_DATABASE_URL)
  assert.equal(uri.hostname,'127.0.0.1')
  assert.ok(['55432','55433'].includes(uri.port))
  assert.equal(uri.pathname,'/nomenu_ci_test')
  assert.equal(uri.search,'')
  const admin=new pg.Pool({connectionString:uri.href})
  uri.pathname='/nomenu_ci_test_'+randomUUID()
  try { await admin.query('CREATE DATABASE "'+uri.pathname.slice(1)+'"') } finally { await admin.end() }
  const pool=new pg.Pool({connectionString:uri.href,statement_timeout:10000})
  t.after(()=>pool.end())
  await migrate(pool)
  await pool.query(`DO $$ BEGIN
    IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='ci_api') THEN CREATE ROLE ci_api; END IF;
    IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='ci_worker') THEN CREATE ROLE ci_worker; END IF;
    END $$`)
  await pool.query(await readFile(new URL('../../db/runtime-grants.sql',import.meta.url),'utf8'))
  const worker=new pg.Pool({connectionString:uri.href,options:'-c role=ci_worker',statement_timeout:10000})
  t.after(()=>worker.end())
  assert.equal((await worker.query('SELECT current_user')).rows[0].current_user,'ci_worker')
  const now=Date.now(), data=sourceData(now-100)
  const settings={...config,e1:configureE1({NODE_ENV:'test',CI_E1_MODE:'shadow',
    CI_E1_LOCAL_BUNDLE:fileURLToPath(new URL('offline-bundle.json',import.meta.url))},uri,new URL('http://127.0.0.1'))}
  const version=settings.e1.activeVersion
  const users=Array.from({length:12},()=>randomUUID())
  const owners=users.map(u=>userKey(u,config.userKeySecret))
  data.consumer.user_beers=users.flatMap(user=>data.consumer.user_beers.map(row=>({...row,id:randomUUID(),user_id:user})))
  data.consumer.counts.user_beers=data.consumer.user_beers.length
  for(const scope of ['catalog','consumer'])await publishProjection(pool,prepareExport(data[scope],scope,config,now))
  await publishPolicy(pool,settings.e1,0)
  const v1=await refreshV1Snapshots(worker,settings,now)
  assert.equal(v1.generated,36)
  await pool.query(`INSERT INTO ci.refresh_requests(user_key,city_code,requested_at)
    SELECT u,'qingdao',$2 FROM unnest($1::text[]) u`,[owners,new Date(now-10)])
  await pool.query(`INSERT INTO ci.e1_refresh_intents(user_key,city_code,requested_at,epoch,model_version)
    SELECT user_key,city_code,requested_at,1,$1 FROM ci.refresh_requests`,[version])
  const counts=async()=>(await pool.query(`SELECT
    (SELECT count(*)::int FROM ci.feed_snapshots WHERE model_version=$1) snapshots,
    (SELECT count(*)::int FROM ci.e1_refresh_intents) children,
    (SELECT count(*)::int FROM ci.refresh_requests) parents`,[version])).rows[0]

  await t.test('failure after 32 inserts rolls back earlier snapshots and debt, then a retry completes all 36',async()=>{
    await pool.query(`CREATE FUNCTION ci.abort_second_batch() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.model_version<>'rules-v1' AND (SELECT count(*) FROM ci.feed_snapshots WHERE model_version=NEW.model_version)=32
        THEN RAISE EXCEPTION 'second batch'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER abort_batch BEFORE INSERT ON ci.feed_snapshots FOR EACH ROW EXECUTE FUNCTION ci.abort_second_batch()`)
    await assert.rejects(refreshE1Snapshots(worker,settings,now,v1),{message:'second batch'})
    assert.deepEqual(await counts(),{snapshots:0,children:12,parents:12})
    assert.equal((await pool.query('SELECT worker_epoch FROM ci.e1_policy')).rows[0].worker_epoch,null)
    await pool.query('DROP TRIGGER abort_batch ON ci.feed_snapshots')
    assert.equal((await refreshE1Snapshots(worker,settings,now,v1)).generated,36)
    assert.deepEqual(await counts(),{snapshots:36,children:0,parents:0})
  })

  await t.test('signature hits preserve newer demand; a concurrent writer forces a retry, never a lost request',async()=>{
    const pair=[owners[0],'qingdao']
    const ids=async()=>(await pool.query('SELECT snapshot_id FROM ci.feed_snapshots WHERE model_version=$1 ORDER BY snapshot_id',[version])).rows
    const original=await ids()
    const c=await pool.connect()
    let pass
    try {
      await c.query('BEGIN')
      await requestRefresh(c,...pair,await currentPolicy(c),version)
      await c.query('COMMIT')
      const cutoff=Date.now()+1
      await sleep(5)
      await c.query('BEGIN')
      await requestRefresh(c,...pair,await currentPolicy(c),version)
      pass=assert.rejects(refreshE1Snapshots(worker,settings,cutoff,v1),{code:'40001'})
      let blocked=false
      for(let i=0;i<150 && !blocked;i++){
        blocked=(await pool.query(`SELECT 1 FROM pg_stat_activity WHERE datname=current_database()
          AND $1=ANY(pg_blocking_pids(pid)) AND query LIKE 'DELETE FROM ci.e1_refresh_intents%'`,[c.processID])).rowCount>0
        if(!blocked)await sleep(20)
      }
      assert.ok(blocked,'the worker reached the due-child DELETE while the requester held the row')
      await c.query('COMMIT')
      await pass
      assert.deepEqual(await counts(),{snapshots:36,children:1,parents:1})
      assert.equal((await refreshE1Snapshots(worker,settings,cutoff,v1)).generated,0)
      assert.deepEqual(await counts(),{snapshots:36,children:1,parents:1})
      assert.equal((await refreshE1Snapshots(worker,settings,Date.now()+1,v1)).generated,0)
      assert.deepEqual(await counts(),{snapshots:36,children:0,parents:0})
      assert.deepEqual(await ids(),original)
    } finally { await c.query('ROLLBACK');c.release();if(pass)await pass }
  })
  await t.test('mixed hits and misses preserve newer children and newer parents independently',async()=>{
    const cutoff=Date.now(), early=new Date(cutoff-1), future=new Date(cutoff+60000)
    data.catalog.active_cycles[0].beer_name='changed in qingdao'
    data.catalog.export_id=randomUUID()
    data.catalog.source_as_of=new Date(cutoff).toISOString()
    await publishProjection(pool,prepareExport(data.catalog,'catalog',config,cutoff))
    const receipt=await refreshV1Snapshots(worker,settings,cutoff)
    const unchanged=async()=>(await pool.query(`SELECT snapshot_id FROM ci.feed_snapshots
      WHERE model_version=$1 AND city_code<>'qingdao' ORDER BY snapshot_id`,[version])).rows
    const previous=await unchanged()
    // Pair A: due parent, one due child and one future child for the same version.
    // Pair B: newer parent with just a due child. Pair C: due parent only.
    await pool.query(`INSERT INTO ci.refresh_requests(user_key,city_code,requested_at) VALUES
      ($1,'qingdao',$4),($2,'qingdao',$5),($3,'qingdao',$4)`,[...owners.slice(0,3),early,future])
    await pool.query(`INSERT INTO ci.e1_refresh_intents(user_key,city_code,requested_at,epoch,model_version)
      VALUES ($1,'qingdao',$3,0,$5),($1,'qingdao',$4,1,$5),($2,'qingdao',$3,0,$5)`,
    [owners[0],owners[1],early,future,version])
    assert.equal((await refreshE1Snapshots(worker,settings,cutoff,receipt)).generated,12)
    assert.deepEqual(await unchanged(),previous)
    assert.deepEqual(await counts(),{snapshots:48,children:1,parents:2})
    assert.deepEqual((await pool.query('SELECT user_key,epoch,requested_at FROM ci.e1_refresh_intents')).rows,
      [{user_key:owners[0],epoch:'1',requested_at:future}])
    assert.deepEqual((await pool.query('SELECT user_key FROM ci.refresh_requests ORDER BY user_key')).rows.map(r=>r.user_key),
      owners.slice(0,2).sort())
  })
})
