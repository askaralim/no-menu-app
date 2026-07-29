import AsyncStorage from '@react-native-async-storage/async-storage'

const CONSENT_VERSION_KEY = '@taplist/first_launch_consent_v2'

export async function hasCompletedFirstLaunchConsent(): Promise<boolean> {
  const value = await AsyncStorage.getItem(CONSENT_VERSION_KEY)
  return value === '1'
}

export async function completeFirstLaunchConsent(): Promise<void> {
  await AsyncStorage.setItem(CONSENT_VERSION_KEY, '1')
}
