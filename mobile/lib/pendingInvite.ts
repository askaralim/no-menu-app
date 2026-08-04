import AsyncStorage from '@react-native-async-storage/async-storage'

const PENDING_INVITE_KEY = 'nomenu.pendingInviteCode'

export async function savePendingInviteCode(code: string): Promise<void> {
  const trimmed = code.trim()
  if (!trimmed) return
  await AsyncStorage.setItem(PENDING_INVITE_KEY, trimmed)
}

export async function peekPendingInviteCode(): Promise<string | null> {
  return AsyncStorage.getItem(PENDING_INVITE_KEY)
}

export async function clearPendingInviteCode(): Promise<void> {
  await AsyncStorage.removeItem(PENDING_INVITE_KEY)
}

export async function takePendingInviteCode(): Promise<string | null> {
  const code = await peekPendingInviteCode()
  if (code) await clearPendingInviteCode()
  return code
}
