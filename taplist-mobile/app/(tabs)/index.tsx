import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import FontAwesome from '@expo/vector-icons/FontAwesome'
import { Link, useFocusEffect } from 'expo-router'
import { ActivityIndicator, Linking, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native'
import { BlurView } from 'expo-blur'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { AtmosphereImage } from '@/components/taplist/AtmosphereImage'
import { BrewingBadgeFromType } from '@/components/taplist/BrewingBadge'
import { HOME_EVENT_BANNER_HEIGHT, HomeEventBanner } from '@/components/taplist/HomeEventBanner'
import { NewTapRailCard } from '@/components/taplist/NewTapRailCard'
import { NearbyLocationSheet } from '@/components/taplist/NearbyLocationSheet'
import {
  RAIL_CARD_GAP,
  RAIL_CARD_HEIGHT,
  RAIL_VENUE_PILL_BACKGROUND,
  RAIL_VENUE_PILL_BORDER,
  railVenueLabelStyle,
} from '@/components/taplist/railCardStyle'
import { palette, spacing, typography } from '@/constants/design'
import { TAPLIST_LEGAL_DISCLAIMER } from '@/constants/compliance'
import { fetchPublicBars, fetchPublicEvents, fetchPublicNewDrinks } from '@/lib/api/taplist'
import { trackEvent } from '@/lib/analytics'
import { formatRelativeUpdatedAt, sortPublicBarsByMenuUpdated } from '@/lib/formatTaplist'
import { formatDistance, publicBarCoordinates, sortBarsByDistance, type Coordinates } from '@/lib/nearbyBars'
import { fetchNearbyLocation, getNearbyPermissionState, requestNearbyPermission } from '@/lib/nearbyLocation'
import { taplistCityMatches, useTaplistCity } from '@/lib/taplistCity'
import { useTaplistSupabaseReady } from '@/lib/useTaplistSupabaseReady'
import type { PublicBarRow, PublicEventRow, PublicNewTapRow, PublicTaplistCity } from '@/lib/types'

const HOME_STALE_TIME = 2 * 60_000
const LOCATION_CACHE_TIME = 5 * 60_000

type NearbyFailure = 'denied' | 'failed' | null

export default function TonightScreen() {
  const insets = useSafeAreaInsets()
  const configured = useTaplistSupabaseReady()
  const { selectedCity, cities, canSelectCity, selectCity } = useTaplistCity()
  const [cityPickerVisible, setCityPickerVisible] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [sortMode, setSortMode] = useState<'latest' | 'nearby'>('latest')
  const [nearbySheetVisible, setNearbySheetVisible] = useState(false)
  const [nearbyLoading, setNearbyLoading] = useState(false)
  const [nearbyOrigin, setNearbyOrigin] = useState<Coordinates | null>(null)
  const [detectedCity, setDetectedCity] = useState<PublicTaplistCity | null>(null)
  const [nearbyFailure, setNearbyFailure] = useState<NearbyFailure>(null)
  const locationCacheRef = useRef<{
    coordinates: Coordinates
    detectedCity: PublicTaplistCity | null
    expiresAt: number
  } | null>(null)
  const selectedCityName = selectedCity.city

  const barsQuery = useQuery({
    queryKey: ['taplist', 'bars', selectedCityName],
    queryFn: () => fetchPublicBars(selectedCityName),
    enabled: configured,
    staleTime: HOME_STALE_TIME,
  })

  const newTapsQuery = useQuery({
    queryKey: ['taplist', 'new-drinks', selectedCityName],
    queryFn: () => fetchPublicNewDrinks(selectedCityName),
    enabled: configured,
    staleTime: HOME_STALE_TIME,
  })

  const eventsQuery = useQuery({
    queryKey: ['taplist', 'events', selectedCityName],
    queryFn: () => fetchPublicEvents(selectedCityName),
    enabled: configured,
    staleTime: HOME_STALE_TIME,
  })

  useFocusEffect(
    useCallback(() => {
      const now = Date.now()
      if (barsQuery.dataUpdatedAt > 0 && now - barsQuery.dataUpdatedAt >= HOME_STALE_TIME) {
        void barsQuery.refetch()
      }
      if (newTapsQuery.dataUpdatedAt > 0 && now - newTapsQuery.dataUpdatedAt >= HOME_STALE_TIME) {
        void newTapsQuery.refetch()
      }
      if (eventsQuery.dataUpdatedAt > 0 && now - eventsQuery.dataUpdatedAt >= HOME_STALE_TIME) {
        void eventsQuery.refetch()
      }
    }, [
      barsQuery.dataUpdatedAt,
      barsQuery.refetch,
      eventsQuery.dataUpdatedAt,
      eventsQuery.refetch,
      newTapsQuery.dataUpdatedAt,
      newTapsQuery.refetch,
    ]),
  )

  const handleRefresh = async () => {
    if (!configured || refreshing) return
    setRefreshing(true)
    try {
      await Promise.allSettled([
        barsQuery.refetch(),
        newTapsQuery.refetch(),
        eventsQuery.refetch(),
      ])
    } finally {
      setRefreshing(false)
    }
  }

  const bars = sortPublicBarsByMenuUpdated(barsQuery.data ?? [])
  const nearbyAvailable = Platform.OS === 'ios' && bars.some((bar) => publicBarCoordinates(bar) !== null)
  const displayedBars = useMemo(
    () => sortMode === 'nearby' && nearbyOrigin
      ? sortBarsByDistance(bars, nearbyOrigin)
      : bars.map((bar) => ({ bar, distanceMeters: null })),
    [bars, nearbyOrigin, sortMode],
  )
  const newTaps = newTapsQuery.data ?? []
  const events = eventsQuery.data ?? []
  const firstEventsByTenant = firstEventByTenant(eventsQuery.isError ? [] : events)
  const cityMismatch = detectedCity && !taplistCityMatches(detectedCity.city, selectedCity.city)

  const loadNearbyLocation = async () => {
    if (nearbyLoading) return
    setNearbyLoading(true)
    setNearbyFailure(null)
    try {
      const cached = locationCacheRef.current
      const result = cached && cached.expiresAt > Date.now()
        ? cached
        : { ...(await fetchNearbyLocation(cities)), expiresAt: Date.now() + LOCATION_CACHE_TIME }
      locationCacheRef.current = result
      setNearbyOrigin(result.coordinates)
      setDetectedCity(result.detectedCity)
      setSortMode('nearby')
      trackEvent('nearby_sort_completed', {
        coordinate_bar_count: bars.filter((bar) => publicBarCoordinates(bar) !== null).length,
        total_bar_count: bars.length,
      })
    } catch {
      setSortMode('latest')
      setNearbyFailure('failed')
      trackEvent('nearby_sort_failed', { reason: 'location_unavailable' })
    } finally {
      setNearbyLoading(false)
    }
  }

  const activateNearby = async () => {
    if (!nearbyAvailable || nearbyLoading) return
    trackEvent('nearby_sort_selected')
    try {
      const permission = await getNearbyPermissionState()
      if (permission === 'undetermined') {
        setNearbySheetVisible(true)
        return
      }
      if (permission === 'denied') {
        setSortMode('latest')
        setNearbyFailure('denied')
        trackEvent('nearby_sort_failed', { reason: 'permission_denied' })
        return
      }
      await loadNearbyLocation()
    } catch {
      setSortMode('latest')
      setNearbyFailure('failed')
      trackEvent('nearby_sort_failed', { reason: 'permission_unavailable' })
    }
  }

  const confirmNearbyPermission = async () => {
    if (nearbyLoading) return
    setNearbyLoading(true)
    try {
      const permission = await requestNearbyPermission()
      if (permission !== 'granted') {
        setNearbySheetVisible(false)
        setSortMode('latest')
        setNearbyFailure('denied')
        trackEvent('nearby_sort_failed', { reason: 'permission_denied' })
        return
      }
      setNearbySheetVisible(false)
    } catch {
      setNearbySheetVisible(false)
      setNearbyFailure('failed')
      trackEvent('nearby_sort_failed', { reason: 'permission_unavailable' })
      return
    } finally {
      setNearbyLoading(false)
    }
    await loadNearbyLocation()
  }

  return (
    <ScrollView
      style={styles.screen}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void handleRefresh()}
          tintColor={palette.amber}
          progressViewOffset={insets.top + spacing.md}
        />
      }
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg }]}>
      <View style={styles.header}>
        <Text style={styles.title}>TONIGHT</Text>
        <Text style={styles.cityPreposition}>in</Text>
        {canSelectCity ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="选择城市"
            onPress={() => setCityPickerVisible(true)}
            style={({ pressed }) => [styles.cityButton, pressed && styles.cityButtonPressed]}>
            <Text style={styles.city}>{selectedCity.label}</Text>
            <FontAwesome name="angle-down" size={18} color={palette.tungsten} />
          </Pressable>
        ) : (
          <Text style={styles.city}>{selectedCity.label}</Text>
        )}
      </View>
      <CityPickerModal
        visible={cityPickerVisible}
        cities={cities}
        selectedCity={selectedCity}
        onClose={() => setCityPickerVisible(false)}
        onSelect={(city) => {
          setCityPickerVisible(false)
          if (!taplistCityMatches(city.city, selectedCity.city)) {
            trackEvent('city_changed', { from_city: selectedCity.city, to_city: city.city })
          }
          void selectCity(city)
        }}
      />
      <NearbyLocationSheet
        visible={nearbySheetVisible}
        cityLabel={selectedCity.label}
        loading={nearbyLoading}
        onClose={() => setNearbySheetVisible(false)}
        onContinue={() => void confirmNearbyPermission()}
      />

      {barsQuery.isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={palette.amber} />
          <Text style={styles.muted}>正在加载酒吧...</Text>
        </View>
      ) : null}

      {events.length > 0 && !eventsQuery.isError ? (
        <TonightEventsSection
          compactBottom={newTaps.length === 0 || newTapsQuery.isError}
          events={events.slice(0, 5)}
        />
      ) : null}

      {newTaps.length > 0 && !newTapsQuery.isError ? (
        <NewTapTodaySection drinks={newTaps} />
      ) : null}

      {bars.length > 0 ? (
        <View style={styles.barListHeader}>
          <View style={styles.barListToolbar}>
            <Text style={styles.barListTitle}>公开酒单 · {bars.length} 家</Text>
            {nearbyAvailable ? (
              <View style={styles.sortActions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="按最新酒单排序"
                  accessibilityState={{ selected: sortMode === 'latest' }}
                  onPress={() => {
                    setSortMode('latest')
                    setNearbyFailure(null)
                  }}
                  style={({ pressed }) => [
                    styles.sortAction,
                    sortMode === 'latest' && styles.sortActionSelected,
                    pressed && styles.cityButtonPressed,
                  ]}>
                  <Text style={[styles.sortActionText, sortMode === 'latest' && styles.sortActionTextSelected]}>
                    最新
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="按附近距离排序"
                  accessibilityState={{ selected: sortMode === 'nearby', busy: nearbyLoading }}
                  onPress={() => void activateNearby()}
                  style={({ pressed }) => [
                    styles.sortAction,
                    sortMode === 'nearby' && styles.sortActionSelected,
                    pressed && styles.cityButtonPressed,
                  ]}>
                  {nearbyLoading ? (
                    <ActivityIndicator size="small" color={palette.amber} />
                  ) : (
                    <FontAwesome name="location-arrow" size={12} color={sortMode === 'nearby' ? palette.amber : palette.faint} />
                  )}
                  <Text style={[styles.sortActionText, sortMode === 'nearby' && styles.sortActionTextSelected]}>
                    附近
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>
          {cityMismatch && detectedCity ? (
            <View style={styles.nearbyNoticeRow}>
              <Text style={styles.nearbyNoticeText} numberOfLines={2}>
                当前浏览{selectedCity.label} · 你可能在{detectedCity.label}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  trackEvent('city_changed', { from_city: selectedCity.city, to_city: detectedCity.city })
                  void selectCity(detectedCity)
                }}
                style={({ pressed }) => pressed && styles.cityButtonPressed}>
                <Text style={styles.nearbyNoticeAction}>切换城市</Text>
              </Pressable>
            </View>
          ) : nearbyFailure ? (
            <View style={styles.nearbyNoticeRow}>
              <Text accessibilityRole="alert" style={styles.nearbyNoticeText} numberOfLines={2}>
                {nearbyFailure === 'denied'
                  ? '未获得位置权限，已按最新酒单展示。'
                  : '暂时无法获取位置，已按最新酒单展示。'}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => nearbyFailure === 'denied'
                  ? void Linking.openSettings()
                  : void activateNearby()}
                style={({ pressed }) => pressed && styles.cityButtonPressed}>
                <Text style={styles.nearbyNoticeAction}>
                  {nearbyFailure === 'denied' ? '前往设置' : '重试'}
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      ) : null}

      {!configured ? (
        <EmptyState title="尚未连接酒单服务" body="请配置 Supabase 环境变量后查看实时公开酒单。" />
      ) : barsQuery.isError ? (
        <EmptyState
          title="暂时无法加载酒吧"
          body="若系统询问是否允许使用网络，请选择「无线局域网与蜂窝网络」，然后点重试。"
          actionLabel="重试"
          onAction={() => void handleRefresh()}
          actionLoading={refreshing}
        />
      ) : bars.length === 0 && !barsQuery.isLoading ? (
        <EmptyState title="暂无公开酒吧" body="当前城市还没有已发布的公开酒单。" />
      ) : (
        <View style={styles.feed}>
          {displayedBars.map(({ bar, distanceMeters }) => (
            <BarFeedCard
              key={bar.id}
              bar={bar}
              distanceMeters={distanceMeters}
              event={firstEventsByTenant[bar.id] ?? null}
            />
          ))}
        </View>
      )}

      <View style={styles.complianceFootnote}>
        <Text style={styles.complianceText}>{TAPLIST_LEGAL_DISCLAIMER}</Text>
      </View>
    </ScrollView>
  )
}

function CityPickerModal({
  visible,
  cities,
  selectedCity,
  onClose,
  onSelect,
}: {
  visible: boolean
  cities: PublicTaplistCity[]
  selectedCity: PublicTaplistCity
  onClose: () => void
  onSelect: (city: PublicTaplistCity) => void
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.cityModalBackdrop} onPress={onClose}>
        <View style={styles.cityModalPanel} onStartShouldSetResponder={() => true}>
          <View style={styles.cityModalHeader}>
            <Text style={styles.cityModalTitle}>选择城市</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="关闭城市选择"
              hitSlop={10}
              onPress={onClose}
              style={({ pressed }) => [styles.cityCloseButton, pressed && styles.cityButtonPressed]}>
              <FontAwesome name="times" size={16} color={palette.faint} />
            </Pressable>
          </View>
          {cities.map((city) => {
            const selected = taplistCityMatches(city.city, selectedCity.city)
            return (
              <Pressable
                key={city.city}
                accessibilityRole="button"
                accessibilityLabel={`切换到${city.label}`}
                onPress={() => onSelect(city)}
                style={({ pressed }) => [
                  styles.cityOption,
                  selected && styles.cityOptionSelected,
                  pressed && styles.cityOptionPressed,
                ]}>
                <View style={styles.cityOptionCopy}>
                  <Text style={[styles.cityOptionLabel, selected && styles.cityOptionLabelSelected]}>
                    {city.label}
                  </Text>
                  <Text style={styles.cityOptionMeta}>{city.bar_count} 家公开酒吧</Text>
                </View>
                {selected ? <FontAwesome name="check" size={15} color={palette.amber} /> : null}
              </Pressable>
            )
          })}
        </View>
      </Pressable>
    </Modal>
  )
}

function TonightEventsSection({
  compactBottom = false,
  events,
}: {
  compactBottom?: boolean
  events: PublicEventRow[]
}) {
  const scrollRef = useRef<ScrollView>(null)
  const [pageWidth, setPageWidth] = useState(0)
  const [currentPage, setCurrentPage] = useState(0)
  const eventIds = events.map((event) => event.id).join(':')

  useEffect(() => {
    setCurrentPage(0)
    scrollRef.current?.scrollTo({ x: 0, animated: false })
  }, [eventIds, pageWidth])

  const handleMomentumScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (pageWidth <= 0) return
    const nextPage = Math.max(0, Math.min(events.length - 1, Math.round(event.nativeEvent.contentOffset.x / pageWidth)))
    setCurrentPage(nextPage)
  }

  return (
    <View style={[
      styles.discoverySection,
      styles.eventsDiscoverySection,
      compactBottom && styles.eventsDiscoverySectionCompact,
    ]}>
      <View style={[styles.discoveryHeaderRow, styles.eventsDiscoveryHeaderRow]}>
        <Link href="/events" asChild>
          <Pressable
            hitSlop={{ top: 10, right: 4, bottom: 10, left: 12 }}
            style={({ pressed }) => [styles.moreLink, pressed && styles.moreLinkPressed]}>
            <Text style={styles.moreText}>更多 ›</Text>
          </Pressable>
        </Link>
      </View>
      <View
        onLayout={(event) => setPageWidth(event.nativeEvent.layout.width)}
        style={styles.eventCarouselViewport}>
        {pageWidth > 0 ? (
          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            snapToInterval={pageWidth}
            decelerationRate="fast"
            disableIntervalMomentum
            onMomentumScrollEnd={handleMomentumScrollEnd}
            showsHorizontalScrollIndicator={false}
            style={styles.eventCarousel}
            contentContainerStyle={styles.eventCarouselContent}>
            {events.map((event, index) => (
              <HomeEventBanner
                key={event.id}
                event={event}
                width={pageWidth}
                index={index}
                total={events.length}
              />
            ))}
          </ScrollView>
        ) : null}
        {events.length > 1 ? (
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            pointerEvents="none"
            style={styles.eventPageDots}>
            {events.map((event, index) => (
              <View
                key={event.id}
                style={[styles.eventPageDot, index === currentPage && styles.eventPageDotActive]}
              />
            ))}
          </View>
        ) : null}
      </View>
    </View>
  )
}

function NewTapTodaySection({ drinks }: { drinks: PublicNewTapRow[] }) {
  return (
    <View style={styles.discoverySection}>
      <View style={styles.discoveryHeaderRow}>
        <Text style={styles.discoveryTitle}>最近上新</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.discoveryScrollView, styles.newTapRailScrollView]}
        contentContainerStyle={styles.discoveryScroller}>
        {drinks.map((drink) => (
          <NewTapRailCard key={drink.drink_id} drink={drink} source="home_new_tap" />
        ))}
      </ScrollView>
    </View>
  )
}

function BarFeedCard({
  bar,
  distanceMeters,
  event,
}: {
  bar: PublicBarRow
  distanceMeters: number | null
  event: PublicEventRow | null
}) {
  const location = shortBarLocation(bar)
  const feedStatus = compactStatusCounts(bar)
  const updatedLabel = formatRelativeUpdatedAt(bar.last_menu_updated_at)
  const distanceLabel = formatDistance(distanceMeters)

  return (
    <Link href={`/bar/${bar.slug}`} asChild>
      <Pressable
        onPress={() =>
          trackEvent('bar_opened', {
            tenant_id: bar.id,
            tenant_slug: bar.slug,
            source: 'home_bar',
          })
        }
        style={({ pressed }) => [styles.feedCard, pressed && styles.feedCardPressed]}>
        <View style={styles.imageFrame}>
          <AtmosphereImage source={bar.cover_image_url} aspectRatio={4 / 3} overlayOpacity={0.24}>
            <View style={styles.cardOverlay}>
              <View style={styles.cardRule} />
              <Text style={styles.barName}>{bar.display_name || bar.name}</Text>
              <BrewingBadgeFromType
                brewingType={bar.brewing_type}
                brewingLabel={bar.brewing_label}
                variant="card"
              />
              <Text style={styles.barMeta} numberOfLines={1} ellipsizeMode="tail">
                {location}
              </Text>
              {distanceLabel ? (
                <View style={styles.barFooterRow}>
                  {feedStatus ? <Text style={[styles.barStatus, styles.barStatusInline]}>{feedStatus}</Text> : <View />}
                  <Text accessibilityLabel={distanceLabel} style={styles.barDistance}>
                    {distanceLabel}
                  </Text>
                </View>
              ) : feedStatus ? <Text style={styles.barStatus}>{feedStatus}</Text> : null}
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
    marginBottom: spacing.lg,
  },
  city: {
    ...typography.title,
    color: palette.tungsten,
    marginTop: spacing.xxs,
    textAlign: 'center',
  },
  cityButton: {
    marginTop: spacing.xxs,
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: 8,
  },
  cityButtonPressed: {
    opacity: 0.72,
  },
  cityPreposition: {
    ...typography.caption,
    color: palette.faint,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  title: {
    ...typography.displayXL,
    fontSize: 62,
    lineHeight: 62,
    color: palette.text,
    textAlign: 'center',
    textShadowColor: 'rgba(245,241,230,0.12)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 18,
  },
  barListHeader: {
    marginBottom: spacing.md,
  },
  barListToolbar: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  barListTitle: {
    ...typography.caption,
    color: palette.muted,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '400',
  },
  sortActions: {
    minHeight: 38,
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 10,
    backgroundColor: palette.panel,
    padding: 2,
    gap: 2,
    overflow: 'hidden',
  },
  sortAction: {
    minWidth: 68,
    minHeight: 32,
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: 8,
  },
  sortActionSelected: {
    backgroundColor: palette.bgSoft,
  },
  sortActionText: {
    ...typography.caption,
    color: palette.faint,
    fontWeight: '500',
  },
  sortActionTextSelected: {
    color: palette.amber,
  },
  nearbyNoticeRow: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  nearbyNoticeText: {
    ...typography.caption,
    color: palette.muted,
    flex: 1,
  },
  nearbyNoticeAction: {
    ...typography.caption,
    color: palette.amber,
    fontWeight: '600',
  },
  cityModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  cityModalPanel: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.hairline,
    backgroundColor: palette.panelElevated,
    padding: spacing.md,
  },
  cityModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.xs,
  },
  cityModalTitle: {
    ...typography.label,
    color: palette.tungsten,
    fontSize: 11,
    lineHeight: 15,
  },
  cityCloseButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -spacing.xs,
  },
  cityOption: {
    minHeight: 58,
    borderTopWidth: 1,
    borderTopColor: palette.line,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  cityOptionSelected: {
    borderTopColor: 'rgba(211,154,69,0.38)',
  },
  cityOptionPressed: {
    opacity: 0.78,
  },
  cityOptionCopy: {
    flex: 1,
    minWidth: 0,
  },
  cityOptionLabel: {
    ...typography.title,
    color: palette.text,
    fontSize: 18,
    lineHeight: 24,
  },
  cityOptionLabelSelected: {
    color: palette.amber,
  },
  cityOptionMeta: {
    ...typography.micro,
    color: palette.faint,
    marginTop: 2,
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
  eventsDiscoverySectionCompact: {
    marginBottom: spacing.lg,
  },
  discoveryHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.xxs,
  },
  eventsDiscoveryHeaderRow: {
    justifyContent: 'flex-end',
  },
  discoveryTitle: {
    ...typography.title,
    color: palette.tungsten,
    fontSize: 18,
    lineHeight: 25,
    letterSpacing: 0,
    fontWeight: '500',
  },
  moreLink: {
    marginLeft: 'auto',
    alignSelf: 'flex-end',
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
  eventCarouselViewport: {
    width: '100%',
    height: HOME_EVENT_BANNER_HEIGHT,
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 16,
  },
  eventCarousel: {
    width: '100%',
    height: HOME_EVENT_BANNER_HEIGHT,
  },
  eventCarouselContent: {
    alignItems: 'flex-start',
  },
  eventPageDots: {
    position: 'absolute',
    right: spacing.md,
    bottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  eventPageDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: palette.faint,
    opacity: 0.7,
  },
  eventPageDotActive: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: palette.amber,
    opacity: 1,
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
  },
  barFooterRow: {
    width: '100%',
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  barStatusInline: {
    marginTop: 0,
  },
  barDistance: {
    ...typography.caption,
    color: palette.tungsten,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
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
