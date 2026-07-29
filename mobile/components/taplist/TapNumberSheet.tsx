import { useEffect, useMemo, useRef } from 'react'
import {
  Modal,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { TAPLIST_THEME as T } from '../../lib/taplistTheme'
import type { DraftDrink } from '../../lib/taplistOwnerApi'

const ROW_HEIGHT = 56

interface Props {
  visible: boolean
  drink: DraftDrink | null
  drinks: DraftDrink[]
  slotCount: number
  busy: boolean
  onClose: () => void
  onSelect: (tapNumber: number) => void
}

/**
 * Scrollable tap-number sheet. Each slot shows who is on it; picking an
 * occupied slot swaps, picking an empty slot assigns.
 */
export default function TapNumberSheet({
  visible,
  drink,
  drinks,
  slotCount,
  busy,
  onClose,
  onSelect,
}: Props) {
  const scrollRef = useRef<ScrollView>(null)

  const occupantByTap = useMemo(() => {
    const map = new Map<number, DraftDrink>()
    for (const d of drinks) {
      const n = d.public_sort_order
      if (typeof n === 'number' && n > 0 && !map.has(n)) map.set(n, d)
    }
    return map
  }, [drinks])

  const currentTap = drink?.public_sort_order && drink.public_sort_order > 0 ? drink.public_sort_order : null
  const slots = useMemo(() => Array.from({ length: slotCount }, (_, i) => i + 1), [slotCount])

  useEffect(() => {
    if (!visible || !currentTap) return
    const y = Math.max(0, (currentTap - 1) * ROW_HEIGHT - 80)
    const t = setTimeout(() => {
      scrollRef.current?.scrollTo({ y, animated: false })
    }, 50)
    return () => clearTimeout(t)
  }, [visible, currentTap])

  if (!drink) return null

  const drinkLabel = drink.display_name || drink.name

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.eyebrow}>枪号</Text>
              <Text style={styles.title} numberOfLines={1}>
                {drinkLabel}
              </Text>
              <Text style={styles.sub}>
                {currentTap ? `当前 #${currentTap} · 点选交换或改到空位` : '尚未编号 · 点选枪号'}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={10} disabled={busy}>
              <Ionicons name="close" size={24} color={T.text} />
            </TouchableOpacity>
          </View>

          <ScrollView
            ref={scrollRef}
            style={styles.list}
            contentContainerStyle={{ paddingBottom: 36 }}
            showsVerticalScrollIndicator={false}
          >
            {slots.map((n) => {
              const occupant = occupantByTap.get(n)
              const isCurrent = drink.id === occupant?.id || currentTap === n
              const isEmpty = !occupant
              const label = isCurrent
                ? '当前'
                : isEmpty
                  ? '空位'
                  : occupant.display_name || occupant.name
              return (
                <TouchableOpacity
                  key={n}
                  disabled={busy || isCurrent}
                  activeOpacity={0.8}
                  onPress={() => onSelect(n)}
                  style={[styles.row, isCurrent && styles.rowCurrent, isEmpty && styles.rowEmpty]}
                >
                  <View style={[styles.numBadge, isCurrent && styles.numBadgeCurrent]}>
                    <Text style={[styles.numText, isCurrent && styles.numTextCurrent]}>#{n}</Text>
                  </View>
                  <Text
                    style={[styles.rowLabel, isEmpty && styles.rowLabelEmpty, isCurrent && styles.rowLabelCurrent]}
                    numberOfLines={1}
                  >
                    {label}
                  </Text>
                  {busy && isCurrent ? (
                    <ActivityIndicator size="small" color={T.gold} />
                  ) : isCurrent ? (
                    <Ionicons name="checkmark-circle" size={20} color={T.gold} />
                  ) : isEmpty ? (
                    <Ionicons name="add-circle-outline" size={20} color={T.faint} />
                  ) : (
                    <Text style={styles.swapHint}>交换</Text>
                  )}
                </TouchableOpacity>
              )
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' },
  backdrop: { ...StyleSheet.absoluteFillObject },
  sheet: {
    backgroundColor: T.surfaceSolid,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '78%',
    borderWidth: 1,
    borderColor: T.border,
    borderBottomWidth: 0,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: T.border,
    marginTop: 10,
    marginBottom: 6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: T.borderFaint,
  },
  eyebrow: { color: T.goldSoft, fontSize: 12, letterSpacing: 2, textTransform: 'uppercase' },
  title: { color: T.text, fontSize: 20, fontWeight: '800', marginTop: 4 },
  sub: { color: T.muted, fontSize: 13, marginTop: 4 },
  list: { paddingHorizontal: 16, paddingTop: 8 },
  row: {
    height: ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: T.borderFaint,
    backgroundColor: T.surface,
  },
  rowCurrent: { borderColor: T.goldBorder, backgroundColor: T.goldFill },
  rowEmpty: { opacity: 0.85 },
  numBadge: {
    minWidth: 44,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: T.surfaceMuted,
    alignItems: 'center',
  },
  numBadgeCurrent: { backgroundColor: T.gold },
  numText: { color: T.text, fontSize: 15, fontWeight: '800' },
  numTextCurrent: { color: T.background },
  rowLabel: { flex: 1, color: T.text, fontSize: 15, fontWeight: '600' },
  rowLabelEmpty: { color: T.faint, fontWeight: '500' },
  rowLabelCurrent: { color: T.gold },
  swapHint: { color: T.goldSoft, fontSize: 13, fontWeight: '600' },
})
