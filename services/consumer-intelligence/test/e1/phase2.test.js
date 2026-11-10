import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync,copyFileSync,readFileSync,writeFileSync,existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { configureE1 } from '../../src/e1/integration.js'

const file = fileURLToPath(new URL('offline-bundle.json',import.meta.url))
const db = new URL('postgres://127.0.0.1:55433/nomenu_ci_test')
const source = new URL('http://127.0.0.1:3333')
const user = 'a'.repeat(64)
test('E1 configuration defaults off and confines fixture and cohort to isolated runs', () => {
  assert.equal(configureE1({},db,source).mode,'off')
  const env = {NODE_ENV:'test',CI_E1_MODE:'serve',CI_E1_TEST_USERS:user,CI_E1_LOCAL_BUNDLE:file}
  const policy = configureE1(env,db,source)
  assert.ok(policy.routes(user))
  assert.ok(!policy.routes('b'.repeat(64)))
  assert.equal(policy.bundle().model_version,policy.bundle().model_version)
  for (const mode of ['shadow','serve']) {
    const active = {...env,CI_E1_MODE:mode}
    assert.throws(()=>configureE1({...active,NODE_ENV:'production'},db,source))
    assert.throws(()=>configureE1(active,new URL('postgres://127.0.0.1:5432/postgres'),source))
    assert.throws(()=>configureE1(active,db,new URL('https://example.com')))
  }
  assert.throws(()=>configureE1({...env,CI_E1_MODE:'enabled'},db,source))
  assert.throws(()=>configureE1({...env,CI_E1_TEST_USERS:''},db,source))
  assert.throws(()=>configureE1({...env,CI_E1_LOCAL_BUNDLE:'/missing'},db,source).bundle(),e=>e.code==='E1_BUNDLE_UNAVAILABLE')
})

test('registry rejects bad bytes, wrong slots and self-authorized hashes, including after cache fill',()=>{
  const dir=mkdtempSync(join(tmpdir(),'ci-e1-registry-')), asset=JSON.parse(readFileSync(file))
  const slot=join(dir,asset.sha256+'.json')
  copyFileSync(file,slot)
  const p=configureE1({NODE_ENV:'test',CI_E1_LOCAL_REGISTRY:dir},db,source)
  assert.equal(p.bundle().model_version,asset.model_version)
  asset.payload.rules+='-tampered'
  writeFileSync(slot,JSON.stringify(asset))
  assert.throws(()=>p.verifyRetained(asset.model_version),e=>e.status===503)
  assert.throws(()=>p.bundle('rules-v2-e1:'+'0'.repeat(64)),e=>e.status===503)
  assert.throws(()=>configureE1({NODE_ENV:'test',CI_E1_ACTIVE_VERSION:'rules-v2-e1:'+'0'.repeat(64)},db,source))
  const B='8c3ff6ef850a6c5d6d48dd0a1c7f110d77c3e91fa9bf40ff30e06230e35df907'
  copyFileSync(file,join(dir,B+'.json'))
  assert.throws(()=>p.bundle('rules-v2-e1:'+B),e=>e.status===503)
})
test('both packaged units and persistent host overrides execute the external rollback floor',()=>{
  for(const [unit,role] of [['consumer-intelligence.service','api'],['consumer-intelligence-worker.service','worker']]) {
    const expected='ExecStart=/usr/bin/python3 /usr/local/libexec/nomenu-ci/e1-reader-launcher.py /opt/no-menu/consumer-intelligence /etc/no-menu/e1-aware-readers.sha256 '+role
    const lines=f=>readFileSync(new URL('../../deploy/'+f,import.meta.url),'utf8').split('\n').filter(s=>s.startsWith('ExecStart='))
    assert.deepEqual(lines(unit),[expected])
    assert.deepEqual(lines(unit+'.d/99-reader-floor.conf'),['ExecStart=',expected])
  }
})

test('internal Feed has one pinned production asset, applies to every authenticated owner and closes on off',async()=>{
  const {internalVersion}=await import('../../src/e1/trust.js')
  const {loadE1Bundle}=await import('../../src/e1/bundle.js')
  const {policyFingerprint,newE1Route}=await import('../../src/e1/routing.js')
  const asset=JSON.parse(readFileSync(new URL('../../deploy/e1-assets/'+internalVersion.split(':')[1]+'.json',import.meta.url)))
  assert.equal(loadE1Bundle(asset,'internal-feed').model_version,internalVersion)
  assert.throws(()=>loadE1Bundle(JSON.parse(readFileSync(file)),'internal-feed'))
  const altered=structuredClone(asset); altered.payload.bridges.pop()
  assert.throws(()=>loadE1Bundle(altered,'internal-feed'))
  const p=configureE1({NODE_ENV:'production',CI_E1_MODE:'serve'},db,source)
  const row={epoch:'1',worker_epoch:'1',worker_fresh:true,cohort:[],mode:'serve',model_version:internalVersion,
    fingerprint:policyFingerprint(p),worker_fingerprint:policyFingerprint(p)}
  for(const owner of [user,'b'.repeat(64)])assert.equal(newE1Route(row,p,owner),true)
  assert.equal(newE1Route({...row,mode:'off'},p,user),false)
  assert.throws(()=>newE1Route({...row,worker_fresh:false},p,user),e=>e.status===503)
})

test('Internal V2 snapshot call chain matches all 224 accepted coverage lists; retained V1-E1 asset keeps old scores', async(context)=>{
  if (!['outputs/recommendation-v2-replay-20261105/source-snapshot.json', 'outputs/e1-taxonomy-lambda-joint-20261107/ranking-diff.json'].every(path => existsSync(new URL('../../../../' + path, import.meta.url)))) {
    context.skip('Private production replay inputs are not included in the repository')
    return
  }
  const {internalVersion,legacyInternalVersion}=await import('../../src/e1/trust.js')
  const {loadE1Bundle}=await import('../../src/e1/bundle.js')
  const {e1Profile}=await import('../../src/e1/rank.js')
  const {e1Snapshot,e1Filter}=await import('../../src/e1/integration.js')
  const {digest}=await import('../../src/model.js')
  const root=new URL('../../../../',import.meta.url)
  const read=p=>JSON.parse(readFileSync(new URL(p,root)))
  const wrap=version=>{
    const asset=read('services/consumer-intelligence/deploy/e1-assets/'+version.split(':')[1]+'.json')
    return {...loadE1Bundle(asset,'internal-feed'),familyFor:k=>asset.payload.vocabulary[k].family,generic:k=>asset.payload.generic_keys.includes(k)}
  }
  const newer=wrap(internalVersion),older=wrap(legacyInternalVersion)
  const local=JSON.parse(readFileSync(new URL('./fixtures/joint-bundle.json', import.meta.url)))
  const release=read('services/consumer-intelligence/deploy/e1-assets/'+internalVersion.split(':')[1]+'.json')
  for(const k of ['mappings','product_overrides','bridges','vocabulary','generic_keys'])assert.deepEqual(release.payload[k],local.payload[k])
  assert.notEqual(release.sha256,local.sha256)
  assert.throws(()=>loadE1Bundle({...release,signature:'bad'},'internal-feed'),/signature/)
  const source=read('outputs/recommendation-v2-replay-20261105/source-snapshot.json'),t=Date.parse(source.source_as_of)
  const rows=source.candidates.map(r=>({...r,item_id:digest([r.tenant_id,r.source_drink_id,r.session_id])}))
  const diffs=read('outputs/e1-taxonomy-lambda-joint-20261107/ranking-diff.json')
  assert.equal(diffs.length,224)
  for(const d of diffs){
    const city=rows.filter(r=>r.city_code===d.city),byId=new Map(city.map(r=>[r.item_id,r]))
    for(const [b,expected] of [[newer,d.joint],[older,d.baseline]]){
      const p=e1Profile(source,d.user,b),snap=e1Snapshot(city,p,b,t)
      assert.deepEqual(snap.items.map(i=>i.item_id),expected.map(i=>i.item_id))
      for(const item of expected){
        assert.deepEqual(snap.evidence[item.item_id],item)
        assert(e1Filter(p,b,t)(byId.get(item.item_id),item))
      }
      assert(snap.items.every(i=>!('score' in i)&&!('display_score' in i)&&!('tier' in i)))
    }
  }
})
