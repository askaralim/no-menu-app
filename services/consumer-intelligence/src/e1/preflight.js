// Called only after the external launcher authenticates this release tree.
import { createPool,transaction } from '../db.js'
import { loadConfig } from '../config.js'
import { currentPolicy } from './routing.js'
export async function verifyRetainedAssets(pool,p) {
  if (p.invalid) throw Error('Invalid E1 reader configuration')
  if (p.mode==='serve') p.bundle()
  return transaction(pool,async c=>{
    await currentPolicy(c)
    const refs=await c.query('SELECT version FROM ci.e1_required_assets ORDER BY version')
    for (const {version} of refs.rows) p.verifyRetained(version)
    return refs.rowCount
  })
}
if (process.argv[1] && import.meta.url===new URL(process.argv[1],'file:').href) {
  const config=loadConfig(), pool=createPool(config)
  try {console.log('E1 reader preflight: verified references',await verifyRetainedAssets(pool,config.e1))}
  finally {await pool.end()}
}
