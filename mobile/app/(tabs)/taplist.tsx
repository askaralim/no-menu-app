import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from 'expo-router'
import { useAuth } from '../../lib/authProvider'
import { TAPLIST_THEME as T, statusVisual } from '../../lib/taplistTheme'
import { LAYOUT } from '../../lib/theme'
import {
  type DraftDrink,
  type TaplistDraft,
  assignDrinkTapNumber,
  buildDraft,
  isOnTonight,
  loadOwnerTaplist,
  removeDrinkFromTonight,
  setDrinkStatusImmediate,
  tapSlotCount,
} from '../../lib/taplistOwnerApi'
import type { PublicStatus } from '../../lib/types'
import TaplistPreview from '../../components/taplist/TaplistPreview'
import TapNumberSheet from '../../components/taplist/TapNumberSheet'
import DrinkStatusHistorySheet from '../../components/taplist/DrinkStatusHistorySheet'
import AnchorMenu, { type AnchorRect } from '../../components/ui/AnchorMenu'

const SOLD_OUT_UNDO_MS = 7000

type SoldOutUndo = {
  drinkId: string
  drinkName: string
  previousStatus: PublicStatus
}

type Filter = 'all' | 'new' | 'sold_out' | 'hidden'

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'new', label: '上新' },
  { key: 'sold_out', label: '售罄' },
  { key: 'hidden', label: '酒单隐藏' },
]

export default function TaplistScreen() {
  const { tenantId } = useAuth()

  const [draft, setDraft] = useState<TaplistDraft | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [previewOpen, setPreviewOpen] = useState(false)
  const [busyDrinkId, setBusyDrinkId] = useState<string | null>(null)
  const [tapDrink, setTapDrink] = useState<DraftDrink | null>(null)
  const [tapBusy, setTapBusy] = useState(false)
  const [soldOutUndo, setSoldOutUndo] = useState<SoldOutUndo | null>(null)
  const [historyDrink, setHistoryDrink] = useState<DraftDrink | null>(null)
  const [moreMenu, setMoreMenu] = useState<{ drink: DraftDrink; anchor: AnchorRect } | null>(null)
  const soldOutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearSoldOutUndo = useCallback(() => {
    if (soldOutTimerRef.current) {
      clearTimeout(soldOutTimerRef.current)
      soldOutTimerRef.current = null
    }
    setSoldOutUndo(null)
  }, [])

  useEffect(() => () => clearSoldOutUndo(), [clearSoldOutUndo])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const payload = await loadOwnerTaplist(tenantId)
      setDraft(buildDraft(payload))
    } catch (e: any) {
      setError(e?.message || '加载失败')
      setDraft(null)
    } finally {
      setLoading(false)
    }
  }, [tenantId])

  useFocusEffect(
    useCallback(() => {
      load()
    }, [load]),
  )

  const tonightDrinks = useMemo(
    () => (draft ? draft.drinks.filter((d) => d.enabled && isOnTonight(d)) : []),
    [draft],
  )

  const counts = useMemo(() => {
    return {
      total: tonightDrinks.length,
      new: tonightDrinks.filter((d) => d.public_status === 'new').length,
      sold: tonightDrinks.filter((d) => d.public_status === 'sold_out').length,
      hidden: tonightDrinks.filter((d) => !d.is_public_visible).length,
    }
  }, [tonightDrinks])

  const filtered = useMemo(() => {
    return tonightDrinks
      .filter((d) => {
        switch (filter) {
          case 'hidden':
            return !d.is_public_visible
          case 'new':
          case 'sold_out':
            return d.public_status === filter
          default:
            return true
        }
      })
      .sort((a, b) => {
        const an = a.public_sort_order && a.public_sort_order > 0 ? a.public_sort_order : 9999
        const bn = b.public_sort_order && b.public_sort_order > 0 ? b.public_sort_order : 9999
        if (an !== bn) return an - bn
        return (a.display_name || a.name).localeCompare(b.display_name || b.name, 'zh')
      })
  }, [tonightDrinks, filter])

  const slotCount = useMemo(
    () => tapSlotCount(tonightDrinks.length ? tonightDrinks : draft?.drinks ?? []),
    [tonightDrinks, draft],
  )

  // ---- immediate ops (owner + staff), optimistic ----
  const applyImmediate = async (
    d: DraftDrink,
    next: { is_public_visible?: boolean; public_status?: PublicStatus },
  ) => {
    if (!draft) return
    const isVisible = next.is_public_visible ?? d.is_public_visible
    const status = next.public_status ?? d.public_status
    setBusyDrinkId(d.id)
    const prev = draft
    const optimistic = {
      ...draft,
      drinks: draft.drinks.map((x) =>
        x.id === d.id ? { ...x, is_public_visible: isVisible, public_status: status } : x,
      ),
    }
    setDraft(optimistic)
    try {
      await setDrinkStatusImmediate(d.id, isVisible, status)
    } catch (e: any) {
      setDraft(prev) // revert
      Alert.alert('操作失败', e?.message || '请重试')
      throw e
    } finally {
      setBusyDrinkId(null)
    }
  }

  const markSoldOut = async (d: DraftDrink) => {
    if (d.public_status === 'sold_out') return
    const previousStatus = d.public_status
    const name = d.display_name || d.name
    try {
      await applyImmediate(d, { public_status: 'sold_out' })
      if (soldOutTimerRef.current) clearTimeout(soldOutTimerRef.current)
      setSoldOutUndo({ drinkId: d.id, drinkName: name, previousStatus })
      soldOutTimerRef.current = setTimeout(() => {
        soldOutTimerRef.current = null
        setSoldOutUndo(null)
      }, SOLD_OUT_UNDO_MS)
    } catch {
      /* applyImmediate already alerted */
    }
  }

  const undoSoldOut = async () => {
    if (!draft || !soldOutUndo) return
    const d = draft.drinks.find((x) => x.id === soldOutUndo.drinkId)
    const prevStatus = soldOutUndo.previousStatus
    clearSoldOutUndo()
    if (!d) return
    try {
      await applyImmediate(d, { public_status: prevStatus })
    } catch {
      /* already alerted */
    }
  }

  /** After snackbar expires: restore always to available (do not guess previous). */
  const restoreOnSale = async (d: DraftDrink) => {
    clearSoldOutUndo()
    try {
      await applyImmediate(d, { public_status: 'available' })
    } catch {
      /* already alerted */
    }
  }

  const markAsNew = async (d: DraftDrink) => {
    if (d.public_status === 'new') return
    clearSoldOutUndo()
    try {
      await applyImmediate(d, { public_status: 'new' })
    } catch {
      /* already alerted */
    }
  }

  const markAsAvailable = async (d: DraftDrink) => {
    if (d.public_status === 'available') return
    clearSoldOutUndo()
    try {
      await applyImmediate(d, { public_status: 'available' })
    } catch {
      /* already alerted */
    }
  }

  const markComingSoon = async (d: DraftDrink) => {
    if (d.public_status === 'coming_soon') return
    clearSoldOutUndo()
    try {
      await applyImmediate(d, { public_status: 'coming_soon' })
    } catch {
      /* already alerted */
    }
  }

  const openMoreMenu = (d: DraftDrink, anchor: AnchorRect) => {
    setMoreMenu({ drink: d, anchor })
  }

  const handleRemoveFromTonight = (d: DraftDrink) => {
    if (!draft) return
    const name = d.display_name || d.name
    const tap =
      typeof d.public_sort_order === 'number' && d.public_sort_order > 0
        ? `#${d.public_sort_order}`
        : null
    Alert.alert(
      '移出酒单？',
      tap
        ? `「${name}」将离开酒单（${tap}），商品库仍保留。枪号不自动重排。`
        : `「${name}」将离开酒单，商品库仍保留。`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '移出酒单',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setBusyDrinkId(d.id)
              const prev = draft
              setDraft({
                ...draft,
                drinks: draft.drinks.map((x) =>
                  x.id === d.id
                    ? {
                        ...x,
                        public_sort_order: null,
                        is_public_visible: false,
                        public_status: 'available',
                      }
                    : x,
                ),
              })
              if (soldOutUndo?.drinkId === d.id) clearSoldOutUndo()
              try {
                await removeDrinkFromTonight(d.id)
              } catch (e: any) {
                setDraft(prev)
                Alert.alert('移出失败', e?.message || '请重试')
              } finally {
                setBusyDrinkId(null)
              }
            })()
          },
        },
      ],
    )
  }

  const handleAssignTap = async (tapNumber: number) => {
    if (!draft || !tapDrink) return
    const from = tapDrink.public_sort_order
    if (from === tapNumber) {
      setTapDrink(null)
      return
    }
    const occupant = draft.drinks.find(
      (d) => d.id !== tapDrink.id && d.public_sort_order === tapNumber,
    )
    setTapBusy(true)
    const prev = draft
    // Optimistic: swap or move.
    const optimisticDrinks = draft.drinks.map((d) => {
      if (d.id === tapDrink.id) return { ...d, public_sort_order: tapNumber }
      if (occupant && d.id === occupant.id) {
        return { ...d, public_sort_order: from && from > 0 ? from : null }
      }
      return d
    })
    setDraft({ ...draft, drinks: optimisticDrinks })
    try {
      await assignDrinkTapNumber(tapDrink.id, tapNumber)
      setTapDrink(null)
    } catch (e: any) {
      setDraft(prev)
      Alert.alert('改枪号失败', e?.message || '请重试')
    } finally {
      setTapBusy(false)
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.center} edges={['top']}>
        <ActivityIndicator size="large" color={T.gold} />
      </SafeAreaView>
    )
  }

  if (error || !draft) {
    return (
      <SafeAreaView style={styles.center} edges={['top']}>
        <Ionicons name="wine-outline" size={40} color={T.muted} />
        <Text style={styles.errorText}>{error || '暂无酒单'}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={load}>
          <Text style={styles.retryText}>重新加载</Text>
        </TouchableOpacity>
      </SafeAreaView>
    )
  }

  const lastUpdated = draft.tenant.last_menu_updated_at
    ? new Date(draft.tenant.last_menu_updated_at).toLocaleString('zh-CN', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—'

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <FlatList
        data={filtered}
        keyExtractor={(d) => d.id}
        contentContainerStyle={{ paddingBottom: 48 }}
        ListHeaderComponent={
          <View>
            {/* Tonight Control home */}
            <View style={styles.hero}>
              <Text style={styles.barName}>{draft.tenant.display_name || draft.tenant.name}</Text>
              <Text style={styles.eyebrow}>酒单</Text>

              <View style={styles.countsRow}>
                <Stat label="总计" value={counts.total} />
                <Stat label="上新" value={counts.new} />
                <Stat label="售罄" value={counts.sold} />
                <Stat label="隐藏" value={counts.hidden} />
              </View>

              <View style={styles.metaRow}>
                <Text style={styles.updated}>最近更新 {lastUpdated}</Text>
                <TouchableOpacity style={styles.previewBtn} onPress={() => setPreviewOpen(true)}>
                  <Ionicons name="eye-outline" size={16} color={T.gold} />
                  <Text style={styles.previewText}>预览</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Filters */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
              {FILTERS.map((f) => (
                <TouchableOpacity
                  key={f.key}
                  style={[styles.filterChip, filter === f.key && styles.filterChipActive]}
                  onPress={() => setFilter(f.key)}
                >
                  <Text style={[styles.filterText, filter === f.key && styles.filterTextActive]}>
                    {f.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        }
        renderItem={({ item }) => (
          <DrinkRow
            drink={item}
            busy={busyDrinkId === item.id}
            onSoldOut={() => void markSoldOut(item)}
            onRestoreOnSale={() => void restoreOnSale(item)}
            onMarkAsNew={() => void markAsNew(item)}
            onMarkAsAvailable={() => void markAsAvailable(item)}
            onMore={(anchor) => openMoreMenu(item, anchor)}
            onTapNumber={() => setTapDrink(item)}
            onRemoveFromTonight={() => handleRemoveFromTonight(item)}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyList}>
            <Text style={styles.emptyText}>
              {tonightDrinks.length === 0
                ? '酒单为空'
                : '此筛选下暂无酒款'}
            </Text>
            {tonightDrinks.length === 0 ? (
              <Text style={styles.emptyHint}>去「商品库」新增或加入酒款</Text>
            ) : null}
          </View>
        }
      />

      {soldOutUndo ? (
        <View style={styles.snackbar}>
          <Text style={styles.snackbarText} numberOfLines={1}>
            已标记售罄 · {soldOutUndo.drinkName}
          </Text>
          <TouchableOpacity onPress={() => void undoSoldOut()} hitSlop={8}>
            <Text style={styles.snackbarUndo}>撤销</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <AnchorMenu
        visible={!!moreMenu}
        anchor={moreMenu?.anchor ?? null}
        items={
          moreMenu
            ? [
                {
                  key: 'visibility',
                  label: moreMenu.drink.is_public_visible ? '酒单隐藏' : '设为公开',
                  onPress: () => {
                    const d = moreMenu.drink
                    void applyImmediate(d, {
                      is_public_visible: !d.is_public_visible,
                    }).catch(() => {})
                  },
                },
                {
                  key: 'coming_soon',
                  label: '即将上新',
                  onPress: () => void markComingSoon(moreMenu.drink),
                },
                {
                  key: 'history',
                  label: '状态记录',
                  onPress: () => setHistoryDrink(moreMenu.drink),
                },
              ]
            : []
        }
        onClose={() => setMoreMenu(null)}
      />
      <TaplistPreview visible={previewOpen} draft={draft} onClose={() => setPreviewOpen(false)} />
      <DrinkStatusHistorySheet
        visible={!!historyDrink}
        drinkId={historyDrink?.id ?? null}
        drinkName={historyDrink ? historyDrink.display_name || historyDrink.name : ''}
        onClose={() => setHistoryDrink(null)}
      />
      <TapNumberSheet
        visible={!!tapDrink}
        drink={tapDrink}
        drinks={tonightDrinks}
        slotCount={slotCount}
        busy={tapBusy}
        onClose={() => {
          if (!tapBusy) setTapDrink(null)
        }}
        onSelect={(n) => void handleAssignTap(n)}
      />
    </SafeAreaView>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  )
}

function DrinkRow({
  drink,
  busy,
  onSoldOut,
  onRestoreOnSale,
  onMarkAsNew,
  onMarkAsAvailable,
  onMore,
  onTapNumber,
  onRemoveFromTonight,
}: {
  drink: DraftDrink
  busy: boolean
  onSoldOut: () => void
  onRestoreOnSale: () => void
  onMarkAsNew: () => void
  onMarkAsAvailable: () => void
  onMore: (anchor: AnchorRect) => void
  onTapNumber: () => void
  onRemoveFromTonight: () => void
}) {
  const moreRef = useRef<View>(null)
  const tapNo =
    typeof drink.public_sort_order === 'number' && drink.public_sort_order > 0
      ? drink.public_sort_order
      : null
  const isSoldOut = drink.public_status === 'sold_out'
  const isNew = drink.public_status === 'new'
  const statusVis = statusVisual(drink.public_status)
  const meta = [drink.profile.brewery, drink.profile.beer_style].filter(Boolean).join(' · ')
  const isPublic = drink.is_public_visible

  return (
    <View style={[styles.card, !isPublic && styles.cardHidden]}>
      <View style={styles.cardTop}>
        <TouchableOpacity
          onPress={onTapNumber}
          disabled={busy}
          activeOpacity={0.8}
          style={[styles.tapBadge, !tapNo && styles.tapBadgeEmpty]}
          hitSlop={6}
          accessibilityLabel={tapNo ? `枪号 ${tapNo}，点按换号` : '未设枪号，点按换号'}
        >
          <Text style={[styles.tapBadgeText, !tapNo && styles.tapBadgeTextEmpty]}>
            {tapNo ? `#${tapNo}` : '#'}
          </Text>
        </TouchableOpacity>
        {drink.image_url ? (
          <Image source={{ uri: drink.image_url }} style={styles.cardImage} />
        ) : (
          <View style={[styles.cardImage, styles.cardImagePlaceholder]}>
            <Ionicons name="wine-outline" size={22} color={T.faint} />
          </View>
        )}

        <View style={styles.cardBody}>
          <View style={styles.cardHeader}>
            <Text style={styles.drinkName} numberOfLines={2}>
              {drink.display_name || drink.name}
            </Text>
            <View style={styles.statusBadges}>
              <View
                style={[
                  styles.statusBadge,
                  { backgroundColor: statusVis.bg, borderColor: statusVis.border },
                ]}
              >
                <Text style={[styles.statusBadgeText, { color: statusVis.fg }]}>{statusVis.label}</Text>
              </View>
              {!isPublic ? (
                <View style={styles.visibilityBadge}>
                  <Text style={styles.visibilityBadgeText}>酒单隐藏</Text>
                </View>
              ) : null}
            </View>
          </View>

          {meta ? (
            <Text style={styles.meta} numberOfLines={1}>
              {meta}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.actionsRow}>
        {isSoldOut ? (
          <TouchableOpacity
            disabled={busy}
            onPress={onRestoreOnSale}
            style={[styles.actionChip, styles.actionChipPrimary]}
          >
            <Text style={[styles.actionChipText, styles.actionChipTextPrimary]} numberOfLines={1}>
              恢复在售
            </Text>
          </TouchableOpacity>
        ) : (
          <>
            {isNew ? (
              <TouchableOpacity
                disabled={busy}
                onPress={onMarkAsAvailable}
                style={styles.actionChip}
              >
                <Text style={styles.actionChipText} numberOfLines={1}>
                  标为在售
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                disabled={busy}
                onPress={onMarkAsNew}
                style={[styles.actionChip, styles.actionChipPrimary]}
              >
                <Text style={[styles.actionChipText, styles.actionChipTextPrimary]} numberOfLines={1}>
                  上新
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity disabled={busy} onPress={onSoldOut} style={styles.actionChip}>
              <Text style={styles.actionChipText} numberOfLines={1}>
                售罄
              </Text>
            </TouchableOpacity>
          </>
        )}
        <TouchableOpacity disabled={busy} onPress={onRemoveFromTonight} style={styles.actionChip}>
          <Text style={[styles.actionChipText, styles.actionChipDanger]} numberOfLines={1}>
            移出
          </Text>
        </TouchableOpacity>
        <View ref={moreRef} collapsable={false} style={styles.actionMoreWrap}>
          <TouchableOpacity
            disabled={busy}
            onPress={() => {
              moreRef.current?.measureInWindow((x, y, width, height) => {
                onMore({ x, y, width, height })
              })
            }}
            style={[styles.actionChip, styles.actionChipMore]}
            accessibilityLabel="更多操作"
          >
            <Text style={styles.actionChipText}>⋯</Text>
          </TouchableOpacity>
        </View>
        {busy ? <ActivityIndicator size="small" color={T.gold} /> : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.background },
  center: { flex: 1, backgroundColor: T.background, justifyContent: 'center', alignItems: 'center', gap: 14 },
  errorText: { color: T.muted, fontSize: 15 },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: T.gold },
  retryText: { color: T.gold, fontSize: 14, fontWeight: '600' },
  hero: {
    paddingHorizontal: LAYOUT.pagePad,
    paddingTop: LAYOUT.heroPadTop,
    paddingBottom: LAYOUT.heroPadBottom,
  },
  barName: { color: T.text, fontSize: 26, fontWeight: '800' },
  eyebrow: { color: T.goldSoft, fontSize: 13, marginTop: 4, fontWeight: '600' },
  countsRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  stat: {
    flex: 1,
    backgroundColor: T.surfaceMuted,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: T.borderFaint,
  },
  statValue: { color: T.text, fontSize: 22, fontWeight: '800' },
  statLabel: { color: T.muted, fontSize: 12, marginTop: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 },
  updated: { color: T.faint, fontSize: 13 },
  previewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: T.goldBorder,
  },
  previewText: { color: T.gold, fontSize: 14, fontWeight: '600' },
  filterRow: { flexGrow: 0, paddingHorizontal: LAYOUT.pagePad, marginBottom: 8 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    marginRight: 8,
    borderWidth: 1,
    borderColor: T.border,
  },
  filterChipActive: { backgroundColor: T.goldFill, borderColor: T.goldBorder },
  filterText: { color: T.muted, fontSize: 14 },
  filterTextActive: { color: T.text, fontWeight: '600' },
  card: {
    backgroundColor: T.surface,
    borderRadius: 14,
    paddingTop: 14,
    paddingHorizontal: 14,
    paddingBottom: 12,
    marginHorizontal: LAYOUT.pagePad,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: T.borderFaint,
  },
  cardHidden: { opacity: 0.55 },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  tapBadge: {
    minWidth: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: T.goldFill,
    borderWidth: 1,
    borderColor: T.goldBorder,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  tapBadgeEmpty: {
    backgroundColor: T.surfaceMuted,
    borderColor: T.border,
  },
  tapBadgeText: { color: T.gold, fontSize: 15, fontWeight: '800' },
  tapBadgeTextEmpty: { color: T.faint },
  cardImage: { width: 56, height: 56, borderRadius: 8, backgroundColor: T.surfaceMuted },
  cardImagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  cardBody: { flex: 1, minWidth: 0 },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  drinkName: { color: T.text, fontSize: 16, fontWeight: '700', flex: 1 },
  statusBadges: { alignItems: 'flex-end', gap: 4 },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 1,
  },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },
  visibilityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surfaceMuted,
  },
  visibilityBadgePublic: { borderColor: T.goldBorder, backgroundColor: T.goldFill },
  visibilityBadgeText: { color: T.muted, fontSize: 11, fontWeight: '700' },
  visibilityBadgeTextPublic: { color: T.gold },
  meta: { color: T.muted, fontSize: 13, marginTop: 4 },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: T.borderFaint,
  },
  actionChip: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 6,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: T.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionChipMore: {
    flex: 0,
    minWidth: 44,
    paddingHorizontal: 10,
  },
  actionMoreWrap: {
    flexGrow: 0,
  },
  actionChipPrimary: {
    borderColor: T.goldBorder,
    backgroundColor: T.goldFill,
  },
  actionChipText: { fontSize: 13, fontWeight: '600', color: T.muted },
  actionChipTextPrimary: { color: T.gold },
  actionChipDanger: { color: 'rgba(220,120,100,0.95)' },
  emptyList: { paddingTop: 40, alignItems: 'center', gap: 8, paddingHorizontal: LAYOUT.pagePad },
  emptyText: { color: T.faint, fontSize: 15 },
  emptyHint: { color: T.muted, fontSize: 13, textAlign: 'center' },
  snackbar: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: T.border,
  },
  snackbarText: { flex: 1, color: T.text, fontSize: 14 },
  snackbarUndo: { color: T.gold, fontSize: 15, fontWeight: '800' },
})
