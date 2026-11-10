import { useIsFocused } from '@react-navigation/native'
import { router, useLocalSearchParams, type Href } from 'expo-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { FeedBeerCard } from '@/components/taplist/FeedBeerCard'
import { FeedExplanation } from '@/components/taplist/FeedExplanation'
import { palette, typography } from '@/constants/design'
import type { FeedItem, FeedMode, FeedResult } from '@/lib/api/beerFeed'
import { trackEvent } from '@/lib/analytics'
import { INTELLIGENCE_ENABLED, IntelligenceError } from '@/lib/intelligenceHttp'
import { tr, useLanguage } from '@/lib/i18n'
import { useTaplistCity } from '@/lib/taplistCity'
import { useBeerFeed } from '@/lib/useBeerFeed'
import { useFeedExposure } from '@/lib/useFeedExposure'

type Row = { key: string; kind: 'date'; date: string } | { key: string; kind: 'venue'; item: FeedItem } | { key: string; kind: 'beer'; item: FeedItem; position: number }
function rowsFor(result: FeedResult | undefined): Row[] {
  if (!result) return []
  if (result.mode === 'for_you') return result.items.map((item, index) => ({ kind: 'beer', key: item.item_id, item, position: index + 1 }))
  const rows: Row[] = []
  let previousDay = '', previousVenue = ''
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: result.timezone, year: 'numeric', month: '2-digit', day: '2-digit' })
  for (const [index, item] of result.items.entries()) {
    const parts = date.formatToParts(new Date(item.current_cycle_started_at))
    const day = ['year', 'month', 'day'].map((type) => parts.find((part) => part.type === type)?.value).join('-')
    if (day !== previousDay) {
      rows.push({ key: `day:${day}`, kind: 'date', date: day })
      previousVenue = ''
      previousDay = day
    }
    // Only consecutive rows are grouped. This preserves server chronology,
    // including when the next cursor page continues the same venue/day.
    if (item.tenant_id !== previousVenue) {
      rows.push({ key: `venue:${item.item_id}`, kind: 'venue', item })
      previousVenue = item.tenant_id
    }
    rows.push({ key: item.item_id, kind: 'beer', item, position: index + 1 })
  }
  return rows
}

export default function NewBeersScreen() {
  const { mode: initial } = useLocalSearchParams<{ mode?: string }>()
  const [mode, setMode] = useState<FeedMode>(initial === 'for_you' ? 'for_you' : 'latest')
  const [visited, setVisited] = useState({ for_you: initial === 'for_you', latest: initial !== 'for_you' })
  const { selectedCity } = useTaplistCity()
  const { language, localized } = useLanguage()
  const insets = useSafeAreaInsets()
  const changeMode = (next: FeedMode) => { setVisited((value) => ({ ...value, [next]: true })); setMode(next) }
  return <View style={[styles.screen, { paddingTop: insets.top }]}>
    <View style={styles.navigation}>
      <Pressable accessibilityRole="button" accessibilityLabel={tr(language, '返回', 'Back')} onPress={() => router.back()} style={styles.back}><Text style={styles.backText}>‹</Text></Pressable>
      <Text style={styles.navigationTitle}>{tr(language, '上新酒款', 'New on Tap')}</Text>
      <View style={styles.back} />
    </View>
    <View style={styles.header}>
      <Text style={styles.city}>{localized(selectedCity.label, selectedCity.label_en)}</Text>
      <View style={styles.tabs} accessibilityRole="tablist">
        {(['for_you', 'latest'] as const).map((value) => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: mode === value }}
          onPress={() => changeMode(value)} style={[styles.tab, value === mode && styles.tabSelected]}>
          <Text style={[styles.tabText, value === mode && styles.tabTextSelected]}>{value === 'for_you' ? tr(language, '适合你的', 'For You') : tr(language, '全部上新', 'Latest')}</Text>
        </Pressable>)}
      </View>
    </View>
    {(['for_you', 'latest'] as const).map((value) => <View key={value} style={mode === value ? styles.panel : styles.hidden}
      accessibilityElementsHidden={mode !== value} importantForAccessibility={mode === value ? 'auto' : 'no-hide-descendants'}>
      <FeedPanel city={selectedCity.city} mode={value} enabled={visited[value]} active={mode === value} onLatest={() => changeMode('latest')} />
    </View>)}
  </View>
}

function FeedPanel({ city, mode, enabled, active, onLatest }: { city: string; mode: FeedMode; enabled: boolean; active: boolean; onLatest: () => void }) {
  const feed = useBeerFeed(city, mode, 'feed_page', enabled && active)
  const { language, localized } = useLanguage()
  const focused = useIsFocused()
  const [explanationOpen, setExplanationOpen] = useState(false)
  const insets = useSafeAreaInsets()
  const exposure = useFeedExposure(feed.data, active && focused && !explanationOpen, insets.top + 44, insets.bottom, mode === 'latest' ? 44 : 0)
  const list = useRef<FlatList<Row>>(null)
  const rows = useMemo(() => rowsFor(feed.data), [feed.data])
  // FlatList's description is child 0; each date row sticks below the fixed tabs.
  const stickyDates = useMemo(() => rows.flatMap((row, index) => row.kind === 'date' ? [index + 1] : []), [rows])
  useEffect(() => { list.current?.scrollToOffset({ offset: 0, animated: false }) }, [feed.cacheKey])
  const guest = mode === 'for_you' && feed.identity.ready && !feed.identity.owner
  const loading = INTELLIGENCE_ENABLED && !guest && (!feed.identity.ready || feed.isPending)
  const result = feed.data
  const cold = result?.personalization?.status === 'cold_start'
  const uniqueTaps = result?.personalization?.unique_tap_count || 0
  const requiredTaps = result?.personalization?.required_tap_count || 5
  const building = result?.snapshot?.state === 'building' || result?.empty_reason === 'refresh_pending'
  const emptyText = guest
    ? tr(language, '记录喝过的酒，让我们按你的口味匹配上新。', 'Log beers you’ve tried to start matching new arrivals to your taste.')
    : cold
      ? tr(language, `已记录 ${uniqueTaps} 款不同的酒，还差 ${Math.max(0, requiredTaps - uniqueTaps)} 款。可在门店酒款详情中点击「记一杯」。`,
        `You’ve logged ${uniqueTaps} different beers. Log ${Math.max(0, requiredTaps - uniqueTaps)} more to start taste matching. Choose “Tap it” on a beer’s detail page at a bar.`)
      : building ? tr(language, '正在准备你的上新列表，请稍后刷新。', 'Your list is being prepared. Please refresh shortly.')
      : mode === 'for_you' ? tr(language, '当前城市暂时没有匹配你口味的上新，可以先看看全部上新。', 'No matching new arrivals in this city right now. Take a look at Latest.')
      : tr(language, '当前城市暂无近期上枪酒款。', 'No recent beers on tap in this city yet.')

  const openVenue = (item: FeedItem) => {
    trackEvent('bar_opened', { tenant_id: item.tenant_id, source: 'feed' })
    router.push(`/bar/${encodeURIComponent(item.tenant_slug)}` as Href)
  }
  return <View ref={exposure.viewport} collapsable={false} style={styles.panel}>
    <FlatList ref={list} data={rows} keyExtractor={(row) => row.key} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
      stickyHeaderIndices={stickyDates}
      removeClippedSubviews={false} refreshing={feed.isFetching && !!result} onRefresh={() => void feed.refresh()}
      onScrollBeginDrag={exposure.invalidate} onMomentumScrollBegin={exposure.invalidate}
      onScroll={exposure.invalidate} scrollEventThrottle={32}
      onEndReached={() => { if (active && !feed.pageError) void feed.loadMore() }} onEndReachedThreshold={0.4}
      ListHeaderComponent={result?.items.length ? <View style={styles.description}>
        <Text style={styles.descriptionText}>{mode === 'for_you' ? tr(language, '根据你 TAP 过的酒款风格匹配', 'Matched to the styles you’ve logged') : tr(language, '最近 14 天 · 按上枪时间排列', 'Last 14 days · By tap date')}</Text>
        {mode === 'for_you' ? <FeedExplanation onVisibilityChange={setExplanationOpen} /> : null}
      </View> : null}
      ListEmptyComponent={loading ? <FeedSkeleton /> : <View style={styles.empty}>
        <Text style={styles.emptyText}>{!INTELLIGENCE_ENABLED || feed.isError && !guest ? tr(language, '上新酒款暂时不可用，请稍后重试。', 'New on Tap is temporarily unavailable. Please try again.') : emptyText}</Text>
        {INTELLIGENCE_ENABLED && (feed.isError || building) ? <Pressable style={styles.action} onPress={() => void feed.refresh()}><Text style={styles.actionText}>{tr(language, '重试', 'Try again')}</Text></Pressable> : null}
        {mode === 'for_you' ? <Pressable style={styles.action} onPress={onLatest}><Text style={styles.actionText}>{tr(language, '查看全部上新', 'Browse Latest')}</Text></Pressable> : null}
      </View>}
      renderItem={({ item: row }) => {
        if (row.kind === 'date') {
          const date = new Date(`${row.date}T12:00:00Z`)
          return <View style={styles.dateHeading} accessibilityRole="header">
            <Text style={styles.date}>{new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en-US', { month: language === 'zh' ? 'numeric' : 'short', day: 'numeric', timeZone: 'UTC' }).format(date)}</Text>
            <View style={styles.dateRule} />
          </View>
        }
        if (row.kind === 'venue') return <Pressable style={styles.venueHeading} onPress={() => openVenue(row.item)} accessibilityRole="button">
          <View style={styles.venueMark} />
          <Text style={styles.venueHeadingText} numberOfLines={2}>{localized(row.item.tenant_name, row.item.tenant_name_en)}</Text>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
        return <View ref={(view) => exposure.register(row.item.item_id, view)} collapsable={false} style={[styles.row, mode === 'latest' && styles.latestRow]}>
          <FeedBeerCard item={row.item} result={result!} position={row.position} showVenue={mode === 'for_you'} />
        </View>
      }}
      ListFooterComponent={feed.moreBusy ? <FeedSkeleton count={1} /> : feed.pageError ? <View style={styles.empty}>
        <Text style={styles.emptyText}>{feed.pageError instanceof IntelligenceError && feed.pageError.status === 410
          ? tr(language, '列表已过期，刷新后继续浏览。', 'This list has expired. Refresh to keep browsing.')
          : tr(language, '暂时无法加载更多，已加载的酒款仍可查看。', 'More beers couldn’t load. You can still browse the current list.')}</Text>
        <Pressable style={styles.action} onPress={() => void (feed.pageError instanceof IntelligenceError && feed.pageError.status === 410 ? feed.refresh() : feed.loadMore())}>
          <Text style={styles.actionText}>{tr(language, '重试', 'Try again')}</Text>
        </Pressable>
      </View> : null} />
  </View>
}

function FeedSkeleton({ count = 4 }: { count?: number }) {
  return <View accessibilityLabel="Loading" style={styles.skeletons}>
    {Array.from({ length: count }, (_, index) => <View key={index} style={styles.skeleton}>
      <View style={styles.skeletonImage} /><View style={styles.skeletonCopy}><View style={styles.skeletonLine} /><View style={[styles.skeletonLine, { width: '65%' }]} /></View>
    </View>)}
  </View>
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.background }, navigation: { height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  back: { width: 40, height: 44, justifyContent: 'center' }, backText: { fontSize: 34, color: palette.text },
  navigationTitle: { ...typography.body, color: palette.text, fontWeight: '600' }, header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4, gap: 12 }, city: { ...typography.caption, color: palette.tungsten },
  tabs: { flexDirection: 'row', padding: 3, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.bgSoft, borderRadius: 12 },
  tab: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 9 }, tabSelected: { backgroundColor: palette.amber },
  tabText: { ...typography.caption, color: palette.muted }, tabTextSelected: { color: palette.background, fontWeight: '600' },
  panel: { flex: 1 }, hidden: { display: 'none' }, content: { paddingHorizontal: 16 },
  description: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 8, paddingBottom: 10 }, descriptionText: { ...typography.micro, color: palette.muted, flexShrink: 1 },
  dateHeading: { height: 40, flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: palette.background },
  date: { ...typography.body, fontSize: 16, color: palette.text, fontWeight: '600' },
  dateRule: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: palette.line },
  venueHeading: { minHeight: 44, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 10 },
  venueMark: { width: 2, height: 12, borderRadius: 1, backgroundColor: palette.goldMuted },
  venueHeadingText: { ...typography.body, flex: 1, color: palette.text, fontWeight: '500' },
  chevron: { fontSize: 22, lineHeight: 24, color: palette.tungsten, paddingRight: 4 },
  row: { marginBottom: 8 }, latestRow: { marginBottom: 4 }, empty: { alignItems: 'center', padding: 24, gap: 12, backgroundColor: palette.panelElevated, borderRadius: 16, marginTop: 8 },
  emptyText: { ...typography.body, color: palette.muted, textAlign: 'center' }, action: { paddingVertical: 12, paddingHorizontal: 20 }, actionText: { ...typography.caption, color: palette.amber },
  skeletons: { gap: 10 }, skeleton: { flexDirection: 'row', height: 90, backgroundColor: palette.panelElevated, borderRadius: 16, overflow: 'hidden' },
  skeletonImage: { width: 84, backgroundColor: palette.bgSoft }, skeletonCopy: { flex: 1, padding: 16, gap: 12 }, skeletonLine: { height: 12, width: '85%', borderRadius: 4, backgroundColor: palette.line },
})
