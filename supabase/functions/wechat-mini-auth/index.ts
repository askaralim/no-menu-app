import { createClient, type Session } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type WechatSession = {
  openid?: string
  unionid?: string
  session_key?: string
  errcode?: number
  errmsg?: string
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ ok: false, code: 'METHOD_NOT_ALLOWED' }, 405)

  const body = await req.json().catch(() => null) as { code?: unknown } | null
  const code = typeof body?.code === 'string' ? body.code.trim() : ''
  if (code.length < 6 || code.length > 256) return json({ ok: false, code: 'INVALID_CODE' }, 400)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const appId = Deno.env.get('WECHAT_MINI_APP_ID')
  const appSecret = Deno.env.get('WECHAT_MINI_APP_SECRET')
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !appId || !appSecret) {
    console.error('wechat mini auth environment is incomplete')
    return json({ ok: false, code: 'SERVICE_UNAVAILABLE' }, 503)
  }

  const wechatUrl = new URL('https://api.weixin.qq.com/sns/jscode2session')
  wechatUrl.searchParams.set('appid', appId)
  wechatUrl.searchParams.set('secret', appSecret)
  wechatUrl.searchParams.set('js_code', code)
  wechatUrl.searchParams.set('grant_type', 'authorization_code')

  let wechat: WechatSession
  try {
    const response = await fetch(wechatUrl)
    wechat = await response.json() as WechatSession
    if (!response.ok || wechat.errcode || !wechat.openid) {
      console.warn('wechat code2Session rejected', { errcode: wechat.errcode, errmsg: wechat.errmsg })
      return json({ ok: false, code: 'WECHAT_CODE_REJECTED' }, 401)
    }
  } catch (error) {
    console.error('wechat code2Session failed', error instanceof Error ? error.message : error)
    return json({ ok: false, code: 'WECHAT_UNAVAILABLE' }, 502)
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const publicClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  async function sessionForEmail(email: string): Promise<Session> {
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
    })
    const tokenHash = linkData?.properties?.hashed_token
    if (linkError || !tokenHash) throw new Error('SESSION_LINK_FAILED')
    const { data, error } = await publicClient.auth.verifyOtp({ token_hash: tokenHash, type: 'email' })
    if (error || !data.session) throw new Error('SESSION_VERIFY_FAILED')
    return data.session
  }

  async function sessionForUser(userId: string): Promise<Session> {
    const { data, error } = await admin.auth.admin.getUserById(userId)
    if (error || !data.user?.email) throw new Error('ACCOUNT_EMAIL_UNAVAILABLE')
    return sessionForEmail(data.user.email)
  }

  try {
    const { data: identity, error: identityError } = await admin
      .from('consumer_wechat_identities')
      .select('id, user_id')
      .eq('app_id', appId)
      .eq('openid', wechat.openid)
      .maybeSingle()
    if (identityError) throw identityError

    let session: Session
    let identityId = identity?.id as string | undefined
    if (identity?.user_id) {
      session = await sessionForUser(identity.user_id)
    } else {
      const emailHash = await sha256(`${appId}:${wechat.openid}`)
      session = await sessionForEmail(`wm_${emailHash}@wechat.nomenu.invalid`)
      const { data: inserted, error: insertError } = await admin
        .from('consumer_wechat_identities')
        .insert({
          app_id: appId,
          openid: wechat.openid,
          unionid: wechat.unionid ?? null,
          user_id: session.user.id,
        })
        .select('id')
        .single()

      if (insertError || !inserted) {
        const { data: winner, error: winnerError } = await admin
          .from('consumer_wechat_identities')
          .select('id, user_id')
          .eq('app_id', appId)
          .eq('openid', wechat.openid)
          .single()
        if (winnerError || !winner) throw insertError ?? winnerError ?? new Error('IDENTITY_CREATE_FAILED')
        if (winner.user_id !== session.user.id) {
          await admin.auth.admin.deleteUser(session.user.id).catch(() => undefined)
          session = await sessionForUser(winner.user_id)
        }
        identityId = winner.id
      } else {
        identityId = inserted.id
      }
    }

    if (identityId) {
      await admin.from('consumer_wechat_identities').update({
        unionid: wechat.unionid ?? null,
        updated_at: new Date().toISOString(),
        last_login_at: new Date().toISOString(),
      }).eq('id', identityId)
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${session.access_token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: profile, error: profileError } = await userClient.rpc('get_my_consumer_profile')
    if (profileError) throw profileError

    return json({
      ok: true,
      session: {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_at: session.expires_at,
        expires_in: session.expires_in,
        token_type: session.token_type,
        user: { id: session.user.id },
      },
      profile,
    })
  } catch (error) {
    const code = error instanceof Error ? error.message : 'LOGIN_FAILED'
    console.error('wechat mini auth failed', code)
    return json({ ok: false, code: /^[A-Z0-9_]+$/.test(code) ? code : 'LOGIN_FAILED' }, 500)
  }
})
