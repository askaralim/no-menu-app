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
  isOpenNow?: boolean
  todayOpensAt?: string | null
  todayClosesAt?: string | null
  closesNextDay?: boolean
  opensLaterToday?: boolean
}

type BeerRoadmapLeg = {
  fromStopIndex: number
  toStopIndex: number
}

type BeerRoadmapSuccess = {
  ok: true
  route: {
    routeId: string
    startTenantId: string
    stops: BeerRoadmapStop[]
    legs: BeerRoadmapLeg[]
    generatedAt: string
  }
}

type StartTenantRow = {
  id: string
  city: string | null
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

function asOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function asOptionalTime(value: unknown): string | null | undefined {
  if (value === null) return null
  if (typeof value === 'string' && /^\d{1,2}:\d{2}$/.test(value.trim())) return value.trim()
  return undefined
}

function asCoordinate(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function toEligibleTenant(raw: unknown): EligibleTenant | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const tenantId = row.tenantId
  const tenantSlug = row.tenantSlug
  const displayName = row.displayName
  const latitude = asCoordinate(row.latitude)
  const longitude = asCoordinate(row.longitude)
  const taplistVerifiedAt = row.taplistVerifiedAt

  if (typeof tenantId !== 'string' || !UUID_RE.test(tenantId)) return null
  if (typeof tenantSlug !== 'string' || tenantSlug.length === 0) return null
  if (typeof displayName !== 'string' || displayName.length === 0) return null
  if (latitude === null || longitude === null) return null
  if (typeof taplistVerifiedAt !== 'string') return null

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
    isOpenNow: asOptionalBoolean(row.isOpenNow),
    todayOpensAt: asOptionalTime(row.todayOpensAt),
    todayClosesAt: asOptionalTime(row.todayClosesAt),
    closesNextDay: asOptionalBoolean(row.closesNextDay),
    opensLaterToday: asOptionalBoolean(row.opensLaterToday),
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
    isOpenNow: tenant.isOpenNow,
    todayOpensAt: tenant.todayOpensAt,
    todayClosesAt: tenant.todayClosesAt,
    closesNextDay: tenant.closesNextDay,
    opensLaterToday: tenant.opensLaterToday,
  }
}

function toLegs(stopCount: number): BeerRoadmapLeg[] {
  const legs: BeerRoadmapLeg[] = []
  for (let i = 0; i < stopCount - 1; i += 1) {
    legs.push({ fromStopIndex: i, toStopIndex: i + 1 })
  }
  return legs
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

  const { data: startTenantRow, error: startTenantError } = await supabase
    .from('tenants')
    .select('id, city')
    .eq('id', startTenantId)
    .maybeSingle()

  if (startTenantError) {
    console.error('start tenant lookup failed', startTenantError)
    return jsonResponse({ ok: false, code: 'FEATURE_DISABLED' })
  }

  const startTenant = startTenantRow as StartTenantRow | null
  const startCity = startTenant?.city?.trim()
  if (!startTenant || !startCity) {
    return jsonResponse({ ok: false, code: 'INVALID_START_TENANT' })
  }

  // Prefer city-scoped RPC (post 20260630120000). Fall back to legacy no-arg RPC so a
  // function deploy before that migration does not break App Store 1.2.x Beer Route.
  let eligibleRaw: unknown
  const eligibleWithCity = await supabase.rpc('get_beer_roadmap_eligible_tenants', {
    p_city: startCity,
  })
  if (eligibleWithCity.error) {
    console.warn(
      'get_beer_roadmap_eligible_tenants(p_city) unavailable, using legacy no-arg RPC',
      eligibleWithCity.error,
    )
    const eligibleLegacy = await supabase.rpc('get_beer_roadmap_eligible_tenants')
    if (eligibleLegacy.error) {
      console.error('get_beer_roadmap_eligible_tenants failed', eligibleLegacy.error)
      return jsonResponse({ ok: false, code: 'FEATURE_DISABLED' })
    }
    eligibleRaw = eligibleLegacy.data
  } else {
    eligibleRaw = eligibleWithCity.data
  }

  const eligible = (Array.isArray(eligibleRaw) ? eligibleRaw : [])
    .map(toEligibleTenant)
    .filter((row): row is EligibleTenant => row !== null)

  const start = eligible.find((t) => t.tenantId === startTenantId)
  if (!start) {
    return jsonResponse({ ok: false, code: 'START_NOT_ELIGIBLE' })
  }

  const destinations = eligible.filter((t) => t.tenantId !== startTenantId)
  if (destinations.length < 1) {
    return jsonResponse({ ok: false, code: 'INSUFFICIENT_CANDIDATES' })
  }

  const ranked = rankRoutes(start, destinations)
  if (!ranked || ranked.stops.length < 2) {
    return jsonResponse({ ok: false, code: 'NO_VALID_ROUTE' })
  }

  const stops = ranked.stops.map(toStop)

  return jsonResponse({
    ok: true,
    route: {
      routeId: crypto.randomUUID(),
      startTenantId,
      stops,
      legs: toLegs(stops.length),
      generatedAt: new Date().toISOString(),
    },
  })
})
