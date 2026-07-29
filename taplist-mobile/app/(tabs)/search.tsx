import { type ReactNode, useEffect, useRef, useState } from 'react'
import FontAwesome from '@expo/vector-icons/FontAwesome'
import { useQuery } from '@tanstack/react-query'
import { Link, useRouter } from 'expo-router'
import {
  ActivityIndicator,
  BackHandler,
  Keyboard,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type TextInput as TextInputType,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { BeerArtwork } from '@/components/taplist/BeerArtwork'
import { CachedImageBackground } from '@/components/taplist/CachedImage'
import { palette, spacing, typography } from '@/constants/design'
import { fetchPublicNewDrinks, fetchPublicTaplistBreweries, searchPublicTaplist } from '@/lib/api/taplist'
import { useTaplistCity } from '@/lib/taplistCity'
import { useTaplistSupabaseReady } from '@/lib/useTaplistSupabaseReady'
import type { PublicNewTapRow, PublicTaplistBreweryDiscoveryRow, PublicTaplistSearchResult } from '@/lib/types'
import { trackEvent } from '@/lib/analytics'

const searchPresets = [
  { label: 'IPA', query: 'IPA' },
  { label: '酸', query: '酸' },
  { label: '世涛', query: '世涛' },
  { label: '拉格', query: '拉格' },
  { label: '小麦', query: '小麦' },
  { label: '西打', query: '西打' },
  { label: '果泥', query: '果泥' },
]

const SEARCH_DEBOUNCE_MS = 300
const PAGE_GUTTER = spacing.md
const GRID_GAP = spacing.md
const GRID_COLS = 3
const DISCOVERY_RADIUS = 10
const PULL_BACK_THRESHOLD = 72

export default function SearchScreen() {
  const insets = useSafeAreaInsets()
  const configured = useTaplistSupabaseReady()
  const { selectedCity } = useTaplistCity()
  const inputRef = useRef<TextInputType>(null)
  const queryKindRef = useRef<'preset' | 'custom'>('custom')
  const trackedSearchRef = useRef<string | null>(null)
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [pullOffset, setPullOffset] = useState(0)
  const trimmedQuery = query.trim()
  const selectedCityName = selectedCity.city
  const isSearching = trimmedQuery.length > 0
  const isDebouncing = isSearching && debouncedQuery !== trimmedQuery
  const pullReady = pullOffset >= PULL_BACK_THRESHOLD

  const clearSearch = () => {
    setQuery('')
    setDebouncedQuery('')
    setPullOffset(0)
    trackedSearchRef.current = null
    inputRef.current?.blur()
    Keyboard.dismiss()
  }

  const selectDiscoveryQuery = (nextQuery: string) => {
    queryKindRef.current = 'preset'
    setQuery(nextQuery)
  }

  useEffect(() => {
    if (!trimmedQuery) {
      setDebouncedQuery('')
      setPullOffset(0)
      return
    }

    const timeout = setTimeout(() => setDebouncedQuery(trimmedQuery), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timeout)
  }, [trimmedQuery])

  useEffect(() => {
    if (!isSearching) return

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      clearSearch()
      return true
    })

    return () => subscription.remove()
  }, [isSearching])

  const handleSearchScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!isSearching || Platform.OS !== 'ios') return
    const y = event.nativeEvent.contentOffset.y
    setPullOffset(y < 0 ? -y : 0)
  }

  const handleSearchScrollEndDrag = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!isSearching || Platform.OS !== 'ios') return
    if (event.nativeEvent.contentOffset.y <= -PULL_BACK_THRESHOLD) {
      clearSearch()
      return
    }
    setPullOffset(0)
  }

  const drinksQuery = useQuery({
    queryKey: ['taplist', 'search', selectedCityName, debouncedQuery],
    queryFn: () => searchPublicTaplist(selectedCityName, debouncedQuery),
    enabled: configured && debouncedQuery.length > 0,
  })

  const newTapsQuery = useQuery({
    queryKey: ['taplist', 'new-drinks', selectedCityName],
    queryFn: () => fetchPublicNewDrinks(selectedCityName),
    enabled: configured,
  })

  const breweriesQuery = useQuery({
    queryKey: ['taplist', 'breweries', selectedCityName],
    queryFn: () => fetchPublicTaplistBreweries(selectedCityName),
    enabled: configured,
  })

  const drinkResults = drinksQuery.data ?? []
  const newTaps = newTapsQuery.data ?? []
  const breweries = breweriesQuery.data ?? []

  const showDrinkSection = isSearching

  useEffect(() => {
    if (!drinksQuery.isSuccess || !debouncedQuery) return
    const searchKey = `${selectedCityName}:${debouncedQuery}`
    if (trackedSearchRef.current === searchKey) return
    trackedSearchRef.current = searchKey
    trackEvent('search_completed', {
      query_kind: queryKindRef.current,
      query_length: debouncedQuery.length,
      result_count: drinkResults.length,
      has_results: drinkResults.length > 0,
    })
  }, [debouncedQuery, drinkResults.length, drinksQuery.isSuccess, selectedCityName])

  return (
    <View style={styles.screen}>
      {isSearching && Platform.OS === 'ios' && pullOffset > 10 ? (
        <View
          pointerEvents="none"
          style={[
            styles.pullBackHint,
            {
              top: insets.top + 6,
              opacity: Math.min(1, pullOffset / PULL_BACK_THRESHOLD),
            },
          ]}>
          <FontAwesome
            name={pullReady ? 'chevron-up' : 'arrow-up'}
            size={12}
            color={pullReady ? palette.amber : palette.faint}
          />
          <Text style={[styles.pullBackHintText, pullReady && styles.pullBackHintTextReady]}>
            {pullReady ? '释放返回浏览' : '下拉返回浏览'}
          </Text>
        </View>
      ) : null}

      <ScrollView
        style={styles.scroll}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        alwaysBounceVertical={isSearching}
        bounces
        scrollEventThrottle={16}
        onScroll={handleSearchScroll}
        onScrollEndDrag={handleSearchScrollEndDrag}
        refreshControl={
          isSearching && Platform.OS === 'android' ? (
            <RefreshControl
              refreshing={false}
              onRefresh={clearSearch}
              colors={[palette.amber]}
              progressBackgroundColor={palette.panelElevated}
            />
          ) : undefined
        }
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg }]}>
      {isSearching ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="返回浏览"
          accessibilityHint="清空搜索并返回风格、上新与酒厂浏览"
          hitSlop={8}
          onPress={clearSearch}
          style={({ pressed }) => [styles.backTitleRow, pressed && styles.backTitlePressed]}>
          <FontAwesome name="chevron-left" size={15} color={palette.text} />
          <Text style={styles.pageTitleText}>搜索</Text>
        </Pressable>
      ) : (
        <Text style={[styles.pageTitleText, styles.pageTitleSpacing]}>搜索</Text>
      )}

      <View style={styles.inputFrame}>
        <FontAwesome name="search" size={17} color={palette.faint} />
        <TextInput
          ref={inputRef}
          accessibilityLabel="搜索公开酒单"
          accessibilityHint="可搜索酒款、酒厂、风格、酒吧或区域"
          placeholder="搜索酒款、酒厂、风格或酒吧"
          placeholderTextColor={palette.faint}
          style={styles.input}
          selectionColor={palette.amber}
          value={query}
          onChangeText={(value) => {
            queryKindRef.current = 'custom'
            setQuery(value)
          }}
          autoCorrect={false}
          autoCapitalize="none"
          clearButtonMode="never"
          returnKeyType="search"
        />
        {query.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="清空搜索"
            hitSlop={10}
            onPress={clearSearch}
            style={({ pressed }) => [styles.clearButton, pressed && styles.clearButtonPressed]}>
            <FontAwesome name="times-circle" size={18} color={palette.faint} />
          </Pressable>
        ) : null}
      </View>

      {!isSearching ? (
        <SearchGuide
          breweries={breweriesQuery.isError ? [] : breweries}
          newTaps={newTapsQuery.isError ? [] : newTaps}
          onSelect={selectDiscoveryQuery}
        />
      ) : null}

      {!configured ? (
        <EmptyState title="尚未连接酒单服务" body="请配置 Supabase 环境变量后查看实时公开酒单。" />
      ) : null}

      {configured && showDrinkSection ? (
        <>
          <Text style={styles.pullGuide}>下拉可返回浏览</Text>
          {isDebouncing || drinksQuery.isLoading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={palette.amber} />
              <Text style={styles.muted}>正在搜索酒款...</Text>
            </View>
          ) : drinksQuery.isError ? (
            <EmptyState
              title="酒款搜索不可用"
              body="请在 Supabase 执行 search_public_taplist 迁移后重试。"
            />
          ) : drinkResults.length === 0 ? (
            <EmptyState title="没有匹配的酒款" body="试试酒厂名、风格、酒款中文名或酒吧名称。">
              <View style={styles.emptyRecovery}>
                <Text style={styles.emptyRecoveryLabel}>换个风格试试</Text>
                <PresetSearches onSelect={selectDiscoveryQuery} />
              </View>
            </EmptyState>
          ) : (
            drinkResults.map((drink) => <DrinkResult key={drink.drink_id} drink={drink} />)
          )}
        </>
      ) : null}

      </ScrollView>
    </View>
  )
}

function SearchGuide({
  breweries,
  newTaps,
  onSelect,
}: {
  breweries: PublicTaplistBreweryDiscoveryRow[]
  newTaps: PublicNewTapRow[]
  onSelect: (query: string) => void
}) {
  const [gridWidth, setGridWidth] = useState(0)
  const gap = GRID_GAP
  const tileWidth =
    gridWidth > 0 ? (gridWidth - gap * (GRID_COLS - 1)) / GRID_COLS : 0

  return (
    <View
      style={styles.guide}
      onLayout={(event) => {
        const nextWidth = event.nativeEvent.layout.width
        setGridWidth((current) => (Math.abs(current - nextWidth) > 0.5 ? nextWidth : current))
      }}>
      <View style={styles.guideSection}>
        <Text style={styles.sectionTitle}>风格</Text>
        <PresetSearches onSelect={onSelect} />
      </View>

      {newTaps.length > 0 && tileWidth > 0 ? (
        <SearchNewTaps drinks={newTaps.slice(0, 9)} tileWidth={tileWidth} gap={gap} />
      ) : null}

      {breweries.length > 0 && tileWidth > 0 ? (
        <BreweryDiscovery
          breweries={breweries.slice(0, 9)}
          onSelect={onSelect}
          tileWidth={tileWidth}
          gap={gap}
        />
      ) : null}
    </View>
  )
}

function PresetSearches({ onSelect }: { onSelect: (query: string) => void }) {
  return (
    <View style={styles.presetRow}>
      {searchPresets.map((preset) => (
        <Pressable
          key={preset.label}
          accessibilityRole="button"
          accessibilityLabel={`搜索${preset.label}`}
          accessibilityHint="显示当前公开酒单中的匹配酒款"
          onPress={() => onSelect(preset.query)}
          style={({ pressed }) => [styles.presetPill, pressed && styles.presetPillPressed]}>
          <Text style={styles.presetLabel}>{preset.label}</Text>
        </Pressable>
      ))}
    </View>
  )
}

function SearchNewTaps({
  drinks,
  tileWidth,
  gap,
}: {
  drinks: PublicNewTapRow[]
  tileWidth: number
  gap: number
}) {
  const rows = chunkRows(drinks, GRID_COLS)
  const tileHeight = tileWidth

  return (
    <View style={styles.guideSection}>
      <Text style={styles.sectionTitle}>上新</Text>
      <View style={[styles.newTapGrid, { gap }]}>
        {rows.map((row, rowIndex) => (
          <View key={row.map((drink) => drink.drink_id).join('-')} style={[styles.newTapRow, { gap }]}>
            {row.map((drink) => (
              <SearchNewTapTile
                key={drink.drink_id}
                drink={drink}
                width={tileWidth}
                height={tileHeight}
              />
            ))}
            {row.length < GRID_COLS
              ? Array.from({ length: GRID_COLS - row.length }).map((_, index) => (
                  <View
                    key={`spacer-${rowIndex}-${index}`}
                    style={{ width: tileWidth, height: tileHeight }}
                  />
                ))
              : null}
          </View>
        ))}
      </View>
    </View>
  )
}

function SearchNewTapTile({
  drink,
  width,
  height,
}: {
  drink: PublicNewTapRow
  width: number
  height: number
}) {
  const router = useRouter()
  const breweryLine = drink.brewery ?? drink.brand_name ?? null
  const hasImage = Boolean(drink.image_url)
  const copy = (
    <View style={styles.newTapTileCopy}>
      <Text style={styles.newTapTileName} numberOfLines={2} ellipsizeMode="tail">
        {drink.name}
      </Text>
      {breweryLine ? (
        <Text style={styles.newTapTileBrewery} numberOfLines={1} ellipsizeMode="tail">
          {breweryLine}
        </Text>
      ) : null}
    </View>
  )

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[breweryLine, drink.name, `@ ${drink.tenant_display_name}`]
        .filter(Boolean)
        .join('，')}
      onPress={() => {
        trackEvent('beer_opened', {
          tenant_id: drink.tenant_id,
          drink_id: drink.drink_id,
          source: 'search_discovery',
        })
        router.push(`/bar/${drink.tenant_slug}/beer/${drink.drink_id}`)
      }}
      style={({ pressed }) => [
        styles.newTapTile,
        { width, height },
        pressed && styles.newTapTilePressed,
      ]}>
      {hasImage ? (
        <CachedImageBackground
          source={drink.image_url as string}
          style={styles.newTapTileImage}
          imageStyle={styles.newTapTileImageRadius}>
          <LinearGradient
            colors={['rgba(13,13,13,0.05)', 'rgba(13,13,13,0.42)', 'rgba(13,13,13,0.94)']}
            locations={[0, 0.42, 1]}
            style={styles.newTapTileScrim}>
            {copy}
          </LinearGradient>
        </CachedImageBackground>
      ) : (
        <LinearGradient
          colors={['rgba(75,54,31,0.28)', 'rgba(17,16,15,0.94)']}
          locations={[0, 1]}
          style={styles.newTapTileScrim}>
          {copy}
        </LinearGradient>
      )}
    </Pressable>
  )
}

function chunkRows<T>(items: T[], size: number) {
  const rows: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    rows.push(items.slice(index, index + size))
  }
  return rows
}

function BreweryDiscovery({
  breweries,
  onSelect,
  tileWidth,
  gap,
}: {
  breweries: PublicTaplistBreweryDiscoveryRow[]
  onSelect: (query: string) => void
  tileWidth: number
  gap: number
}) {
  const rows = chunkRows(breweries, GRID_COLS)

  return (
    <View style={styles.guideSection}>
      <Text style={styles.sectionTitle}>酒厂</Text>
      <View style={[styles.breweryGrid, { gap }]}>
        {rows.map((row, rowIndex) => (
          <View key={row.map((brewery) => brewery.brewery_name).join('-')} style={[styles.breweryRow, { gap }]}>
            {row.map((brewery) => (
              <Pressable
                key={brewery.brewery_name}
                accessibilityRole="button"
                accessibilityLabel={`搜索${brewery.brewery_name}`}
                accessibilityHint="显示当前公开酒单中的匹配酒款"
                onPress={() => onSelect(brewery.brewery_name)}
                style={({ pressed }) => [
                  styles.breweryCard,
                  { width: tileWidth },
                  pressed && styles.breweryCardPressed,
                ]}>
                <Text style={styles.breweryName} numberOfLines={1} ellipsizeMode="tail">
                  {brewery.brewery_name}
                </Text>
                <Text style={styles.breweryCount}>{brewery.tap_count} 款</Text>
              </Pressable>
            ))}
            {row.length < GRID_COLS
              ? Array.from({ length: GRID_COLS - row.length }).map((_, index) => (
                  <View key={`spacer-${rowIndex}-${index}`} style={{ width: tileWidth }} />
                ))
              : null}
          </View>
        ))}
      </View>
    </View>
  )
}

function DrinkResult({ drink }: { drink: PublicTaplistSearchResult }) {
  const brewery = drink.brewery ?? drink.brand_name
  const styleLine = [drink.beer_style, typeof drink.abv === 'number' ? `${drink.abv}%` : null]
    .filter(Boolean)
    .join(' · ')
  const servingLine = searchServingLine(drink.default_serving)
  const isSoldOut = drink.public_status === '售罄'

  return (
    <View style={[styles.resultItem, isSoldOut && styles.resultItemMuted]}>
      <Link href={`/bar/${drink.tenant_slug}/beer/${drink.drink_id}`} asChild>
        <Pressable
          onPress={() =>
            trackEvent('beer_opened', {
              tenant_id: drink.tenant_id,
              drink_id: drink.drink_id,
              source: 'search_result',
            })
          }
          style={({ pressed }) => [styles.drinkPressable, pressed && styles.pressed]}>
          <View style={styles.drinkRowInner}>
            {drink.image_url ? (
              <BeerArtwork name={drink.name} source={drink.image_url} size={72} />
            ) : (
              <View style={styles.artworkSpacer} />
            )}
            <View style={styles.drinkCopy}>
              <Text style={styles.resultName} numberOfLines={2}>
                {drink.name}
              </Text>
              {brewery ? <Text style={styles.resultMeta}>{brewery}</Text> : null}
              {styleLine ? <Text style={styles.drinkStyle}>{styleLine}</Text> : null}
              <Text style={styles.drinkVenue}>
                {drink.tenant_display_name}
                {drink.tenant_address
                  ? ` · ${drink.tenant_address}`
                  : drink.tenant_district
                    ? ` · ${drink.tenant_district}`
                    : ''}
              </Text>
              <View style={styles.resultDetailBlock}>
                {drink.public_status ? (
                  <View style={[styles.statusBadge, isSoldOut && styles.statusBadgeMuted]}>
                    <Text style={[styles.statusText, isSoldOut && styles.statusTextMuted]}>
                      {drink.public_status}
                    </Text>
                  </View>
                ) : null}
                {servingLine ? (
                  <View style={styles.servingPill}>
                    <Text style={styles.servingLine}>{servingLine}</Text>
                  </View>
                ) : null}
              </View>
            </View>
          </View>
        </Pressable>
      </Link>
    </View>
  )
}

function searchServingLine(serving: PublicTaplistSearchResult['default_serving']) {
  if (!serving) return null
  if (!(typeof serving.price === 'number' && serving.price > 0)) return null
  const parts = [
    serving.label,
    serving.volume_ml ? `${serving.volume_ml}ml` : null,
    `¥${serving.price}`,
  ].filter(Boolean)

  return parts.length > 0 ? parts.join(' · ') : null
}

function EmptyState({ title, body, children }: { title: string; body: string; children?: ReactNode }) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: palette.background,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: PAGE_GUTTER,
    paddingBottom: 96,
  },
  pullBackHint: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  pullBackHintText: {
    ...typography.micro,
    color: palette.faint,
    letterSpacing: 0.4,
  },
  pullBackHintTextReady: {
    color: palette.amber,
  },
  pageTitleText: {
    ...typography.title,
    color: palette.text,
    fontSize: 28,
    lineHeight: 36,
    fontWeight: '500',
  },
  pageTitleSpacing: {
    marginBottom: spacing.md,
  },
  backTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    marginBottom: spacing.md,
    marginLeft: -2,
    minHeight: 36,
  },
  backTitlePressed: {
    opacity: 0.72,
  },
  inputFrame: {
    height: 52,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(245,241,230,0.10)',
    backgroundColor: 'rgba(17,17,17,0.72)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  pullGuide: {
    ...typography.micro,
    color: palette.faint,
    fontSize: 11,
    lineHeight: 15,
    marginTop: -spacing.md,
    marginBottom: spacing.md,
    opacity: 0.78,
  },
  input: {
    ...typography.body,
    flex: 1,
    height: '100%',
    color: palette.text,
    paddingHorizontal: 0,
  },
  clearButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -spacing.sm,
  },
  clearButtonPressed: {
    opacity: 0.55,
  },
  guide: {
    gap: spacing.xl,
  },
  sectionTitle: {
    ...typography.title,
    color: palette.text,
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '500',
  },
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  presetPill: {
    minHeight: 40,
    borderRadius: DISCOVERY_RADIUS,
    borderWidth: 1,
    borderColor: 'rgba(198,168,117,0.22)',
    backgroundColor: 'rgba(184,138,61,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  presetPillPressed: {
    borderColor: 'rgba(211,154,69,0.48)',
    backgroundColor: 'rgba(184,138,61,0.16)',
    opacity: 0.86,
  },
  presetLabel: {
    ...typography.caption,
    color: palette.text,
    fontWeight: '500',
    lineHeight: 18,
  },
  guideSection: {
    gap: spacing.sm,
  },
  newTapGrid: {
    width: '100%',
  },
  newTapRow: {
    flexDirection: 'row',
    width: '100%',
  },
  newTapTile: {
    borderRadius: DISCOVERY_RADIUS,
    backgroundColor: palette.bgSoft,
    overflow: 'hidden',
    flexShrink: 0,
  },
  newTapTilePressed: {
    opacity: 0.78,
  },
  newTapTileImage: {
    flex: 1,
    width: '100%',
  },
  newTapTileImageRadius: {
    borderRadius: DISCOVERY_RADIUS,
  },
  newTapTileScrim: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
    paddingTop: spacing.md,
  },
  newTapTileCopy: {
    minWidth: 0,
    gap: 2,
  },
  newTapTileName: {
    ...typography.caption,
    color: palette.text,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.84)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  newTapTileBrewery: {
    ...typography.micro,
    color: 'rgba(245,241,232,0.68)',
    fontSize: 10,
    lineHeight: 13,
    textShadowColor: 'rgba(0,0,0,0.84)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  breweryGrid: {
    width: '100%',
  },
  breweryRow: {
    flexDirection: 'row',
    width: '100%',
  },
  breweryCard: {
    minHeight: 68,
    borderRadius: DISCOVERY_RADIUS,
    borderWidth: 1,
    borderColor: 'rgba(198,168,117,0.16)',
    backgroundColor: 'rgba(20,18,16,0.55)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    justifyContent: 'center',
    gap: 2,
  },
  breweryCardPressed: {
    borderColor: 'rgba(211,154,69,0.40)',
    backgroundColor: 'rgba(184,138,61,0.12)',
    opacity: 0.88,
  },
  breweryName: {
    ...typography.caption,
    color: palette.text,
    fontWeight: '500',
    fontSize: 13,
    lineHeight: 18,
  },
  breweryCount: {
    ...typography.micro,
    color: palette.faint,
    lineHeight: 15,
  },
  loading: {
    borderTopWidth: 1,
    borderTopColor: palette.hairline,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  muted: {
    ...typography.caption,
    color: palette.muted,
  },
  resultItem: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(245,241,230,0.12)',
    paddingBottom: spacing.lg,
    marginBottom: spacing.lg,
  },
  resultItemMuted: {
    opacity: 0.52,
  },
  drinkPressable: {
    paddingTop: spacing.sm,
  },
  drinkRowInner: {
    flexDirection: 'row',
    gap: spacing.lg,
    alignItems: 'flex-start',
  },
  artworkSpacer: {
    width: 72,
    height: 72,
  },
  pressed: {
    opacity: 0.78,
  },
  drinkCopy: {
    flex: 1,
    minWidth: 0,
  },
  resultName: {
    ...typography.displayL,
    color: palette.text,
    fontSize: 22,
    lineHeight: 28,
  },
  resultMeta: {
    ...typography.caption,
    color: palette.muted,
    marginTop: spacing.xxs,
    lineHeight: 19,
  },
  drinkStyle: {
    ...typography.caption,
    color: palette.faint,
    marginTop: spacing.xxs,
    lineHeight: 18,
  },
  drinkVenue: {
    ...typography.micro,
    color: palette.tungsten,
    marginTop: 3,
    lineHeight: 16,
  },
  resultDetailBlock: {
    alignItems: 'flex-start',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(159,122,61,0.24)',
    backgroundColor: 'rgba(159,122,61,0.14)',
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
  },
  statusBadgeMuted: {
    borderColor: 'rgba(117,111,101,0.18)',
    backgroundColor: 'rgba(117,111,101,0.14)',
  },
  statusText: {
    ...typography.label,
    color: palette.tungsten,
    fontSize: 10,
    lineHeight: 12,
  },
  statusTextMuted: {
    color: palette.faint,
  },
  servingPill: {
    alignSelf: 'flex-start',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(245,241,232,0.08)',
    backgroundColor: 'rgba(17,17,17,0.38)',
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
  },
  servingLine: {
    ...typography.micro,
    color: palette.muted,
    lineHeight: 16,
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
  emptyRecovery: {
    marginTop: spacing.lg,
  },
  emptyRecoveryLabel: {
    ...typography.label,
    color: palette.faint,
    fontSize: 11,
    lineHeight: 15,
    marginBottom: spacing.sm,
  },
})
