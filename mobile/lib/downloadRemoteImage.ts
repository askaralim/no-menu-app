import * as FileSystem from 'expo-file-system'

/**
 * Download a remote image into the cache directory and return a local file URI.
 */
export async function downloadRemoteImageToCache(
  remoteUrl: string,
  fileName: string,
): Promise<string> {
  const base = FileSystem.cacheDirectory
  if (!base) throw new Error('无法访问本地缓存目录')

  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_') || `image-${Date.now()}.png`
  const dest = `${base}${safeName}`

  const result = await FileSystem.downloadAsync(remoteUrl, dest)
  if (result.status !== 200) {
    throw new Error(`下载失败（${result.status}）`)
  }
  return result.uri
}
