import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { e1Reason, REASON_VERSION } from '../../src/e1/reason.js'
import { reasonLabels } from '../../src/e1/reason-labels.js'
import { e1Profile, e1Evidence, rankE1Coverage } from '../../src/e1/rank.js'
import { e1Snapshot, e1Signature } from '../../src/e1/integration.js'
import { loadE1Bundle } from '../../src/e1/bundle.js'
import { internalVersion } from '../../src/e1/trust.js'
import { digest, eligible, recentOrder, publicItem } from '../../src/model.js'
import { valid } from '../../src/schema.js'

const root = new URL('../../../../',import.meta.url)
const read = path => JSON.parse(readFileSync(new URL(path,root)))
const asset = read('services/consumer-intelligence/deploy/e1-assets/'+internalVersion.split(':')[1]+'.json')
const bundle = {...loadE1Bundle(asset,'internal-feed'),familyFor:key=>asset.payload.vocabulary[key].family}
const profile = (entries,total=126) => ({count:total,counts:new Map(entries),followed:new Set(),tapped:new Set()})
const reason = (p,key) => e1Reason({style_key:key,...e1Evidence(p,bundle).get(key)},p,bundle)

test('Reason catalogue explicitly covers every known vocabulary key without suffix-based granularity',()=>{
  assert.deepEqual(Object.keys(reasonLabels).sort(),Object.keys(asset.payload.vocabulary).filter(k=>k!=='unknown').sort())
  assert.equal(reasonLabels['kolsch.generic'].granularity,'specific')
  assert.equal(reasonLabels['english.bitter'].granularity,'broad')
  assert.equal(reasonLabels['sour.wheat'].granularity,'broad')
  assert.equal(reasonLabels.unknown,undefined)
  for(const value of Object.values(reasonLabels)) assert.ok(Object.isFrozen(value))
})

test('Exact broad and specific use real counts, include Unknown in total, and never use scores',()=>{
  const p=profile([['lager.generic',15],['ipa.west_coast',13],['ipa.hazy',12],['english.bitter',6],['kolsch.generic',4]])
  const labels=['拉格类酒','西海岸IPA','浑浊IPA','英式苦啤类酒','科隆啤酒']
  for(const [[key,n],label] of [...p.counts].map((entry,i)=>[entry,labels[i]])) {
    const r=reason(p,key)
    assert.equal(r.text,`你记录过${n}款${label}`)
    assert.equal(r.version,REASON_VERSION)
    assert.equal(r.code,'style_exact')
    assert.equal(r.evidence.matched_unique_taps,n)
    assert.equal(r.evidence.total_unique_taps,126)
    assert.equal(r.evidence.matched_percentage,n/126*100)
    assert.ok(valid('feed/reason.schema.json',r))
    assert.deepEqual(e1Reason({style_key:key,...e1Evidence(p,bundle).get(key),score:1.15,display_score:0.01},p,bundle),r)
  }
  const single=reason(profile([['ipa.hazy',1]],10),'ipa.hazy')
  assert.equal(single.text,'你记录过1款浑浊IPA')
  assert.equal(single.evidence.matched_percentage,10)
})

test('Bridge sums only authorized distinct witnesses and reports each count as association',()=>{
  const p=profile([['ipa.west_coast',3],['ipa.hazy',2],['ipa.sour',8]],15)
  const r=reason(p,'ipa.generic')
  assert.equal(r.code,'style_bridge')
  assert.equal(r.evidence.matched_unique_taps,5)
  assert.deepEqual(r.evidence.witnesses.map(w=>[w.style_key,w.unique_taps]),[['ipa.west_coast',3],['ipa.hazy',2]])
  assert.equal(r.text,'你记录过3款西海岸IPA、2款浑浊IPA，这款是关联风格')
  assert.ok(!/同一|喜欢/.test(r.text))
  assert.ok(valid('feed/reason.schema.json',r))
  const exact=reason(profile([...p.counts,['ipa.generic',1]],16),'ipa.generic')
  assert.equal(exact.evidence.matched_unique_taps,1)
  assert.equal(exact.code,'style_exact')
  const incoming=bundle.historiesFor('ipa.generic')
  assert.ok(incoming.length>2)
  const many=reason(profile(incoming.map(k=>[k,1234]),incoming.length*1234),'ipa.generic')
  assert.equal(many.evidence.witnesses.length,incoming.length)
  assert.equal(many.evidence.matched_unique_taps,incoming.length*1234)
  assert.ok([...many.text].length<=60)
  assert.ok(valid('feed/reason.schema.json',many))
})

test('Invalid, duplicated, unknown, reversed or mismatched evidence fails closed',()=>{
  const p=profile([['ipa.west_coast',3],['ipa.sour',2]],5)
  const match={style_key:'ipa.generic',tier:1,witnesses:['ipa.west_coast'],evidence_count:3}
  for(const patch of [
    {style_key:'unknown'}, {tier:2}, {witnesses:[]}, {witnesses:['ipa.west_coast','ipa.west_coast']},
    {witnesses:['ipa.sour'],evidence_count:2}, {witnesses:['unknown']}, {evidence_count:4}, {tier:0},
  ]) assert.throws(()=>e1Reason({...match,...patch},p,bundle))
  assert.throws(()=>e1Reason(match,{...p,count:2},bundle))
  assert.throws(()=>e1Reason(match,profile([...p.counts,['ipa.generic',1]],6),bundle))
  assert.throws(()=>reason(profile([['ipa.west_coast',1]],5),'ipa.hazy'))
})

test('Canonical duplicate TAP does not inflate counts; Unknown contributes only to denominator',()=>{
  const rows=[['a','p1','IPA'],['b','p1','IPA'],['c','p2',null],['d','p3','unknown style'],['e','p4','IPA'],['f','p5','IPA']]
  const p=e1Profile({user_beers:rows.map(([id,product_id,style])=>({id,product_id,style,user_key:'u'})),follows:[],venue_experiences:[]},'u',bundle)
  assert.equal(p.count,5)
  assert.equal(p.counts.get('ipa.generic'),3)
  assert.equal(reason(p,'ipa.generic').evidence.matched_percentage,60)
  assert.deepEqual(e1Snapshot([],p,bundle,Date.now()),{items:[],evidence:{}})
})

test('Reason API remains compatible with old code/text, requires paired version/evidence, exposes no TAP identities',()=>{
  assert.ok(valid('feed/reason.schema.json',{code:'style_exact',text:'你TAP过同一风格的酒'}))
  const r=reason(profile([['ipa.hazy',1]],10),'ipa.hazy')
  for(const field of ['version','evidence']) {
    const copy=structuredClone(r);delete copy[field]
    assert.equal(valid('feed/reason.schema.json',copy),false)
  }
  for(const field of ['user_id','product_id','taps','score','tier','follow_boost']) {
    const copy=structuredClone(r);copy.evidence[field]='forbidden'
    assert.equal(valid('feed/reason.schema.json',copy),false)
    const witness=structuredClone(r);witness.evidence.witnesses[0][field]='forbidden'
    assert.equal(valid('feed/reason.schema.json',witness),false)
  }
})

test('All 224 accepted lists retain full public items and internal ranking; U00069 single witnesses stay truthful',(t)=>{
  if (!['outputs/recommendation-v2-replay-20261105/source-snapshot.json', 'outputs/e1-taxonomy-lambda-joint-20261107/ranking-diff.json'].every(path => existsSync(new URL('../../../../' + path, import.meta.url)))) {
    t.skip('Private production replay inputs are not included in the repository')
    return
  }
  const source=read('outputs/recommendation-v2-replay-20261105/source-snapshot.json'),now=Date.parse(source.source_as_of)
  const candidates=source.candidates.map(r=>({...r,item_id:digest([r.tenant_id,r.source_drink_id,r.session_id])}))
  let singleWitnesses=0, bridgeItems=0
  const withoutReason=({reason,...item})=>item
  for(const d of read('outputs/e1-taxonomy-lambda-joint-20261107/ranking-diff.json')) {
    const p=e1Profile(source,d.user,bundle),city=candidates.filter(r=>r.city_code===d.city)
    const snap=e1Snapshot(city,p,bundle,now),byId=new Map(city.map(r=>[r.item_id,r]))
    assert.deepEqual(Object.values(snap.evidence),d.joint)
    assert.deepEqual(snap.items.map(withoutReason),d.joint.map(m=>withoutReason(publicItem({...byId.get(m.item_id),style_family:bundle.familyFor(m.style_key)},m.rank))))
    assert.deepEqual(rankE1Coverage(city,p,bundle,now,6).items,d.joint.slice(0,6))
    for(const item of snap.items) {
      const match=snap.evidence[item.item_id],e=item.reason.evidence
      assert.ok(valid('feed/reason.schema.json',item.reason))
      assert.equal(e.total_unique_taps,p.count)
      assert.equal(e.matched_unique_taps,match.evidence_count)
      assert.deepEqual(e.witnesses.map(w=>w.style_key),match.witnesses)
      for(const w of e.witnesses) assert.equal(w.unique_taps,p.counts.get(w.style_key))
      if(match.tier===1) bridgeItems++
      if(d.user==='U00069' && match.evidence_count===1) {
        singleWitnesses++
        assert.match(item.reason.text,/1款/)
      }
    }
    const oldSignature=digest({version:bundle.model_version,count:p.count,counts:Object.fromEntries(p.counts),
      tapped:[...p.tapped].sort(),followed:[...p.followed].sort(),candidates:city.filter(r=>eligible(r,now,{windowDays:14})).sort(recentOrder)})
    assert.notEqual(e1Signature(city,p,bundle,now),oldSignature)
    assert.equal(e1Signature(city,p,bundle,now),e1Signature(city,p,bundle,now))
    assert.equal(e1Signature(city,p,bundle,now),e1Signature(city.map(row=>({...row,style_en:'Display only'})),p,bundle,now))
  }
  assert.ok(singleWitnesses>0)
  assert.ok(bridgeItems>0)
})
