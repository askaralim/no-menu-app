import FontAwesome from '@expo/vector-icons/FontAwesome'
import { useQuery } from '@tanstack/react-query'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { BackButton } from '@/components/taplist/BackButton'
import { CachedImage, CachedImageBackground } from '@/components/taplist/CachedImage'
import { eventDateLabel, eventMetaLine } from '@/components/taplist/EventCards'
import { TAPLIST_LEGAL_DISCLAIMER } from '@/constants/compliance'
import { palette, spacing, typography } from '@/constants/design'
import { fetchPublicEvent } from '@/lib/api/taplist'
import { useTaplistSupabaseReady } from '@/lib/useTaplistSupabaseReady'
import { trackEvent } from '@/lib/analytics'

const EVENT_INFORMATION_DISCLAIMER = '活动信息由门店提供，时间、内容与供应情况以门店现场为准。'

export default function EventDetailScreen() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { eventId } = useLocalSearchParams<{ slug: string; eventId: string }>()
  const configured = useTaplistSupabaseReady()
  const [imageViewerVisible, setImageViewerVisible] = useState(false)

  const eventQuery = useQuery({
    queryKey: ['taplist', 'event', eventId],
    queryFn: () => fetchPublicEvent(eventId),
    enabled: configured && !!eventId,
  })

  const result = eventQuery.data
  const event = result?.ok ? result.event : null
  const dateLabel = event ? eventDateLabel(event) : null

  return (
    <View style={styles.screen}>
      <BackButton />
      <ScrollView
        style={styles.screen}
        contentContainerStyle={event?.image_url ? { paddingBottom: insets.bottom + 48 } : [styles.paddedContent, { paddingTop: insets.top + spacing.xxxl, paddingBottom: insets.bottom + 48 }]}>
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
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`查看活动图片：${event.title}`}
                accessibilityHint="打开完整图片"
                onPress={() => setImageViewerVisible(true)}
                style={({ pressed }) => [styles.cover, pressed && styles.coverPressed]}>
                <CachedImageBackground
                  contentPosition="top"
                  source={event.image_url}
                  style={styles.coverFill}>
                  <LinearGradient
                    colors={['rgba(13,13,13,0.04)', 'rgba(13,13,13,0.30)', 'rgba(13,13,13,1)']}
                    locations={[0, 0.52, 1]}
                    style={styles.coverScrim}
                  />
                </CachedImageBackground>
              </Pressable>
            ) : null}

            <View style={event.image_url ? styles.paddedContent : undefined}>
              <View style={styles.stateBadge}>
                <Text style={styles.typeLabel}>{eventMetaLine(event)}</Text>
              </View>
              <Text style={styles.title}>{event.title}</Text>
              {event.subtitle ? <Text style={styles.subtitle}>{event.subtitle}</Text> : null}

              <Pressable
                accessibilityRole="link"
                accessibilityLabel={`查看${event.tenant_display_name}酒吧详情`}
                onPress={() => {
                  trackEvent('bar_opened', {
                    tenant_id: event.tenant_id,
                    tenant_slug: event.tenant_slug,
                    source: 'bar_event',
                  })
                  router.push({ pathname: '/bar/[slug]', params: { slug: event.tenant_slug } })
                }}
                style={({ pressed }) => [styles.venueLink, pressed && styles.venueLinkPressed]}>
                <FontAwesome name="map-marker" size={15} color={palette.tungsten} />
                <Text style={styles.venueLinkName} numberOfLines={1} ellipsizeMode="tail">
                  {event.tenant_display_name}
                </Text>
                <FontAwesome name="chevron-right" size={11} color={palette.faint} />
              </Pressable>

              {dateLabel || event.time_label || event.display_time ? (
                <View style={styles.metaBlock}>
                  <View style={styles.metaRow}>
                    <FontAwesome name="clock-o" size={14} color={palette.tungsten} />
                    <View style={styles.metaCopy}>
                      {dateLabel ? <Text style={styles.metaText}>{dateLabel}</Text> : null}
                      {event.time_label ? <Text style={styles.metaSecondary}>{event.time_label}</Text> : null}
                      {!dateLabel && !event.time_label && event.display_time ? (
                        <Text style={styles.metaText}>{event.display_time}</Text>
                      ) : null}
                    </View>
                  </View>
                </View>
              ) : null}

              {event.description ? (
                <View style={styles.descriptionSection}>
                  <Text style={styles.sectionLabel}>活动介绍</Text>
                  <Text style={styles.description}>{event.description}</Text>
                </View>
              ) : null}

              <View style={styles.complianceFooter}>
                <Text style={styles.eventDisclaimer}>{EVENT_INFORMATION_DISCLAIMER}</Text>
                <Text style={styles.complianceText}>{TAPLIST_LEGAL_DISCLAIMER}</Text>
              </View>
            </View>
          </>
        ) : null}
      </ScrollView>
      {event?.image_url ? (
        <Modal
          animationType="fade"
          onRequestClose={() => setImageViewerVisible(false)}
          presentationStyle="fullScreen"
          statusBarTranslucent
          visible={imageViewerVisible}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="关闭完整图片"
            onPress={() => setImageViewerVisible(false)}
            style={styles.imageViewer}>
            <CachedImage
              accessibilityLabel={`活动完整图片：${event.title}`}
              contentFit="contain"
              pointerEvents="none"
              source={event.image_url}
              style={styles.fullImage}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="关闭完整图片"
              hitSlop={10}
              onPress={() => setImageViewerVisible(false)}
              style={({ pressed }) => [
                styles.imageViewerClose,
                { top: insets.top + spacing.sm },
                pressed && styles.imageViewerClosePressed,
              ]}>
              <FontAwesome name="close" size={18} color={palette.text} />
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
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
  paddedContent: {
    paddingHorizontal: spacing.md,
  },
  cover: {
    aspectRatio: 1,
    width: '100%',
  },
  coverFill: {
    flex: 1,
  },
  coverPressed: {
    opacity: 0.92,
  },
  coverScrim: {
    flex: 1,
  },
  imageViewer: {
    flex: 1,
    backgroundColor: palette.background,
  },
  fullImage: {
    flex: 1,
    width: '100%',
  },
  imageViewerClose: {
    position: 'absolute',
    right: spacing.md,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.panel,
    borderWidth: 1,
    borderColor: palette.line,
  },
  imageViewerClosePressed: {
    opacity: 0.72,
  },
  stateBadge: {
    alignSelf: 'flex-start',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: palette.goldMuted,
    backgroundColor: palette.panel,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
    marginBottom: spacing.sm,
  },
  typeLabel: {
    ...typography.label,
    color: palette.tungsten,
    fontSize: 10,
    lineHeight: 13,
    letterSpacing: 1,
  },
  title: {
    ...typography.headline,
    color: palette.text,
    fontSize: 32,
    lineHeight: 40,
  },
  subtitle: {
    ...typography.body,
    color: palette.muted,
    marginTop: spacing.xs,
  },
  venueLink: {
    alignSelf: 'flex-start',
    minHeight: 44,
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingRight: spacing.xs,
  },
  venueLinkPressed: {
    opacity: 0.72,
  },
  venueLinkName: {
    ...typography.title,
    color: palette.tungsten,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600',
    flexShrink: 1,
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
  metaCopy: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xxs,
  },
  metaText: {
    ...typography.caption,
    color: palette.muted,
  },
  metaSecondary: {
    ...typography.caption,
    color: palette.faint,
  },
  descriptionSection: {
    marginTop: spacing.xl,
  },
  sectionLabel: {
    ...typography.caption,
    color: palette.tungsten,
    fontWeight: '500',
    marginBottom: spacing.sm,
  },
  description: {
    ...typography.body,
    color: palette.text,
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
  eventDisclaimer: {
    ...typography.micro,
    color: palette.muted,
    marginBottom: spacing.sm,
  },
})
