import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { digest, venueBeer } from '../../src/model.js'
import { loadE1Bundle } from '../../src/e1/bundle.js'
import { e1Evidence, e1Profile, rankE1 } from '../../src/e1/rank.js'

const fixture = JSON.parse(fs.readFileSync(new URL('offline-bundle.json', import.meta.url)))
const load = f => loadE1Bundle(f, 'local-offline')
const bundle = load(fixture)
const now = Date.UTC(2026, 10, 5)
function candidate(id, style, changes = {}) {
  return { item_id:id, style, product_id:id, tenant_id:'one', current_cycle_started_at:new Date(now).toISOString(),
    public_tenant:true, public_category:true, public_drink:true, tap_assigned:true, accuracy:'exact',
    canceled:false, ended_at:null, public_status:'available', ...changes }
}
function profile(counts) {
  return { count:Math.max(5,Object.values(counts).reduce((a,b)=>a+b,0)), counts:new Map(Object.entries(counts)),
    followed:new Set(), tapped:new Set() }
}
function tamper(fn) {
  const f = structuredClone(fixture)
  fn(f.payload)
  f.sha256 = digest(f.payload)
  f.model_version = 'rules-v2-e1:' + f.sha256
  return f
}

test('A01/A02: one exact SQL-trimmed index for both sides; reviewed descriptors and aliases only', () => {
  for (const [raw,want] of [[null,null],['   ',null],['  意大利皮尔斯 ','pilsner.italian'],
    ['\t意大利皮尔斯',null],['新造IPA字符串',null],['美式淡拉格','lager.generic'],['南瓜艾尔',null],['THD帝国浑浊IPA',null]]) {
    assert.equal(bundle.styleKey(raw),want)
  }
  assert.throws(()=>load(tamper(p=>p.mappings.push([' IPA ', 'auto_high','ipa.red']))),/Duplicate effective raw/)
  assert.throws(()=>load(tamper(p=>p.mappings[0][1]='auto_medium')),/acceptance/)
  assert.throws(()=>load(tamper(p=>p.mappings[0][2]='missing')),/referenced style/)
})
test('A03/A04: canonical first-id winner, provisional identity, unknown counts for eligibility only', () => {
  const rows = ['IPA', 'IPA', 'IPA', 'IPA', null, '冷IPA'].map((style,i)=>({
    user_key:'U', id:String(i), style, product_id:i<4?'p'+i:i===5?'p0':null, provisional_drink_id:i===4?'d':null
  }))
  const input={user_beers:[...rows].reverse(),venue_experiences:[],follows:[]}
  const p=e1Profile(input,'U',bundle)
  assert.equal(p.count,5); assert.deepEqual([...p.counts],[['ipa.generic',4]])
  assert.equal(rankE1([candidate('one','IPA')],p,bundle,now).length,1)
  const fewer=e1Profile({...input,user_beers:rows.slice(0,4)},'U',bundle)
  assert.deepEqual(rankE1([candidate('one','IPA')],fewer,bundle,now),[])
  const unknown=e1Profile({...input,user_beers:rows.map(r=>({...r,style:null}))},'U',bundle)
  assert.equal(unknown.count,5); assert.equal(unknown.counts.size,0)
  assert.deepEqual(rankE1([candidate('one','IPA')],unknown,bundle,now),[])
})
test('A05–A07: no reverse, transitive, same-family or exploration fallback', () => {
  function match(h,c) { return e1Evidence(profile({[h]:1}),bundle).get(c)?.tier }
  assert.equal(match('ipa.generic','ipa.hazy'),1)
  assert.equal(match('ipa.west_coast','ipa.generic'),1)
  for (const [h,c] of [['ipa.generic','ipa.west_coast'],['ipa.west_coast','ipa.hazy'],
    ['ipa.generic','ipa.sour'],['ipa.sour','ipa.generic'],['stout.generic','stout.milk'],['ipa.generic','ipa.red'],
    ['porter.generic','stout.dry'],['english.bitter','english.mild'],['ipa.west_coast','ipa.cold'],
    ['pilsner.german','pilsner.italian'],['lager.generic','pilsner.czech']]) assert.equal(match(h,c),undefined)
  assert.equal(match('ipa.red','ipa.red'),0)
  assert.equal(match('ipa.generic','ipa.generic'),0)
})
test('A08/A09: derive counts and normalization solely from authorized directional matches', () => {
  const history={'stout.generic':2,'porter.generic':1,'stout.imperial':5}
  const dry=e1Evidence(profile(history),bundle).get('stout.dry')
  assert.deepEqual(dry.witnesses,['stout.generic']); assert.equal(dry.evidence_count,2)
  const p=profile({'ipa.hazy':2,'ipa.american':1,'stout.generic':7,'ipa.sour':99})
  const [bridge]=rankE1([candidate('i','IPA')],p,bundle,now)
  assert.deepEqual(bridge.witnesses,['ipa.hazy','ipa.american'])
  assert.equal(bridge.denominator,7); assert.equal(bridge.score,3/7)
  assert.equal(e1Evidence(profile({}),bundle).size,0)
})
test('A10/A11: exact owns its venue; follow is tier-local; exclusion precedes dedup; time then item id', () => {
  const p=profile({'ipa.hazy':1,'ipa.american':3})
  p.followed.add('bar')
  const exact=candidate('a','浑浊IPA')
  const bridge=candidate('b','IPA',{product_id:'a',tenant_id:'bar'})
  assert.deepEqual(rankE1([bridge,exact],p,bundle,now).map(r=>r.item_id),['a'])
  p.tapped.add(venueBeer(exact))
  const [other]=rankE1([bridge,exact],p,bundle,now)
  assert.equal(other.item_id,'b');assert.equal(other.score,1.15)
  const peers=[candidate('z','IPA'),candidate('a','IPA'),candidate('x','IPA',{current_cycle_started_at:new Date(now-1).toISOString()})]
  assert.deepEqual(rankE1(peers,p,bundle,now).map(r=>r.item_id),['z','x']) // a at the tapped venue is excluded
  p.tapped.clear()
  assert.deepEqual(rankE1(peers,p,bundle,now).map(r=>r.item_id),['a','z','x'])
})
test('A12: short lists, home prefix, full cap and current lifecycle', () => {
  const p=profile({'ipa.generic':1})
  for (const n of [0,1,19,20,21]) {
    const rows=Array.from({length:n},(_,i)=>candidate(String(i),'IPA'))
    assert.equal(rankE1(rows,p,bundle,now).length,Math.min(20,n))
    assert.deepEqual(rankE1(rows,p,bundle,now,6),rankE1(rows,p,bundle,now).slice(0,6))
  }
  const boundary=now-14*86400000
  const changes=[{canceled:true},{ended_at:new Date(now).toISOString()},{accuracy:'estimated'},
    {public_drink:false},{public_category:false},{public_tenant:false},{tap_assigned:false},
    {public_status:'hidden'},{current_cycle_started_at:new Date(now+1).toISOString()},
    {current_cycle_started_at:new Date(boundary-1).toISOString()}]
  assert.equal(rankE1(changes.map((v,i)=>candidate(String(i),'IPA',v)),p,bundle,now).length,0)
  assert.equal(rankE1([candidate('edge','IPA',{public_status:'low',current_cycle_started_at:new Date(boundary).toISOString()})],p,bundle,now).length,1)
})
test('A13: checksum, trust anchor, hierarchy and fail-closed scope', () => {
  for (const purpose of [undefined,'serve','shadow','production']) assert.throws(()=>loadE1Bundle(fixture,purpose),/authorization/)
  const previousEnv = process.env.NODE_ENV
  try {
    process.env.NODE_ENV = 'production'
    assert.throws(()=>load(fixture),/authorization/)
  } finally {
    if (previousEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previousEnv
  }
  assert.throws(()=>load({...fixture,model_version:'rules-v1'}),/checksum\/version/)
  assert.throws(()=>load({...fixture,sha256:'0'.repeat(64)}),/checksum\/version/)
  assert.throws(()=>load(tamper(p=>p.production_approved=true)),/scope/)
  assert.throws(()=>load(tamper(p=>p.rules='changed')),/Unrecognized offline bundle/)
  assert.throws(()=>load(tamper(p=>p.generic_keys.push('missing'))),/generic key/)
  assert.throws(()=>load(tamper(p=>p.bridges.push(p.bridges[0]))),/Duplicate directed bridge/)
  assert.throws(()=>load(tamper(p=>p.bridges[0].relation='child_to_parent_unspecified')),/parent\/child/)
  assert.throws(()=>load(tamper(p=>p.bridges.push({history:'ipa.generic',candidate:'stout.dry',relation:'parent_to_child'}))),/endpoints/)
  assert.throws(()=>load(tamper(p=>p.bridges.push({history:'stout.generic',candidate:'porter.english',relation:'parent_to_child'}))),/Unauthorized directed/)
  const clone=structuredClone(fixture),isolated=load(clone)
  clone.payload.bridges.length=0; clone.payload.mappings.length=0
  assert.equal(isolated.styleKey('IPA'),'ipa.generic')
  assert.throws(()=>isolated.historiesFor('ipa.generic').push('ipa.sour'),TypeError)
})

test('coverage-1 promotes supported keys from below the old cutoff; keeps tier, venue and prefixes', async () => {
  const {rankE1Coverage} = await import('../../src/e1/rank.js')
  const p = profile({'ipa.hazy':5,'ipa.west_coast':3})
  p.followed.add('followed')
  const rows = Array.from({length:24},(_,i)=>candidate('h'+String(i).padStart(2,'0'),'浑浊IPA'))
  rows.push(candidate('w','西海岸IPA'),candidate('generic','IPA'),
    candidate('elsewhere','浑浊IPA',{product_id:'h00',tenant_id:'followed'}),
    candidate('unknown','未收录'),candidate('ended','西海岸IPA',{ended_at:new Date(now).toISOString()}))
  p.tapped.add(venueBeer(rows[3]))
  const base = rankE1(rows,p,bundle,now)
  const full = rankE1Coverage(rows,p,bundle,now)
  assert.notEqual(full.model_version,bundle.model_version)
  assert(!base.some(i=>i.item_id==='w'))
  assert.equal(full.items[0].item_id,'elsewhere')
  assert.equal(full.items[1].item_id,'w')
  assert.equal(full.items[0].score,1.15)
  assert.equal(full.items[2].display_score,0.5)
  assert.deepEqual(rankE1Coverage(rows,p,bundle,now,6).items,full.items.slice(0,6))
  assert.equal(full.items.length,20)
  assert(full.items.every(i=>i.tier===0 && !['h00','h03','unknown','ended'].includes(i.item_id)))
  const short = rankE1Coverage([rows[0],rows[24],rows[25]],p,bundle,now)
  assert.deepEqual(short.items.map(i=>i.tier),[0,0,1])
  for (const list of [[],rows.slice(0,1),rows.slice(0,24)]) {
    assert.deepEqual(rankE1Coverage(list,p,bundle,now).items.map(i=>i.item_id),rankE1(list,p,bundle,now).map(i=>i.item_id))
  }
})

const jointFixture = JSON.parse(fs.readFileSync(new URL('./fixtures/joint-bundle.json', import.meta.url)))
const jointDecisions = JSON.parse(fs.readFileSync(new URL('./fixtures/joint-decisions.json', import.meta.url)))
const joint = load(jointFixture)

test('Joint taxonomy: exactly reviewed changes, unchanged vocabulary/bridges and no raw-name inference', () => {
  assert.deepEqual(jointFixture.payload.bridges, fixture.payload.bridges)
  assert.deepEqual(jointFixture.payload.vocabulary, fixture.payload.vocabulary)
  assert.deepEqual(jointFixture.payload.generic_keys, fixture.payload.generic_keys)
  const changed = new Map(jointDecisions.global_changes.map(r => [r.raw_style, r.style_key === 'unknown' ? null : r.style_key]))
  for (const [raw] of jointFixture.payload.mappings) {
    assert.equal(joint.styleKey(raw), changed.has(raw) ? changed.get(raw) : bundle.styleKey(raw))
  }
  for (const raw of ['最苦啤', '纽伦堡红啤', '英式社交深色艾尔', '麦芽实验啤酒']) assert.equal(joint.styleKey(raw), null)
  assert.equal(joint.styleKey('新造酸浑浊IPA'), null)
})

test('Joint taxonomy: signed local asset cannot serve; missing/bad signature and checksum fail closed', () => {
  assert.throws(() => loadE1Bundle(jointFixture, 'internal-feed'), /scope/)
  assert.throws(() => loadE1Bundle(jointFixture, 'serve'), /authorization/)
  for (const signature of [undefined, 'not-a-signature']) assert.throws(() => load({...jointFixture, signature}), /signature/)
  const edited = structuredClone(jointFixture)
  edited.payload.mappings[0][2] = 'ipa.generic'
  assert.throws(() => load(edited), /checksum/)
  edited.sha256 = digest(edited.payload); edited.model_version = 'rules-v2-e1:' + edited.sha256
  assert.throws(() => load(edited), /Unauthorized product overrides/)
})

test('Joint taxonomy: six exact canonical IDs work on history and candidates, no NULL or name-wide override', () => {
  for (const override of jointDecisions.product_overrides) {
    const product_id = override.canonical_beer.slice('product:'.length)
    const row = {product_id, style: override.raw_style}
    assert.equal(joint.styleKey(row.style, row), override.style_key)
    assert.equal(joint.styleKey(row.style, {...row, identity_valid:false}), joint.styleKey(row.style))
    assert.equal(joint.styleKey(row.style, {...row, product_status:'merged'}), joint.styleKey(row.style))
    assert.equal(joint.styleKey(row.style, {product_id:'unrelated',beer_name:override.product}), joint.styleKey(row.style))
    assert.equal(joint.styleKey(row.style, {provisional_drink_id:product_id}), joint.styleKey(row.style))
    const p=e1Profile({user_beers:[0,1,2,3,4,5].map(i=>({id:String(i),user_key:'U',...row,product_id:i<2?product_id:'unknown'+i,style:i<2?row.style:null})),follows:[],venue_experiences:[]},'U',joint)
    assert.equal(p.count,5); assert.equal(p.counts.get(override.style_key),1)
    const result=rankE1([candidate('target',row.style,{product_id})],p,joint,now)
    assert.equal(result[0].style_key,override.style_key); assert.equal(result[0].evidence_count,1)
  }
  assert.equal(joint.styleKey(null),null)
})

test('Joint taxonomy: sour subtype corrections cannot match ordinary IPA; semantic holds contribute no evidence', () => {
  for (const r of jointDecisions.global_changes.filter(r=>r.group!=='approved_alias')) {
    const p=e1Profile({user_beers:[0,1,2,3,4].map(i=>({id:String(i),user_key:'U',product_id:'p'+i,style:i===0?r.raw_style:null})),follows:[],venue_experiences:[]},'U',joint)
    if (r.style_key==='unknown') {
      assert.equal(p.counts.size,0)
      assert.deepEqual(rankE1([candidate('x','IPA')],p,joint,now),[])
      assert.deepEqual(rankE1([candidate('x',r.raw_style)],profile({[r.old_key]:3}),joint,now),[])
    } else {
      assert.equal(p.counts.get('ipa.sour'),1)
      assert.equal(rankE1([candidate('x',r.raw_style)],p,joint,now)[0].tier,0)
      assert.deepEqual(rankE1([candidate('x',r.raw_style)],profile({[r.old_key]:3}),joint,now),[])
      assert.deepEqual(rankE1([candidate('x','IPA')],p,joint,now),[])
    }
  }
})

test('Joint taxonomy: canonical override keeps TAP exclusion, fixed venue, history filter and version signature consistent', async () => {
  const {rankE1Coverage} = await import('../../src/e1/rank.js')
  const {e1Filter,e1Signature} = await import('../../src/e1/integration.js')
  const override=jointDecisions.product_overrides.find(r=>r.style_key==='lager.helles')
  const product_id=override.canonical_beer.slice('product:'.length)
  const input={user_beers:[0,1,2,3,4].map(i=>({id:String(i),user_key:'U',product_id:i===0?product_id:'other'+i,style:null})),
    follows:[{user_key:'U',tenant_id:'followed'}],venue_experiences:[{user_key:'U',product_id,tenant_id:'tapped'}]}
  const p=e1Profile(input,'U',joint)
  const rows=['tapped','ordinary','followed'].map((tenant_id,i)=>candidate(String(i),null,{tenant_id,product_id}))
  const result=rankE1Coverage(rows,p,joint,now)
  assert.equal(result.items.length,1);const [item]=result.items
  assert.equal(item.tenant_id,'followed');assert.equal(item.score,1.15);assert.equal(item.evidence_count,1)
  assert.deepEqual(rankE1Coverage(rows,p,joint,now,6).items,result.items)
  assert(e1Filter(p,joint,now)(rows[2],item))
  assert(!e1Filter(p,joint,now)(rows[0],item))
  assert(!e1Filter(p,joint,now)({...rows[2],product_id:'other',beer_name:override.product},item))
  assert(!e1Filter(p,joint,now)({...rows[2],product_status:'merged'},item))
  assert.notEqual(e1Signature(rows,p,joint,now),e1Signature(rows,p,bundle,now))
})
