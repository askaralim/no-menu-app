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
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useFocusEffect } from 'expo-router'
import { useAuth } from '../../lib/authProvider'
import { TAPLIST_THEME as T, statusVisual } from '../../lib/taplistTheme'
import { LAYOUT } from '../../lib/theme'
import {
  type DraftDrink,
  type TaplistDraft,
  assignDrinkTapNumber,
  buildDraft,
  emptyDraftDrink,
  isOnTonight,
  loadOwnerTaplist,
  removeDrinkFromTonight,
  setDrinkStatusImmediate,
  setTenantTapSlotCount,
  tapSlotCount,
} from '../../lib/taplistOwnerApi'
import type { DrinkUpsertResult, PublicStatus } from '../../lib/types'
import TaplistPreview from '../../components/taplist/TaplistPreview'
import TapNumberSheet from '../../components/taplist/TapNumberSheet'
import DrinkStatusHistorySheet from '../../components/taplist/DrinkStatusHistorySheet'
import CatalogPickSheet from '../../components/taplist/CatalogPickSheet'
import DrinkEditSheet from '../../components/taplist/DrinkEditSheet'
import JoinTonightSheet from '../../components/taplist/JoinTonightSheet'
import TapSlotCountSheet from '../../components/taplist/TapSlotCountSheet'
import TaplistSlotRow from '../../components/taplist/TaplistSlotRow'
import TonightShareSheet from '../../components/taplist/TonightShareSheet'
import AnchorMenu, { type AnchorRect } from '../../components/ui/AnchorMenu'

const SOLD_OUT_UNDO_MS = 7000
const TAP_NUMBER_HINT_KEY = 'taplist:tap-number-hint:v1'
const TAP_NUMBER_HINT_MS = 6000

type SoldOutUndo = {
  drinkId: string
  drinkName: string
  previousStatus: PublicStatus
}

type Filter = 'all' | 'new' | 'sold_out' | 'hidden' | 'empty'

type TapSlotItem = {
  tapNumber: number
  drink: DraftDrink | null
}

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'new', label: '上新' },
  { key: 'sold_out', label: '售罄' },
  { key: 'hidden', label: '隐藏' },
  { key: 'empty', label: '空位' },
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
  const [pickerTapNumber, setPickerTapNumber] = useState<number | null>(null)
  const [joinDrink, setJoinDrink] = useState<DraftDrink | null>(null)
  const [joinTapNumber, setJoinTapNumber] = useState<number | null>(null)
  const [editing, setEditing] = useState<DraftDrink | null>(null)
  const [creating, setCreating] = useState(false)
  const [editorTapNumber, setEditorTapNumber] = useState<number | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [tonightShareOpen, setTonightShareOpen] = useState(false)
  const [tapNumberHintVisible, setTapNumberHintVisible] = useState(false)
  const soldOutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tapNumberHintCheckedRef = useRef(false)
  const tenantIdRef = useRef(tenantId)

  const clearSoldOutUndo = useCallback(() => {
    if (soldOutTimerRef.current) {
      clearTimeout(soldOutTimerRef.current)
      soldOutTimerRef.current = null
    }
    setSoldOutUndo(null)
  }, [])

  useEffect(() => () => clearSoldOutUndo(), [clearSoldOutUndo])

  const refreshDraft = useCallback(async () => {
    const payload = await loadOwnerTaplist(tenantId)
    const next = buildDraft(payload)
    setDraft(next)
    return next
  }, [tenantId])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      await refreshDraft()
    } catch (e: any) {
      setError(e?.message || '加载失败')
      setDraft(null)
    } finally {
      setLoading(false)
    }
  }, [refreshDraft])

  useFocusEffect(
    useCallback(() => {
      load()
    }, [load]),
  )

  useEffect(() => {
    if (tenantIdRef.current === tenantId) return
    tenantIdRef.current = tenantId
    clearSoldOutUndo()
    setPreviewOpen(false)
    setTapDrink(null)
    setHistoryDrink(null)
    setMoreMenu(null)
    setPickerTapNumber(null)
    setJoinDrink(null)
    setJoinTapNumber(null)
    setEditing(null)
    setCreating(false)
    setEditorTapNumber(null)
    setSettingsOpen(false)
    setTonightShareOpen(false)
    setFilter('all')
    setDraft(null)
    setError(null)
    setLoading(true)
  }, [tenantId, clearSoldOutUndo])

  const tonightDrinks = useMemo(
    () => (draft ? draft.drinks.filter((d) => d.enabled && isOnTonight(d)) : []),
    [draft],
  )

  const slotCount = useMemo(
    () =>
      tapSlotCount(
        tonightDrinks.length ? tonightDrinks : draft?.drinks ?? [],
        draft?.tenant.tap_slot_count,
      ),
    [tonightDrinks, draft],
  )

  const slots = useMemo<TapSlotItem[]>(() => {
    const occupantByTap = new Map<number, DraftDrink>()
    for (const drink of tonightDrinks) {
      const tap = drink.public_sort_order
      if (typeof tap === 'number' && tap >= 1 && tap <= slotCount && !occupantByTap.has(tap)) {
        occupantByTap.set(tap, drink)
      }
    }
    return Array.from({ length: slotCount }, (_, index) => ({
      tapNumber: index + 1,
      drink: occupantByTap.get(index + 1) ?? null,
    }))
  }, [tonightDrinks, slotCount])

  const counts = useMemo(() => {
    const occupied = slots.filter((slot) => slot.drink).length
    return { occupied, empty: slotCount - occupied }
  }, [slots, slotCount])

  const filterCounts = useMemo<Record<Filter, number>>(
    () => ({
      all: slots.length,
      new: slots.filter((slot) => slot.drink?.public_status === 'new').length,
      sold_out: slots.filter((slot) => slot.drink?.public_status === 'sold_out').length,
      hidden: slots.filter((slot) => slot.drink && !slot.drink.is_public_visible).length,
      empty: counts.empty,
    }),
    [counts.empty, slots],
  )

  useEffect(() => {
    if (counts.occupied < 1 || tapNumberHintCheckedRef.current) return
    tapNumberHintCheckedRef.current = true

    let active = true
    let hideTimer: ReturnType<typeof setTimeout> | null = null

    void AsyncStorage.getItem(TAP_NUMBER_HINT_KEY)
      .then((seen) => {
        if (!active || seen) return
        setTapNumberHintVisible(true)
        void AsyncStorage.setItem(TAP_NUMBER_HINT_KEY, '1')
        hideTimer = setTimeout(() => {
          if (active) setTapNumberHintVisible(false)
        }, TAP_NUMBER_HINT_MS)
      })
      .catch(() => {})

    return () => {
      active = false
      if (hideTimer) clearTimeout(hideTimer)
    }
  }, [counts.occupied])

  const filteredSlots = useMemo(() => {
    switch (filter) {
      case 'empty':
        return slots.filter((slot) => !slot.drink)
      case 'hidden':
        return slots.filter((slot) => slot.drink && !slot.drink.is_public_visible)
      case 'new':
      case 'sold_out':
        return slots.filter((slot) => slot.drink?.public_status === filter)
      default:
        return slots
    }
  }, [slots, filter])

  const highestAssignedTap = useMemo(
    () => tonightDrinks.reduce((highest, drink) => Math.max(highest, drink.public_sort_order || 0), 0),
    [tonightDrinks],
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
      tap ? `清空 ${tap} 酒头？` : '清空酒头？',
      tap
        ? `「${name}」将从 ${tap} 酒头移出并保留在商品库，该酒头会显示为空位。`
        : `「${name}」将离开酒单并保留在商品库。`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '确认清空',
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

  const openTapPicker = (tapNumber: number) => {
    setMoreMenu(null)
    setPickerTapNumber(tapNumber)
  }

  const handleCatalogPick = (drink: DraftDrink) => {
    const target = pickerTapNumber
    setPickerTapNumber(null)
    setJoinTapNumber(target)
    setJoinDrink(drink)
  }

  const openCreateFromPicker = () => {
    const target = pickerTapNumber
    setPickerTapNumber(null)
    setEditorTapNumber(target)
    setCreating(true)
    setEditing(emptyDraftDrink({ entryPoint: 'tonight' }))
  }

  const openEditDrink = (drink: DraftDrink, targetTapNumber: number | null = null) => {
    setMoreMenu(null)
    setEditorTapNumber(targetTapNumber)
    setCreating(false)
    setEditing(drink)
  }

  const closeEditor = () => {
    setEditing(null)
    setCreating(false)
    setEditorTapNumber(null)
  }

  const handlePickLocalDrink = (drink: DraftDrink) => {
    setCreating(false)
    setEditing(drink)
  }

  const handleEditorSaved = async (result?: DrinkUpsertResult, savedDrink?: DraftDrink) => {
    closeEditor()
    if (draft && savedDrink && result?.ok && result.drink_id) {
      // Only optimistic-patch when servings are reconciled (real DB ids).
      const servingsSafe = !(savedDrink.servings ?? []).some((s) => !s._deleted && (!s.id || s._new))
      const merged: DraftDrink = {
        ...savedDrink,
        id: result.drink_id,
        servings: servingsSafe
          ? (savedDrink.servings ?? []).map((s) => ({ ...s, _new: false, _deleted: undefined }))
          : draft.drinks.find((d) => d.id === result.drink_id)?.servings ?? [],
      }
      const exists = draft.drinks.some((d) => d.id === result.drink_id)
      const optimistic: TaplistDraft = {
        ...draft,
        drinks: exists
          ? draft.drinks.map((d) => (d.id === result.drink_id ? { ...d, ...merged } : d))
          : [...draft.drinks, merged],
      }
      setDraft(optimistic)
    }
    refreshDraft().catch(() => {})
  }

  const handleSaveTapSlotCount = async (count: number) => {
    if (!draft || !tenantId || settingsSaving) return
    setSettingsSaving(true)
    try {
      const next = await setTenantTapSlotCount(tenantId, count)
      setDraft({ ...draft, tenant: { ...draft.tenant, tap_slot_count: next } })
      setSettingsOpen(false)
    } catch (e: any) {
      Alert.alert('保存失败', e?.message || '请重试')
    } finally {
      setSettingsSaving(false)
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

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <FlatList
        data={filteredSlots}
        keyExtractor={(slot) => `tap-${slot.tapNumber}`}
        contentContainerStyle={{ paddingBottom: 48 }}
        ListHeaderComponent={
          <View>
            <View style={styles.hero}>
              <View style={styles.headerRow}>
                <View style={styles.headerCopy}>
                  <Text style={styles.barName} numberOfLines={1}>
                    {draft.tenant.display_name || draft.tenant.name}
                  </Text>
                </View>
                <View style={styles.headerActions}>
                  <TouchableOpacity
                    style={styles.shareTonightBtn}
                    onPress={() => setTonightShareOpen(true)}
                    activeOpacity={0.72}
                    accessibilityLabel="分享上新"
                  >
                    <Ionicons name="share-outline" size={21} color={T.gold} />
                    <Text style={styles.shareTonightText}>分享上新</Text>
                  </TouchableOpacity>
                  {draft.isOwner ? (
                    <TouchableOpacity
                      style={styles.settingsBtn}
                      onPress={() => setSettingsOpen(true)}
                      activeOpacity={0.72}
                    >
                      <Ionicons name="settings-outline" size={16} color={T.gold} />
                      <Text style={styles.settingsText}>酒头设置</Text>
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity
                    style={styles.previewBtn}
                    onPress={() => setPreviewOpen(true)}
                    activeOpacity={0.72}
                    accessibilityLabel="顾客预览"
                  >
                    <Ionicons name="eye-outline" size={23} color={T.gold} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>

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
                  <Text
                    style={[
                      styles.filterCount,
                      filter === f.key && styles.filterCountActive,
                    ]}
                  >
                    {filterCounts[f.key]}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {tapNumberHintVisible ? (
              <View style={styles.tapNumberHint}>
                <Ionicons name="pencil-outline" size={14} color={T.goldSoft} />
                <Text style={styles.tapNumberHintText}>点击枪号可调整或交换</Text>
              </View>
            ) : null}
          </View>
        }
        renderItem={({ item }) => {
          const drink = item.drink
          return (
            <TaplistSlotRow
              tapNumber={item.tapNumber}
              drink={drink}
              busy={!!drink && busyDrinkId === drink.id}
              onAdd={() => openTapPicker(item.tapNumber)}
              onTapNumber={() => {
                if (drink) setTapDrink(drink)
              }}
              onEdit={() => {
                if (drink) openEditDrink(drink)
              }}
              onClear={() => {
                if (drink) handleRemoveFromTonight(drink)
              }}
              onReplace={() => openTapPicker(item.tapNumber)}
              onMore={(anchor) => {
                if (drink) openMoreMenu(drink, anchor)
              }}
            />
          )
        }}
        ListEmptyComponent={
          <View style={styles.emptyList}>
            <Text style={styles.emptyText}>此筛选下暂无酒头</Text>
          </View>
        }
      />

      {soldOutUndo ? (
        <View style={styles.snackbar}>
          <Text style={styles.snackbarText} numberOfLines={1}>
            已标记售罄 · {soldOutUndo.drinkName}
          </Text>
          <TouchableOpacity
            style={styles.snackbarUndoBtn}
            onPress={() => void undoSoldOut()}
            activeOpacity={0.72}
          >
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
                  key: 'primary_status',
                  label:
                    moreMenu.drink.public_status === 'sold_out'
                      ? '恢复在售'
                      : moreMenu.drink.public_status === 'new'
                        ? '标为在售'
                        : '标为上新',
                  icon: 'radio-button-on-outline',
                  iconColor:
                    moreMenu.drink.public_status === 'sold_out' ||
                    moreMenu.drink.public_status === 'new'
                      ? statusVisual('available').fg
                      : statusVisual('new').fg,
                  onPress: () => {
                    const drink = moreMenu.drink
                    if (drink.public_status === 'sold_out') void restoreOnSale(drink)
                    else if (drink.public_status === 'new') void markAsAvailable(drink)
                    else void markAsNew(drink)
                  },
                },
                ...(moreMenu.drink.public_status !== 'sold_out'
                  ? [
                      {
                        key: 'sold_out',
                        label: '标为售罄',
                        icon: 'remove-circle-outline' as const,
                        iconColor: statusVisual('sold_out').fg,
                        onPress: () => void markSoldOut(moreMenu.drink),
                      },
                    ]
                  : []),
                {
                  key: 'visibility',
                  label: moreMenu.drink.is_public_visible ? '酒单隐藏' : '设为公开',
                  icon: moreMenu.drink.is_public_visible ? 'eye-off-outline' : 'eye-outline',
                  iconColor: moreMenu.drink.is_public_visible ? T.faint : T.goldSoft,
                  onPress: () => {
                    const d = moreMenu.drink
                    void applyImmediate(d, {
                      is_public_visible: !d.is_public_visible,
                    }).catch(() => {})
                  },
                },
                ...(moreMenu.drink.public_status !== 'coming_soon'
                  ? [
                      {
                        key: 'coming_soon',
                        label: '即将上新',
                        icon: 'calendar-outline' as const,
                        iconColor: statusVisual('coming_soon').fg,
                        onPress: () => void markComingSoon(moreMenu.drink),
                      },
                    ]
                  : []),
                {
                  key: 'tap_number',
                  label: '调整枪号',
                  icon: 'pencil-outline',
                  onPress: () => setTapDrink(moreMenu.drink),
                },
                {
                  key: 'edit',
                  label: '编辑酒款',
                  icon: 'create-outline',
                  onPress: () => openEditDrink(moreMenu.drink),
                },
                {
                  key: 'history',
                  label: '状态记录',
                  icon: 'time-outline',
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
      <CatalogPickSheet
        visible={pickerTapNumber != null}
        drinks={draft.drinks}
        targetTapNumber={pickerTapNumber}
        onClose={() => setPickerTapNumber(null)}
        onPick={handleCatalogPick}
        onCreate={openCreateFromPicker}
      />
      <DrinkEditSheet
        visible={!!editing}
        drink={editing}
        tenantId={tenantId}
        categories={draft.categories}
        isCreate={creating}
        entryPoint={editorTapNumber ? 'tonight' : 'catalog'}
        saveIntent={editorTapNumber ? 'save_and_add_to_tonight' : 'product_only'}
        suggestedTapNumber={editorTapNumber}
        catalogDrinks={draft.drinks}
        onPickLocalDrink={handlePickLocalDrink}
        onClose={closeEditor}
        onSaved={handleEditorSaved}
      />
      <JoinTonightSheet
        visible={!!joinDrink}
        drink={joinDrink}
        allDrinks={draft.drinks}
        configuredTapCount={slotCount}
        fixedTapNumber={joinTapNumber}
        onClose={() => {
          setJoinDrink(null)
          setJoinTapNumber(null)
        }}
        onJoined={async () => {
          setJoinDrink(null)
          setJoinTapNumber(null)
          await refreshDraft()
        }}
      />
      <TapSlotCountSheet
        visible={settingsOpen}
        currentCount={slotCount}
        highestAssigned={highestAssignedTap}
        saving={settingsSaving}
        onClose={() => {
          if (!settingsSaving) setSettingsOpen(false)
        }}
        onSave={(count) => void handleSaveTapSlotCount(count)}
      />
      <TonightShareSheet
        visible={tonightShareOpen}
        draft={draft}
        onClose={() => setTonightShareOpen(false)}
      />
    </SafeAreaView>
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
    paddingTop: 18,
    paddingBottom: 16,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerCopy: { flex: 1, minWidth: 0 },
  barName: { color: T.text, fontSize: 24, fontWeight: '800' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  shareTonightBtn: {
    height: 36,
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 10,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: T.goldBorder,
    backgroundColor: T.goldFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareTonightText: { color: T.gold, fontSize: 14, fontWeight: '700' },
  settingsBtn: {
    height: 36,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 7,
    borderWidth: 1,
    borderColor: T.goldBorder,
    backgroundColor: T.goldFill,
  },
  settingsText: { color: T.gold, fontSize: 14, fontWeight: '700' },
  previewBtn: {
    width: 38,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 7,
    borderWidth: 1,
    borderColor: T.goldBorder,
    backgroundColor: T.goldFill,
  },
  filterRow: { flexGrow: 0, paddingHorizontal: LAYOUT.pagePad, paddingBottom: 8 },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minHeight: 36,
    justifyContent: 'center',
    borderRadius: 8,
    marginRight: 8,
    borderWidth: 1,
    borderColor: T.border,
  },
  filterChipActive: { backgroundColor: T.goldFill, borderColor: T.goldBorder },
  filterText: { color: T.muted, fontSize: 14 },
  filterTextActive: { color: T.text, fontWeight: '600' },
  filterCount: { color: T.faint, fontSize: 12, fontVariant: ['tabular-nums'] },
  filterCountActive: { color: T.goldSoft, fontWeight: '700' },
  tapNumberHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: LAYOUT.pagePad,
    marginTop: 2,
    marginBottom: 6,
  },
  tapNumberHintText: { color: T.faint, fontSize: 12 },
  emptyList: { paddingTop: 40, alignItems: 'center', gap: 8, paddingHorizontal: LAYOUT.pagePad },
  emptyText: { color: T.faint, fontSize: 15 },
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
  snackbarUndoBtn: {
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: T.goldBorder,
    backgroundColor: T.goldFill,
  },
  snackbarUndo: { color: T.gold, fontSize: 15, fontWeight: '800' },
})
