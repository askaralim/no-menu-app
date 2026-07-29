import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT } from 'npm:jose@5.9.6'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function response(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

const appleIssuer = 'https://appleid.apple.com'
const appleKeys = createRemoteJWKSet(new URL(`${appleIssuer}/auth/keys`))

async function createAppleClientSecret() {
  const teamId = Deno.env.get('APPLE_TEAM_ID')
  const keyId = Deno.env.get('APPLE_KEY_ID')
  const clientId = Deno.env.get('APPLE_CLIENT_ID')
  const privateKey = Deno.env.get('APPLE_PRIVATE_KEY')?.replace(/\\n/g, '\n')
  if (!teamId || !keyId || !clientId || !privateKey) throw new Error('APPLE_SECRETS_MISSING')

  const key = await importPKCS8(privateKey, 'ES256')
  const now = Math.floor(Date.now() / 1000)
  return new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: keyId })
    .setIssuer(teamId)
    .setSubject(clientId)
    .setAudience(appleIssuer)
    .setIssuedAt(now)
    .setExpirationTime(now + 300)
    .sign(key)
}

async function revokeAppleAuthorization(authorizationCode: string, expectedAppleUserId: string) {
  const clientId = Deno.env.get('APPLE_CLIENT_ID')
  if (!clientId) throw new Error('APPLE_SECRETS_MISSING')
  const clientSecret = await createAppleClientSecret()

  const tokenResponse = await fetch(`${appleIssuer}/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code: authorizationCode,
      grant_type: 'authorization_code',
    }),
  })
  const tokenData = await tokenResponse.json().catch(() => null) as {
    access_token?: string
    refresh_token?: string
    id_token?: string
  } | null
  if (!tokenResponse.ok || !tokenData?.id_token) throw new Error('APPLE_TOKEN_EXCHANGE_FAILED')
  const { payload } = await jwtVerify(tokenData.id_token, appleKeys, {
    issuer: appleIssuer,
    audience: clientId,
  })
  if (payload.sub !== expectedAppleUserId) throw new Error('APPLE_USER_MISMATCH')

  const token = tokenData.refresh_token ?? tokenData.access_token
  if (!token) throw new Error('APPLE_TOKEN_MISSING')
  const revokeResponse = await fetch(`${appleIssuer}/auth/revoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      token,
      token_type_hint: tokenData.refresh_token ? 'refresh_token' : 'access_token',
    }),
  })
  if (!revokeResponse.ok) throw new Error('APPLE_REVOCATION_FAILED')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return response({ ok: false, code: 'METHOD_NOT_ALLOWED' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const authorization = req.headers.get('Authorization')
  const body = await req.json().catch(() => ({})) as { appleAuthorizationCode?: string }
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !authorization) {
    return response({ ok: false, code: 'UNAUTHORIZED' }, 401)
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: userData, error: userError } = await userClient.auth.getUser()
  if (userError || !userData.user) return response({ ok: false, code: 'UNAUTHORIZED' }, 401)

  const appleIdentity = userData.user.identities?.find((identity) => identity.provider === 'apple')
  if (appleIdentity) {
    if (!body.appleAuthorizationCode) return response({ ok: false, code: 'APPLE_REAUTH_REQUIRED' }, 400)
    try {
      const appleSubject = typeof appleIdentity.identity_data?.sub === 'string'
        ? appleIdentity.identity_data.sub
        : appleIdentity.id
      await revokeAppleAuthorization(body.appleAuthorizationCode, appleSubject)
    } catch (error) {
      console.error('apple authorization revocation failed', error instanceof Error ? error.message : error)
      return response({ ok: false, code: 'APPLE_REVOCATION_FAILED' }, 502)
    }
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error } = await admin.auth.admin.deleteUser(userData.user.id)
  if (error) {
    console.error('delete user failed', error)
    return response({ ok: false, code: 'DELETE_FAILED' }, 500)
  }
  return response({ ok: true })
})
