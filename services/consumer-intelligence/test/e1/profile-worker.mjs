// Offline diagnostic only. Timed wrappers call the real implementations unchanged.
import assert from 'node:assert/strict'
import { mock } from 'node:test'
import { readFileSync } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { config } from '../data.js'
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const base=new URL(process.env.CI_TEST_DATABASE_URL)
assert.equal(base.hostname,'127.0.0.1'); assert.equal(base.port,'55433')
assert.equal(base.pathname,'/nomenu_ci_test'); assert.equal(base.search,'')
assert.match(process.version,/^v26\./)
const measure=()=>performance.now()
let stats=null, stage='other'
function add(group,key,value) {
  if (!stats) return
  const row=stats[group][key]??={n:0,ms:0,max:0}
  row.n++; row.ms+=value; row.max=Math.max(row.max,value)
}
async function instrument(path, syncNames=[],asyncNames=[]) {
  const original=await import(path), exports={...original}
  for(const name of syncNames) exports[name]=(...args)=>{
    const t=measure(); try{return original[name](...args)} finally {add('compute',name,measure()-t)}
  }
  for(const name of asyncNames) exports[name]=async(...args)=>{
    const prev=stage,t=measure();stage=name
    try{return await original[name](...args)}finally{add('stages',name,measure()-t);stage=prev}
  }
  mock.module(new URL(path,import.meta.url).href,{namedExports:exports,cache:true})
  return exports
}
await instrument('../../src/e1/rank.js',['rankE1','e1Profile'])
const {configureE1}=await instrument('../../src/e1/integration.js',['e1Signature','e1Snapshot'])
const {publishPolicy}=await instrument('../../src/e1/routing.js',[],['observeWorker'])
await instrument('../../src/projections.js',['prepareExport'],['publishProjection','refreshV1Snapshots','refreshE1Snapshots'])
await instrument('../../src/assisted-visits.js',[],['refreshAssistedVisits'])
const {runWorker}=await import('../../src/worker.js')
const {migrate}=await import('../../src/migrate.js')
const fixture=readFileSync(process.env.CI_PROFILE_FIXTURE??'/private/tmp/nomenu-p27-linux/assets/source.json')
const sha=createHash('sha256').update(fixture).digest('hex'), data=JSON.parse(fixture)
assert.equal(sha,'868196b278ae8045e6732b2e0b5316af5df223c7e8c8b2dd125dcb4a687274d3','use the audited synthetic source fixture')
assert.equal(data.catalog.active_cycles.length,373);assert.equal(data.consumer.user_beers.length,160)
const at=Date.now()-1000, shift=at-Date.parse(data.catalog.source_as_of)
for(const c of data.catalog.active_cycles)c.current_cycle_started_at=new Date(Date.parse(c.current_cycle_started_at)+shift).toISOString()
for(const s of [data.catalog,data.consumer])s.source_as_of=new Date(at).toISOString()
const bundleFile=fileURLToPath(new URL('offline-bundle.json',import.meta.url))
function settings(mode,url) {
  const p=configureE1({NODE_ENV:'test',CI_E1_MODE:mode,CI_E1_LOCAL_BUNDLE:bundleFile},url,new URL('http://127.0.0.1'))
  let n=0
  return {...config,e1:{...p,bundle(...args){
    const t=measure(),key=n++?'bundle_cached':'bundle_first'
    try{return p.bundle(...args)}finally{add('compute',key,measure()-t)}
  }}}
}
function sqlType(sql){
  if(sql.includes('WITH ORDINALITY AS k(user_key,city_code,signature,n)'))return 'batch_lookup'
  if(sql.includes('ci:data-maintenance'))return sql.includes('unlock')?'maintenance_unlock':'maintenance_lock'
  if(sql.includes('ci:e1-policy'))return 'epoch_gate'
  if(sql.includes('pg_advisory'))return 'other_advisory'
  if(sql.includes('ci.e1_policy'))return 'policy_row'
  if(sql.includes('INSERT INTO ci.feed_snapshots'))return 'snapshot_insert'
  if(sql.includes('DELETE FROM ci.e1_refresh_intents'))return 'intent_delete'
  if(sql.includes('DELETE FROM ci.refresh_requests'))return 'request_delete'
  if(sql.includes('ci.projections'))return 'projection'
  if(sql.startsWith('BEGIN'))return 'begin'
  if(sql==='COMMIT')return 'commit'
  return 'other'
}
function timedPool(pool){
  return {async connect(){
    const start=measure(), c=await pool.connect();add('sql',stage+':checkout',measure()-start)
    let begin
    return {on:c.on.bind(c),removeListener:c.removeListener.bind(c),release:c.release,
      async query(sql,args){
        const t=measure()
        if(sql.startsWith('BEGIN '))begin=t
        try{return await c.query(sql,args)}
        finally{
          const end=measure()
          add('sql',stage+':'+sqlType(sql),end-t)
          if(sql==='COMMIT')add('transactions',stage,end-begin)
        } }}
  }}
}
const admin=new pg.Pool({connectionString:base.href})
async function database(mode){
  const uri=new URL(base);uri.pathname='/nomenu_ci_test_'+randomUUID()
  await admin.query('CREATE DATABASE "'+uri.pathname.slice(1)+'"')
  const pool=new pg.Pool({connectionString:uri.href,application_name:'readiness_worker',statement_timeout:10000,max:3})
  await migrate(pool)
  // Elect an isolated fixture policy, never start a Worker unit, timer, Shadow or serving endpoint.
  await publishPolicy(pool,settings(mode,uri).e1,0)
  return {uri,pool,mode}
}
async function cycle({uri,pool,mode},pair,cycle,mixed=false){
  const settingsForCycle=settings(mode,uri),record={pair,cycle,mode,sql:{},transactions:{},stages:{},compute:{},events:{}}
  const cpu=process.cpuUsage(), start=measure();stats=record
  const run=await runWorker(timedPool(pool),settingsForCycle,{export:async scope=>data[scope]},e=>{
    if(e.generated!==undefined)record.events[e.event]=e.generated
  })
  record.wall=measure()-start;const used=process.cpuUsage(cpu);record.cpu=(used.system+used.user)/1000;stats=null
  assert.deepEqual(run.failures,[])
  assert.equal(record.events.snapshots_refreshed,cycle===1 && !(mixed && mode==='shadow')?96:0)
  if(mode==='shadow'){
    assert.equal(record.events.e1_snapshots_refreshed,cycle===1?96:0)
    assert.equal(record.compute.rankE1?.n ?? 0,cycle===1?96:0);assert.equal(record.compute.e1Signature.n,96)
    assert.equal(record.compute.bundle_first.n,1)
  }
  console.log(JSON.stringify(record))
}
console.log(JSON.stringify({node:process.version,platform:process.platform,arch:process.arch,
  pg:(await admin.query('SHOW server_version')).rows[0].server_version,sha256_fixture_bytes:sha,subjects:32,cities:3,candidates:373}))
async function mixedPass(pair,concurrent) {
  const db=await database('off'), observer=new pg.Pool({connectionString:db.uri.href,max:2})
  let suite, suiteResult, probe, sampler, done=false
  try {
    await cycle(db,pair,1,true)
    const p=settings('shadow',db.uri)
    await publishPolicy(db.pool,p.e1,1)
    if(concurrent){
      // A real independent suite uses its own UUID database on the same local PG.
      suite=spawn(process.execPath,['--test','test/integration.test.js'],{stdio:'ignore'})
      suiteResult=new Promise(resolve=>suite.once('exit',code=>resolve(code)))
      let active=false
      for(let i=0;i<100;i++){
        active=(await admin.query(`SELECT 1 FROM pg_stat_activity WHERE datname LIKE 'nomenu_ci_test_%'
          AND datname<>$1 AND state='active' AND backend_type='client backend'`,[db.uri.pathname.slice(1)])).rowCount>0
        if(active)break
        await sleep(20)
      }
      assert.ok(active,'concurrent workload observed before start')
    }
    let polls=0,concurrentPolls=0,waitPolls=0
    sampler=(async()=>{
      while(!done){
        const s=(await observer.query(`SELECT bool_or(datname<>current_database() AND datname LIKE 'nomenu_ci_test_%'
          AND state='active') AS competition, bool_or(datname=current_database() AND application_name='readiness_worker'
          AND wait_event_type='Lock') AS waiting, bool_or(datname=current_database() AND application_name='readiness_worker'
          AND query LIKE 'SELECT scope,generation,source_as_of,payload%' AND state IN ('active','idle in transaction')) AS can_probe
          FROM pg_stat_activity`)).rows[0]
        polls++; if(s.competition)concurrentPolls++; if(s.waiting)waitPolls++
        if(s.can_probe && !probe){const t=measure();probe=observer.query("SELECT pg_advisory_xact_lock(hashtextextended('ci:data-maintenance',0))").then(()=>measure()-t)}
        await sleep(5)
      }
    })()
    await cycle({...db,mode:'shadow'},pair,1,true)
    done=true;await sampler
    const status=suiteResult?await suiteResult:null
    assert.ok(!suiteResult||status===0)
    console.log(JSON.stringify({mixed:pair,concurrent,polls,concurrentPolls,workerLockPolls:waitPolls,
      contenderWaitMs:await probe??null,concurrentSuiteExit:status}))
  }finally{done=true;if(sampler)await sampler;if(probe)await probe;if(suiteResult)await suiteResult;await observer.end();await db.pool.end()}
}
try {
  if(process.argv.includes('--mixed')){
    for(let pair=1;pair<=6;pair++)await mixedPass(pair,[2,3,6].includes(pair))
  }else
  // Four independent DB pairs; alternate first arm, reverse order each repeated cycle.
  for(let pair=1;pair<=4;pair++){
    const off=await database('off'),dual=await database('shadow')
    try{
      for(let n=1;n<=4;n++){
        for(const db of (pair+n)%2?[dual,off]:[off,dual])await cycle(db,pair,n)
      }
      for(const db of [off,dual]){
        const counts=(await db.pool.query(`SELECT (SELECT count(*)::int FROM ci.feed_instances) instances,
         (SELECT count(*)::int FROM ci.feed_snapshots) snapshots,(SELECT count(*)::int FROM ci.events) events`)).rows[0]
        assert.deepEqual(counts,{instances:0,snapshots:db===off?96:192,events:0})
      }
    }finally{await Promise.all([off.pool.end(),dual.pool.end()])}
  }
}finally{await admin.end()}
