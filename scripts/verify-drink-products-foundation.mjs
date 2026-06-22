#!/usr/bin/env node
/**
 * Smoke-check Product Pool public RPC compatibility (anon key).
 * Usage: node scripts/verify-drink-products-foundation.mjs
 * Requires EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in env or taplist-mobile/.env
 */

import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

function loadEnvFile(path) {
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (!m || process.env[m[1]]) continue
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

loadEnvFile(resolve(root, 'taplist-mobile/.env'))
loadEnvFile(resolve(root, '.env'))

const url = process.env.EXPO_PUBLIC_SUPABASE_URL
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY

if (!url || !key) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY')
  process.exit(1)
}

async function rpc(name, body) {
  const res = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`${name} HTTP ${res.status}: ${text}`)
  }
  return res.json()
}

function assertDrinkShape(row, label) {
  const required = ['id', 'name', 'public_status', 'serving_options']
  for (const key of required) {
    if (!(key in row)) throw new Error(`${label} missing field: ${key}`)
  }
  if ('product_id' in row && row.product_id != null && typeof row.product_id !== 'string') {
    throw new Error(`${label} product_id must be string or null`)
  }
}

async function main() {
  const bars = await rpc('get_public_taplist_bars', { p_city: 'Shanghai' })
  if (!Array.isArray(bars) || bars.length === 0) {
    throw new Error('No public bars returned')
  }
  console.log(`bars: ${bars.length}`)

  const tenantId = bars[0].id
  const drinksPayload = await rpc('get_public_taplist_drinks', { p_tenant_id: tenantId })
  if (!drinksPayload?.ok) throw new Error(`get_public_taplist_drinks failed: ${drinksPayload?.code}`)
  const drinks = drinksPayload.drinks ?? []
  console.log(`drinks (${bars[0].slug}): ${drinks.length}`)
  for (const d of drinks.slice(0, 5)) assertDrinkShape(d, 'PublicDrinkRow')

  const searchPayload = await rpc('search_public_taplist', { p_city: 'Shanghai', p_query: 'IPA' })
  if (!searchPayload?.ok) throw new Error('search_public_taplist not ok')
  const results = searchPayload.results ?? []
  console.log(`search IPA results: ${results.length}`)
  if (results[0]) {
    if (!('drink_id' in results[0])) throw new Error('search result missing drink_id')
  }

  const newPayload = await rpc('get_public_taplist_new_drinks', { p_city: 'Shanghai' })
  if (!newPayload?.ok) throw new Error('get_public_taplist_new_drinks not ok')
  console.log(`new taps: ${(newPayload.results ?? []).length}`)

  console.log('verify-drink-products-foundation: OK')
}

main().catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
