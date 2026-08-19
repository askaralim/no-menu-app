import { useRef } from 'react'
import {
  ActivityIndicator,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { TAPLIST_THEME as T, statusVisual } from '../../lib/taplistTheme'
import type { DraftDrink } from '../../lib/taplistOwnerApi'
import type { AnchorRect } from '../ui/AnchorMenu'

type Props = {
  tapNumber: number
  drink: DraftDrink | null
  busy?: boolean
  onAdd: () => void
  onTapNumber: () => void
  onClear: () => void
  onReplace: () => void
  onMore: (anchor: AnchorRect) => void
}

export default function TaplistSlotRow({
  tapNumber,
  drink,
  busy = false,
  onAdd,
  onTapNumber,
  onClear,
  onReplace,
  onMore,
}: Props) {
  const moreRef = useRef<View>(null)

  if (!drink) {
    return (
      <TouchableOpacity style={styles.emptyRow} onPress={onAdd} activeOpacity={0.78}>
        <View style={[styles.tapButton, styles.tapButtonEmpty]}>
          <Text style={[styles.tapNumber, styles.tapNumberEmpty]}>{tapNumber}</Text>
        </View>
        <Text style={styles.emptyLabel}>空酒头</Text>
        <View style={styles.addAction}>
          <Ionicons name="add-circle-outline" size={20} color={T.gold} />
          <Text style={styles.addActionText}>上酒</Text>
        </View>
      </TouchableOpacity>
    )
  }

  const status = statusVisual(drink.public_status)
  const name = drink.display_name || drink.name
  const brewery = drink.profile.brewery || drink.brand_name
  const style = drink.profile.beer_style

  return (
    <View style={[styles.row, !drink.is_public_visible && styles.rowHidden]}>
      <TouchableOpacity
        style={styles.tapButton}
        onPress={onTapNumber}
        disabled={busy}
        accessibilityLabel={`枪号 ${tapNumber}，点按调整枪号`}
      >
        <Text style={styles.tapNumber}>{tapNumber}</Text>
        <Ionicons
          name="pencil-outline"
          size={11}
          color={T.goldSoft}
          style={styles.tapEditIcon}
        />
      </TouchableOpacity>

      {drink.image_url ? (
        <Image source={{ uri: drink.image_url }} style={styles.image} />
      ) : (
        <View style={[styles.image, styles.imagePlaceholder]}>
          <Ionicons name="wine-outline" size={20} color={T.faint} />
        </View>
      )}

      <View style={styles.body}>
        <View style={styles.titleLine}>
          {brewery ? (
            <>
              <Text style={styles.brewery} numberOfLines={1}>
                {brewery}
              </Text>
              <Text style={styles.titleDivider}> · </Text>
            </>
          ) : null}
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
        </View>

        <Text style={styles.styleText} numberOfLines={1}>
          {style || '未填写风格'}
        </Text>

        <View style={styles.actions}>
          <TouchableOpacity
            onPress={onClear}
            disabled={busy}
            style={styles.quickAction}
            activeOpacity={0.72}
          >
            <Ionicons name="close-circle-outline" size={15} color={T.muted} />
            <Text style={styles.quickActionText}>清空</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onReplace}
            disabled={busy}
            style={[styles.quickAction, styles.quickActionPrimary]}
            activeOpacity={0.72}
          >
            <Ionicons name="swap-horizontal-outline" size={15} color={T.gold} />
            <Text style={styles.quickActionTextPrimary}>换酒</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.rightRail}>
        <View style={styles.statusReadout}>
          {drink.is_public_visible ? (
            <View style={[styles.statusDot, { backgroundColor: status.fg }]} />
          ) : (
            <Ionicons name="eye-off-outline" size={12} color={T.faint} />
          )}
          <Text
            style={[styles.statusText, { color: drink.is_public_visible ? status.fg : T.faint }]}
            numberOfLines={1}
          >
            {drink.is_public_visible ? status.label : '隐藏'}
          </Text>
        </View>
        <View style={styles.moreSlot}>
          {busy ? (
            <ActivityIndicator size="small" color={T.gold} />
          ) : (
            <View ref={moreRef} collapsable={false}>
            <TouchableOpacity
              style={styles.moreButton}
              disabled={busy}
              activeOpacity={0.58}
              accessibilityLabel="更多操作"
              onPress={() => {
                moreRef.current?.measureInWindow((x, y, width, height) => {
                  onMore({ x, y, width, height })
                })
              }}
            >
              <Ionicons name="ellipsis-horizontal" size={22} color={T.goldSoft} />
            </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    minHeight: 118,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 6,
    paddingHorizontal: 2,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  rowHidden: { opacity: 0.56 },
  emptyRow: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 6,
    paddingHorizontal: 2,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  tapButton: {
    width: 44,
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: T.goldBorder,
    backgroundColor: T.goldFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tapEditIcon: { position: 'absolute', right: 3, bottom: 3 },
  tapButtonEmpty: { backgroundColor: 'transparent', borderColor: T.border },
  tapNumber: { color: T.gold, fontSize: 19, fontWeight: '800' },
  tapNumberEmpty: { color: T.faint },
  image: { width: 54, height: 54, borderRadius: 7, backgroundColor: T.surfaceMuted },
  imagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, minWidth: 0, paddingTop: 1 },
  titleLine: { flexDirection: 'row', alignItems: 'baseline', minWidth: 0 },
  brewery: { color: T.goldSoft, fontSize: 15, fontWeight: '600', maxWidth: '38%' },
  titleDivider: { color: T.faint, fontSize: 15 },
  name: { color: T.text, fontSize: 17, fontWeight: '800', flex: 1 },
  styleText: { color: T.muted, fontSize: 13, marginTop: 6 },
  rightRail: { width: 64, alignSelf: 'stretch', alignItems: 'flex-end' },
  statusReadout: {
    width: 64,
    minHeight: 25,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 5,
    paddingVertical: 4,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: '700' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  quickAction: {
    height: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 10,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surfaceMuted,
  },
  quickActionPrimary: { borderColor: T.goldBorder },
  quickActionText: { color: T.muted, fontSize: 13, fontWeight: '700' },
  quickActionTextPrimary: { color: T.gold, fontSize: 13, fontWeight: '700' },
  moreSlot: { flex: 1, minHeight: 52, justifyContent: 'center', alignItems: 'flex-end' },
  moreButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  emptyLabel: { color: T.faint, fontSize: 16, fontWeight: '600', flex: 1 },
  addAction: {
    height: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: T.goldBorder,
    backgroundColor: T.goldFill,
  },
  addActionText: { color: T.gold, fontSize: 14, fontWeight: '700' },
})
