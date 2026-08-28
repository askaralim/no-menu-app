import { forwardRef, useImperativeHandle, useRef } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import ViewShot from 'react-native-view-shot'

import { CachedImage } from '@/components/taplist/CachedImage'
import { defaultBeerArtwork } from '@/components/taplist/defaultBeerArtwork'
import { palette, spacing, typography } from '@/constants/design'
import type { MyDrinkHistoryRow } from '@/lib/types'

export type ShareableDrinkHistoryImageHandle = { capture: () => Promise<string | undefined> }

export const ShareableDrinkHistoryImage = forwardRef<
  ShareableDrinkHistoryImageHandle,
  { item: MyDrinkHistoryRow }
>(function ShareableDrinkHistoryImage({ item }, ref) {
  const shotRef = useRef<ViewShot>(null)
  const venues = [...item.venues]
    .sort((left, right) => new Date(right.first_drank_at).getTime() - new Date(left.first_drank_at).getTime())
  const visibleVenues = venues.slice(0, 2)
  const hiddenVenueCount = Math.max(0, venues.length - visibleVenues.length)
  const facts = [item.beer_style, typeof item.abv === 'number' ? `ABV ${item.abv}%` : null]
    .filter(Boolean)
    .join(' · ')

  useImperativeHandle(ref, () => ({ capture: async () => (await shotRef.current?.capture?.()) ?? undefined }))

  return (
    <ViewShot ref={shotRef} options={{ format: 'png', quality: 1, width: 1080, height: 1440 }}>
      <View collapsable={false} style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{formatDate(item.first_lit_at)} · 我喝过</Text>
          <View style={styles.headerRule} />
        </View>

        <View style={styles.artFrame}>
          <CachedImage source={item.image_url || defaultBeerArtwork} style={styles.art} />
        </View>

        <View style={styles.copy}>
          <Text numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.72} style={styles.identityLine}>
            {item.brewery ? <Text style={styles.brewery}>{item.brewery} · </Text> : null}
            <Text style={styles.name}>{item.name}</Text>
          </Text>
          {item.country ? <Text numberOfLines={1} style={styles.origin}>{item.country}</Text> : null}
          {facts ? <Text numberOfLines={1} style={styles.facts}>{facts}</Text> : null}
          {visibleVenues.length ? (
            <View style={styles.venueBlock}>
              <Text style={styles.venueLabel}>喝过的酒吧</Text>
              {visibleVenues.map((venue) => (
                <View key={venue.tenant_id} style={styles.venueRow}>
                  <Text numberOfLines={1} style={styles.venueName}>{formatVenueTitle(venue)}</Text>
                  <Text style={styles.venueDate}>{formatDateShort(venue.first_drank_at)}</Text>
                </View>
              ))}
              {hiddenVenueCount > 0 ? (
                <Text style={styles.moreVenues}>还在另外 {hiddenVenueCount} 家酒吧喝过</Text>
              ) : null}
            </View>
          ) : null}
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

function formatDateShort(value: string) {
  const date = new Date(value)
  return `${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`
}

function formatVenueTitle(venue: MyDrinkHistoryRow['venues'][number]) {
  return [venue.city_label || localizeCity(venue.city || ''), venue.tenant_name].filter(Boolean).join(' · ')
}

function localizeCity(city: string) {
  const labels: Record<string, string> = {
    shanghai: '上海', beijing: '北京', tianjin: '天津', 天津: '天津',
    guangzhou: '广州', shenzhen: '深圳', chengdu: '成都', hangzhou: '杭州',
    nanjing: '南京', suzhou: '苏州', wuhan: '武汉', xian: '西安', "xi'an": '西安',
    chongqing: '重庆', qingdao: '青岛', 青岛: '青岛', binzhou: '滨州', 滨州: '滨州',
  }
  return labels[city.trim().toLowerCase()] ?? city
}

const styles = StyleSheet.create({
  card: { width: 390, height: 520, overflow: 'hidden', backgroundColor: palette.background, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16 },
  header: { minHeight: 30, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  headerTitle: { ...typography.body, color: palette.text, fontSize: 14, fontWeight: '500' },
  headerRule: { flex: 1, height: 1, backgroundColor: palette.line },
  artFrame: { width: 248, height: 248, alignSelf: 'center', marginTop: spacing.sm, padding: 5, backgroundColor: palette.text, borderRadius: 5 },
  art: { width: '100%', height: '100%', borderRadius: 3 },
  copy: { marginTop: spacing.md },
  identityLine: { ...typography.headline, color: palette.text, fontSize: 24, lineHeight: 31, textAlign: 'center' },
  name: { color: palette.text, fontSize: 24 },
  brewery: { color: palette.amber, fontSize: 17 },
  origin: { ...typography.caption, color: palette.muted, fontSize: 11, lineHeight: 15, marginTop: spacing.xxs, textAlign: 'center' },
  facts: { ...typography.micro, color: palette.tungsten, fontSize: 10, lineHeight: 14, marginTop: 2, textAlign: 'center' },
  venueBlock: { marginTop: spacing.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderLeftWidth: 2, borderLeftColor: palette.amber, backgroundColor: palette.panelElevated, borderRadius: 4, gap: 2 },
  venueLabel: { ...typography.label, color: palette.faint, fontSize: 8, lineHeight: 11, marginBottom: 1 },
  venueRow: { minHeight: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  venueName: { ...typography.caption, color: palette.text, fontSize: 11, lineHeight: 15, flex: 1 },
  venueDate: { ...typography.micro, color: palette.tungsten, fontSize: 8, lineHeight: 11 },
  moreVenues: { ...typography.micro, color: palette.amber, fontSize: 8, lineHeight: 11, marginTop: 1 },
  footer: { minHeight: 22, marginTop: 'auto', paddingTop: spacing.xs, borderTopWidth: 1, borderTopColor: palette.line, justifyContent: 'flex-end' },
  brand: { ...typography.label, color: palette.text, fontSize: 10 },
})
