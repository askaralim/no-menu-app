import { supabase } from './supabase'

export const TAPLIST_MEDIA_BUCKET = 'taplist-media'

/** Align with web Admin ADR-013 (~2MB client cap; bucket allows 3MiB). */
export const TAPLIST_IMAGE_MAX_BYTES = 2 * 1024 * 1024

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])

export type LocalImageAsset = {
  uri: string
  mimeType?: string | null
  fileName?: string | null
  fileSize?: number | null
}

function sanitizeImageFileName(name: string): string {
  const base = name.replace(/[/\\]/g, '').replace(/\.\./g, '').trim()
  const safe = base.replace(/[^a-zA-Z0-9._-]/g, '_')
  const trimmed = safe.slice(0, 120)
  return trimmed || `image-${Date.now()}.jpg`
}

function extensionForMime(mime: string): string {
  if (mime === 'image/png') return 'png'
  if (mime === 'image/webp') return 'webp'
  return 'jpg'
}

function normalizeMime(mime: string | null | undefined, fileName?: string | null): string {
  const raw = (mime || '').toLowerCase().trim()
  if (ALLOWED_MIME.has(raw)) return raw
  if (raw === 'image/jpg') return 'image/jpeg'

  const lower = (fileName || '').toLowerCase()
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'

  // ImagePicker with quality usually yields JPEG; default when type is missing.
  return 'image/jpeg'
}

export function assertImageAsset(asset: LocalImageAsset, maxBytes = TAPLIST_IMAGE_MAX_BYTES): string {
  const mime = normalizeMime(asset.mimeType, asset.fileName)
  if (!ALLOWED_MIME.has(mime)) {
    throw new Error('仅支持 JPEG、PNG、WebP 图片')
  }
  if (asset.fileSize != null && asset.fileSize > maxBytes) {
    throw new Error(
      `图片不能超过 ${Math.round(maxBytes / 1024 / 1024)}MB，请换一张或压缩后再传`,
    )
  }
  return mime
}

async function readAssetBytes(uri: string): Promise<ArrayBuffer> {
  const res = await fetch(uri)
  if (!res.ok) throw new Error('无法读取所选图片')
  return res.arrayBuffer()
}

async function uploadTaplistImageFromAsset(
  path: string,
  asset: LocalImageAsset,
): Promise<string> {
  const mime = assertImageAsset(asset)
  const bytes = await readAssetBytes(asset.uri)
  if (bytes.byteLength > TAPLIST_IMAGE_MAX_BYTES) {
    throw new Error(
      `图片不能超过 ${Math.round(TAPLIST_IMAGE_MAX_BYTES / 1024 / 1024)}MB，请换一张或压缩后再传`,
    )
  }

  const { error } = await supabase.storage.from(TAPLIST_MEDIA_BUCKET).upload(path, bytes, {
    upsert: true,
    contentType: mime,
  })
  if (error) throw new Error(error.message || '图片上传失败')

  const { data } = supabase.storage.from(TAPLIST_MEDIA_BUCKET).getPublicUrl(path)
  if (!data?.publicUrl) throw new Error('无法生成图片公开 URL')
  return data.publicUrl
}

/**
 * Upload a local gallery image to taplist-media and return its public URL.
 * Path: {tenantId}/drinks/{drinkId}/{file}
 */
export async function uploadDrinkImageFromAsset(
  tenantId: string,
  drinkId: string,
  asset: LocalImageAsset,
): Promise<string> {
  const mime = assertImageAsset(asset)
  const ext = extensionForMime(mime)
  const base = sanitizeImageFileName(asset.fileName || `drink-${Date.now()}`).replace(/\.[^.]+$/, '')
  const path = `${tenantId}/drinks/${drinkId}/${base}.${ext}`
  return uploadTaplistImageFromAsset(path, asset)
}

/**
 * Path: {tenantId}/events/{eventId}/{file}
 */
export async function uploadEventImageFromAsset(
  tenantId: string,
  eventId: string,
  asset: LocalImageAsset,
): Promise<string> {
  const mime = assertImageAsset(asset)
  const ext = extensionForMime(mime)
  const base = sanitizeImageFileName(asset.fileName || `event-${Date.now()}`).replace(/\.[^.]+$/, '')
  const path = `${tenantId}/events/${eventId}/${base}.${ext}`
  return uploadTaplistImageFromAsset(path, asset)
}
