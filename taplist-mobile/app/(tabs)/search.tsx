import { type ReactNode, useEffect, useRef, useState } from 'react'
import FontAwesome from '@expo/vector-icons/FontAwesome'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Link, type Href, useRouter } from 'expo-router'
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

import { CachedImage, CachedImageBackground } from '@/components/taplist/CachedImage'
import { defaultBeerArtwork } from '@/components/taplist/defaultBeerArtwork'
import { palette, spacing, typography } from '@/constants/design'
import { fetchPublicNewDrinks, fetchPublicTaplistBreweries, searchMiniProducts } from '@/lib/api/taplist'
import { useTaplistCity } from '@/lib/taplistCity'
import { useTaplistSupabaseReady } from '@/lib/useTaplistSupabaseReady'
import type { MiniProductSearchResult, PublicNewTapRow, PublicTaplistBreweryDiscoveryRow } from '@/lib/types'
import { trackEvent } from '@/lib/analytics'
import { formatPrimaryBrewery } from '@/lib/formatTaplist'
import { tr, useLanguage } from '@/lib/i18n'

const searchPresets = [
  'IPA',
  '酸啤',
  '世涛',
  '拉格',
  '小麦',
  '西打',
  '果泥',
]
const expandedSearchPresets = [
  ...searchPresets,
  '赛松 / 农舍',
  '比利时艾尔',
  '艾尔',
  '蜂蜜酒',
  '其他',
]

const englishStyleLabels: Record<string, string> = {
  '酸啤': 'Sour', '世涛': 'Stout', '拉格': 'Lager', '小麦': 'Wheat', '西打': 'Cider',
  '果泥': 'Smoothie', '赛松 / 农舍': 'Saison / Farmhouse', '比利时艾尔': 'Belgian Ale',
  '艾尔': 'Ale', '蜂蜜酒': 'Mead', '其他': 'Other',
}

const SEARCH_DEBOUNCE_MS = 300
const PAGE_GUTTER = spacing.md
const GRID_GAP = spacing.md
const GRID_COLS = 3
const DISCOVERY_RADIUS = 10
const PULL_BACK_THRESHOLD = 72

export default function SearchScreen() {
  const { language } = useLanguage()
  const insets = useSafeAreaInsets()
  const configured = useTaplistSupabaseReady()
  const { selectedCity } = useTaplistCity()
  const inputRef = useRef<TextInputType>(null)
  const queryKindRef = useRef<'style' | 'custom'>('custom')
  const trackedSearchRef = useRef<string | null>(null)
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [selectedStyle, setSelectedStyle] = useState<string | null>(null)
  const [pullOffset, setPullOffset] = useState(0)
  const trimmedQuery = query.trim()
  const selectedCityName = selectedCity.city
  const isSearching = trimmedQuery.length > 0 || selectedStyle !== null
  const isDebouncing = trimmedQuery.length > 0 && debouncedQuery !== trimmedQuery
  const pullReady = pullOffset >= PULL_BACK_THRESHOLD

  const clearSearch = () => {
    setQuery('')
    setDebouncedQuery('')
    setSelectedStyle(null)
    setPullOffset(0)
    trackedSearchRef.current = null
    inputRef.current?.blur()
    Keyboard.dismiss()
  }

  const selectStyle = (style: string) => {
    queryKindRef.current = 'style'
    setQuery('')
    setDebouncedQuery('')
    setSelectedStyle(style)
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
    if (!isSearching) return
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent
    if (Platform.OS === 'ios') {
      setPullOffset(contentOffset.y < 0 ? -contentOffset.y : 0)
    }
    if (
      contentSize.height - layoutMeasurement.height - contentOffset.y < 240 &&
      drinksQuery.hasNextPage &&
      !drinksQuery.isFetchingNextPage
    ) {
      void drinksQuery.fetchNextPage()
    }
  }

  const handleSearchScrollEndDrag = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!isSearching || Platform.OS !== 'ios') return
    if (event.nativeEvent.contentOffset.y <= -PULL_BACK_THRESHOLD) {
      clearSearch()
      return
    }
    setPullOffset(0)
  }

  const drinksQuery = useInfiniteQuery({
    queryKey: ['taplist', 'search', selectedCityName, debouncedQuery, selectedStyle],
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) =>
      searchMiniProducts({
        city: selectedCityName,
        query: debouncedQuery,
        style: selectedStyle,
        offset: pageParam,
        signal,
      }),
    getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
    enabled: configured && (debouncedQuery.length > 0 || selectedStyle !== null),
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

  const drinkResults = dedupeSearchResults(
    drinksQuery.data?.pages.flatMap((page) => page.results) ?? [],
  )
  const newTaps = newTapsQuery.data ?? []
  const breweries = breweriesQuery.data ?? []

  const showDrinkSection = isSearching

  useEffect(() => {
    if (!drinksQuery.isSuccess || (!debouncedQuery && !selectedStyle)) return
    const searchKey = `${selectedCityName}:${selectedStyle ?? ''}:${debouncedQuery}`
    if (trackedSearchRef.current === searchKey) return
    trackedSearchRef.current = searchKey
    trackEvent('search_completed', {
      query_kind: queryKindRef.current,
      query_length: debouncedQuery.length,
      style: selectedStyle,
      result_count: drinkResults.length,
      has_results: drinkResults.length > 0,
    })
  }, [debouncedQuery, drinkResults.length, drinksQuery.isSuccess, selectedCityName, selectedStyle])

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
            {pullReady ? tr(language, '释放返回浏览', 'Release to browse') : tr(language, '下拉返回浏览', 'Pull down to browse')}
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
          accessibilityLabel={tr(language, '返回浏览', 'Back to browse')}
          accessibilityHint={tr(language, '清空搜索并返回风格、上新与酒厂浏览', 'Clear search and return to discovery')}
          hitSlop={8}
          onPress={clearSearch}
          style={({ pressed }) => [styles.backTitleRow, pressed && styles.backTitlePressed]}>
          <FontAwesome name="chevron-left" size={15} color={palette.text} />
          <Text style={styles.pageTitleText}>{tr(language, '搜索', 'Search')}</Text>
        </Pressable>
      ) : (
        <Text style={[styles.pageTitleText, styles.pageTitleSpacing]}>{tr(language, '搜索', 'Search')}</Text>
      )}

      <View style={styles.inputFrame}>
        <FontAwesome name="search" size={17} color={palette.faint} />
        <TextInput
          ref={inputRef}
          accessibilityLabel={tr(language, '搜索公开酒单', 'Search public taplists')}
          accessibilityHint={tr(language, '可搜索酒款、酒厂或风格', 'Search beers, breweries, or styles')}
          placeholder={tr(language, '搜索风格 / 酒款 / 酒厂', 'Search style / beer / brewery')}
          placeholderTextColor={palette.faint}
          style={styles.input}
          selectionColor={palette.amber}
          value={query}
          onChangeText={(value) => {
            queryKindRef.current = 'custom'
            setSelectedStyle(null)
            setQuery(value)
          }}
          autoCorrect={false}
          autoCapitalize="none"
          clearButtonMode="never"
          returnKeyType="search"
          onSubmitEditing={() => setDebouncedQuery(trimmedQuery)}
        />
        {query.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tr(language, '清空搜索', 'Clear search')}
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
          breweriesError={breweriesQuery.isError}
          breweriesLoading={breweriesQuery.isLoading}
          onRetryBreweries={() => void breweriesQuery.refetch()}
          newTaps={newTapsQuery.isError ? [] : newTaps}
          onSelectStyle={selectStyle}
        />
      ) : null}

      {!configured ? (
        <EmptyState title={tr(language, '尚未连接酒单服务', 'Taplist service is not connected')} body={tr(language, '请配置 Supabase 环境变量后查看实时公开酒单。', 'Configure Supabase to view live public taplists.')} />
      ) : null}

      {configured && showDrinkSection ? (
        <>
          <Text style={styles.pullGuide}>{tr(language, '下拉可返回浏览', 'Pull down to return to browse')}</Text>
          {isDebouncing || drinksQuery.isLoading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={palette.amber} />
              <Text style={styles.muted}>{tr(language, '正在搜索酒款...', 'Searching beers...')}</Text>
            </View>
          ) : drinksQuery.isError ? (
            <EmptyState
              title={tr(language, '酒款搜索不可用', 'Beer search is unavailable')}
              body={tr(language, '暂时无法读取公开酒款目录，请稍后重试。', 'The public beer catalog is temporarily unavailable.')}>
              <RetryButton label={tr(language, '重新搜索', 'Search again')} onPress={() => void drinksQuery.refetch()} />
            </EmptyState>
          ) : drinkResults.length === 0 ? (
            <EmptyState title={tr(language, '没有匹配的酒款', 'No matching beers')} body={tr(language, '试试酒厂名、风格或酒款的中英文名。', 'Try a brewery, style, or beer name.')}>
              <View style={styles.emptyRecovery}>
                <Text style={styles.emptyRecoveryLabel}>{tr(language, '换个风格试试', 'Try another style')}</Text>
                <PresetSearches onSelect={selectStyle} />
              </View>
            </EmptyState>
          ) : (
            <>
              {drinkResults.map((drink) => (
                <DrinkResult key={drink.key} drink={drink} />
              ))}
              {drinksQuery.isFetchingNextPage ? (
                <View style={styles.loadingMore}>
                  <ActivityIndicator size="small" color={palette.amber} />
                  <Text style={styles.muted}>{tr(language, '正在加载更多...', 'Loading more...')}</Text>
                </View>
              ) : !drinksQuery.hasNextPage ? (
                <Text style={styles.listEnd}>{tr(language, '已显示全部结果', 'All results shown')}</Text>
              ) : null}
            </>
          )}
        </>
      ) : null}

      </ScrollView>
    </View>
  )
}

function SearchGuide({
  breweries,
  breweriesError,
  breweriesLoading,
  newTaps,
  onRetryBreweries,
  onSelectStyle,
}: {
  breweries: PublicTaplistBreweryDiscoveryRow[]
  breweriesError: boolean
  breweriesLoading: boolean
  newTaps: PublicNewTapRow[]
  onRetryBreweries: () => void
  onSelectStyle: (style: string) => void
}) {
  const { language } = useLanguage()
  const [gridWidth, setGridWidth] = useState(0)
  const [showAllStyles, setShowAllStyles] = useState(false)
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
        <View style={styles.sectionTitleRow}>
          <Text style={styles.sectionTitle}>{tr(language, '风格', 'Styles')}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => setShowAllStyles((visible) => !visible)}
            hitSlop={8}>
            <Text style={styles.moreStyles}>{showAllStyles ? tr(language, '收起', 'Less') : tr(language, '更多', 'More')}</Text>
          </Pressable>
        </View>
        <PresetSearches
          presets={showAllStyles ? expandedSearchPresets : searchPresets}
          onSelect={onSelectStyle}
        />
      </View>

      {newTaps.length > 0 && tileWidth > 0 ? (
        <SearchNewTaps drinks={newTaps.slice(0, 9)} tileWidth={tileWidth} gap={gap} />
      ) : null}

      {breweriesLoading ? (
        <View style={styles.guideSection}>
          <Text style={styles.sectionTitle}>{tr(language, '酒厂', 'Breweries')}</Text>
          <View style={styles.inlineLoading}>
            <ActivityIndicator size="small" color={palette.amber} />
            <Text style={styles.muted}>{tr(language, '加载中', 'Loading')}</Text>
          </View>
        </View>
      ) : breweriesError ? (
        <View style={styles.guideSection}>
          <Text style={styles.sectionTitle}>{tr(language, '酒厂', 'Breweries')}</Text>
          <RetryButton label={tr(language, '酒厂加载失败，点击重试', 'Unable to load breweries. Tap to retry.')} onPress={onRetryBreweries} />
        </View>
      ) : tileWidth > 0 ? (
        <BreweryDiscovery
          breweries={breweries.slice(0, 8)}
          tileWidth={tileWidth}
          gap={gap}
        />
      ) : null}
    </View>
  )
}

function PresetSearches({
  onSelect,
  presets = searchPresets,
}: {
  onSelect: (query: string) => void
  presets?: string[]
}) {
  const { language } = useLanguage()
  return (
    <View style={styles.presetRow}>
      {presets.map((preset) => (
        <Pressable
          key={preset}
          accessibilityRole="button"
          accessibilityLabel={tr(language, `筛选${preset}`, `Filter by ${englishStyleLabels[preset] || preset}`)}
          accessibilityHint={tr(language, '显示当前公开酒单中的匹配酒款', 'Show matching beers on public taplists')}
          onPress={() => onSelect(preset)}
          style={({ pressed }) => [styles.presetPill, pressed && styles.presetPillPressed]}>
          <Text style={styles.presetLabel}>{language === 'en' ? englishStyleLabels[preset] || preset : preset}</Text>
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
  const { language } = useLanguage()
  const rows = chunkRows(drinks, GRID_COLS)
  const tileHeight = tileWidth

  return (
    <View style={styles.guideSection}>
      <Text style={styles.sectionTitle}>{tr(language, '上新', 'New on tap')}</Text>
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
  const { localized } = useLanguage()
  const router = useRouter()
  const breweryLine = formatPrimaryBrewery(localized(drink.brewery, drink.brewery_en), drink.brand_name)
  const artworkSource = drink.image_url || defaultBeerArtwork
  const copy = (
    <View style={styles.newTapTileCopy}>
      <Text style={styles.newTapTileName} numberOfLines={2} ellipsizeMode="tail">
        {localized(drink.name, drink.name_en)}
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
      <CachedImageBackground
        source={artworkSource}
        ossStyle="nm-card"
        style={styles.newTapTileImage}
        imageStyle={styles.newTapTileImageRadius}>
        <LinearGradient
          colors={['rgba(13,13,13,0.05)', 'rgba(13,13,13,0.42)', 'rgba(13,13,13,0.94)']}
          locations={[0, 0.42, 1]}
          style={styles.newTapTileScrim}>
          {copy}
        </LinearGradient>
      </CachedImageBackground>
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
  tileWidth,
  gap,
}: {
  breweries: PublicTaplistBreweryDiscoveryRow[]
  tileWidth: number
  gap: number
}) {
  const { language, localized } = useLanguage()
  const router = useRouter()
  const items: Array<PublicTaplistBreweryDiscoveryRow | 'all'> = [...breweries, 'all']
  const rows = chunkRows(items, GRID_COLS)
  const tileHeight = tileWidth

  return (
    <View style={styles.guideSection}>
      <Text style={styles.sectionTitle}>{tr(language, '酒厂', 'Breweries')}</Text>
      <View style={[styles.breweryGrid, { gap }]}>
        {rows.map((row, rowIndex) => (
          <View
            key={row.map((brewery) => brewery === 'all' ? 'all' : brewery.brewery_name).join('-')}
            style={[styles.breweryRow, { gap }]}>
            {row.map((brewery) => brewery === 'all' ? (
              <Pressable
                key="all-breweries"
                accessibilityRole="link"
                accessibilityLabel={tr(language, '查看全部酒厂', 'View all breweries')}
                accessibilityHint={tr(language, '打开当前城市的完整酒厂列表', 'Open the complete brewery list for this city')}
                onPress={() => router.push('/breweries' as Href)}
                style={({ pressed }) => [
                  styles.newTapTile,
                  { width: tileWidth, height: tileHeight },
                  pressed && styles.newTapTilePressed,
                ]}>
                <LinearGradient
                  colors={['rgba(61,54,43,0.72)', 'rgba(27,25,22,0.92)', 'rgba(13,13,13,1)']}
                  locations={[0, 0.5, 1]}
                  style={styles.allBreweriesSurface}>
                  <View style={styles.allBreweriesIcon}>
                    <FontAwesome name="ellipsis-h" size={24} color="rgba(211,154,69,0.78)" />
                  </View>
                  <View style={styles.newTapTileCopy}>
                    <Text style={styles.newTapTileName}>{tr(language, '全部酒厂', 'All breweries')}</Text>
                    <Text style={styles.newTapTileBrewery}>{tr(language, '本城有供应', 'Available in this city')}</Text>
                  </View>
                </LinearGradient>
              </Pressable>
            ) : (
              <Pressable
                key={brewery.brewery_name}
                accessibilityRole="link"
                accessibilityLabel={tr(language, `查看${brewery.brewery_name}酒厂`, `View ${localized(brewery.brewery_name, brewery.brewery_name_en)}`)}
                accessibilityHint={tr(language, '打开酒厂页', 'Open brewery page')}
                onPress={() => router.push(`/brewery/${encodeURIComponent(brewery.brewery_name)}` as Href)}
                style={({ pressed }) => [
                  styles.newTapTile,
                  { width: tileWidth, height: tileHeight },
                  pressed && styles.newTapTilePressed,
                ]}>
                {brewery.logo_url ? (
                  <CachedImageBackground
                    accessibilityLabel={tr(language, `${brewery.brewery_name}酒厂 Logo`, `${localized(brewery.brewery_name, brewery.brewery_name_en)} brewery logo`)}
                    ossStyle="nm-card"
                    source={brewery.logo_url}
                    contentFit="contain"
                    style={[styles.newTapTileImage, styles.breweryTileFrame]}
                    imageStyle={[styles.newTapTileImageRadius, styles.breweryTileLogo]}>
                    <BreweryTileCopy brewery={brewery} />
                  </CachedImageBackground>
                ) : (
                  <View style={styles.newTapTileImage}>
                    <BreweryTileCopy brewery={brewery} />
                  </View>
                )}
              </Pressable>
            ))}
            {row.length < GRID_COLS
              ? Array.from({ length: GRID_COLS - row.length }).map((_, index) => (
                  <View key={`spacer-${rowIndex}-${index}`} style={{ width: tileWidth, height: tileHeight }} />
                ))
              : null}
          </View>
        ))}
      </View>
    </View>
  )
}

function BreweryTileCopy({ brewery }: { brewery: PublicTaplistBreweryDiscoveryRow }) {
  const { language, localized } = useLanguage()
  return (
    <LinearGradient
      colors={['rgba(13,13,13,0.02)', 'rgba(13,13,13,0.38)', 'rgba(13,13,13,0.92)']}
      locations={[0, 0.5, 1]}
      style={styles.newTapTileScrim}>
      <View style={styles.newTapTileCopy}>
        <Text style={styles.newTapTileName} numberOfLines={2} ellipsizeMode="tail">
          {localized(brewery.brewery_name, brewery.brewery_name_en)}
        </Text>
        <Text style={styles.newTapTileBrewery}>{tr(language, `${brewery.tap_count} 款`, `${brewery.tap_count} beer${brewery.tap_count === 1 ? '' : 's'}`)}</Text>
      </View>
    </LinearGradient>
  )
}

function DrinkResult({ drink }: { drink: MiniProductSearchResult }) {
  const { language, localized } = useLanguage()
  const styleLine = [localized(drink.brewery, drink.brewery_en), drink.beer_style, typeof drink.abv === 'number' ? `ABV ${drink.abv}%` : null]
    .filter(Boolean)
    .join(' · ')
  const hasSupply = drink.venue_count > 0

  return (
    <View style={styles.resultItem}>
      <Link href={`/product/${encodeURIComponent(drink.key)}` as Href} asChild>
        <Pressable
          onPress={() =>
            trackEvent('beer_opened', {
              product_id: drink.product_id,
              drink_id: drink.drink_id,
              source: 'search_result',
            })
          }
          style={({ pressed }) => [styles.drinkPressable, pressed && styles.pressed]}>
          <View style={styles.drinkRowInner}>
            <View style={styles.searchArtwork}>
              {drink.image_url ? (
                <CachedImage
                  accessibilityLabel={tr(language, `${drink.name}酒标`, `${localized(drink.name, drink.name_en)} label`)}
                  source={drink.image_url}
                  ossStyle="nm-thumb"
                  style={styles.searchArtworkImage}
                />
              ) : null}
            </View>
            <View style={styles.drinkCopy}>
              <Text style={styles.resultName} numberOfLines={2}>
                {localized(drink.name, drink.name_en)}
              </Text>
              {styleLine ? <Text style={styles.drinkStyle}>{styleLine}</Text> : null}
              <Text style={[styles.supplyLine, hasSupply && styles.supplyLineAvailable]}>
                {hasSupply ? tr(language, `本城 ${drink.venue_count} 家有售`, `Available at ${drink.venue_count} venue${drink.venue_count === 1 ? '' : 's'}`) : tr(language, '当前城市暂无供应', 'Not available in this city')}
              </Text>
              {drink.venues.length > 0 ? (
                <View style={styles.venuePills}>
                  {drink.venues.slice(0, 2).map((venue) => (
                    <View key={venue.id} style={styles.venuePill}>
                      <Text style={styles.venuePillText} numberOfLines={1}>{localized(venue.name, venue.display_name_en)}</Text>
                    </View>
                  ))}
                  {drink.venue_count > 2 ? (
                    <Text style={styles.moreVenues}>+{drink.venue_count - 2}</Text>
                  ) : null}
                </View>
              ) : null}
            </View>
          </View>
        </Pressable>
      </Link>
    </View>
  )
}

function dedupeSearchResults(results: MiniProductSearchResult[]) {
  const seen = new Set<string>()
  return results.filter((result) => {
    if (seen.has(result.key)) return false
    seen.add(result.key)
    return true
  })
}

function RetryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}>
      <Text style={styles.retryButtonText}>{label}</Text>
    </Pressable>
  )
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
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  moreStyles: {
    ...typography.caption,
    color: palette.amber,
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
  breweryTileFrame: {
    backgroundColor: 'rgba(245,241,232,0.06)',
  },
  breweryTileLogo: {
    top: spacing.sm,
    right: spacing.sm,
    bottom: spacing.sm,
    left: spacing.sm,
  },
  breweryRow: {
    flexDirection: 'row',
    width: '100%',
  },
  allBreweriesSurface: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
    paddingTop: spacing.md,
  },
  allBreweriesIcon: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
  inlineLoading: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  loadingMore: {
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  listEnd: {
    ...typography.micro,
    color: palette.faint,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  resultItem: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(245,241,230,0.12)',
    paddingBottom: spacing.lg,
    marginBottom: spacing.lg,
  },
  drinkPressable: {
    paddingTop: spacing.sm,
  },
  drinkRowInner: {
    flexDirection: 'row',
    gap: spacing.lg,
    alignItems: 'flex-start',
  },
  searchArtwork: {
    width: 72,
    height: 72,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: palette.black,
  },
  searchArtworkImage: {
    width: '100%',
    height: '100%',
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
  drinkStyle: {
    ...typography.caption,
    color: palette.faint,
    marginTop: spacing.xxs,
    lineHeight: 18,
  },
  supplyLine: {
    ...typography.micro,
    color: palette.faint,
    marginTop: spacing.xs,
    lineHeight: 16,
  },
  supplyLineAvailable: {
    color: palette.amber,
  },
  venuePills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  venuePill: {
    maxWidth: '100%',
    borderRadius: 5,
    borderWidth: 1,
    borderColor: 'rgba(198,168,117,0.24)',
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
  venuePillText: {
    ...typography.micro,
    color: palette.muted,
    fontSize: 10,
    lineHeight: 14,
  },
  moreVenues: {
    ...typography.micro,
    color: palette.faint,
    alignSelf: 'center',
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
  retryButton: {
    alignSelf: 'flex-start',
    minHeight: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(198,168,117,0.30)',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm,
  },
  retryButtonText: {
    ...typography.caption,
    color: palette.tungsten,
  },
})
