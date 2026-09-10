#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { readFile, rename, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const PROJECT_REF = 'agtujigvxxdppngirqtu'
const MEDIA_API = 'https://nomenuapp.com/api/media/promote-tenant-cover'
const CONFIRM = 'MIGRATE-TENANT-COVERS'
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const LEGACY_COVER = new RegExp(`^https://${PROJECT_REF}\\.supabase\\.co/storage/v1/object/public/taplist-media/(${UUID})/cover/[^/]+$`, 'i')

function parseArgs(argv) {
  const args = { limit: 48, apply: false }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--limit') args.limit = Number(argv[++i])
    else if (argv[i] === '--apply') args.apply = true
    else if (argv[i] === '--confirm') args.confirm = argv[++i]
    else if (argv[i] === '--state-file') args.stateFile = argv[++i]
    else if (argv[i] === '--help' || argv[i] === '-h') args.help = true
    else throw new Error(`Unknown argument: ${argv[i]}`)
  }
  return args
}

function usage() {
  return `Usage:
  node supabase/tools/migrate-tenant-covers-to-oss.mjs [--limit 48]

Dry-run is the default. Apply requires a platform super-admin token:
  NOMENU_ADMIN_ACCESS_TOKEN=<token> node supabase/tools/migrate-tenant-covers-to-oss.mjs \\
    --limit 48 --apply --confirm ${CONFIRM} --state-file <path>
`
}

function validateArgs(args) {
  if (args.help) return
  if (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 100) throw new Error('--limit must be 1-100')
  if (args.apply) {
    if (args.confirm !== CONFIRM) throw new Error(`--apply requires --confirm ${CONFIRM}`)
    if (!args.stateFile) throw new Error('--apply requires --state-file')
    if (!process.env.NOMENU_ADMIN_ACCESS_TOKEN?.trim()) throw new Error('--apply requires NOMENU_ADMIN_ACCESS_TOKEN')
  }
}

function serviceRoleKey() {
  const env = { ...process.env }
  delete env.SUPABASE_ACCESS_TOKEN
  const keys = JSON.parse(execFileSync('supabase', ['projects', 'api-keys', '--project-ref', PROJECT_REF, '-o', 'json'], { encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'pipe'] }))
  const item = keys.find((entry) => entry.name === 'service_role')
  if (!item?.api_key && !item?.key) throw new Error('service_role key not found')
  return item.api_key || item.key
}

async function requestJson(url, init = {}) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) })
  const text = await response.text()
  const body = text ? JSON.parse(text) : null
  if (!response.ok) throw new Error(`${response.status}: ${body?.message || text}`)
  return body
}

async function loadTenants(key) {
  return requestJson(`https://${PROJECT_REF}.supabase.co/rest/v1/tenants?select=id,name,display_name,slug,status,is_public_visible,cover_image_url&order=id.asc`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  })
}

export function selectCoverCandidates(tenants, limit) {
  return tenants.filter((tenant) => {
    const match = tenant.cover_image_url?.match(LEGACY_COVER)
    return match && match[1].toLowerCase() === tenant.id.toLowerCase()
  }).slice(0, limit)
}

export function coverResumeAction(item, currentUrl) {
  if (item.status === 'complete') return 'complete'
  if (item.newUrl && currentUrl === item.newUrl) return 'complete'
  if (currentUrl === item.oldUrl) return 'promote'
  throw new Error(`Tenant cover changed since plan creation: ${item.tenantId}`)
}

async function sourceMetadata(url) {
  const response = await fetch(url, { method: 'HEAD', redirect: 'error', signal: AbortSignal.timeout(15_000) })
  const type = String(response.headers.get('content-type') || '').split(';', 1)[0].toLowerCase()
  const bytes = Number(response.headers.get('content-length'))
  return { ok: response.ok, status: response.status, type, bytes }
}

async function writeState(path, state) {
  const temporary = `${path}.tmp`
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 })
  await rename(temporary, path)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  validateArgs(args)
  if (args.help) return console.log(usage())
  const key = serviceRoleKey()
  const tenants = await loadTenants(key)
  const remaining = selectCoverCandidates(tenants, 100)
  const candidates = remaining.slice(0, args.limit)

  if (!args.apply) {
    console.log(`DRY RUN tenant covers: ${candidates.length} selected; ${remaining.length} remaining`)
    const inspected = await Promise.all(candidates.map(async (tenant) => ({
      tenant,
      metadata: await sourceMetadata(tenant.cover_image_url),
    })))
    for (const { tenant, metadata } of inspected) {
      console.log(`${tenant.id} | ${tenant.display_name || tenant.name} | ${tenant.slug} | ${tenant.is_public_visible ? 'public' : 'private'} | ${metadata.status} ${metadata.type} ${metadata.bytes}`)
    }
    const invalid = inspected.filter(({ metadata }) =>
      !metadata.ok
      || !['image/jpeg', 'image/png', 'image/webp'].includes(metadata.type)
      || !Number.isFinite(metadata.bytes)
      || metadata.bytes <= 0
      || metadata.bytes > 2 * 1024 * 1024
    )
    console.log(`Eligible: ${inspected.length - invalid.length}; blocked: ${invalid.length}`)
    if (invalid.length) process.exitCode = 2
    return
  }

  const statePath = resolve(args.stateFile)
  let state
  try { state = JSON.parse(await readFile(statePath, 'utf8')) } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  if (!state) {
    state = {
      version: 1,
      projectRef: PROJECT_REF,
      createdAt: new Date().toISOString(),
      items: candidates.map((tenant) => ({ tenantId: tenant.id, name: tenant.display_name || tenant.name, slug: tenant.slug, oldUrl: tenant.cover_image_url, status: 'pending' })),
    }
    await writeState(statePath, state)
    console.log(`Recovery state created: ${statePath}`)
  } else {
    console.log(`Recovery state loaded: ${statePath}`)
  }

  for (const item of state.items) {
    const current = tenants.find((tenant) => tenant.id === item.tenantId)
    const action = coverResumeAction(item, current?.cover_image_url)
    if (action === 'complete') continue
    const promoted = await requestJson(MEDIA_API, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.NOMENU_ADMIN_ACCESS_TOKEN.trim()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantId: item.tenantId, sourceImageUrl: item.oldUrl }),
    })
    item.newUrl = promoted.cdnUrl
    item.status = 'complete'
    item.completedAt = new Date().toISOString()
    await writeState(statePath, state)
    console.log(`Migrated ${item.name}: ${item.newUrl}`)
  }
  console.log(`APPLY complete. Migration state: ${statePath}`)
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1 })
}
