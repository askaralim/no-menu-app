#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const DEFAULT_PROJECT_REF = 'agtujigvxxdppngirqtu'
const DEFAULT_MEDIA_API = 'https://nomenuapp.com/api/media/promote-product-image'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SUPPORTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const EXTENSION_BY_TYPE = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
])
const MAX_IMAGE_BYTES = 2 * 1024 * 1024

function parseArgs(argv) {
  const args = { apply: false, limit: 10 }
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === '--apply') args.apply = true
    else if (value === '--global') args.global = true
    else if (value === '--tenant-id') args.tenantId = argv[++index]
    else if (value === '--limit') args.limit = Number(argv[++index])
    else if (value === '--confirm-tenant') args.confirmTenant = argv[++index]
    else if (value === '--confirm-global') args.confirmGlobal = argv[++index]
    else if (value === '--project-ref') args.projectRef = argv[++index]
    else if (value === '--media-api') args.mediaApi = argv[++index]
    else if (value === '--state-file') args.stateFile = argv[++index]
    else if (value === '--save-plan') args.savePlan = argv[++index]
    else if (value === '--help' || value === '-h') args.help = true
    else throw new Error(`Unknown argument: ${value}`)
  }
  return args
}

function usage() {
  return `Usage:
  node supabase/tools/migrate-product-images-to-oss.mjs --tenant-id <uuid> [--limit 10]
  node supabase/tools/migrate-product-images-to-oss.mjs --global [--limit 25]

Lock a reviewed dry-run plan for a later apply:
  node supabase/tools/migrate-product-images-to-oss.mjs \
    --global --limit 50 --save-plan <path>

Dry-run is the default and never writes to Supabase or OSS.

Apply (production write; requires a signed-in super-admin access token):
  NOMENU_ADMIN_ACCESS_TOKEN=<token> node supabase/tools/migrate-product-images-to-oss.mjs \\
    --tenant-id <uuid> --limit 10 --apply --confirm-tenant <same uuid> [--state-file <path>]
  NOMENU_ADMIN_ACCESS_TOKEN=<token> node supabase/tools/migrate-product-images-to-oss.mjs \\
    --global --limit 25 --apply --confirm-global MIGRATE-PRODUCT-IMAGES [--state-file <path>]

Apply writes a local recovery state file before the first remote write. Re-run
the same command with the same state file to resume an interrupted migration.
`
}

function requireValidArgs(args) {
  if (args.help) return
  if (Boolean(args.global) === Boolean(args.tenantId)) {
    throw new Error('Choose exactly one scope: --global or --tenant-id <uuid>')
  }
  if (args.tenantId && !UUID_PATTERN.test(args.tenantId)) throw new Error('--tenant-id must be a UUID')
  if (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 400) {
    throw new Error('--limit must be an integer from 1 to 400')
  }
  if (args.apply && args.savePlan) {
    throw new Error('--save-plan is only valid for a dry-run')
  }
  if (args.apply) {
    if (args.global && args.confirmGlobal !== 'MIGRATE-PRODUCT-IMAGES') {
      throw new Error('--global --apply requires --confirm-global MIGRATE-PRODUCT-IMAGES')
    }
    if (args.global && !args.stateFile) {
      throw new Error('--global --apply requires an explicit --state-file for this batch')
    }
    if (args.tenantId && args.confirmTenant !== args.tenantId) {
      throw new Error('--apply requires --confirm-tenant with the same tenant UUID')
    }
    if (!process.env.NOMENU_ADMIN_ACCESS_TOKEN?.trim()) {
      throw new Error('--apply requires NOMENU_ADMIN_ACCESS_TOKEN for a platform super admin')
    }
  }
}

function serviceRoleKey(projectRef) {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    return process.env.SUPABASE_SERVICE_ROLE_KEY.trim()
  }
  const cliEnv = { ...process.env }
  // A previous script version used this name for the Web Admin JWT. Never pass
  // that browser token to the Supabase CLI, which reserves it for sbp_ tokens.
  delete cliEnv.SUPABASE_ACCESS_TOKEN
  const keys = JSON.parse(execFileSync(
    'supabase',
    ['projects', 'api-keys', '--project-ref', projectRef, '-o', 'json'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: cliEnv },
  ))
  const entry = keys.find((key) => key.name === 'service_role')
  const value = entry?.api_key || entry?.key
  if (!value) throw new Error('Unable to load the linked project service_role key')
  return value
}

function isSupabaseDrinkImage(url, projectRef) {
  if (!url) return false
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (parsed.hostname !== `${projectRef}.supabase.co`) return false
  return /^\/storage\/v1\/object\/public\/taplist-media\/[0-9a-f-]+\/drinks\/[0-9a-f-]+\/[^/]+$/i.test(
    parsed.pathname,
  )
}

export function selectCandidates({ drinks, products, tenantId, projectRef, limit }) {
  const productById = new Map(products.map((product) => [product.id, product]))
  const usageByProduct = new Map()
  for (const drink of drinks) {
    if (!drink.product_id) continue
    const usages = usageByProduct.get(drink.product_id) || []
    usages.push(drink)
    usageByProduct.set(drink.product_id, usages)
  }

  return [...productById.values()]
    .filter((product) => isSupabaseDrinkImage(product.image_url, projectRef))
    .map((product) => {
      const usages = usageByProduct.get(product.id) || []
      const tenantUsages = usages.filter((drink) => drink.tenant_id === tenantId)
      const otherTenantUsages = usages.filter((drink) => drink.tenant_id !== tenantId)
      const matchingTenantUsages = tenantUsages.filter(
        (drink) => drink.image_url === product.image_url,
      )
      return { product, tenantUsages, otherTenantUsages, matchingTenantUsages }
    })
    .filter((candidate) =>
      candidate.tenantUsages.length > 0 &&
      candidate.otherTenantUsages.length === 0 &&
      candidate.matchingTenantUsages.length === candidate.tenantUsages.length
    )
    .sort((left, right) => left.product.id.localeCompare(right.product.id))
    .slice(0, limit)
}

export function selectGlobalCandidates({ drinks, products, projectRef, limit }) {
  const usageByProduct = new Map()
  for (const drink of drinks) {
    if (!drink.product_id) continue
    const usages = usageByProduct.get(drink.product_id) || []
    usages.push(drink)
    usageByProduct.set(drink.product_id, usages)
  }

  return products
    .filter((product) => isSupabaseDrinkImage(product.image_url, projectRef))
    .map((product) => {
      const usages = usageByProduct.get(product.id) || []
      const matchingUsages = usages.filter((drink) => drink.image_url === product.image_url)
      return {
        product,
        matchingUsages,
        tenantCount: new Set(matchingUsages.map((drink) => drink.tenant_id)).size,
      }
    })
    .sort((left, right) => left.product.id.localeCompare(right.product.id))
    .slice(0, limit)
}

export function annotatePublicVisibility(candidates, publicDrinkIds, tenants) {
  const tenantById = new Map(tenants.map((tenant) => [tenant.id, tenant]))
  return candidates.map((candidate) => {
    const matchingUsages = candidate.matchingUsages || candidate.matchingTenantUsages
    const publicMatchingUsages = matchingUsages
      .filter((drink) => publicDrinkIds.has(drink.id))
      .map((drink) => ({ ...drink, tenant: tenantById.get(drink.tenant_id) || null }))
    return { ...candidate, publicMatchingUsages }
  })
}

function isProductOssUrl(url, productId) {
  try {
    const parsed = new URL(url)
    return parsed.hostname === 'img.nomenuapp.com'
      && parsed.pathname.startsWith(`/prod/products/${productId}/`)
  } catch {
    return false
  }
}

export function resumeAction(item, currentProductUrl) {
  if (item.status === 'complete') return { action: 'complete', newUrl: item.newUrl }
  if (item.newUrl) {
    if (currentProductUrl !== item.newUrl) {
      throw new Error(`Product image changed after promotion: ${item.productId}`)
    }
    return { action: 'sync', newUrl: item.newUrl }
  }
  if (currentProductUrl === item.oldUrl) return { action: 'promote' }
  if (isProductOssUrl(currentProductUrl, item.productId)) {
    return { action: 'sync', newUrl: currentProductUrl }
  }
  throw new Error(`Product image changed since the migration plan was created: ${item.productId}`)
}

async function restJson(baseUrl, key, path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      ...(init.headers || {}),
    },
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`Supabase REST ${response.status}: ${await response.text()}`)
  const text = await response.text()
  return text ? JSON.parse(text) : null
}

async function restAll(baseUrl, key, path) {
  const pageSize = 1000
  const rows = []
  for (let start = 0; ; start += pageSize) {
    const page = await restJson(baseUrl, key, path, {
      headers: { Range: `${start}-${start + pageSize - 1}` },
    })
    rows.push(...page)
    if (page.length < pageSize) return rows
  }
}

async function mapWithConcurrency(values, concurrency, task) {
  const results = new Array(values.length)
  let nextIndex = 0
  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await task(values[index], index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker))
  return results
}

async function annotatePlanPublicVisibility(baseUrl, key, candidates) {
  const matchingUsages = candidates.flatMap(
    (candidate) => candidate.matchingUsages || candidate.matchingTenantUsages,
  )
  const tenantIds = [...new Set(matchingUsages.map((drink) => drink.tenant_id))]
  if (tenantIds.length === 0) return annotatePublicVisibility(candidates, new Set(), [])

  const tenantFilter = encodeURIComponent(`(${tenantIds.join(',')})`)
  const tenants = await restJson(
    baseUrl,
    key,
    `/tenants?select=id,name,display_name,slug,status,is_public_visible&id=in.${tenantFilter}`,
  )
  const payloads = await mapWithConcurrency(tenantIds, 6, (tenantId) => restJson(
    baseUrl,
    key,
    '/rpc/get_public_taplist_drinks',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_tenant_id: tenantId }),
    },
  ))
  const publicDrinkIds = new Set(payloads.flatMap((payload) => [
    ...(payload?.drinks || []),
    ...(payload?.coming_soon || []),
    ...(payload?.recently_sold_out || []),
  ]).map((drink) => drink.id))
  return annotatePublicVisibility(candidates, publicDrinkIds, tenants)
}

async function inspectSource(url) {
  const response = await fetch(url, { method: 'HEAD', redirect: 'error', signal: AbortSignal.timeout(15_000) })
  const type = (response.headers.get('content-type') || '').split(';', 1)[0].trim().toLowerCase()
  const bytes = Number(response.headers.get('content-length'))
  return {
    ok: response.ok && SUPPORTED_TYPES.has(type) && Number.isFinite(bytes) && bytes > 0 && bytes <= MAX_IMAGE_BYTES,
    status: response.status,
    contentType: type || null,
    contentLength: Number.isFinite(bytes) ? bytes : null,
  }
}

async function loadPlan({ projectRef, tenantId, limit, key }) {
  const baseUrl = `https://${projectRef}.supabase.co/rest/v1`
  const tenantRows = await restJson(
    baseUrl,
    key,
    `/tenants?select=id,name,display_name,slug,status,is_public_visible&id=eq.${tenantId}`,
  )
  if (!tenantRows?.length) throw new Error('Tenant not found')

  const tenantDrinks = await restJson(
    baseUrl,
    key,
    `/drinks?select=id,tenant_id,name,product_id,image_url,enabled,is_public_visible&tenant_id=eq.${tenantId}`,
  )
  const productIds = [...new Set(tenantDrinks.map((drink) => drink.product_id).filter(Boolean))]
  if (!productIds.length) return { tenant: tenantRows[0], candidates: [] }

  const inFilter = encodeURIComponent(`(${productIds.join(',')})`)
  const [products, allUsages] = await Promise.all([
    restJson(baseUrl, key, `/drink_products?select=id,name,image_url,status&id=in.${inFilter}`),
    restJson(baseUrl, key, `/drinks?select=id,tenant_id,name,product_id,image_url,enabled,is_public_visible&product_id=in.${inFilter}`),
  ])
  const candidates = selectCandidates({ drinks: allUsages, products, tenantId, projectRef, limit })
  const inspected = []
  for (const candidate of candidates) {
    inspected.push({ ...candidate, source: await inspectSource(candidate.product.image_url) })
  }
  return { tenant: tenantRows[0], candidates: inspected }
}

async function loadGlobalPlan({ projectRef, limit, key }) {
  const baseUrl = `https://${projectRef}.supabase.co/rest/v1`
  const [products, drinks] = await Promise.all([
    restAll(baseUrl, key, '/drink_products?select=id,name,image_url,status&order=id.asc'),
    restAll(baseUrl, key, '/drinks?select=id,tenant_id,name,product_id,image_url,enabled,is_public_visible&product_id=not.is.null&order=id.asc'),
  ])
  const candidates = selectGlobalCandidates({ drinks, products, projectRef, limit })
  const inspected = []
  for (const candidate of candidates) {
    inspected.push({ ...candidate, source: await inspectSource(candidate.product.image_url) })
  }
  return {
    candidates: await annotatePlanPublicVisibility(baseUrl, key, inspected),
    productCount: products.length,
    drinkCount: drinks.length,
    remainingCandidateCount: products.filter((product) =>
      isSupabaseDrinkImage(product.image_url, projectRef)).length,
  }
}

async function promote(mediaApi, accessToken, product) {
  const response = await fetch(mediaApi, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ productId: product.id, sourceImageUrl: product.image_url }),
    signal: AbortSignal.timeout(30_000),
  })
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error(`Media API ${response.status}: ${body?.message || 'unknown error'}`)
  return body
}

async function loadProduct(baseUrl, key, productId) {
  const rows = await restJson(baseUrl, key, `/drink_products?select=id,image_url&id=eq.${productId}`)
  if (rows?.length !== 1) throw new Error(`Product not found while resuming: ${productId}`)
  return rows[0]
}

async function syncDrinkUrls({ projectRef, key, tenantId, productId, drinkIds, oldUrl, newUrl }) {
  if (drinkIds.length === 0) return
  const baseUrl = `https://${projectRef}.supabase.co/rest/v1`
  const filters = new URLSearchParams({
    product_id: `eq.${productId}`,
    image_url: `eq.${oldUrl}`,
    id: `in.(${drinkIds.join(',')})`,
  })
  if (tenantId) filters.set('tenant_id', `eq.${tenantId}`)
  await restJson(baseUrl, key, `/drinks?${filters}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ image_url: newUrl }),
  })

  const expected = new Set(drinkIds)
  const verifyFilters = new URLSearchParams({
    select: 'id,image_url',
    product_id: `eq.${productId}`,
    id: `in.(${drinkIds.join(',')})`,
  })
  if (tenantId) verifyFilters.set('tenant_id', `eq.${tenantId}`)
  const rows = await restJson(baseUrl, key, `/drinks?${verifyFilters}`)
  const valid = rows.length === expected.size
    && rows.every((row) => expected.has(row.id) && row.image_url === newUrl)
  if (!valid) throw new Error(`Tenant drink image sync could not be verified: ${productId}`)
}

function defaultStateFile(scope) {
  return resolve(`.nomenu-product-image-migration-${scope}.state.json`)
}

async function readState(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
}

async function writeState(path, state) {
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.tmp`
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 })
  await rename(temporary, path)
}

function stateFromPlan({ projectRef, mediaApi, scope, tenantId, candidates }) {
  return {
    version: 2,
    projectRef,
    mediaApi,
    scope,
    tenantId,
    createdAt: new Date().toISOString(),
    items: candidates.map((candidate) => ({
      productId: candidate.product.id,
      productName: candidate.product.name,
      oldUrl: candidate.product.image_url,
      drinkIds: (candidate.matchingUsages || candidate.matchingTenantUsages).map((drink) => drink.id),
      newUrl: null,
      status: 'planned',
    })),
  }
}

function validateState(state, expected) {
  if (
    ![1, 2].includes(state?.version)
    || state.projectRef !== expected.projectRef
    || state.mediaApi !== expected.mediaApi
    || (state.scope || state.tenantId) !== expected.scope
  ) {
    throw new Error('Recovery state does not match this migration command')
  }
  if (!Array.isArray(state.items) || state.items.length === 0) {
    throw new Error('Recovery state has no migration items')
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  requireValidArgs(args)
  if (args.help) {
    console.log(usage())
    return
  }

  const projectRef = args.projectRef || DEFAULT_PROJECT_REF
  const mediaApi = args.mediaApi || DEFAULT_MEDIA_API
  const scope = args.global ? 'global' : args.tenantId
  const key = serviceRoleKey(projectRef)
  const stateFile = resolve(args.stateFile || defaultStateFile(scope))
  const existingState = args.apply ? await readState(stateFile) : null
  if (existingState) {
    validateState(existingState, { projectRef, mediaApi, scope })
  }
  const plan = existingState
    ? null
    : args.global
      ? await loadGlobalPlan({ projectRef, limit: args.limit, key })
      : await loadPlan({ projectRef, tenantId: args.tenantId, limit: args.limit, key })

  if (plan) {
    if (args.global) {
      console.log(`${args.apply ? 'APPLY' : 'DRY-RUN'} scope: global product pool`)
      console.log(`Scanned products: ${plan.productCount}; linked drinks: ${plan.drinkCount}`)
      console.log(`Remaining eligible product images: ${plan.remainingCandidateCount}`)
    } else {
      console.log(`${args.apply ? 'APPLY' : 'DRY-RUN'} tenant: ${plan.tenant.display_name || plan.tenant.name} (${plan.tenant.id})`)
    }
  } else {
    console.log(`RESUME scope: ${existingState.scope || existingState.tenantId}`)
  }
  console.log(`Selected candidates: ${plan?.candidates.length ?? existingState.items.length}`)
  if (plan) {
    const matchingUsages = plan.candidates.flatMap(
      (candidate) => candidate.matchingUsages || candidate.matchingTenantUsages,
    )
    console.log(`Drink URLs to sync: ${matchingUsages.length}`)
    console.log(`Affected tenants: ${new Set(matchingUsages.map((drink) => drink.tenant_id)).size}`)
    const publicMatchingUsages = plan.candidates.flatMap(
      (candidate) => candidate.publicMatchingUsages || [],
    )
    console.log(`Currently visible Taplist drinks: ${publicMatchingUsages.length}`)
    console.log(`Non-public matching drinks: ${matchingUsages.length - publicMatchingUsages.length}`)
    console.log(`Products without matching drink URLs: ${plan.candidates.filter((candidate) =>
      (candidate.matchingUsages || candidate.matchingTenantUsages).length === 0).length}`)
  }
  for (const [index, candidate] of (plan?.candidates || []).entries()) {
    console.log(`\n${index + 1}. ${candidate.product.name} (${candidate.product.id})`)
    console.log(`   source: ${candidate.product.image_url}`)
    console.log(`   source check: HTTP ${candidate.source.status}, ${candidate.source.contentType}, ${candidate.source.contentLength} bytes`)
    console.log(`   destination: https://img.nomenuapp.com/prod/products/${candidate.product.id}/{generated-upload-id}.${EXTENSION_BY_TYPE.get(candidate.source.contentType) || 'image'}`)
    const matchingUsages = candidate.matchingUsages || candidate.matchingTenantUsages
    console.log(`   matching drinks: ${matchingUsages.map((drink) => drink.id).join(', ') || 'none'}`)
    console.log(`   affected tenants: ${new Set(matchingUsages.map((drink) => drink.tenant_id)).size}`)
    const publicLabels = (candidate.publicMatchingUsages || []).map((drink) => {
      const tenantName = drink.tenant?.display_name || drink.tenant?.name || drink.tenant_id
      const tenantSlug = drink.tenant?.slug ? ` (${drink.tenant.slug})` : ''
      return `${tenantName}${tenantSlug}: ${drink.name}`
    })
    console.log(`   public Taplist matches: ${publicLabels.join('; ') || 'none'}`)
  }

  const invalid = (plan?.candidates || []).filter((candidate) => !candidate.source.ok)
  if (invalid.length) throw new Error(`${invalid.length} candidate source image(s) failed validation`)
  if (!args.apply) {
    if (args.savePlan) {
      const planFile = resolve(args.savePlan)
      if (await readState(planFile)) throw new Error(`Plan file already exists: ${planFile}`)
      await writeState(planFile, stateFromPlan({
        projectRef,
        mediaApi,
        scope,
        tenantId: args.tenantId,
        candidates: plan.candidates,
      }))
      console.log(`\nLocked migration plan: ${planFile}`)
    }
    console.log('\nDRY-RUN complete. No Supabase or OSS writes were made.')
    return
  }

  const state = existingState || stateFromPlan({
    projectRef,
    mediaApi,
    scope,
    tenantId: args.tenantId,
    candidates: plan.candidates,
  })
  if (!existingState) {
    await writeState(stateFile, state)
    console.log(`Recovery state created: ${stateFile}`)
  } else {
    console.log(`Recovery state loaded: ${stateFile}`)
  }

  const accessToken = process.env.NOMENU_ADMIN_ACCESS_TOKEN.trim()
  const baseUrl = `https://${projectRef}.supabase.co/rest/v1`
  for (const item of state.items) {
    const currentProduct = await loadProduct(baseUrl, key, item.productId)
    let next = resumeAction(item, currentProduct.image_url)
    if (next.action === 'complete') {
      console.log(`Already complete ${item.productId}: ${item.newUrl}`)
      continue
    }
    if (next.action === 'promote') {
      const promoted = await promote(mediaApi, accessToken, {
        id: item.productId,
        image_url: item.oldUrl,
      })
      item.newUrl = promoted.cdnUrl
      item.status = 'promoted'
      item.promotedAt = new Date().toISOString()
      await writeState(stateFile, state)
      next = { action: 'sync', newUrl: item.newUrl }
    } else if (!item.newUrl) {
      item.newUrl = next.newUrl
      item.status = 'promoted'
      item.recoveredAt = new Date().toISOString()
      await writeState(stateFile, state)
    }
    await syncDrinkUrls({
      projectRef,
      key,
      tenantId: args.tenantId,
      productId: item.productId,
      drinkIds: item.drinkIds,
      oldUrl: item.oldUrl,
      newUrl: item.newUrl,
    })
    item.status = 'complete'
    item.completedAt = new Date().toISOString()
    await writeState(stateFile, state)
    console.log(`Migrated ${item.productId}: ${item.newUrl}`)
  }
  console.log(`\nAPPLY complete. Migration state: ${stateFile}`)
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  main().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
