import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { Link, useRouter } from 'expo-router'
import { ActivityIndicator, ImageBackground, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { BlurView } from 'expo-blur'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { AtmosphereImage } from '@/components/taplist/AtmosphereImage'
import { EventCard } from '@/components/taplist/EventCards'
import { RailVenueBadge } from '@/components/taplist/RailVenueBadge'
import {
  EVENT_RAIL_CARD_HEIGHT,
  RAIL_CARD_GAP,
  RAIL_CARD_HEIGHT,
  RAIL_CARD_IMAGE_BORDER,
  RAIL_CARD_RADIUS,
  RAIL_CARD_WIDTH,
  RAIL_IMAGE_SCRIM_COLORS,
  RAIL_IMAGE_SCRIM_LOCATIONS,
  RAIL_TEXT_ONLY_SCRIM_COLORS,
  RAIL_TEXT_ONLY_SCRIM_LOCATIONS,
  RAIL_TEXT_SHADOW,
  railCardBodyStyle,
  railCardScrimStyle,
  RAIL_VENUE_PILL_BACKGROUND,
  RAIL_VENUE_PILL_BORDER,
  railVenueLabelStyle,
} from '@/components/taplist/railCardStyle'
import { palette, spacing, typography } from '@/constants/design'
import { DEFAULT_TAPLIST_CITY } from '@/constants/taplist'
import { TAPLIST_LEGAL_DISCLAIMER } from '@/constants/compliance'
import { fetchPublicBars, fetchPublicEvents, fetchPublicNewDrinks } from '@/lib/api/taplist'
import { formatRelativeUpdatedAt, sortPublicBarsByMenuUpdated } from '@/lib/formatTaplist'
import { useTaplistSupabaseReady } from '@/lib/useTaplistSupabaseReady'
import type { PublicBarRow, PublicEventRow, PublicNewTapRow } from '@/lib/types'

export default function TonightScreen() {
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()
  const configured = useTaplistSupabaseReady()

  useEffect(() => {
    if (!configured) return
    void queryClient.invalidateQueries({ queryKey: ['taplist'] })
  }, [configured, queryClient])

  const barsQuery = useQuery({
    queryKey: ['taplist', 'bars', DEFAULT_TAPLIST_CITY],
    queryFn: () => fetchPublicBars(DEFAULT_TAPLIST_CITY),
    enabled: configured,
    refetchOnMount: 'always',
  })

  const newTapsQuery = useQuery({
    queryKey: ['taplist', 'new-drinks', DEFAULT_TAPLIST_CITY],
    queryFn: () => fetchPublicNewDrinks(DEFAULT_TAPLIST_CITY),
    enabled: configured,
    refetchOnMount: 'always',
  })

  const eventsQuery = useQuery({
    queryKey: ['taplist', 'events', DEFAULT_TAPLIST_CITY],
    queryFn: () => fetchPublicEvents(DEFAULT_TAPLIST_CITY),
    enabled: configured,
    refetchOnMount: 'always',
  })

  const bars = sortPublicBarsByMenuUpdated(barsQuery.data ?? [])
  const newTaps = newTapsQuery.data ?? []
  const events = eventsQuery.data ?? []
  const firstEventsByTenant = firstEventByTenant(eventsQuery.isError ? [] : events)

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg }]}>
      <View style={styles.header}>
        <Text style={styles.title}>TONIGHT</Text>
        <Text style={styles.cityPreposition}>in</Text>
        <Text style={styles.city}>上海</Text>
        {bars.length > 0 ? (
          <Text style={styles.headerMeta}>{bars.length} 家精酿酒吧公开酒单</Text>
        ) : null}
      </View>

      {barsQuery.isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={palette.amber} />
          <Text style={styles.muted}>正在加载酒吧...</Text>
        </View>
      ) : null}

      {events.length > 0 && !eventsQuery.isError ? (
        <TonightEventsSection events={events.slice(0, 5)} />
      ) : null}

      {newTaps.length > 0 && !newTapsQuery.isError ? (
        <NewTapTodaySection drinks={newTaps} />
      ) : null}

      {!configured ? (
        <EmptyState title="尚未连接酒单服务" body="请配置 Supabase 环境变量后查看实时公开酒单。" />
      ) : barsQuery.isError ? (
        <EmptyState
          title="暂时无法加载酒吧"
          body="若系统询问是否允许使用网络，请选择「无线局域网与蜂窝网络」，然后点重试。"
          actionLabel="重试"
          onAction={() => void barsQuery.refetch()}
          actionLoading={barsQuery.isFetching}
        />
      ) : bars.length === 0 && !barsQuery.isLoading ? (
        <EmptyState title="暂无公开酒吧" body="当前城市还没有已发布的公开酒单。" />
      ) : (
        <View style={[styles.feed, newTaps.length > 0 && !newTapsQuery.isError && styles.feedAfterNewTaps]}>
          {bars.map((bar) => (
            <BarFeedCard key={bar.id} bar={bar} event={firstEventsByTenant[bar.id] ?? null} />
          ))}
        </View>
      )}

      <View style={styles.complianceFootnote}>
        <Text style={styles.complianceText}>{TAPLIST_LEGAL_DISCLAIMER}</Text>
      </View>
    </ScrollView>
  )
}

function TonightEventsSection({ events }: { events: PublicEventRow[] }) {
  return (
    <View style={[styles.discoverySection, styles.eventsDiscoverySection]}>
      <View style={styles.discoveryHeaderRow}>
        <View>
          <Text style={styles.discoveryTitle}>EVENTS</Text>
        </View>
        <Link href="/events" asChild>
          <Pressable
            hitSlop={{ top: 10, right: 4, bottom: 10, left: 12 }}
            style={({ pressed }) => [styles.moreLink, pressed && styles.moreLinkPressed]}>
            <Text style={styles.moreText}>更多 ›</Text>
          </Pressable>
        </Link>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.discoveryScrollView, styles.eventRailScrollView]}
        contentContainerStyle={styles.discoveryScroller}>
        {events.map((event) => (
          <EventCard key={event.id} event={event} compact />
        ))}
      </ScrollView>
    </View>
  )
}

function NewTapTodaySection({ drinks }: { drinks: PublicNewTapRow[] }) {
  return (
    <View style={styles.discoverySection}>
      <View style={styles.discoveryHeaderRow}>
        <Text style={styles.discoveryTitle}>NEW ON TAP</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.discoveryScrollView, styles.newTapRailScrollView]}
        contentContainerStyle={styles.discoveryScroller}>
        {drinks.map((drink) => (
          <NewTapCard key={drink.drink_id} drink={drink} />
        ))}
      </ScrollView>
    </View>
  )
}

function NewTapCard({ drink }: { drink: PublicNewTapRow }) {
  const router = useRouter()
  const typeLine = drink.beer_style ?? null
  const brandLine = drink.brewery ?? drink.brand_name ?? null
  const accessibilityLabel = [drink.name, typeLine, brandLine, `@ ${drink.tenant_display_name}`]
    .filter(Boolean)
    .join('，')
  const hasImage = Boolean(drink.image_url)

  const textBlock = (
    <View style={styles.newTapCardBody}>
      <Text style={styles.newTapDrinkName} numberOfLines={2} ellipsizeMode="tail">
        {drink.name}
      </Text>
      {typeLine ? (
        <Text
          style={[styles.newTapMeta, hasImage && styles.newTapMetaOnImage]}
          numberOfLines={1}
          ellipsizeMode="tail">
          {typeLine}
        </Text>
      ) : null}
      {brandLine ? (
        <Text
          style={[styles.newTapBrand, hasImage && styles.newTapBrandOnImage]}
          numberOfLines={1}
          ellipsizeMode="tail">
          {brandLine}
        </Text>
      ) : null}
    </View>
  )

  const venueBadge = <RailVenueBadge name={drink.tenant_display_name} />

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={() => router.push(`/bar/${drink.tenant_slug}/beer/${drink.drink_id}`)}
      style={({ pressed }) => [
        styles.newTapCard,
        hasImage && styles.newTapCardImage,
        pressed && styles.newTapCardPressed,
      ]}>
      {hasImage ? (
        <ImageBackground
          source={{ uri: drink.image_url as string }}
          style={styles.newTapImageFill}
          imageStyle={styles.newTapImageRadius}>
          <LinearGradient
            colors={RAIL_IMAGE_SCRIM_COLORS}
            locations={RAIL_IMAGE_SCRIM_LOCATIONS}
            style={styles.newTapImageScrim}>
            {textBlock}
            {venueBadge}
          </LinearGradient>
        </ImageBackground>
      ) : (
        <LinearGradient
          colors={RAIL_TEXT_ONLY_SCRIM_COLORS}
          locations={RAIL_TEXT_ONLY_SCRIM_LOCATIONS}
          style={styles.newTapCardContent}>
          {textBlock}
          {venueBadge}
        </LinearGradient>
      )}
      <View pointerEvents="none" style={styles.railBorderOverlay} />
    </Pressable>
  )
}

function BarFeedCard({
  bar,
  event,
}: {
  bar: PublicBarRow
  event: PublicEventRow | null
}) {
  const location = shortBarLocation(bar)
  const feedStatus = compactStatusCounts(bar)
  const updatedLabel = formatRelativeUpdatedAt(bar.last_menu_updated_at)

  return (
    <Link href={`/bar/${bar.slug}`} asChild>
      <Pressable style={({ pressed }) => [styles.feedCard, pressed && styles.feedCardPressed]}>
        <View style={styles.imageFrame}>
          <AtmosphereImage source={bar.cover_image_url} aspectRatio={4 / 3} overlayOpacity={0.24}>
            <View style={styles.cardOverlay}>
              <View style={styles.cardRule} />
              <Text style={styles.barName}>{bar.display_name || bar.name}</Text>
              <Text style={styles.barMeta} numberOfLines={1} ellipsizeMode="tail">
                {location}
              </Text>
              {feedStatus ? <Text style={styles.barStatus}>{feedStatus}</Text> : null}
            </View>
          </AtmosphereImage>
          {updatedLabel ? (
            <BlurView intensity={24} tint="dark" style={styles.livePill} pointerEvents="none">
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>{updatedLabel}</Text>
            </BlurView>
          ) : null}
          {event ? (
            <BlurView intensity={24} tint="dark" style={styles.eventPill} pointerEvents="none">
              <Text style={styles.eventPillText} numberOfLines={1} ellipsizeMode="tail">
                {event.title}
              </Text>
            </BlurView>
          ) : null}
        </View>
      </Pressable>
    </Link>
  )
}

function shortBarLocation(bar: PublicBarRow) {
  const district = bar.district?.trim()
  const address = bar.address?.trim()

  if (district && address) return `${district} · ${address}`
  if (address) return address
  if (district) return district
  return bar.city
}

function compactStatusCounts(bar: PublicBarRow) {
  const counts = bar.status_counts
  if (!counts) return null

  const parts = [
    counts.上新 > 0 ? `${counts.上新} 上新` : null,
    counts.在售 > 0 ? `${counts.在售} 在售` : null,
    counts.少量 > 0 ? `${counts.少量} 少量` : null,
  ].filter(Boolean)

  return parts.length > 0 ? parts.join(' · ') : null
}

function firstEventByTenant(events: PublicEventRow[]) {
  return events.reduce<Record<string, PublicEventRow>>((acc, event) => {
    if (!acc[event.tenant_id]) acc[event.tenant_id] = event
    return acc
  }, {})
}

function EmptyState({
  title,
  body,
  actionLabel,
  onAction,
  actionLoading,
}: {
  title: string
  body: string
  actionLabel?: string
  onAction?: () => void
  actionLoading?: boolean
}) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
      {actionLabel && onAction ? (
        <Pressable
          style={({ pressed }) => [styles.retryButton, pressed && styles.retryButtonPressed]}
          onPress={onAction}
          disabled={actionLoading}>
          {actionLoading ? (
            <ActivityIndicator color={palette.background} size="small" />
          ) : (
            <Text style={styles.retryButtonText}>{actionLabel}</Text>
          )}
        </Pressable>
      ) : null}
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
    paddingBottom: 84,
    paddingTop: spacing.xl,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  city: {
    ...typography.title,
    color: palette.tungsten,
    marginTop: spacing.xxs,
    textAlign: 'center',
  },
  cityPreposition: {
    ...typography.caption,
    color: palette.faint,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  title: {
    ...typography.displayXL,
    color: palette.text,
    textAlign: 'center',
    textShadowColor: 'rgba(245,241,230,0.12)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 18,
  },
  headerMeta: {
    ...typography.caption,
    color: palette.muted,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  loading: {
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.panel,
    borderRadius: 8,
    padding: spacing.sm,
    marginBottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  muted: {
    ...typography.caption,
    color: palette.muted,
  },
  discoverySection: {
    marginBottom: spacing.xl,
  },
  eventsDiscoverySection: {
    marginBottom: spacing.xxl,
  },
  discoveryHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.xxs,
  },
  discoveryTitle: {
    ...typography.display,
    color: palette.tungsten,
    fontSize: 28,
    lineHeight: 32,
    letterSpacing: 0.8,
  },
  moreLink: {
    paddingLeft: spacing.md,
    paddingRight: 2,
    justifyContent: 'center',
  },
  moreLinkPressed: {
    opacity: 0.72,
  },
  moreText: {
    ...typography.caption,
    color: palette.tungsten,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  discoveryScrollView: {
    marginHorizontal: -spacing.lg,
    marginTop: 0,
  },
  eventRailScrollView: {
    height: EVENT_RAIL_CARD_HEIGHT,
  },
  newTapRailScrollView: {
    height: RAIL_CARD_HEIGHT,
  },
  discoveryScroller: {
    paddingHorizontal: spacing.lg,
    gap: RAIL_CARD_GAP,
    alignItems: 'flex-start',
    flexGrow: 0,
  },
  newTapCard: {
    width: RAIL_CARD_WIDTH,
    minWidth: RAIL_CARD_WIDTH,
    height: RAIL_CARD_HEIGHT,
    borderRadius: RAIL_CARD_RADIUS,
    backgroundColor: palette.bgSoft,
    overflow: 'hidden',
    position: 'relative',
    flexShrink: 0,
  },
  newTapCardImage: {
    backgroundColor: palette.panelElevated,
  },
  railBorderOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: RAIL_CARD_RADIUS,
    borderWidth: 1,
    borderColor: RAIL_CARD_IMAGE_BORDER,
  },
  newTapImageFill: {
    flex: 1,
    width: '100%',
  },
  newTapImageRadius: {
    borderRadius: RAIL_CARD_RADIUS,
  },
  newTapImageScrim: {
    ...railCardScrimStyle,
  },
  newTapCardContent: {
    ...railCardScrimStyle,
  },
  newTapCardPressed: {
    opacity: 0.78,
  },
  newTapCardBody: {
    ...railCardBodyStyle,
  },
  newTapDrinkName: {
    ...typography.caption,
    color: palette.text,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '600',
    maxWidth: '100%',
    ...RAIL_TEXT_SHADOW,
  },
  newTapMeta: {
    ...typography.micro,
    color: palette.muted,
    fontSize: 11,
    lineHeight: 15,
    marginTop: spacing.xxs,
    marginBottom: 2,
    maxWidth: '100%',
  },
  newTapBrand: {
    ...typography.micro,
    color: palette.faint,
    fontSize: 11,
    lineHeight: 15,
    maxWidth: '100%',
  },
  newTapMetaOnImage: {
    color: 'rgba(245,241,232,0.86)',
    ...RAIL_TEXT_SHADOW,
  },
  newTapBrandOnImage: {
    color: 'rgba(245,241,232,0.72)',
    ...RAIL_TEXT_SHADOW,
  },
  feed: {
    gap: spacing.xl,
  },
  feedAfterNewTaps: {
    marginTop: spacing.md,
  },
  feedCard: {
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: palette.hairline,
    backgroundColor: 'rgba(21,21,21,0.42)',
  },
  feedCardPressed: {
    opacity: 0.82,
  },
  imageFrame: {
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: palette.panelElevated,
  },
  cardOverlay: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.lg,
    alignItems: 'flex-start',
  },
  cardRule: {
    width: spacing.xl,
    height: 2,
    backgroundColor: palette.goldMuted,
    marginBottom: spacing.md,
  },
  barName: {
    ...typography.displayL,
    color: palette.text,
  },
  barMeta: {
    ...typography.caption,
    color: palette.muted,
    marginTop: spacing.xs,
  },
  livePill: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: RAIL_VENUE_PILL_BACKGROUND,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
    borderRadius: 4,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: RAIL_VENUE_PILL_BORDER,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: palette.liveGreen,
  },
  liveText: {
    ...typography.label,
    ...railVenueLabelStyle,
  },
  eventPill: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    maxWidth: '58%',
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
    borderRadius: 4,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(211,154,69,0.42)',
  },
  eventPillText: {
    ...typography.label,
    fontSize: 10,
    lineHeight: 13,
    letterSpacing: 1.2,
    color: palette.amber,
  },
  barStatus: {
    ...typography.label,
    color: palette.tungsten,
    fontSize: 10,
    lineHeight: 14,
    marginTop: spacing.sm,
  },
  emptyState: {
    borderTopWidth: 1,
    borderTopColor: palette.hairline,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
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
  retryButton: {
    marginTop: spacing.lg,
    alignSelf: 'flex-start',
    backgroundColor: palette.tungsten,
    borderRadius: 8,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    minWidth: 88,
    alignItems: 'center',
  },
  retryButtonPressed: {
    opacity: 0.85,
  },
  retryButtonText: {
    ...typography.title,
    color: palette.background,
    fontSize: 14,
  },
  complianceFootnote: {
    marginTop: spacing.lg,
    paddingTop: spacing.xs,
  },
  complianceText: {
    ...typography.micro,
    color: palette.faint,
  },
})
