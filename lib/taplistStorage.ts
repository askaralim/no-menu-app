import type { SupabaseClient } from '@supabase/supabase-js'

export const TAPLIST_MEDIA_BUCKET = 'taplist-media'

/** ADR-013: ~2MB client cap (bucket allows 3MiB) */
export const TAPLIST_IMAGE_MAX_BYTES = 2 * 1024 * 1024

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])

export function sanitizeImageFileName(name: string): string {
  const base = name.replace(/[/\\]/g, '').replace(/\.\./g, '').trim()
  const safe = base.replace(/[^a-zA-Z0-9._-]/g, '_')
  const trimmed = safe.slice(0, 120)
  return trimmed || `image-${Date.now()}.webp`
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
  const { error } = await supabase.storage.from(TAPLIST_MEDIA_BUCKET).upload(objectPath, file, {
    upsert: true,
    contentType: file.type,
  })
  if (error) throw error
  const { data } = supabase.storage.from(TAPLIST_MEDIA_BUCKET).getPublicUrl(objectPath)
  if (!data?.publicUrl) throw new Error('无法生成图片公开 URL')
  return data.publicUrl
}

export async function uploadTaplistCover(
  supabase: SupabaseClient,
  tenantId: string,
  file: File
): Promise<string> {
  const ext = extensionForMime(file.type)
  const base = sanitizeImageFileName(file.name).replace(/\.[^.]+$/, '')
  const path = `${tenantId}/cover/${base}.${ext}`
  return uploadTaplistObject(supabase, path, file)
}

export async function uploadTaplistDrinkImage(
  supabase: SupabaseClient,
  tenantId: string,
  drinkId: string,
  file: File
): Promise<string> {
  const ext = extensionForMime(file.type)
  const base = sanitizeImageFileName(file.name).replace(/\.[^.]+$/, '')
  const path = `${tenantId}/drinks/${drinkId}/${base}.${ext}`
  return uploadTaplistObject(supabase, path, file)
}
