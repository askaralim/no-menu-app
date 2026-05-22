import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { Link } from 'expo-router'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { AtmosphereImage } from '@/components/taplist/AtmosphereImage'
import { palette, spacing, typography } from '@/constants/design'
import { DEFAULT_TAPLIST_CITY } from '@/constants/taplist'
import { TAPLIST_LEGAL_DISCLAIMER } from '@/constants/compliance'
import { fetchPublicBars } from '@/lib/api/taplist'
import { sortPublicBarsByMenuUpdated } from '@/lib/formatTaplist'
import { useTaplistSupabaseReady } from '@/lib/useTaplistSupabaseReady'
import type { PublicBarRow } from '@/lib/types'

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

  const bars = sortPublicBarsByMenuUpdated(barsQuery.data ?? [])

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg }]}>
      <View style={styles.header}>
        <Text style={styles.title}>TONIGHT</Text>
        <Text style={styles.cityPreposition}>in</Text>
        <Text style={styles.city}>上海</Text>
        {bars.length > 0 ? <Text style={styles.headerMeta}>{bars.length} 家酒吧公开酒单</Text> : null}
      </View>

      {barsQuery.isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={palette.amber} />
          <Text style={styles.muted}>正在加载酒吧...</Text>
        </View>
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
        <View style={styles.feed}>
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

function BarFeedCard({
  bar,
}: {
  bar: PublicBarRow
}) {
  const location = shortBarLocation(bar)
  const feedStatus = compactStatusCounts(bar)

  return (
    <Link href={`/bar/${bar.slug}`} asChild>
      <Pressable style={({ pressed }) => [styles.feedCard, pressed && styles.feedCardPressed]}>
        <View style={styles.imageFrame}>
          <AtmosphereImage source={bar.cover_image_url} aspectRatio={4 / 3} overlayOpacity={0.24}>
            <View style={styles.cardOverlay}>
              <View style={styles.cardRule} />
              <Text style={styles.barName}>{bar.display_name || bar.name}</Text>
              <Text style={styles.barMeta}>{location}</Text>
              {feedStatus ? <Text style={styles.barStatus}>{feedStatus}</Text> : null}
            </View>
          </AtmosphereImage>
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
  feed: {
    gap: spacing.xl,
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
