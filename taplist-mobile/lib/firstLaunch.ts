import AsyncStorage from '@react-native-async-storage/async-storage'

const STORAGE_KEY = '@taplist/legal_ack_v1'

export async function hasAcknowledgedLegalNotice(): Promise<boolean> {
  const value = await AsyncStorage.getItem(STORAGE_KEY)
  return value === '1'
}

export async function setAcknowledgedLegalNotice(): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, '1')
}
