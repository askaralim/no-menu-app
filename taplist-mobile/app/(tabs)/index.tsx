import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { Link, useRouter } from 'expo-router'
import { ActivityIndicator, ImageBackground, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { BlurView } from 'expo-blur'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { AtmosphereImage } from '@/components/taplist/AtmosphereImage'
import { palette, spacing, typography } from '@/constants/design'
import { DEFAULT_TAPLIST_CITY } from '@/constants/taplist'
import { TAPLIST_LEGAL_DISCLAIMER } from '@/constants/compliance'
import { fetchPublicBars, fetchPublicNewDrinks } from '@/lib/api/taplist'
import { formatRelativeUpdatedAt, sortPublicBarsByMenuUpdated } from '@/lib/formatTaplist'
import { useTaplistSupabaseReady } from '@/lib/useTaplistSupabaseReady'
import type { PublicBarRow, PublicNewTapRow } from '@/lib/types'

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

  const bars = sortPublicBarsByMenuUpdated(barsQuery.data ?? [])
  const newTaps = newTapsQuery.data ?? []

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
            <BarFeedCard key={bar.id} bar={bar} />
          ))}
        </View>
      )}

      <View style={styles.complianceFootnote}>
        <Text style={styles.complianceText}>{TAPLIST_LEGAL_DISCLAIMER}</Text>
      </View>
    </ScrollView>
  )
}

function NewTapTodaySection({ drinks }: { drinks: PublicNewTapRow[] }) {
  return (
    <View style={styles.newTapSection}>
      <Text style={styles.newTapKicker}>NEW ON TAP</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.newTapScrollView}
        contentContainerStyle={styles.newTapScroller}>
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
      <Text
        style={[styles.newTapDrinkName, hasImage && styles.newTapTextOnImage]}
        numberOfLines={2}
        ellipsizeMode="tail">
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

  const venueBadge = (
    <View style={[styles.newTapBarBadge, hasImage && styles.newTapBarBadgeOnImage]}>
      <Text style={styles.newTapVenue} numberOfLines={1} ellipsizeMode="tail">
        @ {drink.tenant_display_name}
      </Text>
    </View>
  )

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
            colors={['rgba(13,13,13,0.25)', 'rgba(13,13,13,0.70)', 'rgba(13,13,13,0.96)']}
            locations={[0, 0.5, 1]}
            style={styles.newTapImageScrim}>
            {textBlock}
            {venueBadge}
          </LinearGradient>
        </ImageBackground>
      ) : (
        <LinearGradient
          colors={['rgba(75,54,31,0.32)', 'rgba(13,13,13,0.58)', 'rgba(13,13,13,0.90)']}
          locations={[0, 0.58, 1]}
          style={styles.newTapCardContent}>
          {textBlock}
          {venueBadge}
        </LinearGradient>
      )}
    </Pressable>
  )
}

function BarFeedCard({
  bar,
}: {
  bar: PublicBarRow
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
  newTapSection: {
    marginBottom: spacing.xl,
  },
  newTapKicker: {
    ...typography.display,
    color: palette.tungsten,
    fontSize: 28,
    lineHeight: 32,
    letterSpacing: 0.8,
    marginBottom: spacing.xs,
  },
  newTapScrollView: {
    marginHorizontal: -spacing.lg,
    marginTop: spacing.xs,
  },
  newTapScroller: {
    paddingHorizontal: spacing.lg,
    gap: 12,
  },
  newTapCard: {
    width: 160,
    height: 122,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(198,168,117,0.34)',
    backgroundColor: palette.bgSoft,
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 14,
  },
  newTapCardImage: {
    borderColor: 'rgba(198,168,117,0.24)',
    backgroundColor: palette.panelElevated,
  },
  newTapImageFill: {
    flex: 1,
    width: '100%',
  },
  newTapImageRadius: {
    borderRadius: 12,
  },
  newTapImageScrim: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    justifyContent: 'flex-end',
    alignItems: 'flex-start',
  },
  newTapCardContent: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    justifyContent: 'flex-end',
    alignItems: 'flex-start',
  },
  newTapCardPressed: {
    opacity: 0.78,
  },
  newTapCardBody: {
    alignSelf: 'stretch',
    minWidth: 0,
    alignItems: 'flex-start',
  },
  newTapBarBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(198,168,117,0.08)',
    borderRadius: 4,
    borderWidth: 0.5,
    borderColor: 'rgba(198,168,117,0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    maxWidth: '100%',
    marginTop: 4,
  },
  newTapBarBadgeOnImage: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderColor: 'rgba(198,168,117,0.3)',
  },
  newTapDrinkName: {
    ...typography.caption,
    color: palette.text,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '600',
    maxWidth: '100%',
    marginBottom: 6,
  },
  newTapMeta: {
    ...typography.micro,
    color: palette.muted,
    fontSize: 11,
    lineHeight: 15,
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
  newTapVenue: {
    ...typography.micro,
    color: palette.tungsten,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600',
    maxWidth: '100%',
  },
  newTapTextOnImage: {
    color: '#F5F1E8',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  newTapMetaOnImage: {
    color: 'rgba(245,241,232,0.86)',
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  newTapBrandOnImage: {
    color: 'rgba(245,241,232,0.72)',
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
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
    backgroundColor: 'rgba(8,8,8,0.82)',
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
    borderRadius: 4,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(245,241,230,0.16)',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: palette.liveGreen,
  },
  liveText: {
    ...typography.label,
    fontSize: 10,
    lineHeight: 13,
    letterSpacing: 1.5,
    color: palette.tungsten,
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
