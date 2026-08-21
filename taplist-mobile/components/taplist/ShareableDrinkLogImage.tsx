import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import ViewShot from 'react-native-view-shot'

import { CachedImage } from '@/components/taplist/CachedImage'
import { palette, spacing, typography } from '@/constants/design'
import type { MyDrinkInsightRow, MyDrinkInsights } from '@/lib/types'

export type ShareableDrinkLogImageHandle = { capture: () => Promise<string | undefined> }

type FeaturedDrink = { label: string; drink: MyDrinkInsightRow }

export const ShareableDrinkLogImage = forwardRef<
  ShareableDrinkLogImageHandle,
  { month: MyDrinkInsights['month']; username: string }
>(function ShareableDrinkLogImage({ month, username }, ref) {
  const shotRef = useRef<ViewShot>(null)
  const { featured, remaining } = useMemo(() => selectDrinks(month), [month])
  useImperativeHandle(ref, () => ({ capture: async () => (await shotRef.current?.capture?.()) ?? undefined }))

  return (
    <ViewShot ref={shotRef} options={{ format: 'png', quality: 1 }}>
      <View collapsable={false} style={styles.card}>
        <View style={styles.header}>
          <Text numberOfLines={1} style={styles.title}>{username} 的 {formatMonth(month.month_start)} TAP</Text>
          <View style={styles.brandBlock}>
            <Text style={styles.brandTop}>NO MENU</Text>
            <Text style={styles.generatedTop}>{formatDate(new Date().toISOString())}</Text>
          </View>
        </View>
        <View style={styles.rule} />
        <Text style={styles.summary}>新增 {month.new_drink_count} 款 · 来自 {month.bar_count} 家酒吧</Text>
        <Text style={styles.range}>{formatRange(month.month_start, month.month_end)}</Text>
        <View style={styles.rule} />
        <View style={[styles.featured, featured.length < 3 && styles.centered]}>
          {featured.map(({ label, drink }) => (
            <View key={drink.light_id} style={[styles.featuredItem, featured.length === 1 && styles.featuredItemSingle]}>
              <Text numberOfLines={1} style={styles.featureLabel}>{label}</Text>
              <View style={styles.featureArtSlot}>
                {drink.image_url ? <CachedImage source={drink.image_url} style={styles.featureArt} /> : null}
              </View>
              <Text numberOfLines={1} style={styles.featureName}>{drink.name}</Text>
              <Text numberOfLines={1} style={styles.meta}>{drink.brewery || drink.beer_style || '精酿啤酒'}</Text>
              <Text style={styles.date}>{formatMonthDay(drink.recorded_at)}</Text>
            </View>
          ))}
        </View>
        {remaining.length > 0 ? (
          <>
            <View style={styles.rule} />
            <Text style={styles.sectionLabel}>其他新增记录</Text>
            <View style={styles.grid}>
              {remaining.map((drink) => (
                <View key={drink.light_id} style={styles.item}>
                  <View style={styles.artSlot}>
                    {drink.image_url ? <CachedImage source={drink.image_url} style={styles.art} /> : null}
                  </View>
                  <Text numberOfLines={1} style={styles.name}>{drink.name}</Text>
                  <Text numberOfLines={1} style={styles.meta}>{drink.brewery || drink.beer_style || '精酿啤酒'}</Text>
                  <Text style={styles.date}>{formatMonthDay(drink.recorded_at)}</Text>
                </View>
              ))}
            </View>
          </>
        ) : null}
        <View style={styles.footer}>
          <Text style={styles.brand}>NO MENU</Text>
          <Text style={styles.generated}>生成于 {formatDate(new Date().toISOString())}</Text>
        </View>
      </View>
    </ViewShot>
  )
})

function selectDrinks(month: MyDrinkInsights['month']) {
  const byId = new Map(month.drinks.map((drink) => [drink.light_id, drink]))
  const middleId = month.first_new_style_drink_id || month.top_style_drink_id
  const middleLabel = month.first_new_style ? '首次记录的风格' : month.top_style ? '新增最多的风格' : '本月记录'
  const candidates: Array<[string, string | null]> = [
    ['本月第一款', month.first_drink_id],
    [middleLabel, middleId],
    ['最近新增', month.latest_drink_id],
  ]
  const featured: FeaturedDrink[] = []
  const used = new Set<string>()

  candidates.forEach(([label, id]) => {
    const drink = id ? byId.get(id) : null
    if (drink && !used.has(drink.light_id)) {
      featured.push({ label, drink })
      used.add(drink.light_id)
    }
  })
  month.drinks.forEach((drink) => {
    if (featured.length >= 3 || used.has(drink.light_id)) return
    featured.push({ label: '本月记录', drink })
    used.add(drink.light_id)
  })

  return {
    featured,
    remaining: month.drinks.filter((drink) => !used.has(drink.light_id)).slice(0, 6),
  }
}

function formatDate(value: string) {
  const date = new Date(value)
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`
}

function formatMonth(value: string) {
  return `${new Date(value).getMonth() + 1} 月`
}

function formatMonthDay(value: string) {
  const date = new Date(value)
  return `${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`
}

function formatRange(start: string, end: string) {
  const inclusiveEnd = new Date(new Date(end).getTime() - 1)
  return `${formatDate(start)} — ${formatDate(inclusiveEnd.toISOString())}`
}

const styles = StyleSheet.create({
  card: { width: 390, height: 520, overflow: 'hidden', backgroundColor: palette.background, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 16 },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm },
  title: { ...typography.displayL, color: palette.text, fontSize: 31, lineHeight: 36, flex: 1 },
  brandBlock: { alignItems: 'flex-end', paddingTop: 2 },
  brandTop: { ...typography.label, color: palette.amber, fontSize: 8 },
  generatedTop: { ...typography.micro, color: palette.tungsten, fontSize: 8, marginTop: 3 },
  rule: { height: 1, backgroundColor: palette.line, marginVertical: spacing.xs },
  summary: { ...typography.title, color: palette.amber, fontSize: 16, lineHeight: 21 },
  range: { ...typography.micro, color: palette.tungsten, marginTop: 1 },
  featured: { flexDirection: 'row', columnGap: spacing.sm },
  centered: { justifyContent: 'center' },
  featuredItem: { width: 108, alignItems: 'center' },
  featuredItemSingle: { width: 170 },
  featureLabel: { ...typography.micro, color: palette.amber, fontSize: 9, marginBottom: spacing.xs },
  featureArtSlot: { width: '100%', height: 104, alignItems: 'center', justifyContent: 'flex-end' },
  featureArt: { width: '100%', height: '100%', borderRadius: 7 },
  featureName: { ...typography.caption, color: palette.text, textAlign: 'center', marginTop: 3, lineHeight: 16 },
  meta: { ...typography.micro, color: palette.faint, textAlign: 'center', marginTop: 1, fontSize: 8, lineHeight: 10 },
  date: { ...typography.micro, color: palette.tungsten, textAlign: 'center', marginTop: 1, fontSize: 8, lineHeight: 10 },
  sectionLabel: { ...typography.label, color: palette.amber, fontSize: 9, lineHeight: 12, marginBottom: spacing.xs },
  grid: { flexDirection: 'row', columnGap: spacing.sm },
  item: { width: 48, alignItems: 'center' },
  artSlot: { width: 48, height: 48, alignItems: 'center', justifyContent: 'flex-end' },
  art: { width: 48, height: 48, borderRadius: 5 },
  name: { ...typography.micro, color: palette.text, textAlign: 'center', marginTop: 2, fontSize: 8, lineHeight: 10 },
  footer: { minHeight: 24, marginTop: 'auto', paddingTop: spacing.xs, borderTopWidth: 1, borderTopColor: palette.line, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  brand: { ...typography.label, color: palette.text, fontSize: 10 },
  generated: { ...typography.micro, color: palette.faint },
})
