import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const requestTypes = new Set(['bar_onboarding', 'product_support', 'privacy', 'other'])
const contactChannels = new Set(['mobile', 'wechat'])

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function clean(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ ok: false, code: 'METHOD_NOT_ALLOWED' }, 405)

  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!body) return json({ ok: false, code: 'INVALID_BODY' }, 400)
  if (clean(body.website, 200)) return json({ ok: true, requestNumber: 'NM-RECEIVED' })

  const requestType = clean(body.requestType, 40)
  const contactName = clean(body.contactName, 50)
  const contactChannel = clean(body.contactChannel, 20)
  const contactValue = clean(body.contactValue, 100)
  const venueName = clean(body.venueName, 100)
  const message = clean(body.message, 1000)
  const consent = body.consent === true

  if (!requestTypes.has(requestType) || !contactChannels.has(contactChannel)) {
    return json({ ok: false, code: 'INVALID_OPTION' }, 400)
  }
  if (contactName.length < 2 || contactValue.length < 2 || message.length < 10 || !consent) {
    return json({ ok: false, code: 'MISSING_REQUIRED_FIELDS' }, 400)
  }
  if (requestType === 'bar_onboarding' && venueName.length < 2) {
    return json({ ok: false, code: 'VENUE_REQUIRED' }, 400)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const salt = Deno.env.get('SUPPORT_RATE_LIMIT_SALT')
  if (!supabaseUrl || !serviceRoleKey || !salt) {
    console.error('support request environment is incomplete')
    return json({ ok: false, code: 'SERVICE_UNAVAILABLE' }, 503)
  }

  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const ip = forwarded || req.headers.get('cf-connecting-ip') || 'unknown'
  const ipHash = await sha256(`${salt}:${ip}`)
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { count, error: countError } = await admin
    .from('support_requests')
    .select('id', { count: 'exact', head: true })
    .eq('ip_hash', ipHash)
    .gte('created_at', since)
  if (countError) {
    console.error('support rate limit check failed', countError)
    return json({ ok: false, code: 'SERVICE_UNAVAILABLE' }, 503)
  }
  if ((count || 0) >= 5) return json({ ok: false, code: 'RATE_LIMITED' }, 429)

  const { data, error } = await admin
    .from('support_requests')
    .insert({
      request_type: requestType,
      source: 'taplist_web',
      contact_name: contactName,
      contact_channel: contactChannel,
      contact_value: contactValue,
      venue_name: venueName || null,
      message,
      ip_hash: ipHash,
    })
    .select('id')
    .single()
  if (error || !data) {
    console.error('support request insert failed', error)
    return json({ ok: false, code: 'SUBMIT_FAILED' }, 500)
  }

  return json({
    ok: true,
    requestNumber: `NM-${data.id.replaceAll('-', '').slice(0, 8).toUpperCase()}`,
  })
})
