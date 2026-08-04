#!/usr/bin/env node
/**
 * Ops-only: compare public.tenant_qr_links with taplist-web/config/qr-links.json.
 *
 * Auth (pick one — never anon key, never commit service role / DB password):
 *   DATABASE_URL=postgresql://... node supabase/tools/check-qr-links-sync.mjs
 *   SUPABASE_DB_URL=...           (alias)
 *   Or: already-linked `supabase` CLI is not required; this script uses `psql`.
 *
 * Optional:
 *   QR_LINKS_JSON=/path/to/qr-links.json
 *
 * Exit 0 when identical; non-zero on drift or missing config.
 */

import { spawnSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '../..')

const dbUrl = (process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || '').trim()
const jsonPath = resolve(
  process.env.QR_LINKS_JSON ||
    join(repoRoot, '../taplist-web/config/qr-links.json'),
)

function fail(msg) {
  console.error(`check-qr-links-sync: ${msg}`)
  process.exit(1)
}

function norm(row) {
  return {
    qr_code: String(row.qr_code || '').toUpperCase(),
    tenant_id: String(row.tenant_id || '').toLowerCase(),
    placement: String(row.placement || '').toLowerCase(),
    enabled: row.enabled === true || row.enabled === 't' || row.enabled === 'true',
    image_path: String(row.image_path || row.storage_path || ''),
    version: Number(row.version || 0),
  }
}

function rowFingerprint(r) {
  return `${r.qr_code}|${r.tenant_id}|${r.placement}|${r.enabled}|${r.version}|${r.image_path}`
}

if (!dbUrl) {
  fail(
    'Set DATABASE_URL or SUPABASE_DB_URL to a postgres connection string (ops credential). Do not use the anon key.',
  )
}

if (!existsSync(jsonPath)) {
  fail(`JSON not found: ${jsonPath}`)
}

let jsonRows
try {
  jsonRows = JSON.parse(readFileSync(jsonPath, 'utf8'))
} catch (e) {
  fail(`Failed to parse JSON: ${e.message}`)
}

if (!Array.isArray(jsonRows)) {
  fail('qr-links.json must be an array')
}

const jsonByCode = new Map()
for (const raw of jsonRows) {
  const r = norm(raw)
  if (!r.qr_code) fail('JSON entry missing qr_code')
  if (jsonByCode.has(r.qr_code)) fail(`Duplicate qr_code in JSON: ${r.qr_code}`)
  jsonByCode.set(r.qr_code, r)
}

const sql = `
SELECT qr_code, tenant_id::text, placement, enabled, version, image_path
FROM public.tenant_qr_links
ORDER BY qr_code;
`

const psql = spawnSync(
  'psql',
  [dbUrl, '-v', 'ON_ERROR_STOP=1', '-At', '-F', '\t', '-c', sql],
  { encoding: 'utf8' },
)

if (psql.status !== 0) {
  fail(`psql failed (status ${psql.status}): ${psql.stderr || psql.stdout || 'unknown error'}`)
}

const dbByCode = new Map()
const lines = (psql.stdout || '').split('\n').filter(Boolean)
for (const line of lines) {
  const [qr_code, tenant_id, placement, enabled, version, image_path] = line.split('\t')
  const r = norm({ qr_code, tenant_id, placement, enabled, version, image_path })
  if (dbByCode.has(r.qr_code)) fail(`Duplicate qr_code in DB: ${r.qr_code}`)
  dbByCode.set(r.qr_code, r)
}

const errors = []

for (const code of jsonByCode.keys()) {
  if (!dbByCode.has(code)) {
    errors.push(`in JSON only: ${code}`)
  }
}
for (const code of dbByCode.keys()) {
  if (!jsonByCode.has(code)) {
    errors.push(`in DB only: ${code}`)
  }
}

for (const code of jsonByCode.keys()) {
  const a = jsonByCode.get(code)
  const b = dbByCode.get(code)
  if (!b) continue
  if (rowFingerprint(a) !== rowFingerprint(b)) {
    errors.push(
      `mismatch ${code}:\n  JSON ${rowFingerprint(a)}\n  DB   ${rowFingerprint(b)}`,
    )
  }
}

if (errors.length) {
  console.error(`check-qr-links-sync: ${errors.length} difference(s)`)
  for (const e of errors) console.error(`  - ${e}`)
  process.exit(1)
}

console.log(
  `check-qr-links-sync: OK — ${jsonByCode.size} codes match (${jsonPath})`,
)
process.exit(0)
