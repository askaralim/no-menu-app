export type PushPermissionState = 'unavailable' | 'undetermined' | 'granted' | 'denied'

export async function getPushPermissionState(): Promise<PushPermissionState> {
  return 'unavailable'
}

export async function enablePushNotifications() {
  return 'unavailable' as const
}

export async function syncGrantedPushDevice() {}

export async function openNotificationSettings() {}

export function usePushNotificationObserver() {}
