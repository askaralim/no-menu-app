import { forwardRef, useImperativeHandle, useRef } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import ViewShot from 'react-native-view-shot'

import { CachedImage } from '@/components/taplist/CachedImage'
import { defaultBeerArtwork } from '@/components/taplist/defaultBeerArtwork'
import { palette, spacing, typography } from '@/constants/design'
import type { MyDrinkInsights } from '@/lib/types'

export type ShareableDrinkLogImageHandle = { capture: () => Promise<string | undefined> }

export const ShareableDrinkLogImage = forwardRef<
  ShareableDrinkLogImageHandle,
  { month: MyDrinkInsights['month']; username: string }
>(function ShareableDrinkLogImage({ month, username }, ref) {
  const shotRef = useRef<ViewShot>(null)
  const drinks = month.drinks.slice(0, 9)
  const columns = drinks.length === 1 ? 1 : drinks.length <= 4 ? 2 : 3
  const itemWidth = columns === 1 ? 190 : columns === 2 ? 150 : 106
  const artSize = columns === 1 ? 196 : columns === 2 ? 124 : 84

  useImperativeHandle(ref, () => ({ capture: async () => (await shotRef.current?.capture?.()) ?? undefined }))

  return (
    <ViewShot ref={shotRef} options={{ format: 'png', quality: 1, width: 1080, height: 1440 }}>
      <View collapsable={false} style={styles.card}>
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72} style={styles.title}>
          <Text style={styles.headerDate}>{formatYearMonth(month.month_start)}</Text>
          <Text style={styles.headerSeparator}> · </Text>
          <Text style={styles.headerUsername}>{username}</Text>
          <Text style={styles.headerCopy}> 本月 </Text>
          <Text style={styles.headerCount}>{month.drink_count}</Text>
          <Text style={styles.headerCopy}> 款 </Text>
          <Text style={styles.headerTap}>TAP</Text>
        </Text>
        <View style={styles.headerRule} />
        <Text style={styles.contextLabel}>
          {month.drink_count > drinks.length ? `最近 ${drinks.length} 款 · ` : ''}新增 {month.new_drink_count} 款 · 来自 {month.bar_count} 家酒吧
        </Text>
        <View style={[styles.grid, columns < 3 && styles.gridCentered, drinks.length <= 2 && styles.gridSpacious]}>
          {drinks.map((drink) => (
            <View key={drink.light_id} style={[styles.item, { width: itemWidth }]}>
              <CachedImage
                source={drink.image_url || defaultBeerArtwork}
                style={[styles.art, { width: artSize, height: artSize }]}
              />
              <Text numberOfLines={1} style={styles.name}>
                {[drink.brewery, drink.name].filter(Boolean).join(' · ')}
              </Text>
              {drink.bar_names.length ? (
                <Text numberOfLines={1} style={styles.venue}>{drink.bar_names.join(' · ')}</Text>
              ) : null}
            </View>
          ))}
        </View>
        <View style={styles.footer}>
          <Text style={styles.brand}>NO MENU · {formatDate(new Date().toISOString())}</Text>
        </View>
      </View>
    </ViewShot>
  )
})

function formatDate(value: string) {
  const date = new Date(value)
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`
}

function formatYearMonth(value: string) {
  const date = new Date(value)
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}`
}

const styles = StyleSheet.create({
  card: { width: 390, height: 520, overflow: 'hidden', backgroundColor: palette.background, paddingHorizontal: 20, paddingTop: 24, paddingBottom: 20 },
  title: { color: palette.text, fontSize: 20, lineHeight: 34 },
  headerDate: { ...typography.label, color: palette.faint, fontSize: 14, letterSpacing: 0.7 },
  headerSeparator: { ...typography.body, color: palette.faint, fontSize: 17 },
  headerUsername: { ...typography.title, color: palette.amber, fontSize: 20 },
  headerCopy: { ...typography.body, color: palette.muted, fontSize: 17 },
  headerCount: { ...typography.display, color: palette.text, fontSize: 26 },
  headerTap: { ...typography.display, color: palette.text, fontSize: 24, letterSpacing: 1 },
  headerRule: { height: 1, backgroundColor: palette.line, marginTop: spacing.sm },
  contextLabel: { ...typography.micro, color: palette.faint, fontSize: 9, lineHeight: 12, marginTop: spacing.xs },
  grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.sm, rowGap: spacing.sm, marginTop: spacing.sm },
  gridCentered: { justifyContent: 'center' },
  gridSpacious: { marginTop: spacing.xl },
  item: { alignItems: 'center' },
  art: { borderRadius: 7 },
  name: { ...typography.caption, color: palette.text, textAlign: 'center', marginTop: spacing.xxs, fontSize: 11, lineHeight: 15 },
  venue: { ...typography.micro, color: palette.muted, textAlign: 'center', fontSize: 9, lineHeight: 12 },
  footer: { minHeight: 24, marginTop: 'auto', paddingTop: spacing.xs, borderTopWidth: 1, borderTopColor: palette.line, flexDirection: 'row', alignItems: 'flex-end' },
  brand: { ...typography.label, color: palette.text, fontSize: 10 },
})
