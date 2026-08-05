import FontAwesome from '@expo/vector-icons/FontAwesome'
import { useQuery } from '@tanstack/react-query'

import { Link, useLocalSearchParams } from 'expo-router'
import { useRef, useState, type ReactNode } from 'react'
import { ActivityIndicator, Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { AtmosphereImage } from '@/components/taplist/AtmosphereImage'
import { BackButton } from '@/components/taplist/BackButton'
import { BarTagRow } from '@/components/taplist/BarTagRow'
import { BeerRoadmapSection } from '@/components/taplist/BeerRoadmapSection'
import { BeerListCard } from '@/components/taplist/BeerListCard'
import { BrewingBadgeFromType } from '@/components/taplist/BrewingBadge'
import { EventCard } from '@/components/taplist/EventCards'
import { BEER_CARD_GAP, EVENT_RAIL_CARD_HEIGHT, RAIL_CARD_GAP } from '@/components/taplist/railCardStyle'
import {
  ShareableBarTaplistImage,
  type ShareableBarTaplistImageHandle,
} from '@/components/taplist/ShareableBarTaplistImage'
import { palette, spacing, typography } from '@/constants/design'
import { formatOpeningHourLabel } from '@/lib/openingHour'
import { buildAppleMapsPlaceUrl } from '@/lib/navigationLinks'
import { TAPLIST_LEGAL_DISCLAIMER } from '@/constants/compliance'
import { fetchPublicDrinks, fetchPublicTenantBySlug, fetchPublicTenantEvents } from '@/lib/api/taplist'
import { PhotoLibraryPermissionError, saveImageUriToPhotoLibrary } from '@/lib/saveImageToPhotoLibrary'
import { useTaplistSupabaseReady } from '@/lib/useTaplistSupabaseReady'
import { trackEvent } from '@/lib/analytics'
import { partitionPublicDrinks, type PublicEventRow } from '@/lib/types'

export default function BarDetailScreen() {
  const insets = useSafeAreaInsets()
  const shareableRef = useRef<ShareableBarTaplistImageHandle>(null)
  const [isSavingTaplist, setIsSavingTaplist] = useState(false)
  const { slug } = useLocalSearchParams<{ slug: string }>()
  const configured = useTaplistSupabaseReady()

  const tenantQuery = useQuery({
    queryKey: ['taplist', 'tenant', slug],
    queryFn: () => fetchPublicTenantBySlug(slug),
    enabled: configured && !!slug,
  })

  const tenantResult = tenantQuery.data
  const tenant = tenantResult?.ok ? tenantResult.tenant : null

  const drinksQuery = useQuery({
    queryKey: ['taplist', 'drinks', tenant?.id],
    queryFn: () => fetchPublicDrinks(tenant!.id),
    enabled: configured && !!tenant?.id,
  })

  const eventsQuery = useQuery({
    queryKey: ['taplist', 'tenant-events', tenant?.id],
    queryFn: () => fetchPublicTenantEvents(tenant!.id),
    enabled: configured && !!tenant?.id,
    refetchOnMount: 'always',
  })

  const drinkResult = drinksQuery.data
  const partitions = drinkResult?.ok
    ? partitionPublicDrinks(drinkResult)
    : { drinks: [], comingSoon: [], recentlySoldOut: [], allForLookup: [] }
  const drinks = partitions.drinks
  const comingSoon = partitions.comingSoon
  const recentlySoldOut = partitions.recentlySoldOut
  const events = eventsQuery.data ?? []
  const shareDrinks = [...drinks, ...comingSoon]
  const hasAnyDrinks = shareDrinks.length > 0 || recentlySoldOut.length > 0
  const openingHoursLabel = tenant ? formatOpeningHourLabel(tenant.opening_hour) : null
  const canSaveTaplist = Boolean(tenant && shareDrinks.length > 0 && !isSavingTaplist)
  const appleMapsUrl =
    Platform.OS === 'ios' &&
    tenant &&
    typeof tenant.latitude === 'number' &&
    Number.isFinite(tenant.latitude) &&
    tenant.latitude >= -90 &&
    tenant.latitude <= 90 &&
    typeof tenant.longitude === 'number' &&
    Number.isFinite(tenant.longitude) &&
    tenant.longitude >= -180 &&
    tenant.longitude <= 180
      ? buildAppleMapsPlaceUrl({
          latitude: tenant.latitude,
          longitude: tenant.longitude,
          label: tenant.display_name || tenant.name,
        })
      : null

  const handleOpenAppleMaps = () => {
    if (!appleMapsUrl || !tenant) return
    trackEvent('apple_maps_opened', {
      destination_tenant_id: tenant.id,
      source: 'bar_address',
    })
    void Linking.openURL(appleMapsUrl).catch((error) => {
      console.warn('Open Apple Maps place failed', error)
      Alert.alert('暂时无法打开 Apple Maps', '请稍后重试')
    })
  }

  const handleSaveTaplistImage = async () => {
    if (!tenant || shareDrinks.length === 0) {
      Alert.alert('暂无可保存的酒单')
      return
    }
    if (isSavingTaplist) return

    try {
      setIsSavingTaplist(true)
      const uri = await shareableRef.current?.capture()
      if (!uri) {
        trackEvent('taplist_image_save_failed', {
          tenant_id: tenant.id,
          reason: 'capture_failed',
        })
        Alert.alert('保存失败', '酒单图片生成失败，请稍后再试')
        return
      }

      await saveImageUriToPhotoLibrary(uri)
      trackEvent('taplist_image_save_succeeded', { tenant_id: tenant.id })
      Alert.alert('保存成功', '酒单已保存到相册')
    } catch (error) {
      if (error instanceof PhotoLibraryPermissionError) {
        trackEvent('taplist_image_save_failed', {
          tenant_id: tenant.id,
          reason: 'permission_denied',
        })
        Alert.alert('无法保存', '需要相册权限才能保存酒单')
        return
      }
      trackEvent('taplist_image_save_failed', { tenant_id: tenant.id, reason: 'unknown' })
      console.error('Save taplist image failed', error)
      Alert.alert('保存失败', '酒单图片生成失败，请稍后再试')
    } finally {
      setIsSavingTaplist(false)
    }
  }

  return (
    <View style={styles.screen}>
      <BackButton />
      {tenant ? (
        <Pressable
          accessibilityLabel="保存酒单图片"
          hitSlop={10}
          disabled={!canSaveTaplist}
          onPress={handleSaveTaplistImage}
          style={({ pressed }) => [
            styles.downloadButton,
            { top: insets.top + 14 },
            !canSaveTaplist && styles.downloadButtonDisabled,
            pressed && canSaveTaplist && styles.downloadButtonPressed,
          ]}>
          {isSavingTaplist ? (
            <ActivityIndicator size="small" color={palette.amber} />
          ) : (
            <FontAwesome name="download" size={16} color={canSaveTaplist ? palette.text : palette.faint} />
          )}
        </Pressable>
      ) : null}
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.scrollContent}>
        {tenant ? (
          <>
            <AtmosphereImage source={tenant.cover_image_url} aspectRatio={4 / 3} overlayOpacity={0.54} borderRadius={0}>
              <View style={styles.heroCopy}>
                <Text style={styles.title}>{tenant.display_name || tenant.name}</Text>
                <BrewingBadgeFromType
                  brewingType={tenant.brewing_type}
                  brewingLabel={tenant.brewing_label}
                  variant="hero"
                />
                {(tenant.address || openingHoursLabel) ? (
                  <View style={[styles.heroMeta, styles.heroMetaAfterTitle]}>
                    {tenant.address ? (
                      <Pressable
                        accessibilityRole={appleMapsUrl ? 'link' : undefined}
                        accessibilityLabel={appleMapsUrl ? `在 Apple Maps 中查看 ${tenant.display_name || tenant.name}` : undefined}
                        disabled={!appleMapsUrl}
                        hitSlop={8}
                        onPress={handleOpenAppleMaps}
                        style={({ pressed }) => [
                          styles.heroMetaRow,
                          appleMapsUrl && styles.heroAddressLink,
                          pressed && appleMapsUrl && styles.heroAddressPressed,
                        ]}>
                        <FontAwesome name="map-marker" size={13} color={palette.muted} />
                        <Text style={[styles.heroMetaText, appleMapsUrl && styles.heroAddressText]}>{tenant.address}</Text>
                        {appleMapsUrl ? (
                          <View style={styles.heroMapHint}>
                            <FontAwesome name="location-arrow" size={13} color={palette.amber} />
                          </View>
                        ) : null}
                      </Pressable>
                    ) : null}
                    {openingHoursLabel ? (
                      <View style={styles.heroMetaRow}>
                        <FontAwesome name="clock-o" size={13} color={palette.muted} />
                        <Text style={styles.heroMetaText}>{openingHoursLabel}</Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </View>
            </AtmosphereImage>
            
            <View style={styles.paddedContent}>
              {tenant.description ? (
                <View style={styles.barDescriptionStrip}>
                  <Text style={styles.barDescription}>{tenant.description}</Text>
                </View>
              ) : null}
              {tenant.tags && tenant.tags.length > 0 ? <BarTagRow tags={tenant.tags} /> : null}
              {events.length > 0 && !eventsQuery.isError ? (
                <BarEventsSection slug={tenant.slug} events={events} />
              ) : null}
            </View>
          </>
        ) : null}

        <View style={styles.paddedContent}>
          {(tenantQuery.isLoading || drinksQuery.isLoading) && configured ? (
            <View style={styles.loading}>
              <ActivityIndicator color={palette.amber} />
              <Text style={styles.muted}>正在加载实时酒单...</Text>
            </View>
          ) : null}

          {!configured ? (
            <EmptyState title="尚未连接酒单服务" body="请配置 Supabase 环境变量后查看实时公开酒单。" />
          ) : tenantQuery.isError || tenantResult?.ok === false ? (
            <EmptyState title="找不到这家酒吧" body="该酒吧可能尚未发布公开酒单，或链接已经失效。" />
          ) : tenant ? (
            <>
              {drinksQuery.isError || drinkResult?.ok === false ? (
                <EmptyState title="暂时无法加载酒单" body="请稍后重试，或以门店实际供应为准。" />
              ) : !hasAnyDrinks && !drinksQuery.isLoading ? (
                <EmptyState title="暂无公开酒款" body="这家酒吧当前还没有发布可展示的酒单。" />
              ) : (
                <>
                  {drinks.length > 0 ? (
                    <TapListSection title={`今晚 ${drinks.length} 款`}>
                      {drinks.map((drink) => (
                        <BeerListCard
                          key={drink.id}
                          drink={drink}
                          slug={tenant.slug}
                          tenantId={tenant.id}
                        />
                      ))}
                    </TapListSection>
                  ) : null}
                  {comingSoon.length > 0 ? (
                    <TapListSection title={`即将上新 ${comingSoon.length}`}>
                      {comingSoon.map((drink) => (
                        <BeerListCard
                          key={drink.id}
                          drink={drink}
                          slug={tenant.slug}
                          tenantId={tenant.id}
                        />
                      ))}
                    </TapListSection>
                  ) : null}
                  {recentlySoldOut.length > 0 ? (
                    <TapListSection title={`刚售罄 ${recentlySoldOut.length}`} muted>
                      {recentlySoldOut.map((drink) => (
                        <BeerListCard
                          key={drink.id}
                          drink={drink}
                          slug={tenant.slug}
                          tenantId={tenant.id}
                        />
                      ))}
                    </TapListSection>
                  ) : null}
                </>
              )}
              <BeerRoadmapSection startTenantId={tenant.id} enabled={configured} />
            </>
          ) : null}

          <View style={styles.complianceFooter}>
            <Text style={styles.complianceText}>{TAPLIST_LEGAL_DISCLAIMER}</Text>
          </View>
        </View>
      </ScrollView>
      {tenant && shareDrinks.length > 0 ? (
        <View pointerEvents="none" style={styles.shareableCanvas}>
          <ShareableBarTaplistImage ref={shareableRef} tenant={tenant} drinks={shareDrinks} />
        </View>
      ) : null}
      {isSavingTaplist ? (
        <View style={styles.saveOverlay} pointerEvents="none">
          <View style={styles.saveToast}>
            <ActivityIndicator size="small" color={palette.amber} />
            <Text style={styles.saveText}>正在保存酒单</Text>
          </View>
        </View>
      ) : null}
    </View>
  )
}

function TapListSection({
  title,
  muted,
  children,
}: {
  title: string
  muted?: boolean
  children: ReactNode
}) {
  return (
    <View style={styles.tapListSection}>
      <View style={styles.tapListHeader}>
        <Text style={[styles.tapListSub, muted && styles.tapListSubMuted]}>{title}</Text>
      </View>
      <View style={styles.tapList}>{children}</View>
    </View>
  )
}

function BarEventsSection({ slug, events }: { slug: string; events: PublicEventRow[] }) {
  const visibleEvents = events.slice(0, 3)
  const showMore = events.length > 3

  return (
    <View style={styles.eventsSection}>
      <View style={styles.eventsHeader}>
        <View>
          <Text style={styles.eventsTitle}>EVENTS</Text>
        </View>
        {showMore ? (
          <Link href={{ pathname: '/bar/[slug]/events', params: { slug } }} asChild>
            <Pressable style={({ pressed }) => [styles.moreLink, pressed && styles.moreLinkPressed]}>
              <Text style={styles.moreText}>更多 ›</Text>
            </Pressable>
          </Link>
        ) : null}
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.eventScrollView, styles.eventRailHeight]}
        contentContainerStyle={styles.eventScroller}>
        {visibleEvents.map((event) => (
          <EventCard key={event.id} event={event} showVenue={false} source="bar_event" />
        ))}
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
  downloadButton: {
    position: 'absolute',
    right: 16,
    zIndex: 10,
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(17,17,17,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(245,241,230,0.14)',
  },
  downloadButtonPressed: {
    transform: [{ scale: 0.96 }],
  },
  downloadButtonDisabled: {
    opacity: 0.48,
  },
  shareableCanvas: {
    position: 'absolute',
    left: -10000,
    top: 0,
  },
  saveOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  saveToast: {
    minWidth: 148,
    minHeight: 52,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(245,241,230,0.14)',
    backgroundColor: 'rgba(17,17,17,0.92)',
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  saveText: {
    ...typography.caption,
    color: palette.text,
  },
  scrollContent: {
    paddingBottom: spacing.xxl,
  },
  paddedContent: {
    paddingHorizontal: spacing.md,
  },
  heroCopy: {
    transform: [{ translateY: 12 }],
  },
  heroKicker: {
    ...typography.label,
    color: palette.tungsten,
    fontSize: 10,
    lineHeight: 14,
    marginBottom: spacing.sm,
  },
  title: {
    ...typography.displayL,
    color: palette.text,
  },
  heroMeta: {
    gap: spacing.xxs,
  },
  heroMetaAfterTitle: {
    marginTop: spacing.sm,
  },
  heroMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  heroMetaText: {
    ...typography.caption,
    color: palette.muted,
    flex: 1,
  },
  heroAddressLink: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  heroAddressText: {
    flex: 0,
    flexShrink: 1,
    color: 'rgba(245,241,230,0.82)',
  },
  heroMapHint: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: 'rgba(211,154,69,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(211,154,69,0.28)',
  },
  heroAddressPressed: {
    opacity: 0.62,
  },
  barDescriptionStrip: {
    borderBottomWidth: 1,
    borderBottomColor: palette.hairline,
    paddingVertical: spacing.md,
  },
  barDescription: {
    ...typography.caption,
    color: palette.faint,
  },
  eventsSection: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  eventsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  eventsTitle: {
    ...typography.display,
    color: palette.tungsten,
    fontSize: 28,
    lineHeight: 32,
    letterSpacing: 0.8,
  },
  moreLink: {
    minHeight: 44,
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
  eventScrollView: {
    marginHorizontal: -spacing.md,
    marginTop: spacing.xs,
  },
  eventRailHeight: {
    height: EVENT_RAIL_CARD_HEIGHT,
  },
  eventScroller: {
    paddingHorizontal: spacing.md,
    gap: RAIL_CARD_GAP,
    alignItems: 'flex-start',
    flexGrow: 0,
  },
  loading: {
    marginTop: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.panel,
    padding: spacing.sm,
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  muted: {
    ...typography.caption,
    color: palette.muted,
  },
  tapListSection: {
    marginTop: spacing.lg,
  },
  tapListHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginBottom: spacing.md,
  },
  tapListSub: {
    ...typography.caption,
    color: 'rgba(245,238,225,0.62)',
    fontWeight: '600',
  },
  tapListSubMuted: {
    color: 'rgba(245,238,225,0.38)',
  },
  tapList: {
    gap: BEER_CARD_GAP,
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
  emptyState: {
    borderTopWidth: 1,
    borderTopColor: palette.hairline,
    paddingTop: spacing.lg,
    marginTop: spacing.lg,
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
})
