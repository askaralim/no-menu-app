import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { TAPLIST_THEME as T, statusVisual } from '../../lib/taplistTheme'
import type { DraftDrink } from '../../lib/taplistOwnerApi'
import type { PublicStatus } from '../../lib/types'

const STATUS_OPTIONS: { key: PublicStatus; label: string }[] = [
  { key: 'new', label: '上新' },
  { key: 'available', label: '在售' },
  { key: 'coming_soon', label: '即将上新' },
  { key: 'sold_out', label: '售罄' },
]

type Props = {
  drink: DraftDrink | null
  busy: boolean
  onClose: () => void
  onSelectStatus: (status: PublicStatus) => void
  onToggleVisibility: () => void
  onHistory: () => void
  onKegChange: () => void
}

export default function DrinkStatusSheet({
  drink,
  busy,
  onClose,
  onSelectStatus,
  onToggleVisibility,
  onHistory,
  onKegChange,
}: Props) {
  if (!drink) return null

  const name = drink.display_name || drink.name
  const current = statusVisual(drink.public_status)
  const tapNumber = Number(drink.public_sort_order) || 0

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.headingCopy}>
              <Text style={styles.title} numberOfLines={1}>
                {tapNumber ? `#${tapNumber} · ${name}` : name}
              </Text>
              <Text style={styles.subtitle}>调整酒款状态和公开展示</Text>
            </View>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
              accessibilityLabel="关闭酒款状态面板"
            >
              <Ionicons name="close" size={24} color={T.text} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.content}
            contentContainerStyle={styles.contentContainer}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.sectionLabel}>供应状态</Text>
            <View style={styles.statusGrid}>
              {STATUS_OPTIONS.map((option) => {
                const selected = drink.public_status === option.key
                const visual = statusVisual(option.key)
                return (
                  <TouchableOpacity
                    key={option.key}
                    style={[styles.statusOption, selected && styles.statusOptionSelected]}
                    disabled={busy || selected}
                    onPress={() => onSelectStatus(option.key)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected, disabled: busy }}
                    accessibilityLabel={`${option.label}${selected ? '，当前状态' : ''}`}
                  >
                    <View style={[styles.statusDot, { backgroundColor: visual.fg }]} />
                    <Text style={[styles.statusLabel, selected && styles.statusLabelSelected]}>
                      {option.label}
                    </Text>
                    {selected ? (
                      <Ionicons style={styles.statusCheck} name="checkmark" size={18} color={T.gold} />
                    ) : null}
                  </TouchableOpacity>
                )
              })}
            </View>

            <Text style={styles.sectionLabel}>公开展示</Text>
            <TouchableOpacity
              style={styles.settingRow}
              disabled={busy}
              onPress={onToggleVisibility}
              accessibilityRole="switch"
              accessibilityState={{ checked: drink.is_public_visible, disabled: busy }}
              accessibilityLabel="酒单公开"
            >
              <View style={styles.settingCopy}>
                <Ionicons
                  name={drink.is_public_visible ? 'eye-outline' : 'eye-off-outline'}
                  size={20}
                  color={drink.is_public_visible ? T.goldSoft : T.faint}
                />
                <View style={styles.settingText}>
                  <Text style={styles.settingTitle}>
                    {drink.is_public_visible ? '酒单公开' : '酒单隐藏'}
                  </Text>
                  <Text style={styles.settingHint}>
                    {drink.is_public_visible ? '顾客当前可以看到这款酒' : '仅门店员工可以看到这款酒'}
                  </Text>
                </View>
              </View>
              <View style={[styles.switchTrack, drink.is_public_visible && styles.switchTrackOn]}>
                <View style={[styles.switchThumb, drink.is_public_visible && styles.switchThumbOn]} />
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.historyRow}
              disabled={busy}
              onPress={onHistory}
              accessibilityLabel="查看状态记录"
            >
              <Ionicons name="time-outline" size={20} color={T.muted} />
              <Text style={styles.historyText}>状态记录</Text>
              <Ionicons name="chevron-forward" size={18} color={T.faint} />
            </TouchableOpacity>

            {tapNumber ? (
              <>
                <Text style={styles.sectionLabel}>酒头操作</Text>
                <TouchableOpacity
                  style={styles.kegRow}
                  disabled={busy}
                  onPress={onKegChange}
                  accessibilityLabel={drink.public_status === 'sold_out' ? '换桶并恢复在售' : '记录换桶'}
                >
                  <View style={styles.kegIcon}>
                    <Ionicons name="reload-outline" size={20} color={T.gold} />
                  </View>
                  <View style={styles.settingText}>
                    <Text style={styles.settingTitle}>
                      {drink.public_status === 'sold_out' ? '换桶并恢复在售' : '记录换桶'}
                    </Text>
                    <Text style={styles.settingHint}>
                      {drink.public_status === 'sold_out'
                        ? '同一款酒留在当前酒头，记录新桶并开启新的在枪周期'
                        : '同一款酒留在当前酒头，重新开始本桶计时'}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={T.faint} />
                </TouchableOpacity>
              </>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.62)' },
  sheet: {
    backgroundColor: T.surfaceSolid,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 30,
    maxHeight: '88%',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: T.border,
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: T.border,
    alignSelf: 'center',
    marginBottom: 16,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start' },
  content: { flexShrink: 1 },
  contentContainer: { paddingBottom: 2 },
  headingCopy: { flex: 1, minWidth: 0, paddingTop: 2 },
  title: { color: T.text, fontSize: 20, fontWeight: '800' },
  subtitle: { color: T.muted, fontSize: 13, marginTop: 6 },
  closeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  sectionLabel: { color: T.goldSoft, fontSize: 13, fontWeight: '700', marginTop: 22, marginBottom: 10 },
  statusGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 },
  statusOption: {
    position: 'relative',
    width: '48%',
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    paddingLeft: 14,
    paddingRight: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surfaceMuted,
  },
  statusOptionSelected: { borderColor: T.goldBorder, backgroundColor: T.goldFill },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusLabel: { color: T.textSoft, fontSize: 15, fontWeight: '700' },
  statusLabelSelected: { color: T.gold },
  statusCheck: { position: 'absolute', right: 14 },
  settingRow: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surfaceMuted,
  },
  settingCopy: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 },
  settingText: { flex: 1, minWidth: 0 },
  settingTitle: { color: T.text, fontSize: 15, fontWeight: '700' },
  settingHint: { color: T.muted, fontSize: 12, marginTop: 4 },
  switchTrack: { width: 44, height: 26, borderRadius: 13, padding: 3, backgroundColor: T.border },
  switchTrackOn: { backgroundColor: T.gold },
  switchThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: T.textSoft },
  switchThumbOn: { marginLeft: 18, backgroundColor: T.background },
  historyRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
    paddingHorizontal: 14,
  },
  historyText: { flex: 1, color: T.textSoft, fontSize: 15, fontWeight: '600' },
  kegRow: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: T.goldBorder,
    backgroundColor: T.goldFill,
  },
  kegIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: T.surfaceMuted,
  },
})
