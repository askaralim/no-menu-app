import { supabase } from './supabase'
import { assertImageAsset, type LocalImageAsset } from './taplistMedia'

const AI_API_BASE_URL = (process.env.EXPO_PUBLIC_AI_API_BASE_URL || 'https://nomenuapp.com')
  .replace(/\/+$/, '')
const RECOGNITION_TIMEOUT_MS = 75_000

export type BeerLabelDraft = {
  name: string | null
  nameCn?: string | null
  nameEn?: string | null
  beerStyle: string | null
  abv: number | null
  brewery: string | null
  collabBreweries: string[]
}

type RecognitionResponse = {
  results?: BeerLabelDraft[]
  message?: string
}

function recognitionError(status: number, body: RecognitionResponse | null): Error {
  if (status === 401) return new Error('登录已过期，请重新登录')
  if (status === 403) return new Error('当前账号没有酒款识别权限')
  if (status === 429) return new Error('识别请求较多，请稍后重试')
  return new Error(body?.message || '图片识别暂时不可用，请稍后重试')
}

export async function recognizeBeerLabel(
  asset: LocalImageAsset,
  externalSignal?: AbortSignal,
): Promise<BeerLabelDraft> {
  const mediaType = assertImageAsset(asset)
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  const accessToken = data.session?.access_token
  if (!accessToken) throw new Error('登录已过期，请重新登录')

  const imageResponse = await fetch(asset.uri)
  if (!imageResponse.ok) throw new Error('无法读取所选图片')
  const bytes = await imageResponse.arrayBuffer()

  const controller = new AbortController()
  const cancel = () => controller.abort()
  externalSignal?.addEventListener('abort', cancel, { once: true })
  const timeout = setTimeout(() => controller.abort(), RECOGNITION_TIMEOUT_MS)
  try {
    const response = await fetch(`${AI_API_BASE_URL}/api/ai/images/beer-labels`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': mediaType,
      },
      body: bytes,
      signal: controller.signal,
    })
    const body = await response.json().catch(() => null) as RecognitionResponse | null
    if (!response.ok) throw recognitionError(response.status, body)
    const result = body?.results?.[0]
    if (!result) throw new Error('没有识别到酒款信息，请手动填写或换一张图片')
    const normalized: BeerLabelDraft = {
      ...result,
      nameCn: result.nameCn?.trim() || null,
      nameEn: result.nameEn?.trim() || null,
      name: result.nameCn?.trim() || result.nameEn?.trim() || result.name?.trim() || null,
      beerStyle: result.beerStyle?.trim() || null,
      brewery: result.brewery?.trim() || null,
      collabBreweries: (result.collabBreweries ?? []).map((name) => name.trim()).filter(Boolean),
    }
    const hasUsefulResult = Boolean(
      normalized.name ||
      normalized.beerStyle ||
      normalized.brewery ||
      normalized.abv != null ||
      normalized.collabBreweries.length > 0,
    )
    if (!hasUsefulResult) throw new Error('没有识别到有效酒款信息，请手动填写或换一张图片')
    return normalized
  } catch (error) {
    if ((error as { name?: string })?.name === 'AbortError') {
      if (externalSignal?.aborted) throw error
      throw new Error('图片识别超时，请稍后重试')
    }
    throw error
  } finally {
    clearTimeout(timeout)
    externalSignal?.removeEventListener('abort', cancel)
  }
}
