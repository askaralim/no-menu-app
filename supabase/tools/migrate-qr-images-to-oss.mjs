#!/usr/bin/env node
// Run on the media ECS with its existing RAM role. Never mutates the database.
// node --env-file=/etc/nomenu-media-upload.env migrate-qr-images-to-oss.mjs plan.json report.json [--apply]
import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'

const [planPath, reportPath, mode] = process.argv.slice(2)
if (!planPath || !reportPath || (mode && mode !== '--apply')) throw new Error('Expected plan.json report.json [--apply]')
const rows = JSON.parse(await readFile(planPath, 'utf8'))
const require = createRequire('/opt/nomenu-media-upload/package.json')
const Credential = require('@alicloud/credentials').default
const OSS = require('ali-oss')
const credential = new Credential({ type: 'ecs_ram_role', roleName: process.env.OSS_RAM_ROLE_NAME, disableIMDSv1: true })
const temporary = await credential.getCredential()
const client = new OSS({
  accessKeyId: temporary.accessKeyId, accessKeySecret: temporary.accessKeySecret,
  stsToken: temporary.securityToken, bucket: process.env.OSS_BUCKET,
  region: process.env.OSS_REGION, secure: true, authorizationV4: true,
})
const cdn = process.env.OSS_CDN_BASE_URL.replace(/\/+$/, '')
if (cdn !== 'https://img.nomenuapp.com') throw new Error('Unexpected CDN')
const hash = body => createHash('sha256').update(body).digest('hex')
async function png(url) {
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(30000) })
  if (!response.ok || response.headers.get('content-type')?.split(';')[0] !== 'image/png') throw new Error(`PNG unavailable: ${url} (${response.status})`)
  const body = Buffer.from(await response.arrayBuffer())
  if (!body.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) throw new Error('Invalid PNG signature')
  return body
}
const results = []
const codes = new Set()
for (const row of rows) {
  if (!/^[A-Z2-7]{8}$/.test(row.qr_code) || codes.has(row.qr_code)) throw new Error('Invalid/duplicate code')
  codes.add(row.qr_code)
  if (!/^[0-9a-f-]{36}$/.test(row.tenant_id)) throw new Error('Invalid tenant')
  // Slug changes may leave the original filename intact.
  const prefix = `${row.tenant_id}/qr/`
  if (!row.image_path.startsWith(prefix) || !/^no-menu-qr-[a-z0-9-]+-[A-Z2-7]{8}\.png$/.test(row.image_path.slice(prefix.length)) || !row.image_path.endsWith(`-${row.qr_code}.png`)) throw new Error('Unexpected source path')
  const sourceUrl = `https://agtujigvxxdppngirqtu.supabase.co/storage/v1/object/public/taplist-media/${row.image_path}`
  const body = await png(sourceUrl)
  const sha256 = hash(body)
  const objectPath = `prod/tenants/${row.image_path}`
  const imageUrl = `${cdn}/${objectPath}`
  let exists = false
  try {
    const existing = await client.get(objectPath)
    exists = true
    if (hash(existing.content) !== sha256) throw new Error(`Conflicting OSS object: ${objectPath}`)
  } catch (error) {
    if (error.code !== 'NoSuchKey') throw error
  }
  if (mode === '--apply') {
    if (!exists) await client.put(objectPath, body, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=31536000, immutable', 'x-oss-forbid-overwrite': 'true' } })
    const stored = await client.get(objectPath)
    if (hash(stored.content) !== sha256 || hash(await png(imageUrl)) !== sha256) throw new Error(`Verification failed: ${row.qr_code}`)
  }
  results.push({ ...row, source_url: sourceUrl, object_path: objectPath, image_url: imageUrl, sha256, bytes: body.length, verified: mode === '--apply' })
  await writeFile(reportPath, JSON.stringify(results, null, 2) + '\n', { mode: 0o600 })
  console.log(`${mode === '--apply' ? 'VERIFIED' : 'DRY RUN'} ${row.qr_code} ${body.length} bytes${exists ? ' (existing)' : ''}`)
}
console.log(`${results.length} QR images ${mode === '--apply' ? 'verified' : 'planned'}; database unchanged`)
