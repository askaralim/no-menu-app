import { RequestError } from './upload-request.js'

async function parseJson(response) {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

export function createSupabaseAuthorizer(config, fetchImpl = fetch) {
  const headersFor = (accessToken) => ({
    apikey: config.supabaseAnonKey,
    Authorization: `Bearer ${accessToken}`,
  })

  return async function authorizeTenant(accessToken, tenantId) {
    const userResponse = await fetchImpl(`${config.supabaseUrl}/auth/v1/user`, {
      headers: headersFor(accessToken),
      signal: AbortSignal.timeout(8_000),
    })
    if (!userResponse.ok) {
      throw new RequestError(401, 'unauthorized', '登录已过期，请重新登录')
    }

    const user = await parseJson(userResponse)
    if (!user?.id) {
      throw new RequestError(401, 'unauthorized', '登录凭证无效')
    }

    const tenantResponse = await fetchImpl(`${config.supabaseUrl}/rest/v1/rpc/get_my_tenants`, {
      method: 'POST',
      headers: {
        ...headersFor(accessToken),
        'Content-Type': 'application/json',
      },
      body: '{}',
      signal: AbortSignal.timeout(8_000),
    })
    if (!tenantResponse.ok) {
      throw new RequestError(502, 'tenant_lookup_failed', '无法验证门店权限')
    }

    const tenants = await parseJson(tenantResponse)
    let allowed = Array.isArray(tenants) && tenants.some((tenant) =>
      String(tenant?.tenant_id || '').toLowerCase() === tenantId,
    )

    // Platform super admins are intentionally linked only to the internal
    // __platform__ tenant, which get_my_tenants excludes. Reuse the database's
    // existing authorization helper for that established access path.
    if (!allowed) {
      const accessResponse = await fetchImpl(
        `${config.supabaseUrl}/rest/v1/rpc/taplist_can_view_tenant`,
        {
          method: 'POST',
          headers: {
            ...headersFor(accessToken),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ p_tenant_id: tenantId }),
          signal: AbortSignal.timeout(8_000),
        },
      )
      if (!accessResponse.ok) {
        throw new RequestError(502, 'tenant_lookup_failed', '无法验证门店权限')
      }
      allowed = (await parseJson(accessResponse)) === true
    }

    if (!allowed) {
      throw new RequestError(403, 'forbidden', '没有该门店的图片上传权限')
    }

    return { userId: user.id }
  }
}

export function createSupabaseProductService(config, fetchImpl = fetch) {
  const headersFor = (accessToken) => ({
    apikey: config.supabaseAnonKey,
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  })

  return {
    async authorizeAdmin(accessToken) {
      const response = await fetchImpl(`${config.supabaseUrl}/rest/v1/rpc/is_super_admin`, {
        method: 'POST',
        headers: headersFor(accessToken),
        body: '{}',
        signal: AbortSignal.timeout(8_000),
      })
      if (!response.ok || (await parseJson(response)) !== true) {
        throw new RequestError(403, 'forbidden', '只有平台管理员可以归档商品图片')
      }
    },

    async setProductImage(accessToken, productId, imageUrl) {
      const response = await fetchImpl(`${config.supabaseUrl}/rest/v1/rpc/admin_set_drink_product_image`, {
        method: 'POST',
        headers: headersFor(accessToken),
        body: JSON.stringify({ p_product_id: productId, p_image_url: imageUrl }),
        signal: AbortSignal.timeout(8_000),
      })
      if (!response.ok) {
        const error = await parseJson(response)
        throw new RequestError(400, 'product_image_update_failed', error?.message || '无法更新商品池图片')
      }
    },

    async setTenantCover(accessToken, tenantId, imageUrl) {
      const response = await fetchImpl(`${config.supabaseUrl}/rest/v1/rpc/admin_set_tenant_cover_image`, {
        method: 'POST',
        headers: headersFor(accessToken),
        body: JSON.stringify({ p_tenant_id: tenantId, p_image_url: imageUrl }),
        signal: AbortSignal.timeout(8_000),
      })
      if (!response.ok) {
        const error = await parseJson(response)
        throw new RequestError(400, 'tenant_cover_update_failed', error?.message || '无法更新店铺封面')
      }
    },
  }
}
