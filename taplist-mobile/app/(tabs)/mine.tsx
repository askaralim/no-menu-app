import FontAwesome from '@expo/vector-icons/FontAwesome'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, type Href, router, useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Alert, Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { CachedImage } from '@/components/taplist/CachedImage'
import { palette, spacing, typography } from '@/constants/design'
import { resetUser, trackEvent } from '@/lib/analytics'
import { getMyConsumerProfile } from '@/lib/api/consumerProfile'
import { getMyDrinkHistory, getMyDrinkInsights, getMyDrinkSummary } from '@/lib/api/drinkLog'
import { deleteDrinkLogAccount, getAccountProtectionState, isAppleCancellation, protectDrinkLogWithApple } from '@/lib/drinkLogAuth'
import { getTaplistSupabase } from '@/lib/supabase'
import type { AccountProtectionState, MyDrinkHistoryRow, MyDrinkInsights } from '@/lib/types'

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
    queryFn: () => getMyDrinkInsights(),
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
  const tonightCount = insightsQuery.data?.tonight.drink_count ?? 0
  const tapCardMeta = month?.drink_count
    ? `${formatMonthName(month.month_start)}TAP ${month.drink_count} 款 · 来自 ${month.bar_count} 家酒吧`
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
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="关于 No Menu"
              onPress={() => router.push('/about' as Href)}
              style={({ pressed }) => [styles.aboutButton, pressed && styles.pressed]}>
              <FontAwesome name="info-circle" size={21} color={palette.faint} />
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
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="关注酒吧，管理已关注的酒吧"
              onPress={() => router.push('/followed-bars' as Href)}
              style={({ pressed }) => [styles.featureCard, pressed && styles.pressed]}>
              <FontAwesome name="bell-o" size={18} color={palette.amber} style={styles.featureIcon} />
              <View style={styles.featureCopy}>
                <Text style={styles.featureTitle}>关注酒吧</Text>
                <Text style={styles.featureBody}>
                  {Platform.OS === 'ios' ? '管理关注和上新通知' : '管理已关注的酒吧'}
                </Text>
              </View>
              <FontAwesome name="angle-right" size={20} color={palette.faint} />
            </Pressable>
            {month?.drink_count ? (
              <MonthlyArchiveCard month={month} />
            ) : (
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
            )}
            {tonightCount >= 2 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`回顾今晚 ${tonightCount} 款 TAP`}
                onPress={() => router.push('/tonight-recap' as Href)}
                style={({ pressed }) => [styles.tonightRecap, pressed && styles.pressed]}>
                <FontAwesome name="clone" size={15} color={palette.amber} />
                <Text style={styles.tonightRecapCount}>今晚 {tonightCount} 款</Text>
                <Text style={styles.tonightRecapAction}>回顾今晚 TAP</Text>
                <FontAwesome name="angle-right" size={18} color={palette.faint} />
              </Pressable>
            ) : null}
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
            {groups.map((group) => {
              const isCurrentMonth = group.key === currentMonthKey()
              return (
                <View key={group.key} style={styles.month}>
                  <View style={[styles.timelineDot, isCurrentMonth && styles.timelineDotCurrent]} />
                  <View style={styles.monthHeader}>
                    <Text style={[styles.monthLabel, isCurrentMonth && styles.monthLabelCurrent]}>{group.label}</Text>
                    <Text style={styles.monthCount}>{group.items.length} 款</Text>
                  </View>
                  {isCurrentMonth ? group.days.map((day) => (
                    <View key={day.key} style={styles.day}>
                      <Text style={styles.dayLabel}>{day.label}</Text>
                      <View style={styles.grid}>
                        {chunkIntoRows(day.items, 3).map((row, rowIndex) => (
                          <View key={`${day.key}-${rowIndex}`} style={styles.gridRow}>
                            {row.map((item) => <DrinkGridItem key={item.light_id} item={item} />)}
                            {Array.from({ length: 3 - row.length }, (_, emptyIndex) => (
                              <View key={`empty-${emptyIndex}`} style={styles.gridItem} />
                            ))}
                          </View>
                        ))}
                      </View>
                    </View>
                  )) : (
                    <View style={styles.monthPreviewRow}>
                      {group.items.slice(0, 5).map((item) => (
                        <View key={item.light_id} style={styles.previewArtSlot}>
                          {item.image_url ? (
                            <CachedImage source={item.image_url} ossStyle="nm-thumb" style={styles.previewArt} />
                          ) : null}
                        </View>
                      ))}
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`展开${group.label}全部记录`}
                        onPress={() => router.push({ pathname: '/tap-report', params: { month: group.key } } as Href)}
                        style={({ pressed }) => [styles.expandMonth, pressed && styles.pressed]}>
                        <Text style={styles.expandMonthText}>展开全部</Text>
                        <FontAwesome name="angle-right" size={14} color={palette.faint} />
                      </Pressable>
                    </View>
                  )}
                </View>
              )
            })}
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

function MonthlyArchiveCard({ month }: { month: MyDrinkInsights['month'] }) {
  const archiveMonth = formatArchiveMonth(month.month_start)
  const artwork = month.drinks.filter((drink) => Boolean(drink.image_url)).slice(0, 3)

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`我的 TAP，${archiveMonth.year}年${Number(archiveMonth.month)}月，${month.drink_count}款，来自${month.bar_count}家酒吧，查看月报`}
      onPress={() => router.push('/tap-report' as Href)}
      style={({ pressed }) => [styles.monthArchiveCard, pressed && styles.pressed]}>
      <View pointerEvents="none" style={styles.archiveAtmosphere} />

      <View style={styles.archiveCopy}>
        <View style={styles.archiveDateRow}>
          <Text style={styles.archiveDate}>{archiveMonth.year}.</Text>
          <Text style={[styles.archiveDate, styles.archiveDateAccent]}>{archiveMonth.month}</Text>
        </View>
        <View style={styles.archiveCountRow}>
          <Text style={styles.archiveCount}>{month.drink_count}</Text>
          <Text style={styles.archiveCountUnit}>TAP</Text>
        </View>
        <Text style={styles.archiveBars}>
          来自 <Text style={styles.archiveBarsAccent}>{month.bar_count}</Text> 家酒吧
        </Text>
        <View style={styles.archiveShareChip}>
          <Text style={styles.archiveShareText}>查看月报</Text>
          <FontAwesome name="angle-right" size={14} color={palette.amber} />
        </View>
      </View>

      <View pointerEvents="none" style={styles.archiveArtworkStage}>
        {artwork.map((drink, index) => (
          <CachedImage
            key={drink.light_id}
            accessibilityIgnoresInvertColors
            source={drink.image_url as string}
            ossStyle="nm-card"
            style={[
              styles.archiveArtwork,
              index === 0 ? styles.archiveArtworkFront : null,
              index === 1 ? styles.archiveArtworkMiddle : null,
              index === 2 ? styles.archiveArtworkBack : null,
            ]}
          />
        ))}
      </View>
    </Pressable>
  )
}

function DrinkGridItem({ item }: { item: MyDrinkHistoryRow }) {
  const href = `/drink-log/${item.light_id}` as Href
  return (
    <View style={styles.gridItem}>
      <Link href={href} asChild>
        <Pressable style={({ pressed }) => [styles.gridPressable, pressed && styles.pressed]}>
          <View style={styles.artSlot}>
            {item.image_url ? <CachedImage source={item.image_url} ossStyle="nm-card" style={styles.art} /> : null}
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
    const activityByMonth = new Map<string, string>()
    const activityDates = item.venues.length
      ? item.venues.map((venue) => venue.first_drank_at)
      : [item.last_activity_at]

    activityDates.forEach((activityAt) => {
      const date = new Date(activityAt)
      const monthKey = monthKeyForDate(date)
      const existing = activityByMonth.get(monthKey)
      if (!existing || date.getTime() > new Date(existing).getTime()) activityByMonth.set(monthKey, activityAt)
    })

    activityByMonth.forEach((activityAt, monthKey) => {
      const date = new Date(activityAt)
      const dayKey = `${monthKey}-${String(date.getDate()).padStart(2, '0')}`
      const month = map.get(monthKey) ?? new Map<string, MyDrinkHistoryRow[]>()
      const activityItem = { ...item, last_activity_at: activityAt }
      month.set(dayKey, [...(month.get(dayKey) ?? []), activityItem])
      map.set(monthKey, month)
    })
  })
  return [...map.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([key, month]) => {
    const [year, monthNumber] = key.split('-')
    const days = [...month.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([dayKey, grouped]) => ({
        key: dayKey,
        label: formatMonthDay(grouped[0].last_activity_at),
        items: [...grouped].sort((a, b) => (
          new Date(b.last_activity_at).getTime() - new Date(a.last_activity_at).getTime()
        )),
      }))
    return {
      key,
      label: `${year}年${Number(monthNumber)}月`,
      items: days.flatMap((day) => day.items),
      days,
    }
  })
}

function monthKeyForDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
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

function formatArchiveMonth(value: string) {
  const date = new Date(value)
  return {
    year: String(date.getFullYear()),
    month: String(date.getMonth() + 1).padStart(2, '0'),
  }
}

function currentMonthKey() {
  return monthKeyForDate(new Date())
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
  aboutButton: {
    width: 44,
    height: 44,
    flexShrink: 0,
    alignItems: 'flex-end',
    justifyContent: 'center',
    marginLeft: spacing.xxs,
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
  monthArchiveCard: {
    height: 250,
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(198,168,117,0.18)',
    backgroundColor: palette.panelElevated,
  },
  archiveAtmosphere: {
    position: 'absolute',
    width: 230,
    height: 230,
    borderRadius: 115,
    right: -82,
    bottom: -74,
    backgroundColor: 'rgba(124,86,56,0.13)',
  },
  archiveCopy: {
    width: '54%',
    height: '100%',
    justifyContent: 'center',
    paddingLeft: 15,
    paddingVertical: 22,
    zIndex: 4,
  },
  archiveDateRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  archiveDate: {
    ...typography.display,
    color: palette.text,
    fontSize: 48,
    lineHeight: 51,
    letterSpacing: 0.6,
  },
  archiveDateAccent: {
    color: palette.amber,
  },
  archiveCountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 1,
  },
  archiveCount: {
    ...typography.display,
    color: palette.amber,
    fontSize: 39,
    lineHeight: 42,
    letterSpacing: 0.8,
  },
  archiveCountUnit: {
    ...typography.display,
    color: palette.text,
    fontSize: 25,
    lineHeight: 30,
    marginLeft: 5,
    letterSpacing: 1,
  },
  archiveBars: {
    ...typography.caption,
    color: palette.muted,
    marginTop: -1,
  },
  archiveBarsAccent: {
    color: palette.amber,
  },
  archiveShareChip: {
    minHeight: 33,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingHorizontal: 13,
    borderRadius: 17,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.amber,
  },
  archiveShareText: {
    ...typography.micro,
    color: palette.amber,
    fontWeight: '600',
  },
  archiveArtworkStage: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: '58%',
    height: '100%',
    zIndex: 3,
  },
  archiveArtwork: {
    position: 'absolute',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(245,241,230,0.34)',
    backgroundColor: palette.panel,
  },
  archiveArtworkFront: {
    width: 123,
    height: 154,
    right: 8,
    bottom: 8,
    zIndex: 3,
    transform: [{ rotate: '10deg' }],
  },
  archiveArtworkMiddle: {
    width: 112,
    height: 140,
    right: 61,
    bottom: 51,
    zIndex: 2,
    transform: [{ rotate: '-9deg' }],
  },
  archiveArtworkBack: {
    width: 98,
    height: 123,
    right: 6,
    top: 22,
    zIndex: 1,
    transform: [{ rotate: '7deg' }],
  },
  tonightRecap: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(211,154,69,0.28)',
    backgroundColor: 'rgba(124,86,56,0.12)',
  },
  tonightRecapCount: {
    ...typography.caption,
    color: palette.text,
  },
  tonightRecapAction: {
    ...typography.caption,
    color: palette.amber,
    flex: 1,
    textAlign: 'right',
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
    marginLeft: spacing.xxs,
    paddingLeft: 20,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: 'rgba(198,168,117,0.16)',
  },
  month: {
    marginBottom: spacing.lg,
    position: 'relative',
  },
  timelineDot: {
    position: 'absolute',
    left: -24,
    top: 5,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: 'rgba(198,168,117,0.28)',
  },
  timelineDotCurrent: {
    backgroundColor: 'rgba(211,154,69,0.72)',
  },
  monthHeader: {
    minHeight: 20,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  monthLabel: {
    ...typography.title,
    color: palette.muted,
    fontSize: 18,
    lineHeight: 24,
  },
  monthLabelCurrent: {
    color: palette.text,
  },
  monthCount: {
    ...typography.micro,
    color: palette.amber,
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
  monthPreviewRow: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  previewArtSlot: {
    width: 42,
    height: 42,
  },
  previewArt: {
    width: '100%',
    height: '100%',
    borderRadius: 6,
  },
  expandMonth: {
    minWidth: 66,
    minHeight: 42,
    marginLeft: 'auto',
    paddingLeft: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.xxs,
  },
  expandMonthText: {
    ...typography.micro,
    color: palette.muted,
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
