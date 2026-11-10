import { transaction } from '../db.js'
import { internalVersion } from './trust.js'
import { fail } from '../errors.js'
import { digest } from '../model.js'

// Owner changes, API instance creation and worker acknowledgements serialize on this gate.
const gate = (c,exclusive=false) => c.query("SELECT pg_advisory_xact_lock"+(exclusive?'':'_shared')+"(hashtextextended('ci:e1-policy',0))")
const fields = p => ({mode:p?.mode ?? 'off',version:p?.mode === 'serve' || p?.mode === 'shadow' ? p.activeVersion : null,
  cohort:p?.mode === 'serve' ? p.users : []})
export const policyFingerprint = p => digest(fields(p))
export async function revokeBundle(pool,version) {
  await transaction(pool,async c=>{
    await gate(c,true)
    await c.query('INSERT INTO ci.e1_revoked_assets(model_version) VALUES($1) ON CONFLICT DO NOTHING',[version])
  })
}
export async function assertNotRevoked(c,version,pinned=false) {
  if ((await c.query('SELECT 1 FROM ci.e1_revoked_assets WHERE model_version=$1',[version])).rowCount)
    fail(pinned ? 410 : 503,'E1_BUNDLE_REVOKED')
}
export async function publishPolicy(pool,p,expectedEpoch) {
  if (p.mode !== 'off') p.bundle() // never elect a missing or revoked asset
  return transaction(pool,async c=>{
    await gate(c,true)
    const {mode,version,cohort}=fields(p)
    if (version) await assertNotRevoked(c,version)
    const r=await c.query(`UPDATE ci.e1_policy SET epoch=epoch+1,mode=$1,model_version=$2,
      cohort=ARRAY(SELECT u FROM unnest($3::text[]) u WHERE NOT EXISTS(SELECT 1 FROM ci.erased_subjects WHERE user_key=u)),
      fingerprint=$4,worker_epoch=NULL,worker_fingerprint=NULL,worker_until=NULL WHERE singleton AND epoch=$5 RETURNING epoch`,
      [mode,version,cohort,policyFingerprint(p),expectedEpoch])
    if (!r.rowCount) throw Error('Stale E1 policy publication')
    return r.rows[0].epoch
  })
}
export async function currentPolicy(c) {
  await gate(c)
  return (await c.query('SELECT *,worker_until>clock_timestamp() AS worker_fresh FROM ci.e1_policy WHERE singleton')).rows[0]
}
const agrees = (row,p) => !p?.invalid && (row.fingerprint ?? policyFingerprint(null)) === policyFingerprint(p)
export function requireWorkerPolicy(row,p) {
  if (!agrees(row,p)) fail(503,'E1_POLICY_MISMATCH')
}
export function policyTargets(row,user) {
  return row.mode==='serve' && (row.model_version===internalVersion ? row.cohort.length===0 : row.cohort.includes(user))
}
export function newE1Route(row,p,user) {
  if (row.mode==='off' && p?.activeVersion===internalVersion) return false
  const targeted=policyTargets(row,user)
  if (!targeted && !p?.routes(user)) return false
  if (!targeted || !agrees(row,p) || !row.worker_fresh || row.worker_epoch!==row.epoch || row.worker_fingerprint!==row.fingerprint)
    fail(503,'E1_POLICY_MISMATCH')
  return true
}
export async function observeWorker(pool,p) {
  return transaction(pool,async c=>{
    const row=await currentPolicy(c)
    let ok=agrees(row,p)
    if (p && p.mode !== 'off') { try {p.bundle()} catch {ok=false} }
    // Only a successful E1 pass can confirm readiness in a newly published epoch.
    if (!ok || row.mode==='off') await c.query('UPDATE ci.e1_policy SET worker_epoch=$1,worker_fingerprint=$2,worker_until=NULL WHERE singleton',
      [row.epoch,ok ? policyFingerprint(p) : null])
    return ok
  })
}
export async function requestRefresh(c,user,city,row,version) {
  const conflict=version ? 'DO UPDATE SET requested_at=clock_timestamp()' : 'DO NOTHING'
  await c.query('INSERT INTO ci.refresh_requests(user_key,city_code) VALUES($1,$2) ON CONFLICT(user_key,city_code) '+conflict,[user,city])
  if (version) await c.query(`INSERT INTO ci.e1_refresh_intents(user_key,city_code,epoch,model_version) VALUES($1,$2,$3,$4)
    ON CONFLICT(user_key,city_code,epoch,model_version) DO UPDATE SET requested_at=clock_timestamp()`,[user,city,row.epoch,version])
}
