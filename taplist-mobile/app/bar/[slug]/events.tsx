import { useQuery } from '@tanstack/react-query'
import { useLocalSearchParams } from 'expo-router'
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { BackButton } from '@/components/taplist/BackButton'
import { EventListSection } from '@/components/taplist/EventListSection'
import { SPARSE_EVENT_LIST_THRESHOLD } from '@/components/taplist/railCardStyle'
import { TAPLIST_LEGAL_DISCLAIMER } from '@/constants/compliance'
import { palette, spacing, typography } from '@/constants/design'
import { fetchPublicTenantBySlug, fetchPublicTenantEvents } from '@/lib/api/taplist'
import { useTaplistSupabaseReady } from '@/lib/useTaplistSupabaseReady'
import { tr, useLanguage } from '@/lib/i18n'

export default function BarEventsScreen() {
  const insets = useSafeAreaInsets()
  const { slug } = useLocalSearchParams<{ slug: string }>()
  const configured = useTaplistSupabaseReady()
  const { language, localized } = useLanguage()

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
  const sparseList = events.length < SPARSE_EVENT_LIST_THRESHOLD

  return (
    <View style={styles.screen}>
      <BackButton />
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.xxxl }]}>
        <Text style={styles.kicker}>TONIGHT EVENTS</Text>
        <Text style={styles.title}>{tenant ? localized(tenant.display_name || tenant.name, tenant.display_name_en) : tr(language, '酒吧活动', 'Venue events')}</Text>
        <Text style={styles.subtitle}>{tr(language, '看看这家店今晚和近期有什么活动', 'See what is happening here tonight and soon.')}</Text>

        {!configured ? (
          <EmptyState title={tr(language, '尚未连接酒单服务', 'Tap list service is not connected')} body={tr(language, '请配置 Supabase 环境变量后查看公开活动。', 'Configure Supabase to view public events.')} />
        ) : tenantQuery.isLoading || (!!tenant && eventsQuery.isLoading) ? (
          <View style={styles.loading}>
            <ActivityIndicator color={palette.amber} />
            <Text style={styles.loadingText}>{tr(language, '正在加载活动...', 'Loading events...')}</Text>
          </View>
        ) : tenantQuery.isError || tenantResult?.ok === false ? (
          <EmptyState title={tr(language, '找不到这家酒吧', 'Venue not found')} body={tr(language, '该酒吧可能尚未发布公开酒单，或链接已经失效。', 'Its public tap list may be unavailable or this link has expired.')} />
        ) : eventsQuery.isError ? (
          <EmptyState title={tr(language, '暂时无法加载活动', 'Unable to load events')} body={tr(language, '请稍后重试，或以门店现场信息为准。', 'Try again later. Venue information takes precedence.')} />
        ) : events.length === 0 ? (
          <EmptyState title={tr(language, '暂无公开活动', 'No public events')} body={tr(language, '这家酒吧当前还没有发布今晚活动。', 'This venue has not published an event for tonight.')} />
        ) : (
          <>
            {tonightEvents.length > 0 ? (
              <EventListSection
                title="TONIGHT"
                count={tonightEvents.length}
                events={tonightEvents}
                hideVenue
                compact={sparseList}
                source="bar_event"
              />
            ) : null}
            {upcomingEvents.length > 0 ? (
              <EventListSection
                title="UPCOMING"
                count={upcomingEvents.length}
                events={upcomingEvents}
                hideVenue
                compact={sparseList}
                source="bar_event"
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
