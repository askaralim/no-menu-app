import { useIsFocused } from '@react-navigation/native'
import { router, type Href } from 'expo-router'
import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { CachedImage } from '@/components/taplist/CachedImage'
import { FeedExplanation } from '@/components/taplist/FeedExplanation'
import { openFeedBeer } from '@/components/taplist/FeedBeerCard'
import { palette, typography } from '@/constants/design'
import { tr, useLanguage } from '@/lib/i18n'
import { localizeBeerStyle } from '@/lib/styleLocalization'
import { useBeerFeed } from '@/lib/useBeerFeed'
import { useFeedExposure } from '@/lib/useFeedExposure'

export function HomeBeerFeed({ city, refreshVersion = 0, suspended = false, scrollObserver }: {
  city: string; refreshVersion?: number; suspended?: boolean; scrollObserver?: MutableRefObject<(() => void) | null>
}) {
  const { language, localized } = useLanguage()
  const focused = useIsFocused()
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const [explanationOpen, setExplanationOpen] = useState(false)
  const personal = useBeerFeed(city, 'for_you', 'home')
  const hasPersonal = !!personal.identity.owner && !!personal.data?.items.length
  // Preload the fallback without displaying it before the personal result resolves.
  const latestEnabled = personal.identity.ready
  const showLatest = !personal.identity.owner || personal.isError || !!personal.data && !hasPersonal
  const latest = useBeerFeed(city, 'latest', 'home', latestEnabled)
  const result = hasPersonal ? personal.data : showLatest ? latest.data : undefined
  const mode = hasPersonal ? 'for_you' : 'latest'
  const exposure = useFeedExposure(result, focused && !suspended && !explanationOpen, insets.top, insets.bottom + 56)
  const rail = useRef<ScrollView>(null)
  const lastContext = useRef('')
  const refreshSeen = useRef(refreshVersion)
  const atEnd = useRef(false)
  const drag = useRef<{ x: number; eligible: boolean } | null>(null)
  const openList = () => router.push({ pathname: '/new-beers', params: { mode } } as Href)
  const cardWidth = Math.round(Math.min(118, (width - 48) * 0.285))
  useEffect(() => {
    if (!scrollObserver) return
    scrollObserver.current = exposure.invalidate
    return () => { scrollObserver.current = null }
  }, [scrollObserver, exposure.invalidate])

  useEffect(() => {
    const context = `${city}:${personal.identity.owner}:${personal.identity.revision}:${mode}`
    if (lastContext.current !== context) {
      rail.current?.scrollTo({ x: 0, animated: false })
      atEnd.current = false
      lastContext.current = context
    }
  }, [city, personal.identity.owner, personal.identity.revision, mode])
  useEffect(() => {
    if (refreshSeen.current === refreshVersion) return
    refreshSeen.current = refreshVersion
    if (personal.identity.owner) void personal.refresh()
    if (latestEnabled) void latest.refresh()
  }, [refreshVersion])

  // An optional service failure must not replace or delay the bar/event lists.
  if (!result?.items.length) return null
  const label = hasPersonal ? tr(language, '查看完整列表', 'View full list') : tr(language, '查看全部上新', 'View all new arrivals')
  const progress = personal.data?.personalization
  const building = personal.data?.snapshot?.state === 'building' || personal.data?.empty_reason === 'refresh_pending'
  const note = hasPersonal || !personal.data ? '' : building
    ? tr(language, '正在准备适合你的上新。', 'Your matches are being prepared.')
    : progress?.status === 'cold_start'
      ? progress.unique_tap_count > 0 ? tr(language,
        `再记录 ${Math.max(0, progress.required_tap_count - progress.unique_tap_count)} 款不同的酒，可开始口味匹配。`,
        `Log ${Math.max(0, progress.required_tap_count - progress.unique_tap_count)} more unique ${progress.required_tap_count - progress.unique_tap_count === 1 ? 'beer' : 'beers'} to start taste matching.`) : ''
      : tr(language, '当前城市暂时没有匹配你口味的上新。', 'No recent beers match your taste here yet.')
  return <View style={styles.section}>
    <View style={styles.heading}>
      <View style={styles.titleGroup}>
        <Text style={styles.headingText}>{hasPersonal ? tr(language, '适合你的上新', 'New on Tap for You') : tr(language, '最近上新', 'New on Tap')}</Text>
        {hasPersonal ? <FeedExplanation onVisibilityChange={setExplanationOpen} /> : null}
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={openList} hitSlop={8}>
        <Text style={styles.more}>{tr(language, '查看全部', 'View all')} ›</Text>
      </Pressable>
    </View>
    <View ref={exposure.viewport} collapsable={false} style={styles.viewport}>
      <ScrollView ref={rail} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}
        onScrollBeginDrag={exposure.invalidate} onMomentumScrollBegin={exposure.invalidate}
        onTouchStart={(event) => { drag.current = { x: event.nativeEvent.pageX, eligible: atEnd.current } }}
        onTouchEnd={(event) => {
          if (drag.current?.eligible && drag.current.x - event.nativeEvent.pageX > 65) openList()
          drag.current = null
        }} onTouchCancel={() => { drag.current = null }}
        onScroll={(event) => {
          const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent
          atEnd.current = contentSize.width > layoutMeasurement.width && contentOffset.x + layoutMeasurement.width >= contentSize.width - 4
          exposure.invalidate()
        }} scrollEventThrottle={32}>
        {result.items.slice(0, 6).map((item, index) => <View key={item.item_id} ref={(view) => exposure.register(item.item_id, view)} collapsable={false} style={{ width: cardWidth }}>
          <Pressable accessibilityRole="button" onPress={() => openFeedBeer(item, result, index + 1)} style={({ pressed }) => pressed && styles.pressed}>
            <View style={[styles.artwork, { width: cardWidth, height: cardWidth }]}>
              {item.image_url ? <CachedImage source={item.image_url} ossStyle="nm-thumb" style={StyleSheet.absoluteFill} /> : null}
            </View>
            <Text style={styles.name} numberOfLines={2}>{localized(item.beer_name, item.beer_name_en)}</Text>
            <Text style={styles.brewery} numberOfLines={1}>{localized(item.brewery, item.brewery_en)}</Text>
            <Text style={styles.style} numberOfLines={1}>{localizeBeerStyle(item.style, language, item.style_en)}</Text>
            <Text style={styles.venue} numberOfLines={1}>@ {localized(item.tenant_name, item.tenant_name_en)}</Text>
          </Pressable>
        </View>)}
        <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={openList} style={[styles.tail, { height: cardWidth, width: 74 }]}>
          <View style={styles.tailCircle}><Text style={styles.tailArrow}>→</Text></View>
          <Text style={styles.tailLabel}>{tr(language, '完整列表', 'Full list')}</Text>
        </Pressable>
      </ScrollView>
    </View>
    {note ? <View style={styles.note}><Text style={styles.noteText}>{note}</Text></View> : null}
  </View>
}

const styles = StyleSheet.create({
  section: { marginBottom: 20, gap: 10 }, heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  titleGroup: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  headingText: { ...typography.caption, color: palette.muted }, more: { ...typography.caption, color: palette.tungsten },
  viewport: { overflow: 'hidden' }, rail: { gap: 10, paddingBottom: 2 },
  artwork: { borderRadius: 10, overflow: 'hidden', backgroundColor: palette.panelElevated },
  name: { ...typography.caption, color: palette.text, fontWeight: '600', marginTop: 5 },
  brewery: { ...typography.micro, color: palette.muted, marginTop: 2 },
  note: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.hairline, paddingTop: 8 },
  noteText: { ...typography.micro, color: palette.faint, lineHeight: 17 },
  style: { ...typography.micro, color: palette.text, marginTop: 2 },
  venue: { ...typography.micro, color: palette.tungsten, marginTop: 3 },
  tail: { alignItems: 'center', justifyContent: 'center', gap: 6 },
  tailCircle: { width: 32, height: 32, borderRadius: 16, borderColor: palette.line, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  tailArrow: { fontSize: 19, color: palette.tungsten }, tailLabel: { ...typography.micro, color: palette.tungsten }, pressed: { opacity: 0.8 },
})
