import type { SupabaseClient } from '@supabase/supabase-js'

export const TAPLIST_MEDIA_BUCKET = 'taplist-media'

/** ADR-013: ~2MB client cap (bucket allows 3MiB) */
export const TAPLIST_IMAGE_MAX_BYTES = 2 * 1024 * 1024

const MEDIA_API_BASE_URL = (process.env.NEXT_PUBLIC_MEDIA_API_BASE_URL || 'https://nomenuapp.com')
  .replace(/\/+$/, '')

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])

function createUploadId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

export function assertImageFile(file: File, maxBytes = TAPLIST_IMAGE_MAX_BYTES): void {
  if (!ALLOWED_MIME.has(file.type)) {
    throw new Error('仅支持 JPEG、PNG、WebP 图片')
  }
  if (file.size > maxBytes) {
    throw new Error(`图片不能超过 ${Math.round(maxBytes / 1024 / 1024)}MB`)
  }
}

function extensionForMime(mime: string): string {
  if (mime === 'image/png') return 'png'
  if (mime === 'image/webp') return 'webp'
  return 'jpg'
}

async function uploadTaplistObject(
  supabase: SupabaseClient,
  objectPath: string,
  file: File
): Promise<string> {
  assertImageFile(file)
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  if (sessionError) throw sessionError
  const accessToken = sessionData.session?.access_token
  if (!accessToken) throw new Error('登录已过期，请重新登录')

  const signingResponse = await fetch(`${MEDIA_API_BASE_URL}/api/media/upload-url`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      tenantId: objectPath.split('/')[2],
      objectPath,
      contentType: file.type,
      contentLength: file.size,
    }),
  })
  const signingBody = await signingResponse.json().catch(() => null) as {
    uploadUrl?: string
    cdnUrl?: string
    requiredHeaders?: Record<string, string>
    message?: string
  } | null
  if (!signingResponse.ok || !signingBody?.uploadUrl || !signingBody.cdnUrl) {
    throw new Error(signingBody?.message || '无法生成图片上传地址')
  }

  const uploadResponse = await fetch(signingBody.uploadUrl, {
    method: 'PUT',
    headers: signingBody.requiredHeaders || { 'Content-Type': file.type },
    body: file,
  })
  if (!uploadResponse.ok) throw new Error('图片上传失败，请稍后再试')
  return signingBody.cdnUrl
}

export async function uploadTaplistCover(
  supabase: SupabaseClient,
  tenantId: string,
  file: File
): Promise<string> {
  const ext = extensionForMime(file.type)
  const path = `prod/tenants/${tenantId}/covers/${createUploadId()}.${ext}`
  return uploadTaplistObject(supabase, path, file)
}

export async function uploadTaplistDrinkImage(
  supabase: SupabaseClient,
  tenantId: string,
  drinkId: string,
  file: File
): Promise<string> {
  const ext = extensionForMime(file.type)
  const path = `prod/tenants/${tenantId}/drinks/${drinkId}/${createUploadId()}.${ext}`
  return uploadTaplistObject(supabase, path, file)
}

export async function uploadTaplistEventImage(
  supabase: SupabaseClient,
  tenantId: string,
  eventId: string,
  file: File
): Promise<string> {
  const ext = extensionForMime(file.type)
  const path = `prod/events/${tenantId}/${eventId}/${createUploadId()}.${ext}`
  return uploadTaplistObject(supabase, path, file)
}
