import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type FailureCode =
  | 'FEATURE_DISABLED'
  | 'INVALID_START_TENANT'
  | 'INSUFFICIENT_CANDIDATES'

type BeerRoadmapFailure = { ok: false; code: FailureCode }

function jsonResponse(body: BeerRoadmapFailure, status = 200) {
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

  return jsonResponse({ ok: false, code: 'INSUFFICIENT_CANDIDATES' })
})
