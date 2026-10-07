import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ ok: false, code: 'METHOD_NOT_ALLOWED' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const authorization = req.headers.get('Authorization')
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !authorization) {
    return json({ ok: false, code: 'UNAUTHORIZED' }, 401)
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: userData, error: userError } = await userClient.auth.getUser()
  if (userError || !userData.user) return json({ ok: false, code: 'UNAUTHORIZED' }, 401)

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: roles, error: rolesError } = await admin
    .from('user_roles')
    .select('role')
    .eq('user_id', userData.user.id)
    .eq('role', 'super_admin')
    .limit(1)
  if (rolesError || !roles?.length) return json({ ok: false, code: 'FORBIDDEN' }, 403)

  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  const sourceUserId = typeof body?.sourceUserId === 'string' ? body.sourceUserId : ''
  const targetUserId = typeof body?.targetUserId === 'string' ? body.targetUserId : ''
  const keepUsername = body?.keepUsername === 'source' ? 'source' : body?.keepUsername === 'target' ? 'target' : ''
  if (!sourceUserId || !targetUserId || !keepUsername) {
    return json({ ok: false, code: 'INVALID_INPUT' }, 400)
  }

  const { data: previousAudit, error: auditLookupError } = await admin
    .from('consumer_account_merge_audits')
    .select('operation_id, cleanup_status')
    .eq('source_user_id', sourceUserId)
    .eq('target_user_id', targetUserId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (auditLookupError) return json({ ok: false, code: 'AUDIT_LOOKUP_FAILED' }, 500)

  const requestedOperationId = typeof body?.operationId === 'string' ? body.operationId : ''
  const operationId = previousAudit?.operation_id ?? (requestedOperationId || crypto.randomUUID())

  const { data: merge, error: mergeError } = await admin.rpc('admin_merge_consumer_accounts', {
    p_source_user_id: sourceUserId,
    p_target_user_id: targetUserId,
    p_keep_username: keepUsername,
    p_operation_id: operationId,
  })
  if (mergeError || !merge?.ok) {
    console.error('consumer account merge failed', mergeError)
    return json({ ok: false, code: mergeError?.message ?? 'MERGE_FAILED', operationId }, 409)
  }

  const deleteError = previousAudit?.cleanup_status === 'completed'
    ? null
    : (await admin.auth.admin.deleteUser(sourceUserId)).error
  await admin.from('consumer_account_merge_audits').update({
    cleanup_status: deleteError ? 'failed' : 'completed',
    cleanup_error: deleteError?.message ?? null,
    completed_at: new Date().toISOString(),
  }).eq('operation_id', operationId)

  if (deleteError) {
    console.error('merged source cleanup failed', deleteError)
    return json({ ok: false, code: 'SOURCE_CLEANUP_FAILED', operationId, merge }, 500)
  }
  return json({ ok: true, operationId, merge })
})
