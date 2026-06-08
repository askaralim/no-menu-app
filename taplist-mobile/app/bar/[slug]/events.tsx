import { useQuery } from '@tanstack/react-query'
import { useLocalSearchParams } from 'expo-router'
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { BackButton } from '@/components/taplist/BackButton'
import { EventListRow } from '@/components/taplist/EventCards'
import { TAPLIST_LEGAL_DISCLAIMER } from '@/constants/compliance'
import { palette, spacing, typography } from '@/constants/design'
import { fetchPublicTenantBySlug, fetchPublicTenantEvents } from '@/lib/api/taplist'
import type { PublicEventRow } from '@/lib/types'
import { useTaplistSupabaseReady } from '@/lib/useTaplistSupabaseReady'

export default function BarEventsScreen() {
  const insets = useSafeAreaInsets()
  const { slug } = useLocalSearchParams<{ slug: string }>()
  const configured = useTaplistSupabaseReady()

  const tenantQuery = useQuery({
    queryKey: ['taplist', 'tenant', slug],
    queryFn: () => fetchPublicTenantBySlug(slug),
    enabled: configured && !!slug,
  })

  const tenantResult = tenantQuery.data
  const tenant = tenantResult?.ok ? tenantResult.tenant : null

  const eventsQuery = useQuery({
    queryKey: ['taplist', 'tenant-events', tenant?.id],
    queryFn: () => fetchPublicTenantEvents(tenant!.id),
    enabled: configured && !!tenant?.id,
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
        <Text style={styles.kicker}>TONIGHT EVENTS</Text>
        <Text style={styles.title}>{tenant?.display_name || tenant?.name || '酒吧活动'}</Text>
        <Text style={styles.subtitle}>今晚活动与近期动态</Text>

        {!configured ? (
          <EmptyState title="尚未连接酒单服务" body="请配置 Supabase 环境变量后查看公开活动。" />
        ) : tenantQuery.isLoading || (!!tenant && eventsQuery.isLoading) ? (
          <View style={styles.loading}>
            <ActivityIndicator color={palette.amber} />
            <Text style={styles.loadingText}>正在加载活动...</Text>
          </View>
        ) : tenantQuery.isError || tenantResult?.ok === false ? (
          <EmptyState title="找不到这家酒吧" body="该酒吧可能尚未发布公开酒单，或链接已经失效。" />
        ) : eventsQuery.isError ? (
          <EmptyState title="暂时无法加载活动" body="请稍后重试，或以门店现场信息为准。" />
        ) : events.length === 0 ? (
          <EmptyState title="暂无公开活动" body="这家酒吧当前还没有发布今晚活动。" />
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
