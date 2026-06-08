import { useQuery } from '@tanstack/react-query'
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { BackButton } from '@/components/taplist/BackButton'
import { EventListRow } from '@/components/taplist/EventCards'
import { TAPLIST_LEGAL_DISCLAIMER } from '@/constants/compliance'
import { palette, spacing, typography } from '@/constants/design'
import { DEFAULT_TAPLIST_CITY } from '@/constants/taplist'
import { fetchPublicEvents } from '@/lib/api/taplist'
import type { PublicEventRow } from '@/lib/types'
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

  return (
    <View style={styles.screen}>
      <BackButton />
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.xxxl }]}>
        <Text style={styles.kicker}>NO MENU</Text>
        <Text style={styles.title}>TONIGHT EVENTS</Text>
        <Text style={styles.subtitle}>上海 · 今晚活动与近期动态</Text>

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
            {tonightEvents.length > 0 ? <EventGroup title="TONIGHT" events={tonightEvents} /> : null}
            {upcomingEvents.length > 0 ? <EventGroup title="UPCOMING" events={upcomingEvents} /> : null}
          </>
        )}

        <View style={styles.complianceFooter}>
          <Text style={styles.complianceText}>{TAPLIST_LEGAL_DISCLAIMER}</Text>
        </View>
      </ScrollView>
    </View>
  )
}

function EventGroup({ title, events }: { title: string; events: PublicEventRow[] }) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupTitle}>{title}</Text>
      <View>
        {events.map((event) => (
          <EventListRow key={event.id} event={event} />
        ))}
      </View>
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
    color: palette.muted,
    marginTop: spacing.xs,
  },
  loading: {
    marginTop: spacing.xl,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.panel,
    padding: spacing.sm,
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  loadingText: {
    ...typography.caption,
    color: palette.muted,
  },
  group: {
    marginTop: spacing.xl,
  },
  groupTitle: {
    ...typography.display,
    color: palette.tungsten,
    fontSize: 28,
    lineHeight: 32,
    letterSpacing: 1,
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
