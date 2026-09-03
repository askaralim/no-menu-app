import FontAwesome from '@expo/vector-icons/FontAwesome'
import { router } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { BeerArtwork } from '@/components/taplist/BeerArtwork'
import { ShareableDrinkLogImage, type ShareableDrinkLogImageHandle } from '@/components/taplist/ShareableDrinkLogImage'
import { ShareImagePreviewModal } from '@/components/taplist/ShareImagePreviewModal'
import { palette, spacing, typography } from '@/constants/design'
import { getMyConsumerProfile } from '@/lib/api/consumerProfile'
import { getMyDrinkInsights, normalizeBeerStyle } from '@/lib/api/drinkLog'

export default function TapReportScreen() {
  const insets = useSafeAreaInsets()
  const shareRef = useRef<ShareableDrinkLogImageHandle>(null)
  const [previewUri, setPreviewUri] = useState<string | null>(null)
  const [sharing, setSharing] = useState(false)
  const [selectedStyle, setSelectedStyle] = useState('全部')
  const insightsQuery = useQuery({ queryKey: ['drink-log', 'insights'], queryFn: getMyDrinkInsights })
  const profileQuery = useQuery({ queryKey: ['consumer-profile'], queryFn: getMyConsumerProfile })
  const month = insightsQuery.data?.month
  const styleFilters = month?.style_counts.filter((item) => item.style !== '其他') ?? []
  const visibleDrinks = month?.drinks.filter((drink) => (
    selectedStyle === '全部' || normalizeBeerStyle(drink.beer_style) === selectedStyle
  )) ?? []

  const generateShare = async () => {
    if (!month?.drink_count || sharing) return
    setSharing(true)
    try {
      const uri = await shareRef.current?.capture()
      if (uri) setPreviewUri(uri)
    } finally {
      setSharing(false)
    }
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom + spacing.xxl }]}>
        {insightsQuery.isLoading ? (
          <ActivityIndicator color={palette.amber} style={styles.loading} />
        ) : !month?.drink_count ? (
          <>
            <ReportHeader title="TAP 报告" />
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>本月还没有 TAP 记录</Text>
              <Text style={styles.emptyBody}>记录新的酒款后，月度报告会出现在这里。</Text>
            </View>
          </>
        ) : (
          <>
            <ReportHeader
              onShare={() => void generateShare()}
              sharing={sharing}
              title={`${formatMonth(month.month_start)} TAP 报告`}
            />
            <Text style={styles.summary}>
              本月 TAP {month.drink_count} 款 · 新增 {month.new_drink_count} 款 · 来自 {month.bar_count} 家酒吧
            </Text>

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>本月喝过</Text>
                <Text style={styles.sectionMeta}>{visibleDrinks.length} 款</Text>
              </View>
              {styleFilters.length ? (
                <ScrollView
                  horizontal
                  contentContainerStyle={styles.filters}
                  showsHorizontalScrollIndicator={false}
                  style={styles.filterScroll}>
                  {[{ style: '全部', count: month.drinks.length }, ...styleFilters].map((item) => {
                    const selected = selectedStyle === item.style
                    return (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        key={item.style}
                        onPress={() => setSelectedStyle(item.style)}
                        style={({ pressed }) => [styles.filterChip, selected && styles.filterChipSelected, pressed && styles.pressed]}>
                        <Text style={[styles.filterLabel, selected && styles.filterLabelSelected]}>{item.style}</Text>
                        <Text style={[styles.filterCount, selected && styles.filterCountSelected]}>{item.count}</Text>
                      </Pressable>
                    )
                  })}
                </ScrollView>
              ) : null}
              <View style={styles.drinks}>
                {visibleDrinks.map((drink) => (
                  <Pressable
                    accessibilityLabel={`查看${drink.name}的 TAP 记录`}
                    accessibilityRole="button"
                    key={drink.light_id}
                    onPress={() => router.push(`/drink-log/${drink.light_id}`)}
                    style={({ pressed }) => [styles.drinkItem, pressed && styles.pressed]}>
                    <BeerArtwork name={drink.name} source={drink.image_url} size={100} />
                    <Text numberOfLines={2} style={styles.drinkName}>{drink.name}</Text>
                    <Text numberOfLines={1} style={styles.drinkMeta}>{drink.brewery || drink.beer_style || '精酿啤酒'}</Text>
                    <Text style={styles.drinkDate}>{formatMonthDay(drink.recorded_at)}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </>
        )}
      </ScrollView>
      {month?.drink_count ? (
        <View pointerEvents="none" style={styles.hiddenCanvas}>
          <ShareableDrinkLogImage ref={shareRef} month={month} username={profileQuery.data?.consumer_username || 'NoMenuist'} />
        </View>
      ) : null}
      <ShareImagePreviewModal uri={previewUri} onClose={() => setPreviewUri(null)} />
    </View>
  )
}

function ReportHeader({ onShare, sharing = false, title }: { onShare?: () => void; sharing?: boolean; title: string }) {
  return (
    <View style={styles.header}>
      <Pressable
        accessibilityLabel="返回"
        hitSlop={8}
        onPress={() => router.canGoBack() ? router.back() : router.replace('/')}
        style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}>
        <FontAwesome name="chevron-left" size={16} color={palette.text} />
      </Pressable>
      <Text numberOfLines={1} style={styles.title}>{title}</Text>
      {onShare ? (
        <Pressable
          accessibilityLabel="分享本月 TAP"
          disabled={sharing}
          hitSlop={8}
          onPress={onShare}
          style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}>
          {sharing
            ? <ActivityIndicator size="small" color={palette.amber} />
            : <FontAwesome name="share-square-o" size={18} color={palette.amber} />}
        </Pressable>
      ) : <View style={styles.headerButton} />}
    </View>
  )
}

function formatMonth(value: string) {
  return `${new Date(value).getMonth() + 1} 月`
}

function formatMonthDay(value: string) {
  const date = new Date(value)
  return `${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.background },
  content: { paddingHorizontal: spacing.lg },
  loading: { marginTop: spacing.xxxl },
  header: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headerButton: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(17,17,17,0.72)', borderWidth: 1, borderColor: 'rgba(245,241,230,0.14)' },
  title: { ...typography.headline, color: palette.text, flex: 1, fontSize: 24, lineHeight: 32 },
  summary: { ...typography.body, color: palette.muted, marginTop: spacing.sm },
  section: { marginTop: 20, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.line },
  sectionHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: spacing.md },
  sectionTitle: { ...typography.title, color: palette.text },
  sectionMeta: { ...typography.caption, color: palette.faint },
  filterScroll: { marginHorizontal: -spacing.lg, marginBottom: spacing.lg },
  filters: { paddingHorizontal: spacing.lg, gap: spacing.xs },
  filterChip: { minHeight: 36, paddingHorizontal: spacing.sm, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: palette.line, backgroundColor: palette.panelElevated, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  filterChipSelected: { borderColor: palette.amber, backgroundColor: palette.amber },
  filterLabel: { ...typography.caption, color: palette.muted },
  filterLabelSelected: { color: palette.black, fontWeight: '500' },
  filterCount: { ...typography.caption, color: palette.amber },
  filterCountSelected: { color: palette.black },
  drinks: { flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.sm, rowGap: spacing.lg },
  drinkItem: { width: '30%', alignItems: 'center' },
  drinkName: { ...typography.caption, color: palette.text, textAlign: 'center', marginTop: spacing.xs },
  drinkMeta: { ...typography.micro, color: palette.faint, textAlign: 'center', marginTop: 1 },
  drinkDate: { ...typography.micro, color: palette.tungsten, textAlign: 'center', marginTop: 1 },
  empty: { marginTop: spacing.xxl },
  emptyTitle: { ...typography.title, color: palette.text },
  emptyBody: { ...typography.body, color: palette.muted, marginTop: spacing.xs },
  hiddenCanvas: { position: 'absolute', left: -10000, top: 0 },
  pressed: { opacity: 0.82 },
})
