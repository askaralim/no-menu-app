import { useQuery } from '@tanstack/react-query'
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { BackButton } from '@/components/taplist/BackButton'
import { EventListSection } from '@/components/taplist/EventListSection'
import { SPARSE_EVENT_LIST_THRESHOLD } from '@/components/taplist/railCardStyle'
import { TAPLIST_LEGAL_DISCLAIMER } from '@/constants/compliance'
import { palette, spacing, typography } from '@/constants/design'
import { DEFAULT_TAPLIST_CITY } from '@/constants/taplist'
import { fetchPublicEvents } from '@/lib/api/taplist'
import { useTaplistSupabaseReady } from '@/lib/useTaplistSupabaseReady'

export default function EventsScreen() {
  const insets = useSafeAreaInsets()
  const configured = useTaplistSupabaseReady()

  const eventsQuery = useQuery({
    queryKey: ['taplist', 'events', DEFAULT_TAPLIST_CITY],
    queryFn: () => fetchPublicEvents(DEFAULT_TAPLIST_CITY),
    enabled: configured,
    refetchOnMount: 'always',
  })

  const events = eventsQuery.data ?? []
  const tonightEvents = events.filter((event) => event.display_state === 'TONIGHT' || event.display_state === 'ONGOING')
  const upcomingEvents = events.filter((event) => event.display_state === 'UPCOMING')
  const sparseList = events.length < SPARSE_EVENT_LIST_THRESHOLD

  return (
    <View style={styles.screen}>
      <BackButton />
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.xxxl }]}>
        <Text style={styles.kicker}>NO MENU</Text>
        <Text style={styles.title}>EVENTS</Text>
        <Text style={styles.subtitle}>上海 · 近期活动</Text>

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
                title="TONIGHT"
                count={tonightEvents.length}
                events={tonightEvents}
                compact={sparseList}
              />
            ) : null}
            {upcomingEvents.length > 0 ? (
              <EventListSection
                title="UPCOMING"
                count={upcomingEvents.length}
                events={upcomingEvents}
                compact={sparseList}
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
  kicker: {
    ...typography.label,
    color: palette.tungsten,
    fontSize: 10,
    lineHeight: 14,
    marginBottom: spacing.xs,
  },
  title: {
    ...typography.displayL,
    color: palette.text,
  },
  subtitle: {
    ...typography.caption,
    color: 'rgba(245,238,225,0.52)',
    fontSize: 17,
    lineHeight: 24,
    marginTop: spacing.sm,
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
