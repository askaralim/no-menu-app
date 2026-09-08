export type OssImageStyle = 'nm-thumb' | 'nm-card' | 'nm-detail' | 'nm-cover' | 'nm-poster'

const OSS_CDN_HOST = 'img.nomenuapp.com'

export function withOssImageStyle(url: string | null | undefined, style: OssImageStyle): string | null {
  const value = url?.trim()
  if (!value) return null

  try {
    const parsed = new URL(value)
    if (parsed.hostname !== OSS_CDN_HOST) return value
    parsed.searchParams.set('x-oss-process', `style/${style}`)
    return parsed.toString()
  } catch {
    return value
  }
}
