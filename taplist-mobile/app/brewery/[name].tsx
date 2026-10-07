import FontAwesome from '@expo/vector-icons/FontAwesome'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { LinearGradient } from 'expo-linear-gradient'
import { Link, type Href, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { AtmosphereImage } from '@/components/taplist/AtmosphereImage'
import { BackButton } from '@/components/taplist/BackButton'
import { CachedImage } from '@/components/taplist/CachedImage'
import { CityPickerModal } from '@/components/taplist/CityPickerModal'
import {
  listCapsuleCardStyles,
  listCapsuleMetaStyle,
  listCapsuleSecondaryStyle,
  listCapsuleTitleStyle,
} from '@/components/taplist/listCapsuleCardStyle'
import {
  BEER_CARD_GAP,
  BEER_CARD_PANEL_COLORS,
  BEER_CARD_PANEL_LOCATIONS,
} from '@/components/taplist/railCardStyle'
import { palette, spacing, typography } from '@/constants/design'
import { fetchMiniBrewery, searchMiniProducts } from '@/lib/api/taplist'
import { useTaplistCity } from '@/lib/taplistCity'
import { useTaplistSupabaseReady } from '@/lib/useTaplistSupabaseReady'
import type { MiniProductSearchResult } from '@/lib/types'

export default function BreweryScreen() {
  const insets = useSafeAreaInsets()
  const configured = useTaplistSupabaseReady()
  const { selectedCity, cities, canSelectCity, selectCity } = useTaplistCity()
  const { name } = useLocalSearchParams<{ name: string }>()
  const [cityPickerVisible, setCityPickerVisible] = useState(false)
  const breweryName = typeof name === 'string' ? name.trim() : ''
  const breweryQuery = useQuery({
    queryKey: ['taplist', 'mini-brewery', breweryName],
    queryFn: () => fetchMiniBrewery(breweryName),
    enabled: configured && breweryName.length > 0,
  })
  const productsQuery = useInfiniteQuery({
    queryKey: ['taplist', 'mini-brewery-products', selectedCity.city, breweryName],
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) => searchMiniProducts({
      city: selectedCity.city,
      brewery: breweryName,
      offset: pageParam,
      signal,
    }),
    getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
    enabled: configured && breweryName.length > 0,
  })
  const brewery = breweryQuery.data?.brewery ?? null
  const products = dedupeProducts(productsQuery.data?.pages.flatMap((page) => page.results) ?? [])
  const displayName = brewery?.name_zh || breweryName || '未知酒厂'
  const origin = [brewery?.country, brewery?.city].filter(Boolean).join(' · ')

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent
    if (
      contentSize.height - layoutMeasurement.height - contentOffset.y < 240 &&
      productsQuery.hasNextPage &&
      !productsQuery.isFetchingNextPage
    ) {
      void productsQuery.fetchNextPage()
    }
  }

  return (
    <View style={styles.screen}>
      <BackButton />
      <CityPickerModal
        visible={cityPickerVisible}
        cities={cities}
        selectedCity={selectedCity}
        onClose={() => setCityPickerVisible(false)}
        onSelect={(city) => {
          void selectCity(city)
          setCityPickerVisible(false)
        }}
      />
      <ScrollView
        style={styles.screen}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={handleScroll}
        contentContainerStyle={styles.scrollContent}>
        {brewery?.logo_url ? (
          <AtmosphereImage
            source={brewery.logo_url}
            ossStyle="nm-cover"
            aspectRatio={4 / 3}
            overlayOpacity={0.2}
            borderRadius={0}
          />
        ) : null}
        <View style={[styles.paddedContent, { paddingTop: brewery?.logo_url ? spacing.lg : insets.top + 74 }]}>
        <View style={styles.header}>
          <Text style={styles.title}>{displayName}</Text>
          {brewery?.name_en ? <Text style={styles.englishName}>{brewery.name_en}</Text> : null}
          {origin ? <Text style={styles.origin}>{origin}</Text> : null}
        </View>

        <View style={styles.toolbar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={canSelectCity ? `当前城市${selectedCity.label}，选择城市` : `当前城市${selectedCity.label}`}
            disabled={!canSelectCity}
            onPress={() => setCityPickerVisible(true)}
            style={({ pressed }) => [styles.cityButton, pressed && styles.pressed]}>
            <Text style={styles.cityLabel}>{selectedCity.label}</Text>
            {canSelectCity ? <FontAwesome name="angle-down" size={12} color={palette.gold} /> : null}
          </Pressable>
        </View>

        {!configured ? (
          <EmptyState body="尚未连接酒单服务。" />
        ) : breweryQuery.isLoading || productsQuery.isLoading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={palette.amber} />
            <Text style={styles.muted}>正在加载酒厂酒款...</Text>
          </View>
        ) : breweryQuery.isError || productsQuery.isError ? (
          <EmptyState body="暂时无法加载酒厂酒款，请稍后重试。" />
        ) : products.length === 0 ? (
          <EmptyState body="这家酒厂暂无公开酒款。" />
        ) : (
          <View style={styles.list}>
            {products.map((product) => (
              <BreweryProductCard key={product.key} product={product} />
            ))}
            {productsQuery.isFetchingNextPage ? (
              <View style={styles.loadingMore}>
                <ActivityIndicator size="small" color={palette.amber} />
                <Text style={styles.muted}>正在加载更多...</Text>
              </View>
            ) : null}
          </View>
        )}
        </View>
      </ScrollView>
    </View>
  )
}

function BreweryProductCard({ product }: { product: MiniProductSearchResult }) {
  const meta = [product.brewery, product.beer_style].filter(Boolean).join(' · ')
  const abv = typeof product.abv === 'number' ? `ABV ${product.abv}%` : null

  return (
    <Link href={`/product/${encodeURIComponent(product.key)}` as Href} asChild>
      <Pressable style={({ pressed }) => [
        listCapsuleCardStyles.card,
        pressed && listCapsuleCardStyles.cardPressed,
      ]}>
        <View style={listCapsuleCardStyles.cardInner}>
          {product.image_url ? (
            <View style={listCapsuleCardStyles.artworkFrame}>
              <CachedImage
                accessibilityLabel={`${product.name}酒款图片`}
                source={product.image_url}
                ossStyle="nm-thumb"
                style={listCapsuleCardStyles.artwork}
              />
            </View>
          ) : <View style={listCapsuleCardStyles.artworkSpacer} />}
          <View style={listCapsuleCardStyles.panel}>
            <LinearGradient
              colors={BEER_CARD_PANEL_COLORS}
              locations={BEER_CARD_PANEL_LOCATIONS}
              style={StyleSheet.absoluteFill}
            />
            <View style={listCapsuleCardStyles.panelContent}>
              <Text style={listCapsuleTitleStyle} numberOfLines={2} ellipsizeMode="tail">
                {product.name}
              </Text>
              {meta ? <Text style={listCapsuleMetaStyle} numberOfLines={1}>{meta}</Text> : null}
              {abv ? <Text style={listCapsuleSecondaryStyle}>{abv}</Text> : null}
              {product.venues.length > 0 ? (
                <>
                  <Text style={styles.availability}>{product.venue_count} 家有售</Text>
                  <View style={styles.venueRow}>
                    {product.venues.slice(0, 2).map((venue) => (
                      <View key={venue.id} style={styles.venuePill}>
                        <Text style={styles.venuePillText} numberOfLines={1}>{venue.name}</Text>
                      </View>
                    ))}
                  </View>
                </>
              ) : (
                <Text style={styles.unavailable}>当前城市暂无供应</Text>
              )}
            </View>
          </View>
        </View>
        <View pointerEvents="none" style={listCapsuleCardStyles.borderOverlay} />
      </Pressable>
    </Link>
  )
}

function dedupeProducts(products: MiniProductSearchResult[]) {
  const seen = new Set<string>()
  return products.filter((product) => {
    if (seen.has(product.key)) return false
    seen.add(product.key)
    return true
  })
}

function EmptyState({ body }: { body: string }) {
  return <View style={styles.empty}><Text style={styles.muted}>{body}</Text></View>
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.background },
  scrollContent: { width: '100%', maxWidth: 520, alignSelf: 'center', paddingBottom: spacing.xxl },
  paddedContent: {
    width: '100%', maxWidth: 520, alignSelf: 'center',
    paddingHorizontal: spacing.lg,
  },
  pressed: { opacity: 0.68 },
  header: { minHeight: 88 },
  title: { ...typography.headline, color: palette.text, fontSize: 27, lineHeight: 35, fontWeight: '600' },
  englishName: { ...typography.caption, color: palette.muted, marginTop: 2 },
  origin: { ...typography.caption, color: palette.muted, marginTop: 3 },
  toolbar: { zIndex: 10, minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' },
  cityButton: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 8, paddingLeft: 12 },
  cityLabel: { ...typography.caption, color: palette.gold },
  loading: { paddingVertical: spacing.xxl, flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  loadingMore: { paddingVertical: spacing.md, flexDirection: 'row', justifyContent: 'center', gap: spacing.sm, alignItems: 'center' },
  empty: { paddingVertical: spacing.xxl, borderTopWidth: 1, borderTopColor: palette.hairline },
  muted: { ...typography.caption, color: palette.muted },
  list: { gap: BEER_CARD_GAP },
  availability: { ...typography.micro, color: palette.tungsten, marginTop: spacing.xxs },
  venueRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.xxs },
  venuePill: {
    maxWidth: '100%', paddingHorizontal: spacing.xs, paddingVertical: spacing.xxs,
    borderRadius: 6, borderWidth: 1, borderColor: 'rgba(214,176,105,0.16)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  venuePillText: { ...typography.micro, color: palette.muted },
  unavailable: { ...typography.micro, color: palette.faint, marginTop: spacing.xxs },
})
