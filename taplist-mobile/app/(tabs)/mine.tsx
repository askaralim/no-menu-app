import FontAwesome from '@expo/vector-icons/FontAwesome'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, type Href, router, useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Alert, Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { CachedImage } from '@/components/taplist/CachedImage'
import { defaultBeerArtwork } from '@/components/taplist/defaultBeerArtwork'
import { palette, spacing, typography } from '@/constants/design'
import { resetUser, trackEvent } from '@/lib/analytics'
import { getMyConsumerProfile } from '@/lib/api/consumerProfile'
import { getMyDrinkHistory, getMyDrinkInsights, getMyDrinkSummary } from '@/lib/api/drinkLog'
import { deleteDrinkLogAccount, getAccountProtectionState, isAppleCancellation, protectDrinkLogWithApple } from '@/lib/drinkLogAuth'
import { getTaplistSupabase } from '@/lib/supabase'
import type { AccountProtectionState, MyDrinkHistoryRow } from '@/lib/types'

export default function MineScreen() {
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()
  const [protection, setProtection] = useState<AccountProtectionState>('unavailable')

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
  const insightsQuery = useQuery({
    queryKey: ['drink-log', 'insights'],
    queryFn: getMyDrinkInsights,
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
  const month = insightsQuery.data?.month
  const tapCardMeta = month?.new_drink_count
    ? `${formatMonthName(month.month_start)}新增 ${month.new_drink_count} 款 · 来自 ${month.bar_count} 家酒吧`
    : '查看月度报告与分享记录'

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

        {hasSession ? (
          <View style={styles.featureCards}>
            {Platform.OS === 'ios' ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="关注酒吧，管理关注和上新通知"
                onPress={() => router.push('/followed-bars' as Href)}
                style={({ pressed }) => [styles.featureCard, pressed && styles.pressed]}>
                <FontAwesome name="bell-o" size={18} color={palette.amber} style={styles.featureIcon} />
                <View style={styles.featureCopy}>
                  <Text style={styles.featureTitle}>关注酒吧</Text>
                  <Text style={styles.featureBody}>管理关注和上新通知</Text>
                </View>
                <FontAwesome name="angle-right" size={20} color={palette.faint} />
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`我的 TAP，${tapCardMeta}`}
              onPress={() => router.push('/tap-report' as Href)}
              style={({ pressed }) => [styles.featureCard, pressed && styles.pressed]}>
              <FontAwesome name="check-circle-o" size={18} color={palette.amber} style={styles.featureIcon} />
              <View style={styles.featureCopy}>
                <Text style={styles.featureTitle}>我的 TAP</Text>
                <Text numberOfLines={1} style={styles.featureBody}>{tapCardMeta}</Text>
              </View>
              <FontAwesome name="angle-right" size={20} color={palette.faint} />
            </Pressable>
          </View>
        ) : null}

        <View style={styles.historyHeader}>
          <Text style={styles.historyTitle}>TAP 记录</Text>
        </View>

        {sessionQuery.isLoading || (hasSession && historyQuery.isLoading) ? (
          <ActivityIndicator color={palette.amber} style={styles.loading} />
        ) : groups.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>还没有 TAP 记录</Text>
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
            <CachedImage source={item.image_url || defaultBeerArtwork} style={styles.art} />
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

function formatMonthName(value: string) {
  return `${new Date(value).getMonth() + 1} 月`
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
  featureCards: {
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  featureCard: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 76,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: 12,
    backgroundColor: palette.bgSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.line,
  },
  featureIcon: {
    width: 24,
    marginRight: spacing.md,
    textAlign: 'center',
  },
  featureCopy: {
    flex: 1,
    minWidth: 0,
    marginRight: spacing.sm,
  },
  featureTitle: {
    ...typography.title,
    color: palette.text,
    fontSize: 17,
    lineHeight: 23,
  },
  featureBody: {
    ...typography.caption,
    color: palette.muted,
    marginTop: 2,
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  historyTitle: {
    ...typography.headline,
    color: palette.text,
    fontSize: 22,
    lineHeight: 30,
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
})
