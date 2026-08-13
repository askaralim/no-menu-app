import { forwardRef, useImperativeHandle, useRef } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import ViewShot from 'react-native-view-shot'

import { CachedImage } from '@/components/taplist/CachedImage'
import { palette, spacing, typography } from '@/constants/design'
import type { MyDrinkSummary } from '@/lib/types'

export type ShareableDrinkLogImageHandle = { capture: () => Promise<string | undefined> }

export const ShareableDrinkLogImage = forwardRef<
  ShareableDrinkLogImageHandle,
  { summary: MyDrinkSummary }
>(function ShareableDrinkLogImage({ summary }, ref) {
  const shotRef = useRef<ViewShot>(null)
  useImperativeHandle(ref, () => ({ capture: async () => (await shotRef.current?.capture?.()) ?? undefined }))

  return (
    <ViewShot ref={shotRef} options={{ format: 'png', quality: 1 }}>
      <View collapsable={false} style={styles.card}>
        <Text style={styles.title}>最近喝过</Text>
        <Text style={styles.summary}>
          {summary.drink_count} 款酒 · {summary.bar_count} 家店
          {summary.started_at ? ` · ${formatDate(summary.started_at)} 第一杯` : ''}
        </Text>
        <View style={styles.rule} />
        <Text style={styles.sectionLabel}>最近 9 款</Text>
        <View style={styles.grid}>
          {summary.recent.slice(0, 9).map((drink) => (
            <View key={drink.light_id} style={styles.item}>
              <View style={styles.artSlot}>
                {drink.image_url ? <CachedImage source={drink.image_url} style={styles.art} /> : null}
              </View>
              <Text numberOfLines={1} style={styles.name}>{drink.name}</Text>
              <Text numberOfLines={1} style={styles.meta}>{drink.brewery || drink.beer_style || '精酿啤酒'}</Text>
              <Text style={styles.date}>{formatMonthDay(drink.last_activity_at)}</Text>
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

function formatMonthDay(value: string) {
  const date = new Date(value)
  return `${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`
}

const styles = StyleSheet.create({
  card: {
    width: 390,
    height: 520,
    overflow: 'hidden',
    backgroundColor: palette.background,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 16,
  },
  title: { ...typography.displayL, color: palette.text, fontSize: 36, lineHeight: 40 },
  summary: { ...typography.micro, color: palette.muted, marginTop: 2 },
  rule: { height: 1, backgroundColor: palette.line, marginVertical: spacing.xs },
  sectionLabel: { ...typography.label, color: palette.tungsten, fontSize: 9, lineHeight: 12, marginBottom: spacing.xs },
  grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.sm, rowGap: 20 },
  item: { width: 106 },
  artSlot: { height: 62, alignItems: 'center', justifyContent: 'flex-end' },
  art: { width: 54, height: 62, borderRadius: 5 },
  name: { ...typography.micro, color: palette.text, textAlign: 'center', marginTop: 2, lineHeight: 12 },
  meta: { ...typography.micro, color: palette.faint, textAlign: 'center', marginTop: 1, fontSize: 9, lineHeight: 11 },
  date: { ...typography.micro, color: palette.tungsten, textAlign: 'center', marginTop: 1, fontSize: 9, lineHeight: 11 },
  footer: {
    minHeight: 24,
    marginTop: 'auto',
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: palette.line,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  brand: { ...typography.label, color: palette.text, fontSize: 10 },
  generated: { ...typography.micro, color: palette.faint },
})
