// Exercise the same two-step external launcher used by the systemd units, with loopback Auth only.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import http from 'node:http'
const listen=async s=>{s.listen(0,'127.0.0.1');await once(s,'listening');return s.address().port}
export async function readThroughLauncher(args,env,user,headers,query) {
  const auth=http.createServer((req,res)=>{
    assert.equal(req.url,'/auth/v1/user'); res.end(JSON.stringify({id:user}))
  })
  const authPort=await listen(auth)
  const reserve=http.createServer(),port=await listen(reserve)
  await new Promise(r=>reserve.close(r))
  const token='isolated.'+Buffer.from(JSON.stringify({sub:user,role:'authenticated',exp:Date.now()/1000+60})).toString('base64url')+'.test'
  const proc=spawn('python3',args,{env:{...env,SUPABASE_URL:'http://127.0.0.1:'+authPort,HOST:'127.0.0.1',PORT:String(port)},stdio:['ignore','pipe','pipe']})
  let stdout='',stderr=''
  proc.stdout.on('data',s=>{stdout+=s});proc.stderr.on('data',s=>{stderr+=s})
  const done=once(proc,'exit')
  try {
    for(let i=0;i<200 && !stdout.includes('"listening"') && proc.exitCode===null;i++)
      await new Promise(r=>setTimeout(r,25))
    assert.ok(stdout.includes('"listening"'),stderr)
    const res=await fetch('http://127.0.0.1:'+port+'/api/feed/v1/new-beers?'+new URLSearchParams(query),{
      headers:{...headers,Authorization:'Bearer '+token,Connection:'close'},signal:AbortSignal.timeout(4000)})
    assert.equal(res.status,200)
    return await res.json()
  } finally {
    if(proc.exitCode===null)proc.kill('SIGTERM')
    await done;await new Promise(r=>auth.close(r))
  }
}
