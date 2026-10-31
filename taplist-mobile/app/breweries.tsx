import FontAwesome from '@expo/vector-icons/FontAwesome'
import { useInfiniteQuery } from '@tanstack/react-query'
import { type Href, useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { BackButton } from '@/components/taplist/BackButton'
import { CachedImage } from '@/components/taplist/CachedImage'
import { CityPickerModal } from '@/components/taplist/CityPickerModal'
import { palette, spacing, typography } from '@/constants/design'
import { listMiniBreweries } from '@/lib/api/taplist'
import { useTaplistCity } from '@/lib/taplistCity'
import type { MiniBreweryListRow } from '@/lib/types'
import { useTaplistSupabaseReady } from '@/lib/useTaplistSupabaseReady'
import { tr, useLanguage } from '@/lib/i18n'

export default function BreweriesScreen() {
  const { language, localized } = useLanguage()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const configured = useTaplistSupabaseReady()
  const { selectedCity, cities, canSelectCity, selectCity } = useTaplistCity()
  const [cityPickerVisible, setCityPickerVisible] = useState(false)
  const [filter, setFilter] = useState('')
  const breweriesQuery = useInfiniteQuery({
    queryKey: ['taplist', 'mini-breweries', selectedCity.city],
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) =>
      listMiniBreweries(selectedCity.city, pageParam, signal),
    getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
    enabled: configured,
  })
  const breweries = dedupeBreweries(
    breweriesQuery.data?.pages.flatMap((page) => page.results) ?? [],
  )
  const normalizedFilter = normalizeSearchText(filter)
  const visibleBreweries = normalizedFilter
    ? breweries.filter((brewery) => [brewery.display_name, brewery.name_en, brewery.brewery]
      .some((name) => normalizeSearchText(name).includes(normalizedFilter)))
    : breweries

  useEffect(() => {
    if (
      !normalizedFilter
      || !breweriesQuery.hasNextPage
      || breweriesQuery.isFetchingNextPage
      || breweriesQuery.isFetchNextPageError
    ) return

    void breweriesQuery.fetchNextPage()
  }, [breweries.length, breweriesQuery, normalizedFilter])

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent
    if (
      contentSize.height - layoutMeasurement.height - contentOffset.y < 240
      && breweriesQuery.hasNextPage
      && !breweriesQuery.isFetchingNextPage
    ) {
      void breweriesQuery.fetchNextPage()
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
          setCityPickerVisible(false)
          setFilter('')
          void selectCity(city)
        }}
      />
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 74, paddingBottom: insets.bottom + spacing.xxl },
        ]}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={handleScroll}>
        <View style={styles.header}>
          <Text style={styles.title}>{tr(language, '酒厂', 'Breweries')}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={canSelectCity ? tr(language, `当前城市${selectedCity.label}，选择城市`, `Current city: ${localized(selectedCity.label, selectedCity.label_en)}. Select city`) : tr(language, `当前城市${selectedCity.label}`, `Current city: ${localized(selectedCity.label, selectedCity.label_en)}`)}
            disabled={!canSelectCity}
            onPress={() => setCityPickerVisible(true)}
            style={({ pressed }) => [styles.cityButton, pressed && styles.pressed]}>
            <Text style={styles.cityLabel}>{localized(selectedCity.label, selectedCity.label_en)}</Text>
            {canSelectCity ? <FontAwesome name="angle-down" size={12} color={palette.gold} /> : null}
          </Pressable>
        </View>

        <View style={styles.searchFrame}>
          <FontAwesome name="search" size={15} color={palette.faint} />
          <TextInput
            accessibilityLabel={tr(language, '搜索本城酒厂', 'Search breweries in this city')}
            placeholder={tr(language, '搜索酒厂', 'Search breweries')}
            placeholderTextColor={palette.faint}
            value={filter}
            onChangeText={setFilter}
            autoCorrect={false}
            autoCapitalize="none"
            selectionColor={palette.amber}
            returnKeyType="search"
            style={styles.searchInput}
          />
          {filter.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={tr(language, '清空酒厂搜索', 'Clear brewery search')}
              hitSlop={10}
              onPress={() => setFilter('')}
              style={({ pressed }) => pressed && styles.pressed}>
              <FontAwesome name="times-circle" size={17} color={palette.faint} />
            </Pressable>
          ) : null}
        </View>

        {!configured ? (
          <EmptyState body={tr(language, '尚未连接酒单服务。', 'Taplist service is not connected.')} />
        ) : breweriesQuery.isLoading ? (
          <Loading label={tr(language, '正在加载酒厂...', 'Loading breweries...')} />
        ) : breweriesQuery.isError ? (
          <View style={styles.empty}>
            <Text style={styles.muted}>{tr(language, '暂时无法加载酒厂，请稍后重试。', 'Unable to load breweries. Please try again.')}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void breweriesQuery.refetch()}
              style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}>
              <Text style={styles.retryText}>{tr(language, '重新加载', 'Reload')}</Text>
            </Pressable>
          </View>
        ) : breweries.length === 0 ? (
          <EmptyState body={tr(language, `${selectedCity.label}暂无公开在售酒厂。`, `No public breweries are on tap in ${localized(selectedCity.label, selectedCity.label_en)}.`)} />
        ) : visibleBreweries.length === 0 && breweriesQuery.isFetchingNextPage ? (
          <Loading label={tr(language, '正在搜索本城酒厂...', 'Searching breweries...')} />
        ) : visibleBreweries.length === 0 ? (
          <EmptyState body={tr(language, `没有找到与“${filter.trim()}”匹配的酒厂。`, `No brewery matches “${filter.trim()}”.`)} />
        ) : (
          <View style={styles.list}>
            {visibleBreweries.map((brewery) => (
              <BreweryRow
                key={brewery.brewery}
                brewery={brewery}
                onPress={() => router.push(`/brewery/${encodeURIComponent(brewery.brewery)}` as Href)}
              />
            ))}
            {breweriesQuery.isFetchingNextPage ? <Loading label={tr(language, '正在加载更多...', 'Loading more...')} compact /> : null}
            {!breweriesQuery.hasNextPage ? (
              <Text style={styles.listEnd}>{normalizedFilter ? tr(language, '已搜索全部本城酒厂', 'All city breweries searched') : tr(language, '已显示全部酒厂', 'All breweries shown')}</Text>
            ) : null}
          </View>
        )}
      </ScrollView>
    </View>
  )
}

function BreweryRow({
  brewery,
  onPress,
}: {
  brewery: MiniBreweryListRow
  onPress: () => void
}) {
  const { language, localized } = useLanguage()
  const showEnglishName = brewery.name_en
    && brewery.name_en.trim().toLocaleLowerCase() !== brewery.display_name.trim().toLocaleLowerCase()

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={tr(language, `查看${brewery.display_name}酒厂，本城在售${brewery.product_count}款`, `View ${localized(brewery.display_name, brewery.name_en)}, ${brewery.product_count} beers available`)}
      accessibilityHint={tr(language, '打开酒厂在售酒款页', 'Open brewery beer list')}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      {brewery.logo_url ? (
        <View style={styles.logoFrame}>
          <CachedImage
            accessibilityLabel={tr(language, `${brewery.display_name}酒厂 Logo`, `${localized(brewery.display_name, brewery.name_en)} brewery logo`)}
            source={brewery.logo_url}
            ossStyle="nm-thumb"
            contentFit="contain"
            style={styles.logo}
          />
        </View>
      ) : <View style={styles.logoSpacer} />}
      <View style={styles.rowCopy}>
        <Text style={styles.rowTitle} numberOfLines={2}>{localized(brewery.display_name, brewery.name_en)}</Text>
        {showEnglishName ? (
          <Text style={styles.rowEnglish} numberOfLines={1}>{brewery.name_en}</Text>
        ) : null}
        <Text style={styles.rowCount}>{tr(language, `本城在售 ${brewery.product_count} 款`, `${brewery.product_count} available in this city`)}</Text>
      </View>
      <FontAwesome name="angle-right" size={17} color={palette.faint} />
    </Pressable>
  )
}

function Loading({ label, compact = false }: { label: string; compact?: boolean }) {
  return (
    <View style={[styles.loading, compact && styles.loadingCompact]}>
      <ActivityIndicator size={compact ? 'small' : 'large'} color={palette.amber} />
      <Text style={styles.muted}>{label}</Text>
    </View>
  )
}

function EmptyState({ body }: { body: string }) {
  return <View style={styles.empty}><Text style={styles.muted}>{body}</Text></View>
}

function dedupeBreweries(breweries: MiniBreweryListRow[]) {
  const seen = new Set<string>()
  return breweries.filter((brewery) => {
    if (seen.has(brewery.brewery)) return false
    seen.add(brewery.brewery)
    return true
  })
}

function normalizeSearchText(value: string | null | undefined) {
  return value?.trim().toLocaleLowerCase() ?? ''
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.background },
  content: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    paddingHorizontal: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingBottom: spacing.md,
  },
  title: { ...typography.headline, color: palette.text, fontSize: 27, lineHeight: 35, fontWeight: '600' },
  cityButton: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 8, paddingLeft: 12 },
  cityLabel: { ...typography.caption, color: palette.gold },
  searchFrame: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: 10,
    backgroundColor: palette.panelElevated,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  searchInput: {
    ...typography.caption,
    flex: 1,
    minWidth: 0,
    color: palette.text,
    paddingVertical: spacing.sm,
  },
  list: { borderTopWidth: 1, borderTopColor: palette.hairline },
  row: {
    minHeight: 92,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.line,
  },
  rowPressed: { opacity: 0.72 },
  logoFrame: {
    width: 62,
    height: 62,
    borderRadius: 8,
    backgroundColor: 'rgba(245,241,232,0.06)',
    padding: spacing.xs,
    overflow: 'hidden',
  },
  logo: { width: '100%', height: '100%' },
  logoSpacer: { width: 62, height: 62 },
  rowCopy: { flex: 1, minWidth: 0 },
  rowTitle: { ...typography.title, color: palette.text, fontSize: 18, lineHeight: 23 },
  rowEnglish: { ...typography.caption, color: palette.muted, marginTop: 2 },
  rowCount: { ...typography.micro, color: palette.tungsten, marginTop: spacing.xs },
  loading: { paddingVertical: spacing.xxl, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  loadingCompact: { paddingVertical: spacing.lg, flexDirection: 'row' },
  empty: { paddingVertical: spacing.xxl, borderTopWidth: 1, borderTopColor: palette.hairline, gap: spacing.md },
  muted: { ...typography.caption, color: palette.muted },
  retryButton: { alignSelf: 'flex-start', paddingVertical: spacing.xs, paddingHorizontal: spacing.sm },
  retryText: { ...typography.caption, color: palette.amber },
  listEnd: { ...typography.micro, color: palette.faint, textAlign: 'center', paddingVertical: spacing.lg },
  pressed: { opacity: 0.72 },
})
