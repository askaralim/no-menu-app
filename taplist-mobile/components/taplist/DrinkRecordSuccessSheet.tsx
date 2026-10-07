import FontAwesome from '@expo/vector-icons/FontAwesome'
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { CachedImage } from '@/components/taplist/CachedImage'
import { palette, spacing, typography } from '@/constants/design'
import type { LightDrinkResult, MyDrinkInsights } from '@/lib/types'

type Props = {
  result: LightDrinkResult | null
  insights: MyDrinkInsights | undefined
  insightsLoading: boolean
  drinkImageUrl?: string | null
  drinkName?: string
  onDismiss: () => void
  onReviewTonight: () => void
}

export function DrinkRecordSuccessSheet({ result, insights, insightsLoading, drinkImageUrl, drinkName, onDismiss, onReviewTonight }: Props) {
  const insets = useSafeAreaInsets()
  const { height: windowHeight } = useWindowDimensions()
  const compact = windowHeight < 800
  const tonightCount = insights?.tonight.drink_count ?? 0
  const recordedDrink = insights?.tonight.drinks.find((drink) => drink.light_id === result?.light_id)
    ?? insights?.tonight.drinks[0]
  const artworkUrl = recordedDrink?.image_url ?? drinkImageUrl
  const artworkName = recordedDrink?.name ?? drinkName ?? '当前酒款'

  return (
    <Modal transparent animationType="slide" visible={Boolean(result?.created_venue)} onRequestClose={onDismiss}>
      <View style={styles.overlay}>
        <Pressable accessibilityLabel="关闭记录结果" style={styles.backdrop} onPress={onDismiss} />
        <View style={[
          styles.sheet,
          compact && styles.sheetCompact,
          { paddingBottom: Math.max(insets.bottom, compact ? spacing.sm : spacing.md) + (compact ? 0 : spacing.sm) },
        ]}>
          <View style={[styles.artSlot, compact && styles.artSlotCompact]} pointerEvents="none">
            {artworkUrl ? (
              <View style={[styles.artFrame, compact && styles.artFrameCompact]}>
                <CachedImage
                  accessibilityLabel={`${artworkName}酒款图片`}
                  source={artworkUrl}
                  ossStyle="nm-card"
                  style={styles.art}
                />
              </View>
            ) : null}
          </View>
          <View style={[styles.check, compact && styles.checkCompact]}><FontAwesome name="check" size={compact ? 16 : 18} color={palette.tungsten} /></View>
          <Text style={[styles.title, compact && styles.titleCompact]}>{result?.created_light ? `第 ${result.drink_count} 款 TAP 已记录` : '已新增这家酒吧'}</Text>
          {insightsLoading ? <ActivityIndicator color={palette.amber} style={styles.insightsLoading} /> : tonightCount > 0 ? (
            <Text style={styles.tonight}>今晚新记录 {tonightCount} 款</Text>
          ) : null}
          <Pressable accessibilityRole="button" onPress={onDismiss} style={({ pressed }) => [styles.done, compact && styles.doneCompact, pressed && styles.pressed]}>
            <Text style={styles.doneText}>完成</Text>
          </Pressable>
          {tonightCount >= 2 ? (
            <Pressable accessibilityRole="button" onPress={onReviewTonight} style={({ pressed }) => [styles.share, compact && styles.shareCompact, pressed && styles.pressed]}>
              <FontAwesome name="clone" size={15} color={palette.amber} />
              <Text style={styles.shareText}>回顾今晚 {tonightCount} 款</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.42)' },
  sheet: { minHeight: 350, borderTopLeftRadius: 26, borderTopRightRadius: 26, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.panelElevated, paddingHorizontal: spacing.lg, paddingTop: 86, alignItems: 'center' },
  sheetCompact: { minHeight: 314, paddingTop: 72 },
  artSlot: { position: 'absolute', top: -55, left: 0, right: 0, height: 132, alignItems: 'center' },
  artSlotCompact: { top: -44, height: 112 },
  artFrame: { width: 132, height: 132, padding: 3, borderRadius: 11, backgroundColor: palette.text, shadowColor: palette.black, shadowOpacity: 0.44, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 12 },
  artFrameCompact: { width: 112, height: 112, borderRadius: 10 },
  art: { width: '100%', height: '100%', borderRadius: 8 },
  check: { width: 46, height: 46, borderRadius: 23, borderWidth: 1, borderColor: palette.goldMuted, alignItems: 'center', justifyContent: 'center' },
  checkCompact: { width: 42, height: 42, borderRadius: 21 },
  title: { ...typography.headline, color: palette.text, fontSize: 23, lineHeight: 31, marginTop: spacing.sm, textAlign: 'center' },
  titleCompact: { fontSize: 21, lineHeight: 29, marginTop: spacing.xs },
  tonight: { ...typography.caption, color: palette.amber, marginTop: spacing.xxs },
  insightsLoading: { marginTop: spacing.sm },
  done: { width: '100%', minHeight: 52, borderRadius: 8, backgroundColor: palette.amber, alignItems: 'center', justifyContent: 'center', marginTop: spacing.md },
  doneCompact: { minHeight: 50, marginTop: spacing.sm },
  doneText: { ...typography.title, color: palette.black },
  share: { minHeight: 44, flexDirection: 'row', gap: spacing.xs, alignItems: 'center', justifyContent: 'center', marginTop: spacing.xs },
  shareCompact: { minHeight: 40, marginTop: spacing.xxs },
  shareText: { ...typography.caption, color: palette.amber },
  pressed: { opacity: 0.82 },
})
