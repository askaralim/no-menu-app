import FontAwesome from '@expo/vector-icons/FontAwesome'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { router, useFocusEffect } from 'expo-router'
import { useCallback, useState } from 'react'
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { BackButton } from '@/components/taplist/BackButton'
import { CachedImage } from '@/components/taplist/CachedImage'
import { palette, spacing, typography } from '@/constants/design'
import { getMyFollowedBars, setBarNewTapNotifications, unfollowBar } from '@/lib/api/barFollows'
import { enablePushNotifications, getPushPermissionState, openNotificationSettings } from '@/lib/pushNotifications'
import { getTaplistSupabase } from '@/lib/supabase'
import type { FollowedBarRow } from '@/lib/types'

export default function FollowedBarsScreen() {
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()
  const [busyState, setBusyState] = useState<{ tenantId: string; action: 'notification' | 'unfollow' } | null>(null)
  const sessionQuery = useQuery({
    queryKey: ['drink-log', 'session'],
    queryFn: async () => (await getTaplistSupabase().auth.getSession()).data.session,
  })
  const barsQuery = useQuery({
    queryKey: ['bar-follows'],
    queryFn: getMyFollowedBars,
    enabled: Platform.OS === 'ios' && Boolean(sessionQuery.data),
  })

  useFocusEffect(useCallback(() => {
    void sessionQuery.refetch()
    if (sessionQuery.data) void barsQuery.refetch()
  }, [barsQuery.refetch, sessionQuery.data, sessionQuery.refetch]))

  const updateNotification = async (bar: FollowedBarRow) => {
    if (busyState) return
    setBusyState({ tenantId: bar.tenant_id, action: 'notification' })
    try {
      if (bar.notify_new_taps) {
        await setBarNewTapNotifications(bar.tenant_id, false)
      } else {
        const permission = await getPushPermissionState()
        if (permission === 'denied') {
          Alert.alert('通知尚未开启', '请先在 iOS 系统设置中允许 No Menu 发送通知。', [
            { text: '取消', style: 'cancel' },
            { text: '前往设置', onPress: () => void openNotificationSettings() },
          ])
          return
        }
        if (await enablePushNotifications() !== 'granted') return
        await setBarNewTapNotifications(bar.tenant_id, true)
      }
      await queryClient.invalidateQueries({ queryKey: ['bar-follows'] })
      await queryClient.invalidateQueries({ queryKey: ['bar-follow', bar.tenant_id] })
    } catch (error) {
      console.warn('Update bar notification failed', error)
      Alert.alert('设置失败', '请稍后重试')
    } finally {
      setBusyState(null)
    }
  }

  const removeFollow = (bar: FollowedBarRow) => {
    Alert.alert('取消关注这家酒吧？', '取消后将不再收到这家酒吧的上新通知。', [
      { text: '保留关注', style: 'cancel' },
      {
        text: '取消关注',
        style: 'destructive',
        onPress: async () => {
          setBusyState({ tenantId: bar.tenant_id, action: 'unfollow' })
          try {
            await unfollowBar(bar.tenant_id)
            await queryClient.invalidateQueries({ queryKey: ['bar-follows'] })
            queryClient.setQueryData(['bar-follow', bar.tenant_id], {
              ok: true, followed: false, notify_new_taps: false, followed_at: null,
            })
          } catch (error) {
            console.warn('Unfollow bar failed', error)
            Alert.alert('暂时无法取消关注', '请稍后重试')
          } finally {
            setBusyState(null)
          }
        },
      },
    ])
  }

  const bars = barsQuery.data ?? []
  return (
    <View style={styles.screen}>
      <BackButton />
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 14 }]}>
        <View style={styles.headerRow}>
          <View style={styles.backButtonSpace} />
          <View style={styles.headerCopy}>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82} style={styles.followCount}>
              已关注 {bars.length} 家 · 仅自己可见
            </Text>
            <Text style={styles.intro}>关闭通知不会取消关注</Text>
          </View>
        </View>

        {sessionQuery.isLoading || barsQuery.isLoading ? (
          <ActivityIndicator color={palette.amber} style={styles.loading} />
        ) : barsQuery.isError ? (
          <View style={styles.empty}><Text style={styles.emptyTitle}>暂时无法加载</Text><Text style={styles.emptyBody}>请稍后重试。</Text></View>
        ) : bars.length === 0 ? (
          <View style={styles.empty}><Text style={styles.emptyTitle}>还没有关注酒吧</Text><Text style={styles.emptyBody}>在酒吧详情页点“关注”，它就会出现在这里。</Text></View>
        ) : (
          <View style={styles.list}>
            {bars.map((bar) => {
              const busy = busyState?.tenantId === bar.tenant_id
              const updatingNotification = busy && busyState.action === 'notification'
              const removingFollow = busy && busyState.action === 'unfollow'
              return (
                <View key={bar.tenant_id} style={[styles.row, removingFollow && styles.rowBusy]}>
                  <Pressable
                    accessibilityRole="link"
                    onPress={() => router.push(`/bar/${bar.tenant_slug}`)}
                    style={({ pressed }) => [styles.barLink, pressed && styles.pressed]}>
                    <View style={styles.artSlot}>
                      {bar.cover_image_url ? <CachedImage source={bar.cover_image_url} style={styles.art} /> : null}
                    </View>
                    <View style={styles.copy}>
                      <Text style={styles.barName} numberOfLines={1}>{bar.tenant_display_name}</Text>
                      <Text style={styles.meta} numberOfLines={1}>
                      {bar.tenant_district || '上海'} · {bar.notify_new_taps ? '通知已开启' : '通知已关闭'}
                      </Text>
                    </View>
                  </Pressable>
                  <Pressable
                    accessibilityRole="switch"
                    accessibilityState={{ checked: bar.notify_new_taps, disabled: busy }}
                    disabled={busy}
                    onPress={() => void updateNotification(bar)}
                    style={[styles.toggle, bar.notify_new_taps && styles.toggleOn]}>
                    {updatingNotification ? <ActivityIndicator size="small" color={palette.amber} /> : <View style={[styles.knob, bar.notify_new_taps && styles.knobOn]} />}
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`取消关注 ${bar.tenant_display_name}`}
                    accessibilityState={{ disabled: busy }}
                    disabled={busy}
                    onPress={() => removeFollow(bar)}
                    style={({ pressed }) => [styles.remove, pressed && styles.pressed]}>
                    {removingFollow ? <ActivityIndicator size="small" color={palette.copper} /> : <FontAwesome name="minus-circle" size={18} color={palette.copper} />}
                  </Pressable>
                </View>
              )
            })}
          </View>
        )}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.background },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  headerRow: { minHeight: 50, flexDirection: 'row', alignItems: 'flex-start' },
  backButtonSpace: { width: 54 },
  headerCopy: { flex: 1, minWidth: 0, paddingTop: 2 },
  followCount: { ...typography.title, color: palette.text, flex: 1 },
  intro: { ...typography.caption, color: palette.faint, fontSize: 11, lineHeight: 15, marginTop: 2 },
  loading: { marginTop: spacing.xxl },
  list: { marginTop: spacing.xl, borderTopWidth: 1, borderTopColor: palette.line },
  row: { minHeight: 78, borderBottomWidth: 1, borderBottomColor: palette.line, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowBusy: { opacity: 0.6 },
  barLink: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  artSlot: { width: 50, height: 50, borderRadius: 7, backgroundColor: palette.panel, overflow: 'hidden' },
  art: { width: '100%', height: '100%' },
  copy: { flex: 1, minWidth: 0 },
  barName: { ...typography.title, color: palette.text },
  meta: { ...typography.micro, color: palette.muted, marginTop: 3 },
  toggle: { width: 44, height: 26, borderRadius: 13, padding: 4, backgroundColor: palette.panel, justifyContent: 'center' },
  toggleOn: { backgroundColor: palette.amber },
  knob: { width: 18, height: 18, borderRadius: 9, backgroundColor: palette.muted },
  knobOn: { alignSelf: 'flex-end', backgroundColor: palette.background },
  remove: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.72 },
  empty: { marginTop: spacing.xl, paddingTop: spacing.lg, borderTopWidth: 1, borderTopColor: palette.line },
  emptyTitle: { ...typography.headline, color: palette.text },
  emptyBody: { ...typography.body, color: palette.muted, marginTop: spacing.sm },
})
