import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from '../src/server.js'
import { reportScope } from '../src/admin-report.js'
import { config } from './data.js'

test('report scope bounds windows and rejects ambiguous or arbitrary query parameters',()=>{
  assert.equal(reportScope(new URLSearchParams(),Date.parse('2026-11-12T00:00:00Z')).from,'2026-11-05T00:00:00.000Z')
  for(const query of ['days=90','days=7&days=30','application=anything','sql=select','from=2020']) assert.throws(()=>reportScope(new URLSearchParams(query)))
})
test('anonymous and ordinary authenticated users cannot read internal aggregates',async()=>{
  let reads=0, roleChecks=0
  const server=createServer({pool:{connect(){reads++;throw new Error('unexpected data read')}},config,
    supabase:{authorize:async token=>({token,user_key:'private'}),rpc:async(name,body,token)=>{roleChecks++;assert.equal(name,'is_super_admin');assert.equal(token,'ordinary');return false}},log:()=>{}})
  server.listen(0,'127.0.0.1');await once(server,'listening')
  try{
    const url=`http://127.0.0.1:${server.address().port}/api/internal/v1/intelligence-report`
    assert.equal((await fetch(url)).status,401)
    assert.equal((await fetch(url,{headers:{Authorization:'Bearer ordinary'}})).status,403)
    assert.equal(reads,0);assert.equal(roleChecks,1)
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
})
