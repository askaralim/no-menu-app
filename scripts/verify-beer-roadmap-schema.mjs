#!/usr/bin/env node
/**
 * Smoke-check Beer Route schema and RPC contracts.
 * Usage: node scripts/verify-beer-roadmap-schema.mjs
 *
 * Optional: SUPABASE_SERVICE_ROLE_KEY for kill-switch RPC read.
 * Requires EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.
 *
 * Full constraint matrix: run after local `supabase db reset` using
 * supabase/tests/beer_roadmap_foundation.sql
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
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !anonKey) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY')
  process.exit(1)
}

async function restGet(path, key) {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
  })
  return { status: res.status, body: await res.text() }
}

async function rpc(name, body, key) {
  const res = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body ?? {}),
  })
  const text = await res.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    data = text
  }
  return { status: res.status, data }
}

async function main() {
  const anonSettings = await restGet('beer_roadmap_settings?select=feature_enabled', anonKey)
  if (anonSettings.status === 200 && !anonSettings.body.includes('permission denied')) {
    const parsed = JSON.parse(anonSettings.body)
    if (Array.isArray(parsed) && parsed.length > 0) {
      throw new Error('anon must not read beer_roadmap_settings')
    }
  }
  console.log('anon cannot read beer_roadmap_settings: OK')

  if (serviceKey) {
    const enabled = await rpc('get_beer_roadmap_feature_enabled', {}, serviceKey)
    if (enabled.status !== 200) {
      throw new Error(`get_beer_roadmap_feature_enabled HTTP ${enabled.status}`)
    }
    if (enabled.data !== false) {
      throw new Error(`expected feature_enabled false, got ${enabled.data}`)
    }
    console.log('service_role get_beer_roadmap_feature_enabled -> false: OK')

    const tenantsCols = await restGet('tenants?select=roadmap_longitude,roadmap_latitude&limit=1', serviceKey)
    if (tenantsCols.status !== 200) {
      throw new Error(`tenants roadmap columns HTTP ${tenantsCols.status}`)
    }
    console.log('tenants roadmap_longitude/roadmap_latitude columns: OK')

    const poiProbe = await restGet('tenants?select=amap_poi_id&limit=1', serviceKey)
    if (poiProbe.status === 200 && !poiProbe.body.includes('does not exist')) {
      throw new Error('amap_poi_id column should not exist')
    }
    console.log('amap_poi_id column absent: OK')

    const eligible = await rpc('get_beer_roadmap_eligible_tenants', {}, serviceKey)
    if (eligible.status !== 200) {
      throw new Error(`get_beer_roadmap_eligible_tenants HTTP ${eligible.status}`)
    }
    if (!Array.isArray(eligible.data)) {
      throw new Error('get_beer_roadmap_eligible_tenants must return json array')
    }
    console.log('service_role get_beer_roadmap_eligible_tenants -> array: OK')
  } else {
    console.log('skip service_role checks (SUPABASE_SERVICE_ROLE_KEY not set)')
  }

  console.log('verify-beer-roadmap-schema: OK')
  console.log('RPC set_tenant_beer_roadmap_config: 4 params (no POI) — verify after db reset via migration file')
  console.log('For full SQL matrix run: supabase db reset && psql ... -f supabase/tests/beer_roadmap_foundation.sql')
}

main().catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
