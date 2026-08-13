import Constants from 'expo-constants'
import * as Device from 'expo-device'
import * as Notifications from 'expo-notifications'
import { type Href, router } from 'expo-router'
import { useEffect } from 'react'
import { Linking, Platform } from 'react-native'

import { registerMyPushDevice } from '@/lib/api/barFollows'
import { getTaplistSupabase } from '@/lib/supabase'

export type PushPermissionState = 'unavailable' | 'undetermined' | 'granted' | 'denied'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
})

export async function getPushPermissionState(): Promise<PushPermissionState> {
  if (Platform.OS !== 'ios' || !Device.isDevice) return 'unavailable'
  const permission = await Notifications.getPermissionsAsync()
  if (permission.status === 'granted') return 'granted'
  if (permission.status === 'denied') return 'denied'
  return 'undetermined'
}

export async function enablePushNotifications() {
  if (Platform.OS !== 'ios' || !Device.isDevice) return 'unavailable' as const
  const current = await Notifications.getPermissionsAsync()
  const permission = current.status === 'undetermined'
    ? await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true } })
    : current
  if (permission.status !== 'granted') return 'denied' as const

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId
  if (typeof projectId !== 'string' || !projectId) throw new Error('EAS_PROJECT_ID_MISSING')
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data
  await registerMyPushDevice(token)
  return 'granted' as const
}

export async function syncGrantedPushDevice() {
  if (await getPushPermissionState() !== 'granted') return
  const { data } = await getTaplistSupabase().auth.getSession()
  if (!data.session) return
  try {
    await enablePushNotifications()
  } catch (error) {
    console.warn('Push device sync failed', error)
  }
}

export function openNotificationSettings() {
  return Linking.openSettings()
}

function routeFromNotification(notification: Notifications.Notification) {
  const data = notification.request.content.data
  if (data?.type !== 'new_tap' || typeof data.tenantSlug !== 'string') return
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(data.tenantSlug)) return
  if (typeof data.drinkId === 'string' && /^[0-9a-f-]{36}$/i.test(data.drinkId)) {
    router.push(`/bar/${data.tenantSlug}/beer/${data.drinkId}?fromPush=1` as Href)
    return
  }
  router.push(`/bar/${data.tenantSlug}?fromPush=1` as Href)
}

export function usePushNotificationObserver() {
  useEffect(() => {
    if (Platform.OS !== 'ios') return
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response?.notification) routeFromNotification(response.notification)
    })
    const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      routeFromNotification(response.notification)
    })
    const tokenSubscription = Notifications.addPushTokenListener(() => {
      void syncGrantedPushDevice()
    })
    void syncGrantedPushDevice()
    return () => {
      responseSubscription.remove()
      tokenSubscription.remove()
    }
  }, [])
}
