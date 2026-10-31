import FontAwesome from '@expo/vector-icons/FontAwesome'
import { useQuery } from '@tanstack/react-query'
import { router } from 'expo-router'
import { useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { CachedImage } from '@/components/taplist/CachedImage'
import { ShareableTonightImage, type ShareableTonightImageHandle } from '@/components/taplist/ShareableTonightImage'
import { ShareImagePreviewModal } from '@/components/taplist/ShareImagePreviewModal'
import { palette, spacing, typography } from '@/constants/design'
import { trackEvent } from '@/lib/analytics'
import { getMyConsumerProfile } from '@/lib/api/consumerProfile'
import { getMyDrinkInsights } from '@/lib/api/drinkLog'
import { tr, useLanguage } from '@/lib/i18n'

export default function TonightRecapScreen() {
  const { language, localized } = useLanguage()
  const insets = useSafeAreaInsets()
  const shareRef = useRef<ShareableTonightImageHandle>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const [previewUri, setPreviewUri] = useState<string | null>(null)
  const [sharing, setSharing] = useState(false)
  const insightsQuery = useQuery({ queryKey: ['drink-log', 'insights'], queryFn: () => getMyDrinkInsights() })
  const profileQuery = useQuery({ queryKey: ['consumer-profile'], queryFn: getMyConsumerProfile })
  const tonight = insightsQuery.data?.tonight
  const drinks = tonight?.drinks ?? []
  const activeDrink = drinks[activeIndex]
  const stack = useMemo(() => {
    const count = Math.min(drinks.length, 3)
    return Array.from({ length: count }, (_, depth) => ({
      depth,
      drink: drinks[(activeIndex + depth) % drinks.length],
    })).reverse()
  }, [activeIndex, drinks])

  const close = () => router.canGoBack() ? router.back() : router.replace('/(tabs)/mine')
  const selectRelative = (offset: number) => {
    if (drinks.length < 2) return
    setActiveIndex((current) => (current + offset + drinks.length) % drinks.length)
  }
  const shareTonight = async () => {
    if (!tonight?.drink_count || sharing) return
    setSharing(true)
    try {
      const uri = await shareRef.current?.capture()
      if (!uri) {
        Alert.alert(tr(language, '生成失败', 'Generation failed'), tr(language, '今晚分享图暂时无法生成，请稍后重试。', 'Unable to create tonight’s image. Please try again.'))
        return
      }
      setPreviewUri(uri)
      trackEvent('drink_tonight_share_generated', { drink_count: tonight.drink_count })
    } finally {
      setSharing(false)
    }
  }

  if (insightsQuery.isLoading) {
    return <View style={styles.loading}><ActivityIndicator color={palette.amber} /></View>
  }

  if (!tonight || tonight.drink_count < 2 || !activeDrink) {
    return (
      <View style={[styles.screen, styles.empty, { paddingTop: insets.top + spacing.xl }]}>
        <Pressable accessibilityRole="button" onPress={close} style={styles.completeButton}>
          <Text style={styles.complete}>{tr(language, '完成', 'Done')}</Text>
        </Pressable>
        <Text style={styles.emptyTitle}>{tr(language, '今晚还没有可以回顾的 TAP', 'No TAP recap yet')}</Text>
        <Text style={styles.emptyBody}>{tr(language, '当晚记录两款酒后，这里会生成一段只属于你的今晚回顾。', 'Record two beers tonight to create your personal recap.')}</Text>
      </View>
    )
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md, paddingBottom: Math.max(insets.bottom, spacing.md) + spacing.sm }]}>
      <View style={styles.header}>
        <View style={styles.headerSide} />
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>{tr(language, '今晚 TAP 回顾', 'Tonight’s TAP recap')}</Text>
          <Text style={styles.date}>{formatDate(tonight.business_day_start)}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={tr(language, '完成回顾', 'Finish recap')} hitSlop={8} onPress={close} style={styles.headerSide}>
          <Text style={styles.complete}>{tr(language, '完成', 'Done')}</Text>
        </Pressable>
      </View>

      <View style={styles.stage}>
        <View pointerEvents="none" style={styles.stageGlow} />
        {stack.map(({ depth, drink }) => (
          <View key={`${drink.light_id}-${depth}`} style={[styles.card, cardDepthStyle(depth)]}>
            {drink.image_url ? (
              <CachedImage accessibilityLabel={tr(language, `${drink.name}酒款图片`, `${localized(drink.name, drink.name_en)} beer image`)} source={drink.image_url} ossStyle="nm-detail" style={styles.art} />
            ) : null}
          </View>
        ))}
        <Pressable accessibilityRole="button" accessibilityLabel={tr(language, '上一款 TAP', 'Previous TAP')} onPress={() => selectRelative(-1)} style={[styles.stageControl, styles.stageControlLeft]} />
        <Pressable accessibilityRole="button" accessibilityLabel={tr(language, '下一款 TAP', 'Next TAP')} onPress={() => selectRelative(1)} style={[styles.stageControl, styles.stageControlRight]} />
      </View>

      <View style={styles.drinkCopy}>
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.76} style={styles.drinkName}>{localized(activeDrink.name, activeDrink.name_en)}</Text>
        {activeDrink.brewery ? <Text numberOfLines={1} style={styles.brewery}>{localized(activeDrink.brewery, activeDrink.brewery_en)}</Text> : null}
        <Text style={styles.position}>{tr(language, `今晚第 ${activeIndex + 1} 款 TAP`, `TAP #${activeIndex + 1} tonight`)}</Text>
      </View>

      <View style={styles.dots}>
        {drinks.map((drink, index) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tr(language, `查看今晚第 ${index + 1} 款 TAP`, `View TAP #${index + 1} tonight`)}
            accessibilityState={{ selected: index === activeIndex }}
            key={drink.light_id}
            onPress={() => setActiveIndex(index)}
            style={[styles.dotHit, index === activeIndex && styles.dotHitActive]}>
            <View style={[styles.dot, index === activeIndex && styles.dotActive]} />
          </Pressable>
        ))}
      </View>

      <View style={styles.footer}>
        <Pressable
          accessibilityRole="button"
          disabled={sharing}
          onPress={() => void shareTonight()}
          style={({ pressed }) => [styles.shareButton, pressed && styles.pressed, sharing && styles.disabled]}>
          {sharing ? <ActivityIndicator color={palette.black} /> : <FontAwesome name="share-square-o" size={19} color={palette.black} />}
          <Text style={styles.shareText}>{tr(language, '分享今晚 TAP', 'Share tonight’s TAPs')}</Text>
        </Pressable>
        <Text style={styles.archived}>{tr(language, `今晚 ${tonight.drink_count} 款 · 已归入我的 TAP`, `${tonight.drink_count} tonight · Saved to My TAPs`)}</Text>
      </View>

      <View pointerEvents="none" style={styles.hiddenCanvas}>
        <ShareableTonightImage ref={shareRef} tonight={tonight} username={profileQuery.data?.consumer_username || 'NoMenuist'} />
      </View>
      <ShareImagePreviewModal uri={previewUri} onClose={() => setPreviewUri(null)} />
    </View>
  )
}

function cardDepthStyle(depth: number) {
  if (depth === 0) return styles.cardFront
  if (depth === 1) return styles.cardMiddle
  return styles.cardBack
}

function formatDate(value: string) {
  const date = new Date(value)
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.background, paddingHorizontal: spacing.lg },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.background },
  header: { minHeight: 58, flexDirection: 'row', alignItems: 'center' },
  headerSide: { width: 72, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' },
  headerCopy: { flex: 1, alignItems: 'center' },
  headerTitle: { ...typography.title, color: palette.text, fontSize: 20, lineHeight: 27 },
  date: { ...typography.micro, color: palette.faint, marginTop: 2 },
  completeButton: { position: 'absolute', right: spacing.lg, top: spacing.md, zIndex: 2, minWidth: 56, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' },
  complete: { ...typography.title, color: palette.amber, fontSize: 16 },
  stage: { height: 390, position: 'relative', marginHorizontal: -spacing.lg, marginTop: spacing.xs },
  stageGlow: { position: 'absolute', left: 34, right: 34, top: 42, height: 286, borderRadius: 143, backgroundColor: 'rgba(124,86,56,0.18)' },
  card: { position: 'absolute', width: 282, height: 282, left: '50%', marginLeft: -141, borderRadius: 14, overflow: 'hidden', backgroundColor: palette.panelElevated, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(245,241,230,0.12)' },
  cardFront: { top: 88, transform: [{ rotate: '0deg' }] },
  cardMiddle: { top: 44, transform: [{ translateX: 22 }, { rotate: '5deg' }], opacity: 0.84 },
  cardBack: { top: 18, transform: [{ translateX: -22 }, { rotate: '-5deg' }], opacity: 0.62 },
  art: { width: '100%', height: '100%' },
  stageControl: { position: 'absolute', top: 78, bottom: 6, width: '34%', zIndex: 5 },
  stageControlLeft: { left: 0 },
  stageControlRight: { right: 0 },
  drinkCopy: { alignItems: 'center', minHeight: 96, paddingTop: spacing.xs },
  drinkName: { ...typography.headline, color: palette.text, fontSize: 30, lineHeight: 38, textAlign: 'center', width: '100%' },
  brewery: { ...typography.caption, color: palette.muted, marginTop: 2 },
  position: { ...typography.caption, color: palette.amber, marginTop: spacing.sm },
  dots: { minHeight: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  dotHit: { width: 22, height: 28, alignItems: 'center', justifyContent: 'center' },
  dotHitActive: { width: 26 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(198,168,117,0.28)' },
  dotActive: { width: 8, height: 8, borderRadius: 4, backgroundColor: palette.amber },
  footer: { marginTop: 'auto' },
  shareButton: { minHeight: 54, borderRadius: 12, backgroundColor: palette.amber, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  shareText: { ...typography.title, color: palette.black },
  archived: { ...typography.caption, color: palette.faint, textAlign: 'center', marginTop: spacing.md },
  hiddenCanvas: { position: 'absolute', left: -10000, top: 0 },
  empty: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl },
  emptyTitle: { ...typography.headline, color: palette.text, textAlign: 'center' },
  emptyBody: { ...typography.body, color: palette.muted, textAlign: 'center', marginTop: spacing.sm },
  pressed: { opacity: 0.82 },
  disabled: { opacity: 0.58 },
})
