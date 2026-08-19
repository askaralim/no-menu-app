import type { ComponentProps } from 'react'
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { TAPLIST_THEME as T } from '../../lib/taplistTheme'

export type AnchorRect = { x: number; y: number; width: number; height: number }

export type AnchorMenuItem = {
  key: string
  label: string
  icon?: ComponentProps<typeof Ionicons>['name']
  iconColor?: string
  destructive?: boolean
  onPress: () => void
}

type Props = {
  visible: boolean
  anchor: AnchorRect | null
  items: AnchorMenuItem[]
  onClose: () => void
}

const MENU_WIDTH = 168
const EST_ITEM_H = 44
const GAP = 6

/**
 * Compact menu anchored near a trigger (e.g. ⋯). Prefer above/below the
 * button; flip horizontally if near the screen edge.
 */
export default function AnchorMenu({ visible, anchor, items, onClose }: Props) {
  const { width: winW, height: winH } = useWindowDimensions()
  if (!visible || !anchor) return null

  const menuH = items.length * EST_ITEM_H + 8
  const spaceBelow = winH - (anchor.y + anchor.height)
  const placeBelow = spaceBelow >= menuH + GAP || spaceBelow >= anchor.y

  let top = placeBelow ? anchor.y + anchor.height + GAP : anchor.y - menuH - GAP
  top = Math.max(12, Math.min(top, winH - menuH - 12))

  let left = anchor.x + anchor.width - MENU_WIDTH
  left = Math.max(12, Math.min(left, winW - MENU_WIDTH - 12))

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.menu, { top, left, width: MENU_WIDTH }]}>
          <View style={styles.card}>
            {items.map((item, i) => (
              <Pressable
                key={item.key}
                style={({ pressed }) => [
                  styles.row,
                  i < items.length - 1 && styles.rowBorder,
                  pressed && styles.rowPressed,
                ]}
                onPress={() => {
                  onClose()
                  // Let the menu dismiss first so the next UI (sheet/alert) stacks cleanly.
                  requestAnimationFrame(() => item.onPress())
                }}
              >
                {item.icon ? (
                  <Ionicons
                    name={item.icon}
                    size={18}
                    color={item.destructive ? T.danger : item.iconColor || T.goldSoft}
                  />
                ) : null}
                <Text style={[styles.label, item.destructive && styles.labelDanger]}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  menu: {
    position: 'absolute',
  },
  card: {
    backgroundColor: T.surfaceSolid,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.border,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  row: {
    minHeight: EST_ITEM_H,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    justifyContent: 'flex-start',
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: T.border,
  },
  rowPressed: {
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  label: {
    color: T.text,
    fontSize: 15,
    fontWeight: '500',
  },
  labelDanger: {
    color: T.danger,
  },
})
