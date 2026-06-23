#!/usr/bin/env node
/**
 * Smoke-check public-beer-roadmap Edge Function (anon invoke).
 * Usage: node scripts/verify-beer-roadmap-edge.mjs
 *
 * Requires EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY
 * in env or taplist-mobile/.env
 *
 * Local: supabase start && supabase functions serve public-beer-roadmap
 * Remote: deploy first, then run against project URL.
 */

import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

const VALID_TENANT_ID = '00000000-0000-4000-8000-000000000001'

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

async function invokeBeerRoadmap(body) {
  const res = await fetch(`${url}/functions/v1/public-beer-roadmap`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error(`Non-JSON response HTTP ${res.status}: ${text.slice(0, 200)}`)
  }
  return { status: res.status, data }
}

function assertFailure(payload, expectedCode, label) {
  if (!payload || payload.ok !== false) {
    throw new Error(`${label}: expected ok=false, got ${JSON.stringify(payload)}`)
  }
  if (payload.code !== expectedCode) {
    throw new Error(`${label}: expected code=${expectedCode}, got ${payload.code}`)
  }
}

function assertNoProviderMetrics(payload) {
  const text = JSON.stringify(payload)
  for (const key of ['walkingDistanceM', 'walkingDurationS', 'routeToken', 'openUntilLabel']) {
    if (text.includes(key)) {
      throw new Error(`response must not expose ${key}`)
    }
  }
}

async function main() {
  const disabled = await invokeBeerRoadmap({ startTenantId: VALID_TENANT_ID })
  if (disabled.status !== 200) {
    throw new Error(`valid UUID invoke HTTP ${disabled.status} (is public-beer-roadmap deployed?)`)
  }
  assertFailure(disabled.data, 'FEATURE_DISABLED', 'valid UUID with kill switch off')
  assertNoProviderMetrics(disabled.data)

  const invalid = await invokeBeerRoadmap({ startTenantId: 'not-a-uuid' })
  if (invalid.status !== 200) {
    throw new Error(`invalid UUID invoke HTTP ${invalid.status}`)
  }
  assertFailure(invalid.data, 'INVALID_START_TENANT', 'invalid UUID')

  const missing = await invokeBeerRoadmap({})
  assertFailure(missing.data, 'INVALID_START_TENANT', 'missing startTenantId')

  console.log('verify-beer-roadmap-edge: OK')
  console.log('  valid UUID -> FEATURE_DISABLED')
  console.log('  invalid UUID -> INVALID_START_TENANT')
  console.log('  response shape excludes distance/time/token fields')
  console.log('Optional pilot block: enable kill switch + seed verified cluster, then expect ok=true route')
}

main().catch((err) => {
  if (err.message?.includes('404') || err.message?.includes('deployed')) {
    console.error(
      `${err.message}\n\nDeploy locally: supabase functions serve public-beer-roadmap\nOr deploy remote after explicit approval.`
    )
  } else {
    console.error(err.message || err)
  }
  process.exit(1)
})
