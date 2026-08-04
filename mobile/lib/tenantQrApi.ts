import { supabase } from './supabase'
import { TAPLIST_MEDIA_BUCKET } from './taplistMedia'

export type TenantQrLink = {
  qr_code: string
  short_url: string
  image_path: string
  placement: string
  version: number
  image_url: string
}

const PUBLIC_SITE = 'https://nomenuapp.com'

/** Public taplist URL shared from No Menu Tonight (not the permanent QR short link). */
export function buildMerchantShareTaplistUrl(slug: string): string {
  const s = slug.trim()
  return `${PUBLIC_SITE}/bar/${s}?source=merchant_share&placement=tonight`
}

export async function getMyTenantQr(
  tenantId: string,
  placement = 'venue',
): Promise<TenantQrLink | null> {
  const { data, error } = await supabase.rpc('get_my_tenant_qr', {
    p_tenant_id: tenantId,
    p_placement: placement,
  })
  if (error) throw new Error(error.message || '加载门店二维码失败')
  if (data == null) return null

  const row = data as {
    qr_code?: string
    short_url?: string
    image_path?: string
    placement?: string
    version?: number
  }

  if (!row.qr_code || !row.image_path) return null

  const { data: pub } = supabase.storage.from(TAPLIST_MEDIA_BUCKET).getPublicUrl(row.image_path)
  const image_url = pub?.publicUrl
  if (!image_url) throw new Error('无法生成二维码图片地址')

  return {
    qr_code: row.qr_code,
    short_url: row.short_url || `${PUBLIC_SITE}/q/${row.qr_code}`,
    image_path: row.image_path,
    placement: row.placement || placement,
    version: typeof row.version === 'number' ? row.version : 1,
    image_url,
  }
}
