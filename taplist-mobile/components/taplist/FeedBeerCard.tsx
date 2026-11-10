import { router, type Href } from 'expo-router'
import { LinearGradient } from 'expo-linear-gradient'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { CachedImage } from '@/components/taplist/CachedImage'
import { listCapsuleCardStyles, listCapsuleTitleStyle, listCapsuleMetaStyle, listCapsuleVenueBadgeStyle, listCapsuleVenueStyle } from '@/components/taplist/listCapsuleCardStyle'
import { BEER_CARD_PANEL_COLORS, BEER_CARD_PANEL_LOCATIONS } from '@/components/taplist/railCardStyle'
import { palette, typography } from '@/constants/design'
import type { FeedItem, FeedResult } from '@/lib/api/beerFeed'
import { trackEvent } from '@/lib/analytics'
import { recordFeedEvent } from '@/lib/intelligenceAnalytics'
import { tr, useLanguage } from '@/lib/i18n'
import { localizeBeerStyle, localizeRecommendationReason } from '@/lib/styleLocalization'

export function openFeedBeer(item: FeedItem, result: FeedResult, position: number) {
  recordFeedEvent('feed_item_opened', result.feed_instance_id, result.analyticsContext, item.item_id, position)
  trackEvent('beer_opened', { tenant_id: item.tenant_id, drink_id: item.source_drink_id, product_id: item.product_id, source: 'feed' })
  router.push(`/bar/${encodeURIComponent(item.tenant_slug)}/beer/${encodeURIComponent(item.source_drink_id)}` as Href)
}

function relativeTime(value: string, language: 'zh' | 'en') {
  const minutes = Math.floor((Date.now() - Date.parse(value)) / 60_000)
  if (!Number.isFinite(minutes) || minutes < 0 || minutes >= 7 * 1440) return ''
  if (minutes < 1) return tr(language, '刚刚', 'Just now')
  if (minutes < 60) return tr(language, `${minutes} 分钟前`, `${minutes}m ago`)
  if (minutes < 1440) return tr(language, `${Math.floor(minutes / 60)} 小时前`, `${Math.floor(minutes / 60)}h ago`)
  const days = Math.floor(minutes / 1440)
  return days === 1 ? tr(language, '昨天', 'Yesterday') : tr(language, `${days} 天前`, `${days}d ago`)
}

export function FeedBeerCard({ item, result, position, showVenue = true }: {
  item: FeedItem; result: FeedResult; position: number; showVenue?: boolean
}) {
  const { language, localized } = useLanguage()
  const personal = result.mode === 'for_you'
  const reason = personal ? localizeRecommendationReason(item.reason, language) : ''
  const brewery = localized(item.brewery, item.brewery_en)
  const style = localizeBeerStyle(item.style, language, item.style_en)
  const time = personal ? relativeTime(item.current_cycle_started_at, language) : ''
  return (
    <Pressable onPress={() => openFeedBeer(item, result, position)} accessibilityRole="button"
      style={({ pressed }) => [listCapsuleCardStyles.card, pressed && listCapsuleCardStyles.cardPressed]}>
      <View style={[listCapsuleCardStyles.cardInner, !personal && styles.compact]}>
        <View style={[listCapsuleCardStyles.artworkFrame, !personal && styles.compactArtwork]}>
          {item.image_url ? <CachedImage source={item.image_url} ossStyle="nm-thumb" style={listCapsuleCardStyles.artwork} /> : null}
        </View>
        <LinearGradient colors={BEER_CARD_PANEL_COLORS} locations={BEER_CARD_PANEL_LOCATIONS}
          style={[listCapsuleCardStyles.panel, !personal && styles.compact]}>
          <View style={[listCapsuleCardStyles.panelContent, styles.copy]}>
            <View style={styles.titleRow}>
              <Text style={[listCapsuleTitleStyle, styles.title]} numberOfLines={2}>{localized(item.beer_name, item.beer_name_en)}</Text>
              {time ? <Text style={styles.time}>{time}</Text> : null}
            </View>
            <Text style={[listCapsuleMetaStyle, { flex: 0 }]} numberOfLines={2}>
              <Text style={styles.brewery}>{brewery}</Text>{brewery && style ? ' · ' : ''}<Text style={styles.style}>{style}</Text>
            </Text>
            {showVenue ? <View style={styles.venue}><Text style={listCapsuleVenueStyle} numberOfLines={1}>{localized(item.tenant_name, item.tenant_name_en)}</Text></View> : null}
            {reason ? <Text style={styles.reason}>{reason}</Text> : null}
          </View>
        </LinearGradient>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  compact: { minHeight: 80 }, compactArtwork: { width: 80 },
  copy: { justifyContent: 'center', paddingHorizontal: 12, gap: 4 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  title: { flex: 1 },
  brewery: { color: palette.text, fontWeight: '600' }, style: { color: palette.tungsten },
  venue: { ...listCapsuleVenueBadgeStyle, alignSelf: 'flex-start', marginTop: 2 },
  time: { ...typography.micro, color: palette.muted, marginTop: 4 },
  reason: { ...typography.micro, color: palette.muted, borderLeftWidth: 1, borderLeftColor: palette.line, paddingLeft: 6, marginTop: 4 },
})
