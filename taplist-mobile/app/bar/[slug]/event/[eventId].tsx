import FontAwesome from '@expo/vector-icons/FontAwesome'
import { useQuery } from '@tanstack/react-query'
import { Link, useLocalSearchParams } from 'expo-router'
import { ImageBackground, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { BackButton } from '@/components/taplist/BackButton'
import { TAPLIST_LEGAL_DISCLAIMER } from '@/constants/compliance'
import { palette, spacing, typography } from '@/constants/design'
import { fetchPublicEvent } from '@/lib/api/taplist'
import { useTaplistSupabaseReady } from '@/lib/useTaplistSupabaseReady'

export default function EventDetailScreen() {
  const insets = useSafeAreaInsets()
  const { eventId } = useLocalSearchParams<{ slug: string; eventId: string }>()
  const configured = useTaplistSupabaseReady()

  const eventQuery = useQuery({
    queryKey: ['taplist', 'event', eventId],
    queryFn: () => fetchPublicEvent(eventId),
    enabled: configured && !!eventId,
  })

  const result = eventQuery.data
  const event = result?.ok ? result.event : null

  return (
    <View style={styles.screen}>
      <BackButton />
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + (event?.image_url ? spacing.md : spacing.xxxl) }]}>
        {!configured ? (
          <EmptyState title="尚未连接酒单服务" body="请配置 Supabase 环境变量后查看公开活动。" />
        ) : eventQuery.isLoading ? (
          <Text style={styles.loadingText}>正在加载活动...</Text>
        ) : eventQuery.isError ? (
          <EmptyState title="暂时无法加载活动" body="请稍后重试，或以门店现场信息为准。" />
        ) : result?.ok === false ? (
          <EmptyState title={eventErrorTitle(result.code)} body="该活动可能已结束、取消，或不再公开展示。" />
        ) : event ? (
          <>
            {event.image_url ? (
              <ImageBackground source={{ uri: event.image_url }} style={styles.cover} imageStyle={styles.coverRadius}>
                <LinearGradient
                  colors={['rgba(13,13,13,0.04)', 'rgba(13,13,13,0.58)', 'rgba(13,13,13,0.96)']}
                  locations={[0, 0.58, 1]}
                  style={styles.coverScrim}>
                  <View style={styles.stateBadge}>
                    <Text style={styles.stateText}>{event.display_state}</Text>
                  </View>
                </LinearGradient>
              </ImageBackground>
            ) : (
              <View style={styles.textStateBadge}>
                <Text style={styles.stateText}>{event.display_state}</Text>
              </View>
            )}

            <Text style={styles.typeLabel}>{event.event_type_label}</Text>
            <Text style={styles.title}>{event.title}</Text>
            {event.subtitle ? <Text style={styles.subtitle}>{event.subtitle}</Text> : null}

            <View style={styles.metaBlock}>
              {event.display_time ? (
                <View style={styles.metaRow}>
                  <FontAwesome name="clock-o" size={14} color={palette.tungsten} />
                  <Text style={styles.metaText}>{event.display_time}</Text>
                </View>
              ) : null}
              <View style={styles.metaRow}>
                <FontAwesome name="map-marker" size={14} color={palette.tungsten} />
                <Text style={styles.metaText}>
                  {[event.tenant_display_name, event.tenant_address || event.tenant_district].filter(Boolean).join(' · ')}
                </Text>
              </View>
            </View>

            {event.description ? <Text style={styles.description}>{event.description}</Text> : null}

            <View style={styles.venueSection}>
              <Link href={{ pathname: '/bar/[slug]', params: { slug: event.tenant_slug } }} asChild>
                <Pressable style={({ pressed }) => [styles.venueCard, pressed && styles.venueCardPressed]}>
                  <Text style={styles.venueName}>{event.tenant_display_name}</Text>
                  <Text style={styles.venueMeta} numberOfLines={1} ellipsizeMode="tail">
                    {event.tenant_address || event.tenant_district || '查看实时酒单'}
                  </Text>
                  <Text style={styles.venueLinkHint}>查看酒单 ›</Text>
                </Pressable>
              </Link>
            </View>

            <View style={styles.complianceFooter}>
              <Text style={styles.complianceText}>{TAPLIST_LEGAL_DISCLAIMER}</Text>
            </View>
          </>
        ) : null}
      </ScrollView>
    </View>
  )
}

function eventErrorTitle(code: string) {
  if (code === 'cancelled') return '活动已取消'
  if (code === 'expired') return '活动已结束'
  return '找不到这个活动'
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
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  cover: {
    aspectRatio: 4 / 5,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: palette.panelElevated,
    marginBottom: spacing.lg,
  },
  coverRadius: {
    borderRadius: 8,
  },
  coverScrim: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: spacing.md,
  },
  stateBadge: {
    alignSelf: 'flex-start',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(211,154,69,0.5)',
    backgroundColor: 'rgba(13,13,13,0.64)',
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  textStateBadge: {
    alignSelf: 'flex-start',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(211,154,69,0.5)',
    backgroundColor: 'rgba(211,154,69,0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: spacing.md,
  },
  stateText: {
    ...typography.label,
    color: palette.amber,
    fontSize: 10,
    lineHeight: 13,
    letterSpacing: 1.2,
  },
  typeLabel: {
    ...typography.label,
    color: palette.tungsten,
    fontSize: 10,
    lineHeight: 14,
    marginBottom: spacing.sm,
  },
  title: {
    ...typography.headline,
    color: palette.text,
    fontSize: 34,
    lineHeight: 42,
  },
  subtitle: {
    ...typography.body,
    color: palette.muted,
    marginTop: spacing.xs,
  },
  metaBlock: {
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: palette.hairline,
    gap: spacing.sm,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  metaText: {
    ...typography.caption,
    color: palette.muted,
    flex: 1,
  },
  description: {
    ...typography.body,
    color: palette.text,
    marginTop: spacing.lg,
  },
  venueSection: {
    marginTop: spacing.xl,
  },
  venueCard: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.panel,
    padding: spacing.md,
  },
  venueCardPressed: {
    opacity: 0.78,
  },
  venueName: {
    ...typography.title,
    color: palette.text,
  },
  venueMeta: {
    ...typography.caption,
    color: palette.muted,
    marginTop: spacing.xxs,
  },
  venueLinkHint: {
    ...typography.label,
    color: palette.tungsten,
    fontSize: 10,
    lineHeight: 14,
    marginTop: spacing.md,
  },
  loadingText: {
    ...typography.caption,
    color: palette.muted,
  },
  emptyState: {
    borderTopWidth: 1,
    borderTopColor: palette.hairline,
    paddingTop: spacing.lg,
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
