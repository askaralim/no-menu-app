import { useEffect, useMemo, useState } from 'react'
import {
  Modal,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { TAPLIST_THEME as T, EDITOR_STATUSES, statusVisual } from '../../lib/taplistTheme'
import {
  type DraftDrink,
  nextFreeTapNumber,
  restoreDrink,
  setDrinkTaplistListing,
  tapSlotCount,
} from '../../lib/taplistOwnerApi'
import type { PublicStatus } from '../../lib/types'

interface Props {
  visible: boolean
  drink: DraftDrink | null
  allDrinks: DraftDrink[]
  configuredTapCount?: number | null
  fixedTapNumber?: number | null
  onClose: () => void
  onJoined: () => void | Promise<void>
}

/**
 * Light sheet after catalog save (or pick-from-catalog): assign tap # and status.
 * Visibility defaults to public; hide from the tonight list afterward if needed.
 */
export default function JoinTonightSheet({
  visible,
  drink,
  allDrinks,
  configuredTapCount,
  fixedTapNumber,
  onClose,
  onJoined,
}: Props) {
  const [tap, setTap] = useState(1)
  const [status, setStatus] = useState<PublicStatus>('new')
  const [saving, setSaving] = useState(false)

  const slotCount = useMemo(
    () => tapSlotCount(allDrinks, configuredTapCount),
    [allDrinks, configuredTapCount],
  )
  const occupantByTap = useMemo(() => {
    const map = new Map<number, DraftDrink>()
    for (const d of allDrinks) {
      const n = d.public_sort_order
      if (typeof n === 'number' && n >= 1 && d.id !== drink?.id && !map.has(n)) map.set(n, d)
    }
    return map
  }, [allDrinks, drink?.id])

  useEffect(() => {
    if (!visible || !drink) return
    setTap(
      fixedTapNumber ??
        nextFreeTapNumber(
          allDrinks.filter((d) => d.id !== drink.id),
          drink.public_sort_order,
          slotCount,
        ),
    )
    // Always default to 上新 when joining; operator can change before confirm.
    setStatus('new')
    setSaving(false)
  }, [visible, drink, allDrinks, fixedTapNumber, slotCount])

  if (!drink) return null

  const confirm = async () => {
    if (saving) return
    setSaving(true)
    try {
      if (!drink.enabled) await restoreDrink(drink.id)
      const res = await setDrinkTaplistListing(drink.id, {
        isPublicVisible: true,
        publicStatus: status,
        publicSortOrder: tap,
      })
      if (!res.ok) {
        const msg = (res.errors ?? []).map((e) => e.message).slice(0, 3).join('\n')
        Alert.alert('无法加入酒单', msg || '请重试')
        return
      }
      await onJoined()
    } catch (e: any) {
      Alert.alert('加入失败', e?.message || '请重试')
    } finally {
      setSaving(false)
    }
  }

  const occupant = occupantByTap.get(tap)

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.eyebrow}>加入酒单</Text>
          <Text style={styles.title} numberOfLines={2}>
            {drink.display_name || drink.name}
          </Text>

          <Text style={styles.section}>枪号</Text>
          {fixedTapNumber ? (
            <View style={styles.fixedTap}>
              <Text style={styles.fixedTapNumber}>#{fixedTapNumber}</Text>
              <Text style={styles.fixedTapText} numberOfLines={2}>
                {occupant
                  ? `将替换「${occupant.display_name || occupant.name}」，原酒款仍保留在商品库`
                  : '当前为空位，确认后直接上枪'}
              </Text>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tapRow}>
              {Array.from({ length: slotCount }, (_, i) => i + 1).map((n) => {
                const tapOccupant = occupantByTap.get(n)
                const active = tap === n
                return (
                  <TouchableOpacity
                    key={n}
                    style={[styles.tapChip, active && styles.tapChipActive]}
                    onPress={() => setTap(n)}
                  >
                    <Text style={[styles.tapChipText, active && styles.tapChipTextActive]}>#{n}</Text>
                    {tapOccupant ? (
                      <Text style={styles.tapOcc} numberOfLines={1}>
                        {tapOccupant.display_name || tapOccupant.name}
                      </Text>
                    ) : (
                      <Text style={styles.tapOccEmpty}>空</Text>
                    )}
                  </TouchableOpacity>
                )
              })}
            </ScrollView>
          )}

          <Text style={styles.section}>状态</Text>
          <View style={styles.chipRow}>
            {EDITOR_STATUSES.map((s) => {
              const vis = statusVisual(s)
              const active = status === s
              return (
                <TouchableOpacity
                  key={s}
                  onPress={() => setStatus(s)}
                  style={[
                    styles.chip,
                    { borderColor: active ? vis.border : T.border, backgroundColor: active ? vis.bg : 'transparent' },
                  ]}
                >
                  <Text style={[styles.chipText, { color: active ? vis.fg : T.muted }]}>{vis.label}</Text>
                </TouchableOpacity>
              )
            })}
          </View>

          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={saving}>
              <Text style={styles.cancelText}>稍后</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.confirmBtn} onPress={() => void confirm()} disabled={saving}>
              {saving ? (
                <ActivityIndicator color={T.background} />
              ) : (
                <>
                  <Ionicons name="sparkles" size={16} color={T.background} />
                  <Text style={styles.confirmText}>确认加入</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    backgroundColor: T.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 28,
    borderTopWidth: 1,
    borderColor: T.border,
    maxHeight: '78%',
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: T.border,
    marginBottom: 12,
  },
  eyebrow: { color: T.goldSoft, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  title: { color: T.text, fontSize: 20, fontWeight: '800', marginTop: 6, marginBottom: 8 },
  section: {
    color: T.goldSoft,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 16,
    marginBottom: 10,
  },
  tapRow: { gap: 8, paddingRight: 12 },
  tapChip: {
    width: 88,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surfaceMuted,
  },
  tapChipActive: { borderColor: T.goldBorder, backgroundColor: T.goldFill },
  tapChipText: { color: T.text, fontSize: 16, fontWeight: '800' },
  tapChipTextActive: { color: T.gold },
  tapOcc: { color: T.muted, fontSize: 11, marginTop: 4 },
  tapOccEmpty: { color: T.faint, fontSize: 11, marginTop: 4 },
  fixedTap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: T.goldBorder,
    backgroundColor: T.goldFill,
    borderRadius: 10,
    padding: 12,
  },
  fixedTapNumber: { color: T.gold, fontSize: 20, fontWeight: '800' },
  fixedTapText: { flex: 1, color: T.muted, fontSize: 13, lineHeight: 19 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  chipText: { fontSize: 13, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 22 },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: T.border,
    alignItems: 'center',
  },
  cancelText: { color: T.muted, fontSize: 15, fontWeight: '600' },
  confirmBtn: {
    flex: 1.4,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: T.gold,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  confirmText: { color: T.background, fontSize: 15, fontWeight: '800' },
})
