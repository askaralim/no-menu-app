import { useQuery } from '@tanstack/react-query'
import FontAwesome from '@expo/vector-icons/FontAwesome'
import { router } from 'expo-router'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { EventListSection } from '@/components/taplist/EventListSection'
import { SPARSE_EVENT_LIST_THRESHOLD } from '@/components/taplist/railCardStyle'
import { TAPLIST_LEGAL_DISCLAIMER } from '@/constants/compliance'
import { palette, spacing, typography } from '@/constants/design'
import { fetchPublicEvents } from '@/lib/api/taplist'
import { useTaplistCity } from '@/lib/taplistCity'
import { useTaplistSupabaseReady } from '@/lib/useTaplistSupabaseReady'

export default function EventsScreen() {
  const insets = useSafeAreaInsets()
  const configured = useTaplistSupabaseReady()
  const { selectedCity } = useTaplistCity()
  const selectedCityName = selectedCity.city

  const eventsQuery = useQuery({
    queryKey: ['taplist', 'events', selectedCityName],
    queryFn: () => fetchPublicEvents(selectedCityName),
    enabled: configured,
    refetchOnMount: 'always',
  })

  const events = eventsQuery.data ?? []
  const tonightEvents = events.filter((event) => event.display_state === 'TONIGHT' || event.display_state === 'ONGOING')
  const upcomingEvents = events.filter((event) => event.display_state === 'UPCOMING')
  const sparseList = events.length < SPARSE_EVENT_LIST_THRESHOLD

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 14 }]}>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="返回"
            hitSlop={10}
            onPress={() => {
              if (router.canGoBack()) {
                router.back()
              } else {
                router.replace('/')
              }
            }}
            style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}>
            <FontAwesome name="chevron-left" size={16} color={palette.text} />
          </Pressable>
          <Text style={styles.headerTitle} numberOfLines={1} ellipsizeMode="tail">
            {selectedCity.label} · 近期活动
          </Text>
        </View>

        {!configured ? (
          <EmptyState title="尚未连接酒单服务" body="请配置 Supabase 环境变量后查看公开活动。" />
        ) : eventsQuery.isLoading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={palette.amber} />
            <Text style={styles.loadingText}>正在加载活动...</Text>
          </View>
        ) : eventsQuery.isError ? (
          <EmptyState title="暂时无法加载活动" body="请稍后重试，或以门店现场信息为准。" />
        ) : events.length === 0 ? (
          <EmptyState title="暂无公开活动" body="今晚还没有酒吧发布活动。" />
        ) : (
          <>
            {tonightEvents.length > 0 ? (
              <EventListSection
                title="进行中"
                count={tonightEvents.length}
                events={tonightEvents}
                compact={sparseList}
                source="home_event"
              />
            ) : null}
            {upcomingEvents.length > 0 ? (
              <EventListSection
                title="即将开始"
                count={upcomingEvents.length}
                events={upcomingEvents}
                compact={sparseList}
                source="home_event"
              />
            ) : null}
          </>
        )}

        <View style={styles.complianceFooter}>
          <Text style={styles.complianceText}>{TAPLIST_LEGAL_DISCLAIMER}</Text>
        </View>
      </ScrollView>
    </View>
  )
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
    </View>
  )
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
  header: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(17,17,17,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(245,241,230,0.14)',
    flexShrink: 0,
  },
  backButtonPressed: {
    transform: [{ scale: 0.96 }],
  },
  headerTitle: {
    ...typography.title,
    color: palette.muted,
    fontSize: 17,
    lineHeight: 24,
    flex: 1,
    minWidth: 0,
  },
  loading: {
    marginTop: spacing.xl,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  loadingText: {
    ...typography.caption,
    color: palette.muted,
  },
  emptyState: {
    borderTopWidth: 1,
    borderTopColor: palette.hairline,
    paddingTop: spacing.lg,
    marginTop: spacing.xl,
  },
  emptyTitle: {
    ...typography.title,
    color: palette.text,
  },
  emptyBody: {
    ...typography.body,
    color: palette.muted,
    marginTop: spacing.xs,
  },
  complianceFooter: {
    marginTop: spacing.xl,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: palette.line,
  },
  complianceText: {
    ...typography.micro,
    color: palette.faint,
  },
})
