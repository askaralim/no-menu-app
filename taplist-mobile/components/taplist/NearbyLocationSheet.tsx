import FontAwesome from '@expo/vector-icons/FontAwesome'
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { palette, spacing, typography } from '@/constants/design'

export function NearbyLocationSheet({
  visible,
  cityLabel,
  loading,
  onContinue,
  onClose,
}: {
  visible: boolean
  cityLabel: string
  loading: boolean
  onContinue: () => void
  onClose: () => void
}) {
  const insets = useSafeAreaInsets()

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={loading ? undefined : onClose}>
        <View
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}
          onStartShouldSetResponder={() => true}>
          <View style={styles.iconWrap}>
            <FontAwesome name="location-arrow" size={24} color={palette.amber} />
          </View>
          <Text style={styles.title}>查看离你最近的酒吧</Text>
          <Text style={styles.body}>
            No Menu 会使用你当前的大致位置，为{cityLabel}的酒吧按直线距离排序。
          </Text>
          <View style={styles.privacyRow}>
            <FontAwesome name="shield" size={14} color={palette.tungsten} />
            <Text style={styles.privacyText}>位置只在本机使用，不会保存。</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            disabled={loading}
            onPress={onContinue}
            style={({ pressed }) => [styles.primaryButton, (pressed || loading) && styles.pressed]}>
            {loading ? (
              <ActivityIndicator color={palette.background} />
            ) : (
              <Text style={styles.primaryText}>使用当前位置</Text>
            )}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={loading}
            onPress={onClose}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
            <Text style={styles.secondaryText}>暂不使用</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  sheet: {
    borderTopWidth: 1,
    borderTopColor: palette.hairline,
    backgroundColor: palette.panelElevated,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(211,154,69,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...typography.headline,
    color: palette.text,
    marginTop: spacing.lg,
  },
  body: {
    ...typography.body,
    color: palette.muted,
    marginTop: spacing.sm,
  },
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.lg,
  },
  privacyText: {
    ...typography.caption,
    color: palette.tungsten,
  },
  primaryButton: {
    minHeight: 50,
    marginTop: spacing.xl,
    borderRadius: 8,
    backgroundColor: palette.amber,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: {
    ...typography.title,
    color: palette.background,
    fontWeight: '600',
  },
  secondaryButton: {
    minHeight: 48,
    marginTop: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: {
    ...typography.body,
    color: palette.tungsten,
  },
  pressed: {
    opacity: 0.72,
  },
})
