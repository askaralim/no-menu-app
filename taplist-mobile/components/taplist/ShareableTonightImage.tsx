import { forwardRef, useImperativeHandle, useRef } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import ViewShot from 'react-native-view-shot'

import { CachedImage } from '@/components/taplist/CachedImage'
import { palette, spacing, typography } from '@/constants/design'
import type { MyDrinkInsights } from '@/lib/types'

export type ShareableTonightImageHandle = { capture: () => Promise<string | undefined> }

export const ShareableTonightImage = forwardRef<
  ShareableTonightImageHandle,
  { tonight: MyDrinkInsights['tonight'] }
>(function ShareableTonightImage({ tonight }, ref) {
  const shotRef = useRef<ViewShot>(null)
  const drinks = tonight.drinks.slice(0, 9)
  const itemWidth = drinks.length === 1 ? 220 : drinks.length === 2 ? 164 : 106
  const artHeight = drinks.length <= 2 ? 174 : 86

  useImperativeHandle(ref, () => ({ capture: async () => (await shotRef.current?.capture?.()) ?? undefined }))

  return (
    <ViewShot ref={shotRef} options={{ format: 'png', quality: 1 }}>
      <View collapsable={false} style={styles.card}>
        <Text style={styles.title}>今晚喝过</Text>
        <Text style={styles.date}>{formatDate(tonight.business_day_start)}</Text>
        <View style={styles.rule} />
        <Text style={styles.summary}>本次新增 {tonight.drink_count} 款记录 · {tonight.bar_count} 家酒吧</Text>
        <View style={[styles.grid, drinks.length < 3 && styles.gridCentered]}>
          {drinks.map((drink) => (
            <View key={drink.light_id} style={[styles.item, { width: itemWidth }]}>
              <View style={[styles.artSlot, { height: artHeight }]}>
                {drink.image_url ? <CachedImage source={drink.image_url} style={styles.art} /> : null}
              </View>
              <Text numberOfLines={1} style={styles.name}>{drink.name}</Text>
              <Text numberOfLines={1} style={styles.meta}>{drink.brewery || drink.beer_style || '精酿啤酒'}</Text>
            </View>
          ))}
        </View>
        <View style={styles.footer}>
          <Text style={styles.brand}>NO MENU</Text>
          <Text style={styles.generated}>生成于 {formatDate(new Date().toISOString())}</Text>
        </View>
      </View>
    </ViewShot>
  )
})

function formatDate(value: string) {
  const date = new Date(value)
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`
}

const styles = StyleSheet.create({
  card: { width: 390, height: 520, overflow: 'hidden', backgroundColor: palette.background, padding: 20 },
  title: { ...typography.displayL, color: palette.text, fontSize: 42, lineHeight: 46 },
  date: { ...typography.label, color: palette.tungsten, fontSize: 10, marginTop: 2 },
  rule: { height: 1, backgroundColor: palette.line, marginVertical: spacing.sm },
  summary: { ...typography.title, color: palette.amber, fontSize: 16, lineHeight: 22 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.sm, rowGap: spacing.md, marginTop: spacing.lg },
  gridCentered: { justifyContent: 'center' },
  item: { alignItems: 'center' },
  artSlot: { width: '100%', alignItems: 'center', justifyContent: 'flex-end' },
  art: { width: '100%', height: '100%', borderRadius: 7 },
  name: { ...typography.caption, color: palette.text, textAlign: 'center', marginTop: spacing.xs },
  meta: { ...typography.micro, color: palette.faint, textAlign: 'center', marginTop: 1 },
  footer: { minHeight: 28, marginTop: 'auto', paddingTop: spacing.xs, borderTopWidth: 1, borderTopColor: palette.line, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  brand: { ...typography.label, color: palette.text, fontSize: 10 },
  generated: { ...typography.micro, color: palette.faint },
})
