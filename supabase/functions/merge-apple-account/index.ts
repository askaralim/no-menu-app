import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function response(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return response({ ok: false, code: 'METHOD_NOT_ALLOWED' }, 405)
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const targetToken = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  const body = await req.json().catch(() => null) as { anonymousAccessToken?: string } | null
  if (!supabaseUrl || !serviceRoleKey || !targetToken || !body?.anonymousAccessToken) return response({ ok: false, code: 'UNAUTHORIZED' }, 401)

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const [{ data: targetData }, { data: anonData }] = await Promise.all([
    admin.auth.getUser(targetToken),
    admin.auth.getUser(body.anonymousAccessToken),
  ])
  const target = targetData.user
  const anonymous = anonData.user
  if (!target || !anonymous || target.id === anonymous.id || !anonymous.is_anonymous) return response({ ok: false, code: 'INVALID_ACCOUNTS' }, 400)
  if (!target.identities?.some((identity) => identity.provider === 'apple')) return response({ ok: false, code: 'TARGET_NOT_APPLE' }, 400)

  const { data: oldLights, error: oldError } = await admin.from('user_drink_lights').select('*, user_drink_venues(*)').eq('user_id', anonymous.id)
  if (oldError) return response({ ok: false, code: 'MERGE_FAILED' }, 500)

  for (const oldLight of oldLights ?? []) {
    let targetQuery = admin.from('user_drink_lights').select('id, first_lit_at, last_activity_at').eq('user_id', target.id)
    targetQuery = oldLight.product_id ? targetQuery.eq('product_id', oldLight.product_id) : targetQuery.is('product_id', null).eq('provisional_drink_id', oldLight.provisional_drink_id)
    const { data: existing, error: existingError } = await targetQuery.maybeSingle()
    if (existingError) return response({ ok: false, code: 'MERGE_FAILED' }, 500)
    let targetLightId = existing?.id as string | undefined
    if (!targetLightId) {
      const { data: inserted, error } = await admin.from('user_drink_lights').insert({
        user_id: target.id, product_id: oldLight.product_id, provisional_drink_id: oldLight.provisional_drink_id,
        first_lit_at: oldLight.first_lit_at, last_activity_at: oldLight.last_activity_at,
      }).select('id').single()
      if (error || !inserted) return response({ ok: false, code: 'MERGE_FAILED' }, 500)
      targetLightId = inserted.id
    } else {
      const { error: updateError } = await admin.from('user_drink_lights').update({
        first_lit_at: new Date(Math.min(Date.parse(existing.first_lit_at), Date.parse(oldLight.first_lit_at))).toISOString(),
        last_activity_at: new Date(Math.max(Date.parse(existing.last_activity_at), Date.parse(oldLight.last_activity_at))).toISOString(),
      }).eq('id', targetLightId)
      if (updateError) return response({ ok: false, code: 'MERGE_FAILED' }, 500)
    }
    for (const venue of oldLight.user_drink_venues ?? []) {
      const { data: existingVenue, error: existingVenueError } = await admin
        .from('user_drink_venues')
        .select('id, source_drink_id, first_drank_at')
        .eq('light_id', targetLightId)
        .eq('tenant_id', venue.tenant_id)
        .maybeSingle()
      if (existingVenueError) return response({ ok: false, code: 'MERGE_FAILED' }, 500)

      const venueWrite = existingVenue
        ? admin.from('user_drink_venues').update({
            source_drink_id: existingVenue.source_drink_id ?? venue.source_drink_id,
            first_drank_at: new Date(Math.min(
              Date.parse(existingVenue.first_drank_at),
              Date.parse(venue.first_drank_at),
            )).toISOString(),
          }).eq('id', existingVenue.id)
        : admin.from('user_drink_venues').insert({
            light_id: targetLightId, user_id: target.id, tenant_id: venue.tenant_id,
            source_drink_id: venue.source_drink_id, first_drank_at: venue.first_drank_at,
          })
      const { error: venueError } = await venueWrite
      if (venueError) return response({ ok: false, code: 'MERGE_FAILED' }, 500)
    }
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(anonymous.id)
  if (deleteError) return response({ ok: false, code: 'CLEANUP_FAILED' }, 500)
  return response({ ok: true })
})
