import FontAwesome from '@expo/vector-icons/FontAwesome'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, type Href, router, useFocusEffect } from 'expo-router'
import * as Sharing from 'expo-sharing'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Alert, Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { CachedImage } from '@/components/taplist/CachedImage'
import { ShareableDrinkLogImage, type ShareableDrinkLogImageHandle } from '@/components/taplist/ShareableDrinkLogImage'
import { palette, spacing, typography } from '@/constants/design'
import { resetUser, trackEvent } from '@/lib/analytics'
import { getMyConsumerProfile } from '@/lib/api/consumerProfile'
import { getMyDrinkHistory, getMyDrinkSummary } from '@/lib/api/drinkLog'
import { deleteDrinkLogAccount, getAccountProtectionState, isAppleCancellation, protectDrinkLogWithApple } from '@/lib/drinkLogAuth'
import { PhotoLibraryPermissionError, saveImageUriToPhotoLibrary } from '@/lib/saveImageToPhotoLibrary'
import { getTaplistSupabase } from '@/lib/supabase'
import type { AccountProtectionState, MyDrinkHistoryRow, MyDrinkSummary } from '@/lib/types'

export default function MineScreen() {
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()
  const shareRef = useRef<ShareableDrinkLogImageHandle>(null)
  const [protection, setProtection] = useState<AccountProtectionState>('unavailable')
  const [previewUri, setPreviewUri] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)

  const sessionQuery = useQuery({
    queryKey: ['drink-log', 'session'],
    queryFn: async () => (await getTaplistSupabase().auth.getSession()).data.session,
  })
  const hasSession = Boolean(sessionQuery.data)
  const profileQuery = useQuery({
    queryKey: ['consumer-profile'],
    queryFn: getMyConsumerProfile,
    enabled: hasSession,
  })
  const historyQuery = useQuery({
    queryKey: ['drink-log', 'history'],
    queryFn: () => getMyDrinkHistory(),
    enabled: hasSession,
  })
  const summaryQuery = useQuery({
    queryKey: ['drink-log', 'summary'],
    queryFn: getMyDrinkSummary,
    enabled: hasSession,
  })

  useFocusEffect(useCallback(() => {
    void sessionQuery.refetch()
    if (hasSession) void profileQuery.refetch()
  }, [hasSession, profileQuery.refetch, sessionQuery.refetch]))

  useEffect(() => {
    trackEvent('drink_log_opened')
    void getAccountProtectionState().then(setProtection)
  }, [])

  const groups = useMemo(() => groupByMonth(historyQuery.data ?? []), [historyQuery.data])
  const shareSummary = useMemo<MyDrinkSummary | null>(() => {
    if (!summaryQuery.data) return null
    const history = historyQuery.data ?? []
    return {
      ...summaryQuery.data,
      recent: (history.length > summaryQuery.data.recent.length ? history : summaryQuery.data.recent).slice(0, 9),
    }
  }, [historyQuery.data, summaryQuery.data])

  const generateShare = async () => {
    if (!shareSummary || busy || historyQuery.isLoading) return
    setBusy(true)
    try {
      const uri = await shareRef.current?.capture()
      if (uri) {
        setPreviewUri(uri)
        trackEvent('drink_share_generated')
      }
    } finally {
      setBusy(false)
    }
  }

  const savePreview = async () => {
    if (!previewUri || saving) return
    setSaving(true)
    try {
      await saveImageUriToPhotoLibrary(previewUri)
      Alert.alert('保存成功', '记录分享图已保存到相册')
    } catch (error) {
      Alert.alert(
        error instanceof PhotoLibraryPermissionError ? '无法保存分享图' : '保存失败',
        error instanceof PhotoLibraryPermissionError ? '请在系统设置中允许 No Menu 添加照片。' : '暂时无法保存到相册，请稍后重试。',
      )
    } finally {
      setSaving(false)
    }
  }

  const linkApple = async () => {
    trackEvent('apple_link_started')
    try {
      await protectDrinkLogWithApple()
      setProtection('apple')
      await sessionQuery.refetch()
      await queryClient.invalidateQueries({ queryKey: ['consumer-profile'] })
      trackEvent('apple_link_succeeded')
    } catch (error) {
      if (isAppleCancellation(error)) return
      Alert.alert('暂时无法使用 Apple 登录', '请确认 Apple 登录和 Supabase Apple Provider 已配置后再试。')
      trackEvent('apple_link_failed')
    }
  }

  const deleteAccount = () => Alert.alert(
    '删除账号与全部记录？',
    '所有喝过记录、关注的酒吧和通知设置都会永久删除，且无法恢复。',
    [
      { text: '取消', style: 'cancel' },
      {
        text: '永久删除',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteDrinkLogAccount()
            await resetUser()
            queryClient.clear()
            setProtection('anonymous')
          } catch (error) {
            if (isAppleCancellation(error)) return
            Alert.alert('删除失败', '暂时无法删除账号，请稍后重试。')
          }
        },
      },
    ],
  )

  const summary = summaryQuery.data
  const hasDrinks = Boolean(summary && summary.drink_count > 0)
  const firstCupLabel = summary?.started_at ? `${formatDotDate(summary.started_at)} 第一杯` : null

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg }]}>
        <View style={styles.hero}>
          <View style={styles.identityRow}>
            <Image
              accessibilityIgnoresInvertColors
              source={require('../../assets/images/no-menu-consumer-avatar.png')}
              style={styles.avatar}
            />
            <View style={styles.identityCopy}>
              <Text numberOfLines={1} style={styles.username}>
                {profileQuery.data?.consumer_username || 'NoMenuist'}
              </Text>
              {hasDrinks ? (
                <Text numberOfLines={1} style={styles.identitySummary}>
                  {summary?.drink_count} 款酒 · {summary?.bar_count} 家酒吧
                </Text>
              ) : null}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="编辑昵称"
              onPress={() => router.push('/edit-profile' as Href)}
              style={({ pressed }) => [styles.editProfileButton, pressed && styles.pressed]}>
              <FontAwesome name="pencil" size={20} color={palette.amber} />
            </Pressable>
          </View>

          {protection !== 'unavailable' ? (
            <Pressable
              disabled={protection === 'apple'}
              onPress={() => void linkApple()}
              style={({ pressed }) => [styles.protectionRow, pressed && protection !== 'apple' && styles.pressed]}>
              <FontAwesome name={protection === 'apple' ? 'check-circle' : 'lock'} size={15} color={palette.tungsten} />
              <Text style={styles.protectionText}>
                {protection === 'apple' ? '记录已受 Apple 保护' : '使用 Apple 保护记录'}
              </Text>
              {protection !== 'apple' ? <FontAwesome name="angle-right" size={18} color={palette.faint} /> : null}
            </Pressable>
          ) : null}
        </View>

        {Platform.OS === 'ios' && hasSession ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="关注酒吧，管理关注和上新通知"
            onPress={() => router.push('/followed-bars' as Href)}
            style={({ pressed }) => [styles.followCard, pressed && styles.pressed]}>
            <FontAwesome name="bell-o" size={16} color={palette.amber} style={styles.followIcon} />
            <View style={styles.followCopy}>
              <Text style={styles.followTitle}>关注酒吧</Text>
              <Text style={styles.followBody}>管理关注和上新通知</Text>
            </View>
            <FontAwesome name="angle-right" size={18} color={palette.faint} />
          </Pressable>
        ) : null}

        <View style={styles.historyHeader}>
          <Text style={styles.historyTitle}>最近喝过</Text>
          {hasDrinks ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="分享喝过记录图"
              hitSlop={4}
              disabled={busy || historyQuery.isLoading}
              onPress={() => void generateShare()}
              style={({ pressed }) => [styles.shareButton, pressed && styles.pressed]}>
              {busy ? (
                <ActivityIndicator size="small" color={palette.amber} />
              ) : (
                <FontAwesome name="share-square-o" size={13} color={palette.amber} />
              )}
              <Text style={styles.shareText}>分享记录</Text>
            </Pressable>
          ) : null}
        </View>

        {firstCupLabel ? <Text style={styles.summary}>{firstCupLabel}</Text> : null}

        {sessionQuery.isLoading || (hasSession && historyQuery.isLoading) ? (
          <ActivityIndicator color={palette.amber} style={styles.loading} />
        ) : groups.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>还没有记录</Text>
            <Text style={styles.emptyBody}>看到喝过的酒，点一下“喝过”，它就会留在这里。</Text>
            <Link href="/search" asChild>
              <Pressable style={styles.emptyButton}>
                <Text style={styles.emptyButtonText}>去搜索酒款</Text>
              </Pressable>
            </Link>
          </View>
        ) : (
          <View style={styles.history}>
            {groups.map((group) => (
              <View key={group.key} style={styles.month}>
                <Text style={styles.monthLabel}>{group.label}</Text>
                {group.days.map((day) => (
                  <View key={day.key} style={styles.day}>
                    <Text style={styles.dayLabel}>{day.label}</Text>
                    <View style={styles.grid}>
                      {chunkIntoRows(day.items, 3).map((row, rowIndex) => (
                        <View key={`${day.key}-${rowIndex}`} style={styles.gridRow}>
                          {row.map((item) => <DrinkGridItem key={item.light_id} item={item} />)}
                          {Array.from({ length: 3 - row.length }, (_, index) => (
                            <View key={`empty-${index}`} style={styles.gridItem} />
                          ))}
                        </View>
                      ))}
                    </View>
                  </View>
                ))}
              </View>
            ))}
          </View>
        )}

        {hasSession ? (
          <Pressable onPress={deleteAccount} style={styles.deleteAccount}>
            <Text style={styles.deleteAccountText}>删除账号与全部记录</Text>
          </Pressable>
        ) : null}
      </ScrollView>

      {shareSummary ? (
        <View pointerEvents="none" style={styles.hiddenCanvas}>
          <ShareableDrinkLogImage ref={shareRef} summary={shareSummary} />
        </View>
      ) : null}
      <Modal visible={Boolean(previewUri)} animationType="slide" onRequestClose={() => setPreviewUri(null)}>
        <View style={[styles.preview, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.md }]}>
          <View style={styles.previewHeader}>
            <Text style={styles.previewTitle}>分享图预览</Text>
            <Pressable onPress={() => setPreviewUri(null)}>
              <Text style={styles.close}>关闭</Text>
            </Pressable>
          </View>
          {previewUri ? <Image source={{ uri: previewUri }} resizeMode="contain" style={styles.previewImage} /> : null}
          <View style={styles.actions}>
            <Pressable style={styles.primaryAction} onPress={() => previewUri && void Sharing.shareAsync(previewUri)}>
              <Text style={styles.primaryActionText}>分享记录图</Text>
            </Pressable>
            <Pressable disabled={saving} style={styles.secondaryAction} onPress={() => void savePreview()}>
              {saving ? <ActivityIndicator size="small" color={palette.text} /> : <Text style={styles.secondaryActionText}>保存到相册</Text>}
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  )
}

function DrinkGridItem({ item }: { item: MyDrinkHistoryRow }) {
  const href = `/drink-log/${item.light_id}` as Href
  return (
    <View style={styles.gridItem}>
      <Link href={href} asChild>
        <Pressable style={({ pressed }) => [styles.gridPressable, pressed && styles.pressed]}>
          <View style={styles.artSlot}>
            {item.image_url ? <CachedImage source={item.image_url} style={styles.art} /> : null}
          </View>
          <Text numberOfLines={2} style={styles.drinkName}>{item.name}</Text>
          <Text numberOfLines={1} style={styles.drinkMeta}>{item.brewery || item.beer_style || '精酿啤酒'}</Text>
        </Pressable>
      </Link>
    </View>
  )
}

function groupByMonth(items: MyDrinkHistoryRow[]) {
  const map = new Map<string, Map<string, MyDrinkHistoryRow[]>>()
  items.forEach((item) => {
    const date = new Date(item.last_activity_at)
    const monthKey = `${date.getFullYear()}-${date.getMonth()}`
    const dayKey = `${monthKey}-${date.getDate()}`
    const month = map.get(monthKey) ?? new Map<string, MyDrinkHistoryRow[]>()
    month.set(dayKey, [...(month.get(dayKey) ?? []), item])
    map.set(monthKey, month)
  })
  return [...map.entries()].map(([key, month]) => {
    const firstDay = month.values().next().value as MyDrinkHistoryRow[]
    const monthDate = new Date(firstDay[0].last_activity_at)
    return {
      key,
      label: `${monthDate.getFullYear()}年${monthDate.getMonth() + 1}月`,
      days: [...month.entries()].map(([dayKey, grouped]) => ({
        key: dayKey,
        label: formatMonthDay(grouped[0].last_activity_at),
        items: grouped,
      })),
    }
  })
}

function chunkIntoRows<T>(items: T[], size: number) {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, index * size + size))
}

function formatMonthDay(value: string) {
  const d = new Date(value)
  return `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

function formatDotDate(value: string) {
  const d = new Date(value)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: palette.background,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  hero: {
    marginBottom: spacing.md,
  },
  identityRow: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 64,
    height: 64,
    flexShrink: 0,
  },
  identityCopy: {
    flex: 1,
    minWidth: 0,
    marginLeft: spacing.md,
  },
  username: {
    ...typography.headline,
    color: palette.text,
    fontSize: 26,
    lineHeight: 34,
  },
  identitySummary: {
    ...typography.caption,
    color: palette.muted,
    marginTop: 2,
  },
  editProfileButton: {
    width: 44,
    height: 44,
    flexShrink: 0,
    alignItems: 'flex-end',
    justifyContent: 'center',
    marginLeft: spacing.sm,
  },
  protectionRow: {
    width: '100%',
    marginTop: spacing.md,
    minHeight: 52,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: palette.line,
    flexDirection: 'row',
    alignItems: 'center',
  },
  protectionText: {
    ...typography.caption,
    color: palette.muted,
    marginLeft: spacing.xs,
    flex: 1,
  },
  followCard: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 64,
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.xl,
    borderRadius: 10,
    backgroundColor: palette.bgSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.line,
  },
  followIcon: {
    marginRight: spacing.sm,
  },
  followCopy: {
    flex: 1,
    minWidth: 0,
    marginRight: spacing.sm,
  },
  followTitle: {
    ...typography.title,
    color: palette.text,
    fontSize: 16,
    lineHeight: 22,
  },
  followBody: {
    ...typography.caption,
    color: palette.muted,
    marginTop: 2,
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  historyTitle: {
    ...typography.headline,
    color: palette.text,
    fontSize: 22,
    lineHeight: 30,
  },
  summary: {
    ...typography.body,
    color: palette.muted,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: palette.amber,
    backgroundColor: 'transparent',
  },
  shareText: {
    ...typography.caption,
    color: palette.amber,
    marginLeft: 6,
    fontWeight: '500',
  },
  pressed: {
    opacity: 0.72,
  },
  loading: {
    marginTop: spacing.lg,
  },
  history: {
    marginTop: 0,
  },
  month: {
    marginBottom: 0,
  },
  monthLabel: {
    ...typography.label,
    color: palette.amber,
    fontSize: 12,
    lineHeight: 16,
    borderLeftWidth: 2,
    borderLeftColor: palette.amber,
    paddingLeft: spacing.xs,
    marginBottom: spacing.md,
  },
  day: {
    marginBottom: spacing.md,
  },
  dayLabel: {
    ...typography.caption,
    color: palette.muted,
    marginBottom: spacing.sm,
  },
  grid: {
    rowGap: spacing.lg,
  },
  gridRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  gridItem: {
    flex: 1,
    minWidth: 0,
  },
  gridPressable: {
    width: '100%',
  },
  artSlot: {
    width: '100%',
    aspectRatio: 4 / 5,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  art: {
    width: '100%',
    height: '100%',
    borderRadius: 7,
  },
  drinkName: {
    ...typography.caption,
    color: palette.text,
    textAlign: 'left',
    marginTop: spacing.xs,
  },
  drinkMeta: {
    ...typography.micro,
    color: palette.faint,
    textAlign: 'left',
    marginTop: 2,
  },
  empty: {
    marginTop: spacing.sm,
  },
  emptyTitle: {
    ...typography.headline,
    color: palette.text,
  },
  emptyBody: {
    ...typography.body,
    color: palette.muted,
    marginTop: spacing.sm,
  },
  emptyButton: {
    marginTop: spacing.lg,
    alignSelf: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: palette.amber,
    paddingBottom: spacing.xxs,
  },
  emptyButtonText: {
    ...typography.title,
    color: palette.amber,
  },
  deleteAccount: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.line,
    alignItems: 'center',
  },
  deleteAccountText: {
    ...typography.caption,
    color: palette.copper,
  },
  hiddenCanvas: {
    position: 'absolute',
    left: -10000,
    top: 0,
  },
  preview: {
    flex: 1,
    backgroundColor: palette.background,
    paddingHorizontal: spacing.lg,
  },
  previewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  previewTitle: {
    ...typography.title,
    color: palette.text,
  },
  close: {
    ...typography.caption,
    color: palette.amber,
  },
  previewImage: {
    flex: 1,
    width: '100%',
    marginVertical: spacing.md,
  },
  actions: {
    gap: spacing.sm,
  },
  primaryAction: {
    minHeight: 50,
    borderRadius: 8,
    backgroundColor: palette.amber,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryActionText: {
    ...typography.title,
    color: palette.background,
  },
  secondaryAction: {
    minHeight: 50,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryActionText: {
    ...typography.title,
    color: palette.text,
  },
})
