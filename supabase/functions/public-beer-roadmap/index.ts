import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { rankRoutes, type EligibleTenant } from './ranking.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type FailureCode =
  | 'FEATURE_DISABLED'
  | 'INVALID_START_TENANT'
  | 'START_NOT_ELIGIBLE'
  | 'INSUFFICIENT_CANDIDATES'
  | 'NO_VALID_ROUTE'

type BeerRoadmapFailure = { ok: false; code: FailureCode }

type BeerRoadmapStop = {
  tenantId: string
  tenantSlug: string
  displayName: string
  district: string | null
  address: string | null
  latitude: number
  longitude: number
  qualifyingNewTapCount: number
  newTapNames: string[]
}

type BeerRoadmapLeg = {
  fromStopIndex: 0 | 1
  toStopIndex: 1 | 2
}

type BeerRoadmapSuccess = {
  ok: true
  route: {
    routeId: string
    startTenantId: string
    stops: [BeerRoadmapStop, BeerRoadmapStop, BeerRoadmapStop]
    legs: [BeerRoadmapLeg, BeerRoadmapLeg]
    generatedAt: string
  }
}

function jsonResponse(body: BeerRoadmapFailure | BeerRoadmapSuccess, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function parseStartTenantId(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null
  const value = (body as Record<string, unknown>).startTenantId
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function toEligibleTenant(raw: unknown): EligibleTenant | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const tenantId = row.tenantId
  const tenantSlug = row.tenantSlug
  const displayName = row.displayName
  const latitude = row.latitude
  const longitude = row.longitude
  const taplistVerifiedAt = row.taplistVerifiedAt

  if (typeof tenantId !== 'string' || !UUID_RE.test(tenantId)) return null
  if (typeof tenantSlug !== 'string' || tenantSlug.length === 0) return null
  if (typeof displayName !== 'string' || displayName.length === 0) return null
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return null
  if (typeof taplistVerifiedAt !== 'string') return null

  const newTapNamesRaw = row.newTapNames
  const newTapNames = Array.isArray(newTapNamesRaw)
    ? newTapNamesRaw.filter((name): name is string => typeof name === 'string')
    : []

  return {
    tenantId,
    tenantSlug,
    displayName,
    district: typeof row.district === 'string' ? row.district : null,
    address: typeof row.address === 'string' ? row.address : null,
    latitude,
    longitude,
    taplistVerifiedAt,
    qualifyingNewTapCount:
      typeof row.qualifyingNewTapCount === 'number' ? row.qualifyingNewTapCount : 0,
    newTapNames,
  }
}

function toStop(tenant: EligibleTenant): BeerRoadmapStop {
  return {
    tenantId: tenant.tenantId,
    tenantSlug: tenant.tenantSlug,
    displayName: tenant.displayName,
    district: tenant.district,
    address: tenant.address,
    latitude: tenant.latitude,
    longitude: tenant.longitude,
    qualifyingNewTapCount: tenant.qualifyingNewTapCount,
    newTapNames: tenant.newTapNames.slice(0, 2),
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, code: 'INVALID_START_TENANT' }, 405)
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ ok: false, code: 'INVALID_START_TENANT' })
  }

  const startTenantId = parseStartTenantId(body)
  if (!startTenantId || !UUID_RE.test(startTenantId)) {
    return jsonResponse({ ok: false, code: 'INVALID_START_TENANT' })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ ok: false, code: 'FEATURE_DISABLED' })
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: settings, error: settingsError } = await supabase
    .from('beer_roadmap_settings')
    .select('feature_enabled')
    .eq('id', true)
    .maybeSingle()

  if (settingsError || !settings?.feature_enabled) {
    return jsonResponse({ ok: false, code: 'FEATURE_DISABLED' })
  }

  const { data: eligibleRaw, error: eligibleError } = await supabase.rpc(
    'get_beer_roadmap_eligible_tenants',
  )

  if (eligibleError) {
    console.error('get_beer_roadmap_eligible_tenants failed', eligibleError)
    return jsonResponse({ ok: false, code: 'FEATURE_DISABLED' })
  }

  const eligible = (Array.isArray(eligibleRaw) ? eligibleRaw : [])
    .map(toEligibleTenant)
    .filter((row): row is EligibleTenant => row !== null)

  const start = eligible.find((t) => t.tenantId === startTenantId)
  if (!start) {
    const { data: tenantRow } = await supabase
      .from('tenants')
      .select('id')
      .eq('id', startTenantId)
      .maybeSingle()

    if (!tenantRow) {
      return jsonResponse({ ok: false, code: 'INVALID_START_TENANT' })
    }
    return jsonResponse({ ok: false, code: 'START_NOT_ELIGIBLE' })
  }

  const destinations = eligible.filter((t) => t.tenantId !== startTenantId)
  if (destinations.length < 2) {
    return jsonResponse({ ok: false, code: 'INSUFFICIENT_CANDIDATES' })
  }

  const ranked = rankRoutes(start, destinations)
  if (!ranked) {
    return jsonResponse({ ok: false, code: 'NO_VALID_ROUTE' })
  }

  const stops: [BeerRoadmapStop, BeerRoadmapStop, BeerRoadmapStop] = [
    toStop(ranked.stops[0]),
    toStop(ranked.stops[1]),
    toStop(ranked.stops[2]),
  ]

  return jsonResponse({
    ok: true,
    route: {
      routeId: crypto.randomUUID(),
      startTenantId,
      stops,
      legs: [
        { fromStopIndex: 0, toStopIndex: 1 },
        { fromStopIndex: 1, toStopIndex: 2 },
      ],
      generatedAt: new Date().toISOString(),
    },
  })
})
