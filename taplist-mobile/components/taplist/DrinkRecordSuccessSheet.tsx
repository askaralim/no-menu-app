import FontAwesome from '@expo/vector-icons/FontAwesome'
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { palette, spacing, typography } from '@/constants/design'
import type { LightDrinkResult, MyDrinkInsights } from '@/lib/types'

type Props = {
  result: LightDrinkResult | null
  insights: MyDrinkInsights | undefined
  insightsLoading: boolean
  sharing: boolean
  onDismiss: () => void
  onShareTonight: () => void
}

export function DrinkRecordSuccessSheet({ result, insights, insightsLoading, sharing, onDismiss, onShareTonight }: Props) {
  const insets = useSafeAreaInsets()
  const tonightCount = insights?.tonight.drink_count ?? 0

  return (
    <Modal transparent animationType="slide" visible={Boolean(result?.created_venue)} onRequestClose={onDismiss}>
      <View style={styles.overlay}>
        <Pressable accessibilityLabel="关闭记录结果" style={styles.backdrop} onPress={onDismiss} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.md) + spacing.sm }]}>
          <View style={styles.handle} />
          <View style={styles.check}><FontAwesome name="check" size={18} color={palette.tungsten} /></View>
          <Text style={styles.title}>{result?.created_light ? `第 ${result.drink_count} 款已记录` : '已新增这家酒吧'}</Text>
          <Text style={styles.subtitle}>{result?.created_light ? '已加入「我的 TAP」' : '这款酒已在「我的 TAP」中'}</Text>
          {insightsLoading ? <ActivityIndicator color={palette.amber} style={styles.insightsLoading} /> : tonightCount > 0 ? (
            <Text style={styles.tonight}>今晚新记录 {tonightCount} 款</Text>
          ) : null}
          <Pressable accessibilityRole="button" onPress={onDismiss} style={({ pressed }) => [styles.done, pressed && styles.pressed]}>
            <Text style={styles.doneText}>完成</Text>
          </Pressable>
          {tonightCount > 0 ? (
            <Pressable accessibilityRole="button" disabled={sharing} onPress={onShareTonight} style={({ pressed }) => [styles.share, pressed && styles.pressed]}>
              {sharing ? <ActivityIndicator size="small" color={palette.amber} /> : <FontAwesome name="share-alt" size={15} color={palette.amber} />}
              <Text style={styles.shareText}>分享今晚喝过 · {tonightCount} 款</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.26)' },
  sheet: { borderTopLeftRadius: 26, borderTopRightRadius: 26, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.panelElevated, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, alignItems: 'center' },
  handle: { width: 34, height: 4, borderRadius: 2, backgroundColor: palette.tungsten, marginBottom: spacing.lg },
  check: { width: 46, height: 46, borderRadius: 23, borderWidth: 1, borderColor: palette.goldMuted, alignItems: 'center', justifyContent: 'center' },
  title: { ...typography.headline, color: palette.text, fontSize: 21, lineHeight: 29, marginTop: spacing.md },
  subtitle: { ...typography.body, color: palette.muted, marginTop: spacing.xs },
  tonight: { ...typography.caption, color: palette.muted, marginTop: spacing.xs },
  insightsLoading: { marginTop: spacing.sm },
  done: { width: '100%', minHeight: 52, borderRadius: 8, backgroundColor: palette.tungsten, alignItems: 'center', justifyContent: 'center', marginTop: spacing.lg },
  doneText: { ...typography.title, color: palette.black },
  share: { minHeight: 44, flexDirection: 'row', gap: spacing.xs, alignItems: 'center', justifyContent: 'center', marginTop: spacing.xs },
  shareText: { ...typography.caption, color: palette.amber },
  pressed: { opacity: 0.82 },
})
