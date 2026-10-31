import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { MerchantUpdate } from '../../lib/merchantUpdates'
import { RADIUS, SPACING, THEME } from '../../lib/theme'

export function MerchantUpdateSheet({
  update,
  onClose,
  onCta,
}: {
  update: MerchantUpdate | null
  onClose: () => void
  onCta: () => void
}) {
  const insets = useSafeAreaInsets()

  return (
    <Modal visible={update != null} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="关闭新功能介绍"
        />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, SPACING.lg) }]}>
          <View style={styles.handle} />
          <View style={styles.eyebrowRow}>
            <View style={styles.eyebrowDot} />
            <Text style={styles.eyebrow}>本次更新</Text>
          </View>
          <Text style={styles.title}>{update?.title}</Text>
          <Text style={styles.summary}>{update?.summary}</Text>

          <ScrollView style={styles.points} contentContainerStyle={styles.pointsContent}>
            {update?.bullets.map((bullet) => (
              <View key={bullet} style={styles.pointRow}>
                <Ionicons name="checkmark-circle-outline" size={18} color={THEME.gold} />
                <Text style={styles.pointText}>{bullet}</Text>
              </View>
            ))}
          </ScrollView>

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={onCta}
            activeOpacity={0.78}
            accessibilityRole="button"
          >
            <Text style={styles.primaryText}>{update?.ctaLabel}</Text>
            <Ionicons name="arrow-forward" size={17} color={THEME.onGold} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={onClose}
            activeOpacity={0.72}
            accessibilityRole="button"
          >
            <Text style={styles.secondaryText}>知道了</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.68)' },
  sheet: {
    maxHeight: '84%',
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.sm,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: THEME.border,
    backgroundColor: THEME.surfaceSolid,
  },
  handle: {
    width: 38,
    height: 4,
    marginBottom: SPACING.xl,
    alignSelf: 'center',
    borderRadius: RADIUS.pill,
    backgroundColor: THEME.border,
  },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  eyebrowDot: { width: 7, height: 7, borderRadius: RADIUS.pill, backgroundColor: THEME.gold },
  eyebrow: { color: THEME.gold, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  title: { color: THEME.text, fontSize: 25, lineHeight: 32, fontWeight: '800', marginTop: 10 },
  summary: { color: THEME.muted, fontSize: 14, lineHeight: 21, marginTop: SPACING.sm },
  points: {
    flexGrow: 0,
    marginTop: SPACING.lg,
    borderRadius: RADIUS.lg,
    backgroundColor: THEME.background,
  },
  pointsContent: { padding: SPACING.lg, gap: SPACING.md },
  pointRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  pointText: { flex: 1, color: THEME.textSoft, fontSize: 14, lineHeight: 20 },
  primaryButton: {
    minHeight: 50,
    marginTop: SPACING.lg,
    borderRadius: RADIUS.md,
    backgroundColor: THEME.gold,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
  },
  primaryText: { color: THEME.onGold, fontSize: 15, fontWeight: '800' },
  secondaryButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: { color: THEME.faint, fontSize: 14, fontWeight: '600' },
})
