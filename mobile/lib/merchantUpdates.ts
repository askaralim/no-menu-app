import AsyncStorage from '@react-native-async-storage/async-storage'
import type { UserRole } from './types'

export const MERCHANT_UPDATE_STORAGE_KEY = 'nomenu.merchantUpdates.seen.v1'

export type MerchantUpdate = {
  id: string
  audience: UserRole[]
  title: string
  summary: string
  bullets: string[]
  ctaLabel: string
  ctaHref: string
}

export const MERCHANT_UPDATES: MerchantUpdate[] = [
  {
    id: 'merchant-2026-10-31-tap-lifecycle',
    audience: ['owner', 'staff', 'super_admin'],
    title: '酒头周期与换桶记录',
    summary: '现在可以按真实操作回看每款酒的在枪周期，并记录同一款酒每次换桶。',
    bullets: [
      '上枪开始周期，换酒、下枪或售罄结束周期',
      '同款酒换桶时保留在枪周期，同时记录每一桶',
      '售罄后恢复供应，可直接开始或换桶后开始新周期',
      '历史起点不完整会明确标注，操作记录可继续加载',
    ],
    ctaLabel: '查看酒头数据',
    ctaHref: '/(tabs)/house/tap-data',
  },
]

export function latestMerchantUpdate(role: UserRole | null | undefined): MerchantUpdate | null {
  if (!role) return null
  for (let index = MERCHANT_UPDATES.length - 1; index >= 0; index -= 1) {
    const update = MERCHANT_UPDATES[index]
    if (update.audience.includes(role)) return update
  }
  return null
}

function parseSeenMap(raw: string | null): Record<string, string> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const seen: Record<string, string> = {}
    for (const [userId, updateId] of Object.entries(parsed)) {
      if (userId && typeof updateId === 'string') seen[userId] = updateId
    }
    return seen
  } catch {
    return {}
  }
}

async function readSeenMap(): Promise<Record<string, string>> {
  try {
    return parseSeenMap(await AsyncStorage.getItem(MERCHANT_UPDATE_STORAGE_KEY))
  } catch {
    return {}
  }
}

export async function getUnseenMerchantUpdate(
  userId: string | null | undefined,
  role: UserRole | null | undefined,
): Promise<MerchantUpdate | null> {
  if (!userId) return null
  const update = latestMerchantUpdate(role)
  if (!update) return null
  const seen = await readSeenMap()
  return seen[userId] === update.id ? null : update
}

export async function markMerchantUpdateSeen(
  userId: string | null | undefined,
  updateId: string | null | undefined,
): Promise<boolean> {
  if (!userId || !updateId) return false
  try {
    const seen = await readSeenMap()
    seen[userId] = updateId
    await AsyncStorage.setItem(MERCHANT_UPDATE_STORAGE_KEY, JSON.stringify(seen))
    return true
  } catch {
    return false
  }
}
