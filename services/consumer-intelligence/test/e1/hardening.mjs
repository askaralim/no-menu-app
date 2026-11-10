// Diagnostic harness: a FAIL records an unmet release invariant, even if the probe itself ran successfully.
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { execFileSync, fork, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import pg from 'pg'
import { readThroughLauncher } from './phase26-rollback.mjs'
import { revokeBundle, publishPolicy } from '../../src/e1/routing.js'
import { configureE1 } from '../../src/e1/integration.js'
import { getFeed } from '../../src/feed.js'
import { eraseUser } from '../../src/maintenance.js'
import { migrate } from '../../src/migrate.js'
import { runWorker } from '../../src/worker.js'
import { prepareExport, publishProjection, refreshSnapshots, refreshV1Snapshots, refreshE1Snapshots } from '../../src/projections.js'
import { userKey } from '../../src/supabase.js'
import { config, sourceData, batch } from '../data.js'
import { DAY, digest, iso } from '../../src/model.js'
import { ingestBatch } from '../../src/collector.js'

const here=fileURLToPath(new URL('.',import.meta.url))
const service=path.resolve(here,'../..')
const out=path.resolve(service,'../../outputs/recommendation-v2-e1-phase26-20261106')
const fixture=path.join(here,'offline-bundle.json')
const url=new URL(process.env.CI_TEST_DATABASE_URL)
assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'55433');assert.ok(!url.search)
const childMode=['reader','off-worker','publisher'].includes(process.argv[2])
if (childMode) assert.match(url.pathname,/^\/nomenu_ci_test_[a-f0-9-]{36}$/)
else assert.equal(url.pathname,'/nomenu_ci_test')
assert.match(process.version,/^v26\./)
function policy(mode,owner,file=fixture,extra={}) {
  return {...config,e1:configureE1({NODE_ENV:'test',CI_E1_MODE:mode,CI_E1_TEST_USERS:owner,
    CI_E1_LOCAL_BUNDLE:file,...extra},url,new URL('http://127.0.0.1'))}
}
function request(extra={}) { return {mode:'for_you',city_code:'qingdao',surface:'home',limit:6,feed_instance_id:randomUUID(),...extra} }
const resultOf=async fn=>{try {return {status:200,body:await fn()}}catch(e){return {status:e.status??500,code:e.code??e.message}}}
const ids=r=>r.items.map(i=>[i.rank,i.item_id,i.tenant_id])
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms))

if (childMode) {
  const pool=new pg.Pool({connectionString:url.href,application_name:process.argv[2]==='reader'?'p25_reader':'p26_'+process.argv[2],max:1})
  process.once('message',async ({q,headers,owner,now,epoch})=>{
    const r=process.argv[2]==='off-worker' ? await resultOf(()=>refreshSnapshots(pool,policy('off',owner),now))
      : process.argv[2]==='publisher' ? await resultOf(()=>publishPolicy(pool,policy('off',owner).e1,epoch))
      : await resultOf(()=>getFeed(pool,policy('off',owner),q,headers,owner,now))
    await pool.end()
    process.send(r,()=>process.disconnect())
  })
} else {
  const admin=new pg.Pool({connectionString:url.href})
  const db='nomenu_ci_test_'+randomUUID()
  await admin.query('CREATE DATABASE "'+db+'"');await admin.end();url.pathname='/'+db
  const pool=new pg.Pool({connectionString:url.href,max:5,statement_timeout:10000,idle_in_transaction_session_timeout:15000})
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'nomenu-e1-p25-'))
  const report={node:process.version,db,tests:[]}
  function check(name,condition,details) {
    const status=condition?'PASS':'FAIL'
    report.tests.push({name,status,details})
    console.log(status,name)
  }
  try {
    // Archived V1 reader, not a test double. Verify the reviewed V1 source fingerprint.
    const archive=process.env.CI_V1_ARCHIVE ?? '/tmp/nomenu-ci-maintenance-20261104.tar.gz'
    assert.equal(hash(archive),'2c4433f64cf7cab15ff41f03f0e4494085a800fd19788441b6c1090f9454ae31')
    const legacy=path.join(temp,'legacy'), next=path.join(temp,'next')
    for (const dir of [legacy,next]) {
      fs.mkdirSync(dir)
    }
    fs.cpSync(path.join(service,'node_modules'),path.join(legacy,'node_modules'),{recursive:true,verbatimSymlinks:true})
    fs.copyFileSync(path.join(service,'package-lock.json'),path.join(legacy,'package-lock.json'))
    execFileSync('tar',['-xzf',archive,'-C',legacy,'src','db','contracts/schemas','package.json'])
    assert.equal(hash(path.join(legacy,'src/feed.js')),'7b4fffbd76df058af6260ecc5e03bbf9d6ab9d3c8c4d4214e49c93e50a842601')
    const {getFeed:legacyRead}=await import(pathToFileURL(path.join(legacy,'src/feed.js')))
    const {migrate:legacyMigrate}=await import(pathToFileURL(path.join(legacy,'src/migrate.js')))
    await legacyMigrate(pool)
    const now=Date.now()-1000, data=sourceData(now), owner=userKey(data.user,config.userKeySecret)
    const headers={'X-Installation-ID':randomUUID(),'X-Analytics-Session-ID':randomUUID()}
    const A=policy('serve',owner), off=policy('off',owner)
    let epoch=0
    const elect=async p=>{epoch=await publishPolicy(pool,p.e1,epoch)}
    function remote(action,msg) {
      const proc=fork(fileURLToPath(import.meta.url),[action],{env:{...process.env,CI_TEST_DATABASE_URL:url.href},stdio:['ignore','ignore','inherit','ipc']})
      const done=new Promise((res,rej)=>{proc.once('message',res);proc.once('error',rej);proc.once('exit',code=>{if(code)rej(Error(action+': '+code))})})
      proc.send(msg);return done
    }
    data.catalog.active_cycles[1].style='phase26 synthetic discriminator'
    const vA=A.e1.bundle().model_version
    const publish=async(scope,time)=>{
      const raw=data[scope];raw.export_id=randomUUID();raw.source_as_of=iso(time)
      for(const key of Object.keys(raw.counts))raw.counts[key]=raw[key].length
      await publishProjection(pool,prepareExport(raw,scope,config,time))
    }
    const read=(settings,q,time=now,ctx=headers,subject=owner)=>getFeed(pool,settings,q,ctx,subject,time)
    await publish('catalog',now); await publish('consumer',now)
    const {refreshSnapshots:legacyRefresh}=await import(pathToFileURL(path.join(legacy,'src/projections.js')))
    await legacyRefresh(pool,config,now)
    const instanceA=request(), v1=await legacyRead(pool,config,instanceA,headers,owner,now)
    // Legacy building request with no model_version or snapshot; the 005 upgrade cannot discard its E1 need.
    const priorOwner='f'.repeat(64), priorId=randomUUID()
    await pool.query(`INSERT INTO ci.feed_instances(instance_id,created_at,retention_until,payload)
      SELECT $2,created_at,retention_until,payload||$3::jsonb FROM ci.feed_instances WHERE instance_id=$1`,
      [instanceA.feed_instance_id,priorId,JSON.stringify({feed_instance_id:priorId,owner_user_key:priorOwner,
        analytics_installation_id:null,analytics_session_id:null,snapshot_id:null,model_version:null,ranking_version:vA,items:[]})])
    await pool.query('INSERT INTO ci.refresh_requests(user_key,city_code) VALUES($1,$2)',[priorOwner,'qingdao'])
    await Promise.all([migrate(pool),migrate(pool)])
    const backfill=(await pool.query('SELECT epoch,model_version FROM ci.e1_refresh_intents WHERE user_key=$1',[priorOwner])).rows
    assert.deepEqual(backfill,[{epoch:'0',model_version:vA}])
    await eraseUser(pool,priorOwner,{apply:true})
    assert.equal((await pool.query('SELECT 1 FROM ci.e1_refresh_intents WHERE user_key=$1',[priorOwner])).rowCount,0)
    check('005 preserves pre-upgrade building intent and erasure clears it',true,{backfill})
    const migration=await pool.query("SELECT count(*)::int n FROM ci.schema_migrations WHERE version='004_e1_withdrawals'")
    const legacyAfter=await legacyRead(pool,config,instanceA,headers,owner,now)
    check('004 concurrent migration, existing V1 and legacy reader',migration.rows[0].n===1 && JSON.stringify(ids(v1))===JSON.stringify(ids(legacyAfter)),{records:migration.rows[0].n,items:v1.items.length})
    await pool.query(fs.readFileSync(path.join(service,'db/runtime-grants.sql'),'utf8'))
    const acl=(await pool.query("SELECT privilege_type FROM information_schema.role_table_grants WHERE table_schema='ci' AND table_name='e1_instance_withdrawals' AND grantee='ci_api' ORDER BY privilege_type")).rows.map(r=>r.privilege_type)
    check('004 runtime privileges',JSON.stringify(acl)==='["INSERT","SELECT"]',{api:acl})
    const denied=[]
    for(const sql of ['DELETE FROM ci.e1_instance_withdrawals','UPDATE ci.e1_instance_withdrawals SET item_id=item_id','TRUNCATE ci.e1_instance_withdrawals']) {
      const client=await pool.connect()
      try {
        await client.query('BEGIN'); await client.query('SET LOCAL ROLE ci_api')
        try {await client.query(sql);denied.push('allowed')} catch(error) {denied.push(error.code)}
      } finally {await client.query('ROLLBACK');client.release()}
    }
    check('004 runtime mutation denied',denied.every(code=>code==='42501'),{delete_update_truncate:denied})
    await elect(A)
    await refreshSnapshots(pool,A,now)
    const instanceB=request(), orig=await read(A,instanceB), target=orig.items[0]
    const oldIds=ids(orig)
    const tap={id:randomUUID(),user_id:data.user,product_id:target.product_id,provisional_drink_id:null,tenant_id:target.tenant_id,
      source_drink_id:target.source_drink_id,first_drank_at:iso(now),created_at:iso(now),style:null}
    data.consumer.venue_experiences=[tap];await publish('consumer',now+1)
    // Hold the same instance lock until both distinct Node processes are waiting in PostgreSQL.
    const lock=await pool.connect()
    await lock.query('BEGIN');await lock.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",['instance:'+instanceB.feed_instance_id])
    const children=[0,1].map(()=>{
      const child=fork(fileURLToPath(import.meta.url),['reader'],{env:{...process.env,CI_TEST_DATABASE_URL:url.href},stdio:['ignore','ignore','inherit','ipc']})
      const done=new Promise((resolve,reject)=>{child.once('message',resolve);child.once('error',reject);child.once('exit',code=>{if(code)reject(Error('reader '+code))})})
      child.send({q:instanceB,headers,owner,now:now+1})
      return done
    })
    let waiting=0
    try {
      for(let i=0;i<150;i++) {
        waiting=(await pool.query("SELECT count(*)::int n FROM pg_stat_activity WHERE datname=current_database() AND application_name='p25_reader' AND wait_event='advisory'")).rows[0].n
        if(waiting===2)break
        await delay(40)
      }
    } finally {await lock.query('COMMIT');lock.release()}
    const concurrent=await Promise.all(children)
    data.consumer.venue_experiences=[];await publish('consumer',now+2)
    const retired=await read(off,instanceB,now+2)
    const n=(await pool.query('SELECT count(*)::int n FROM ci.e1_instance_withdrawals WHERE instance_id=$1',[instanceB.feed_instance_id])).rows[0].n
    check('004 cross-process withdrawal and restoration',waiting===2 && n===1 && concurrent.every(r=>r.status===200 && !r.body.items.some(i=>i.item_id===target.item_id)) && !retired.items.some(i=>i.item_id===target.item_id),{waiting,rows:n,original:oldIds,after:ids(retired)})
    // A and B each have a separately reviewed local pin. No runtime source or frozen asset is patched.
    const asset=JSON.parse(fs.readFileSync(fixture))
    fs.copyFileSync(fixture,path.join(next,asset.sha256+'.json'))
    asset.payload.rules+='-phase25-B'
    asset.payload.mappings.push(['phase26 synthetic discriminator','accepted_reviewed_mapping','ipa.generic'])
    asset.sha256=digest(asset.payload);asset.model_version='rules-v2-e1:'+asset.sha256
    const fileB=path.join(next,asset.sha256+'.json');fs.writeFileSync(fileB,JSON.stringify(asset))
    const registry={CI_E1_LOCAL_REGISTRY:next,CI_E1_ACTIVE_VERSION:asset.model_version}
    const B=policy('serve',owner,null,registry), offB=policy('off',owner,null,registry)
    await elect(B)
    await refreshSnapshots(pool,B,now+2)
    const bQuery=request(),newB=await read(B,bQuery,now+2)
    const discriminator=newB.items.find(i=>i.style==='phase26 synthetic discriminator')
    assert.ok(discriminator && !orig.items.some(i=>i.item_id===discriminator.item_id))
    const stored=(await pool.query('SELECT payload FROM ci.feed_instances WHERE instance_id=$1',[newB.feed_instance_id])).rows[0].payload
    assert.equal(stored.evidence[discriminator.item_id].style_key,'ipa.generic')
    check('separate B namespace',newB.snapshot.model_version===asset.model_version && asset.model_version!==vA,{vA,vB:newB.snapshot.model_version,B_only_item:discriminator.item_id,evidence:stored.evidence[discriminator.item_id].witnesses})
    for(const [name,settings] of [['release B',B],['flag off in release B',offB]]) {
      if(settings===offB) await elect(offB)
      const vr=await read(settings,instanceA,now+2)
      check(name+' preserves V1',JSON.stringify(ids(vr))===JSON.stringify(ids(v1)),{version:vr.ranking_version})
      const rr=await resultOf(()=>read(settings,instanceB,now+2))
      check(name+' retains prior E1 reader',rr.status===200 && JSON.stringify(ids(rr.body))===JSON.stringify(ids(retired)),{status:rr.status,error:rr.code,version:rr.body?.ranking_version,items:rr.body && ids(rr.body)})
    }
    const missing=await resultOf(()=>read(policy('off',owner,path.join(temp,'missing')),instanceB,now+2))
    const revoked=await resultOf(()=>read(policy('off',owner,null,{...registry,CI_E1_REVOKED_VERSION:vA}),instanceB,now+2))
    check('missing 503 and revoked 410',missing.status===503 && revoked.status===410,{missing:missing.code,revoked:revoked.code})
    const launcher=path.join(service,'deploy/e1-reader-launcher.py'), list=path.join(temp,'trusted-readers')
    // An isolated operator enrolls only the reviewed current reader. Never enroll the candidate being rolled back.
    const mark=root=>execFileSync('python3',['-B','-c',
      "import runpy,sys,pathlib;print(runpy.run_path(sys.argv[1])['fingerprint'](pathlib.Path(sys.argv[2])))",launcher,root],{encoding:'utf8'}).trim()
    const releaseB=path.join(temp,'reader-B')
    fs.mkdirSync(releaseB)
    for(const name of ['src','package.json','package-lock.json','contracts','node_modules'])
      fs.cpSync(path.join(service,name),path.join(releaseB,name),{recursive:true,verbatimSymlinks:true})
    fs.appendFileSync(path.join(releaseB,'src/server.js'),'\n// Synthetic reader release B.\n')
    const marks=[mark(service),mark(releaseB)]
    assert.notEqual(marks[0],marks[1])
    fs.writeFileSync(list,marks.join('\n')+'\n')
    const args=(dir,action)=>['-B',launcher,dir,list,action,'--node',process.execPath]
    const env={...process.env,NODE_ENV:'test',CI_DATABASE_URL:url.href,CI_DATABASE_TLS:'disable',
      CI_USER_KEY_SECRET:config.userKeySecret,CI_CURSOR_SECRET:config.cursorSecret,SUPABASE_URL:'http://127.0.0.1',SUPABASE_ANON_KEY:'isolated',
      CI_E1_MODE:'off',CI_E1_LOCAL_REGISTRY:next}
    const launch=(dir,action,extra={})=>spawnSync('python3',args(dir,action),{
      encoding:'utf8',timeout:10000,env:{...env,...extra}})
    const aware=launch(service,'check')
    assert.equal(aware.status,0,aware.stderr)
    const onlyB=path.join(temp,'registry-without-A');fs.mkdirSync(onlyB)
    fs.copyFileSync(fileB,path.join(onlyB,asset.sha256+'.json'))
    const absent=launch(service,'check',{CI_E1_LOCAL_REGISTRY:onlyB})
    assert.equal(absent.status,1);assert.match(absent.stderr,/E1_BUNDLE_UNAVAILABLE/)
    // Revoking access to an item does not authorize removing bytes needed by retained records.
    const missingRevoked=launch(service,'check',{CI_E1_LOCAL_REGISTRY:onlyB,CI_E1_REVOKED_VERSION:vA})
    assert.equal(missingRevoked.status,1)
    const launchedB=await readThroughLauncher(args(releaseB,'api'),{...env,...registry},data.user,headers,instanceB)
    assert.deepEqual(ids(launchedB),ids(retired))
    const reverted=await readThroughLauncher(args(service,'api'),env,data.user,headers,instanceB)
    check('rollback to A-aware binary',JSON.stringify(ids(reverted))===JSON.stringify(ids(retired)),{version:reverted.ranking_version,preflight:aware.stdout.trim(),missing_assets:absent.status,reader_digests:marks,actual_http:true})
    // Counterexample control: archived code is still unsafe. Only start it if the actual external launcher allows it.
    const rawLegacy=await legacyRead(pool,config,instanceB,headers,owner,now+2)
    assert.ok(rawLegacy.items.some(i=>i.item_id===target.item_id))
    const denial=launch(legacy,'api'), workerDenial=launch(legacy,'worker')
    for (const d of [denial,workerDenial]) {assert.equal(d.status,1);assert.match(d.stderr,/reader below trusted rollback floor/)}
    // After rejected promotion the existing reader remains installed. Preserve the original response assertion.
    const oldBinary=await resultOf(()=>read(offB,instanceB,now+2))
    check('rollback to pre-E1 binary is safe',oldBinary.status===410 || oldBinary.status===503 || (oldBinary.status===200 && JSON.stringify(ids(oldBinary.body))===JSON.stringify(ids(retired))),
      {status:oldBinary.status,legacy_api_exit:denial.status,legacy_worker_exit:workerDenial.status,why:denial.stderr.trim(),unguarded_negative_control:true,withdrawn_item_returned:oldBinary.body?.items.some(i=>i.item_id===target.item_id)})
    const event={event_id:randomUUID(),event_name:'feed_item_opened',schema_version:1,occurred_at:iso(now+500),session_id:headers['X-Analytics-Session-ID'],session_started_at:iso(now-1000),
      feed:{feed_instance_id:instanceB.feed_instance_id,item_id:target.item_id,display_position:target.rank}}
    await ingestBatch(pool,batch(headers['X-Installation-ID'],[event]),now+DAY)
    const row=(await pool.query("SELECT enrichment,raw->'feed'->>'item_id' AS item FROM ci.events WHERE event_id=$1",[event.event_id])).rows[0]
    const e=row.enrichment
    assert.equal(row.item,target.item_id);assert.equal(e.source_drink_id,target.source_drink_id)
    check('historical enrichment after release and rollback',e.model_version===vA && e.original_rank===target.rank && e.tenant_id===target.tenant_id && e.product_id===target.product_id,{version:e.model_version,rank:e.original_rank,venue:e.tenant_id,item:row.item})
    await elect(A);await refreshSnapshots(pool,A,Date.now())
    const aCheck=request(),aBefore=await read(A,aCheck,now+2)
    const changedRow=data.catalog.active_cycles[2], changedItem=aBefore.items.find(i=>i.source_drink_id===changedRow.source_drink_id)
    assert.ok(changedItem)
    changedRow.style='phase26 synthetic discriminator'
    data.catalog.active_cycles[0].beer_name='updated';await publish('catalog',now+3)
    await read(A,request(),now+3)
    const hint=async()=> (await pool.query('SELECT count(*)::int n FROM ci.refresh_requests WHERE user_key=$1 AND city_code=$2',[owner,'qingdao'])).rows[0].n
    const before=await hint()
    assert.equal(before,1)
    const owed=async()=>(await pool.query('SELECT epoch,model_version FROM ci.e1_refresh_intents WHERE user_key=$1 AND city_code=$2',[owner,'qingdao'])).rows
    const owedBefore=await owed()
    assert.deepEqual(owedBefore,[{epoch,model_version:vA}])
    assert.equal((await remote('off-worker',{owner,now:Date.now()})).status,200)
    const drift=await resultOf(()=>read(A,request(),now+3))
    assert.deepEqual(await owed(),owedBefore)
    assert.equal(drift.code,'E1_POLICY_MISMATCH')
    const after=await hint()
    check('route mismatch detected and request protected',drift.status===503 && before===after,{api:'serve A',worker:'off',api_status:drift.status,before,after,owed:owedBefore})
    // Another OS process tries to elect off while the old epoch is in use. It must wait.
    const v1Pass=await refreshV1Snapshots(pool,A,Date.now())
    let signal,release
    const entered=new Promise(r=>{signal=r}), hold=new Promise(r=>{release=r})
    const pausedPool={connect:async()=>{
      const c=await pool.connect()
      return {release:err=>c.release(err),query:async(sql,params)=>{
        const result=await c.query(sql,params)
        if(sql.includes('worker_until>clock_timestamp()')) {signal();await hold}
        return result
      }}
    }}
    // This is a real new request. A disagrees with the off worker, so it will roll back with 503.
    const inflight=resultOf(()=>getFeed(pausedPool,A,request(),headers,owner,now+3))
    await entered
    let switched,blocked=false
    try {
      switched=remote('publisher',{owner,epoch})
      for(let i=0;i<100;i++) {
        blocked=(await pool.query("SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND application_name='p26_publisher' AND wait_event='advisory'")).rowCount===1
        if(blocked)break
        await delay(30)
      }
    } finally {release()}
    assert.equal((await inflight).status,503)
    const elected=await switched
    assert.equal(elected.status,200);epoch=elected.body
    await assert.rejects(refreshE1Snapshots(pool,A,Date.now(),v1Pass),err=>err.code==='E1_POLICY_MISMATCH')
    await elect(A) // A -> off -> A with identical config, different epoch
    await refreshE1Snapshots(pool,A,Date.now(),v1Pass)
    assert.equal(await hint(),1)
    await assert.rejects(read(A,request(),now+3),err=>err.code==='E1_POLICY_MISMATCH')
    await assert.rejects(publishPolicy(pool,off.e1,v1Pass.epoch),/Stale/)
    await elect(B);await refreshSnapshots(pool,B,Date.now())
    assert.equal(await hint(),0);assert.equal((await owed()).length,0)
    check('concurrent publication, stale epoch and retained model intent',blocked,{publisher_waited:blocked,old_epoch:v1Pass.epoch,new_epoch:epoch,drained_model:vA})

    const pinnedA=await read(B,aCheck,now+3)
    assert.equal(B.e1.bundle().styleKey(changedRow.style),'ipa.generic')
    assert.equal(B.e1.bundle(vA).styleKey(changedRow.style),null)
    assert.deepEqual(ids(pinnedA),ids(aBefore).filter(i=>i[1]!==changedItem.item_id))
    const withAActive=policy('off',owner,null,{CI_E1_LOCAL_REGISTRY:next})
    const pinnedB=await read(withAActive,bQuery,now+3)
    assert.deepEqual(ids(pinnedB),ids(newB))
    check('opposite bundle would change evidence; pinned readers keep their own mapping',true,{removed_only_under_A:changedItem.item_id,B_only_kept:discriminator.item_id})

    for(const [name,q,ctx,subject,time,expected,legacyExpected] of [
      ['expired with stale projections',instanceA,headers,owner,now+31*DAY,410,503],
      ['valid with stale projections',instanceA,headers,owner,now+700000,503,503],
      ['context mismatch', {...instanceA,surface:'feed_page'},headers,owner,now+3,409,409],
      ['context mismatch and stale',{...instanceA,surface:'feed_page'},headers,owner,now+700000,409,503],
      ['cross-user',instanceA,headers,'another-user',now+3,409,409],
      ['anonymous For You',instanceA,{},null,now+3,401,401]]) {
      const actual=await resultOf(()=>read(off,q,time,ctx,subject))
      const prior=await resultOf(()=>legacyRead(pool,config,q,ctx,subject,time))
      check('V1 '+name,actual.status===expected && prior.status===legacyExpected,{actual:actual.status,legacy:prior.status})
    }
    const latest=request({mode:'latest',limit:2}), first=await read(off,latest,now+3,{},null)
    const page={...latest,cursor:first.page.next_cursor}
    const currentPage=await read(offB,page,now+3,{},null), priorPage=await legacyRead(pool,config,page,{},null,now+3)
    check('anonymous Latest cursor across releases',currentPage.ranking_version==='latest-v1' && JSON.stringify(ids(currentPage))===JSON.stringify(ids(priorPage)) && !currentPage.items.some(i=>first.items.some(j=>j.item_id===i.item_id)),{page_items:currentPage.items.length})
    await revokeBundle(pool,asset.model_version)
    const revokedAcrossRollback=await resultOf(()=>read(withAActive,bQuery,now+3))
    assert.equal(revokedAcrossRollback.status,410)
    await assert.rejects(publishPolicy(pool,B.e1,epoch),err=>err.code==='E1_BUNDLE_REVOKED')
    check('durable revocation survives independent binary configuration',true,{pinned_status:410,re_election:'denied'})
    await measure()
    async function measure() {
      const testNow=Date.now(), large=sourceData(testNow-100)
      const sample=structuredClone(large.catalog.active_cycles[0]), history=structuredClone(large.consumer.user_beers[0])
      large.catalog.active_cycles=Array.from({length:373},(_,i)=>({...sample,session_id:randomUUID(),product_id:randomUUID(),source_drink_id:randomUUID(),city_code:large.catalog.cities[i%3].city_code,style:i%3?'浑浊IPA':'IPA'}))
      large.consumer.user_beers=Array.from({length:32},()=>{const id=randomUUID();return Array.from({length:5},()=>({...history,user_id:id,id:randomUUID(),product_id:randomUUID(),style:'IPA'}))}).flat()
      large.consumer.consumer_profiles=[]
      for(const raw of [large.consumer,large.catalog]) for(const key of Object.keys(raw.counts))raw.counts[key]=raw[key].length
      const lockPool=new pg.Pool({connectionString:url.href,max:1})
      for(const mode of ['off','shadow']) {
        let held=0, high=0, waitProbe
        const watched={connect:async()=>{
          const c=await pool.connect();high=Math.max(high,++held)
          return {release:err=>{held--;c.release(err)},query:async(sql,args)=>{
            const result=await c.query(sql,args)
            if(!waitProbe && sql.includes("SELECT scope,generation,source_as_of,payload")) {
              const begin=performance.now()
              waitProbe=lockPool.query("SELECT pg_advisory_xact_lock(hashtextextended('ci:data-maintenance',0))").then(()=>performance.now()-begin)
            }
            return result
          }}
        }}
        await elect(policy(mode,owner))
        const begin=performance.now(),cpu=process.cpuUsage(),nInstances=async()=>(await pool.query('SELECT count(*)::int n FROM ci.feed_instances')).rows[0].n
        const count=await nInstances()
        const run=await runWorker(watched,policy(mode,owner),{export:async scope=>large[scope]},()=>{})
        const workerMs=performance.now()-begin,usage=process.cpuUsage(cpu)
        check('bounded worker probe '+mode,run.failures.length===0 && count===await nInstances(),{workerMs,cpuMs:(usage.user+usage.system)/1000,processHighWaterMiB:process.resourceUsage().maxRSS/1024,workerConnections:high,maintenanceExclusiveWaitMs:await waitProbe,subjects:32,candidates:373,cities:3})
      }
      const apiOwner=userKey(large.consumer.user_beers[0].user_id,config.userKeySecret)
      const api=policy('serve',apiOwner)
      await elect(api);await refreshSnapshots(pool,api,Date.now())
      const begin=performance.now(),cpu=process.cpuUsage(),elapsed=[]
      for(let i=0;i<24;i++) {
        const start=performance.now();await getFeed(pool,api,request(),{},apiOwner,Date.now());elapsed.push(performance.now()-start)
      }
      const usage=process.cpuUsage(cpu)
      check('bounded API probe',elapsed.length===24,{calls:24,sequential:true,wallMs:performance.now()-begin,cpuMs:(usage.user+usage.system)/1000,p95Ms:elapsed.sort((a,b)=>a-b)[22],processHighWaterMiB:process.resourceUsage().maxRSS/1024})
      await lockPool.end()
    }
  } finally {
    fs.writeFileSync(path.join(out,'probe-results.json'),JSON.stringify(report,null,2)+'\n')
    await pool.end()
  }
  if(report.tests.some(t=>t.status==='FAIL'))process.exitCode=1
}
