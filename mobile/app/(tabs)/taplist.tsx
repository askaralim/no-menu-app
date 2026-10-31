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
  Modal,
  Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useFocusEffect, useRouter } from 'expo-router'
import { useAuth } from '../../lib/authProvider'
import { TAPLIST_THEME as T } from '../../lib/taplistTheme'
import { LAYOUT } from '../../lib/theme'
import {
  type DraftDrink,
  type TaplistDraft,
  TapOperationConflictError,
  assignDrinkTapNumber,
  buildDraft,
  emptyDraftDrink,
  isOnTonight,
  loadOwnerTaplist,
  newTapOperationId,
  recordTapKegChange,
  removeDrinkFromTonight,
  setDrinkStatusImmediate,
  setTenantTapSlotCount,
  tapSlotCount,
} from '../../lib/taplistOwnerApi'
import type { DrinkUpsertResult, PublicStatus } from '../../lib/types'
import type { LocalImageAsset } from '../../lib/taplistMedia'
import TaplistPreview from '../../components/taplist/TaplistPreview'
import TapNumberSheet from '../../components/taplist/TapNumberSheet'
import DrinkStatusHistorySheet from '../../components/taplist/DrinkStatusHistorySheet'
import CatalogPickSheet from '../../components/taplist/CatalogPickSheet'
import DrinkEditSheet from '../../components/taplist/DrinkEditSheet'
import TapSlotCountSheet from '../../components/taplist/TapSlotCountSheet'
import TaplistSlotRow from '../../components/taplist/TaplistSlotRow'
import TonightShareSheet from '../../components/taplist/TonightShareSheet'
import DrinkStatusSheet from '../../components/taplist/DrinkStatusSheet'

const SOLD_OUT_UNDO_MS = 7000
const TAP_NUMBER_HINT_KEY = 'taplist:tap-number-hint:v1'
const TAP_NUMBER_HINT_MS = 6000
const KEG_CHANGE_PENDING_KEY_PREFIX = 'taplist:keg-change-pending:v1'

type SoldOutUndo = {
  drinkId: string
  drinkName: string
  previousStatus: PublicStatus
}

type PendingKegChange = {
  operationId: string
  attemptedAt: string
  tapNumber: number
}

type WebKegChangeDialog =
  | {
      kind: 'confirm'
      drink: DraftDrink
      pending: PendingKegChange
      title: string
      message: string
      confirmLabel: string
    }
  | {
      kind: 'pending'
      drink: DraftDrink
      pending: PendingKegChange
      title: string
      message: string
    }
  | {
      kind: 'recover'
      drink: DraftDrink
      targetStatus: 'new' | 'available' | 'low'
      title: string
      message: string
    }
  | {
      kind: 'sold_out'
      drink: DraftDrink
      title: string
      message: string
    }
  | {
      kind: 'message'
      title: string
      message: string
    }

function pendingKegChangeKey(tenantId: string, drinkId: string): string {
  return `${KEG_CHANGE_PENDING_KEY_PREFIX}:${tenantId}:${drinkId}`
}

function parsePendingKegChange(value: string | null): PendingKegChange | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as Partial<PendingKegChange>
    if (
      typeof parsed.operationId !== 'string' ||
      typeof parsed.attemptedAt !== 'string' ||
      !Number.isInteger(parsed.tapNumber) ||
      Number(parsed.tapNumber) < 1
    ) {
      return null
    }
    return parsed as PendingKegChange
  } catch {
    return null
  }
}

function formatPendingKegChangeTime(value: string): string | null {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
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
  const router = useRouter()
  const { tenantId, memberships } = useAuth()
  const canSwitchStore = memberships.length > 1

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
  const [moreMenu, setMoreMenu] = useState<DraftDrink | null>(null)
  const [pickerTapNumber, setPickerTapNumber] = useState<number | null>(null)
  const [editing, setEditing] = useState<DraftDrink | null>(null)
  const [creating, setCreating] = useState(false)
  const [editorTapNumber, setEditorTapNumber] = useState<number | null>(null)
  const [editorRecognitionAsset, setEditorRecognitionAsset] = useState<LocalImageAsset | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [tonightShareOpen, setTonightShareOpen] = useState(false)
  const [tapNumberHintVisible, setTapNumberHintVisible] = useState(false)
  const [webKegChangeDialog, setWebKegChangeDialog] = useState<WebKegChangeDialog | null>(null)
  const soldOutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tapNumberHintCheckedRef = useRef(false)
  const tenantIdRef = useRef(tenantId)
  const pendingKegChangesRef = useRef<Map<string, PendingKegChange>>(new Map())

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
    pendingKegChangesRef.current.clear()
    clearSoldOutUndo()
    setPreviewOpen(false)
    setBusyDrinkId(null)
    setTapDrink(null)
    setHistoryDrink(null)
    setMoreMenu(null)
    setPickerTapNumber(null)
    setEditing(null)
    setCreating(false)
    setEditorTapNumber(null)
    setEditorRecognitionAsset(null)
    setSettingsOpen(false)
    setTonightShareOpen(false)
    setWebKegChangeDialog(null)
    setFilter('all')
    setDraft(null)
    setError(null)
    setLoading(true)
  }, [tenantId, clearSoldOutUndo])

  const showKegChangeMessage = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      setMoreMenu(null)
      setWebKegChangeDialog({ kind: 'message', title, message })
      return
    }
    Alert.alert(title, message)
  }

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

  const confirmMarkSoldOut = (d: DraftDrink) => {
    const name = d.display_name || d.name
    const tapNumber = Number(d.public_sort_order)
    const location = Number.isInteger(tapNumber) && tapNumber > 0 ? `#${tapNumber} 酒头` : '当前酒头'
    const endsActiveCycle = d.public_status !== 'coming_soon'
    const message = endsActiveCycle
      ? `「${name}」将结束当前在枪周期。酒款仍保留在 ${location}，并在酒单中显示为售罄。`
      : `「${name}」将取消即将上新安排。酒款仍保留在 ${location}，并在酒单中显示为售罄。`

    if (Platform.OS === 'web') {
      setMoreMenu(null)
      setWebKegChangeDialog({
        kind: 'sold_out',
        drink: d,
        title: '确认标记售罄？',
        message,
      })
      return
    }

    Alert.alert(
      '确认标记售罄？',
      message,
      [
        { text: '取消', style: 'cancel' },
        { text: '确认售罄', style: 'destructive', onPress: () => void markSoldOut(d) },
      ],
    )
  }

  const undoSoldOut = async () => {
    if (!draft || !soldOutUndo) return
    const d = draft.drinks.find((x) => x.id === soldOutUndo.drinkId)
    const prevStatus = soldOutUndo.previousStatus
    clearSoldOutUndo()
    if (!d) return
    if (prevStatus === 'new' || prevStatus === 'available' || prevStatus === 'low') {
      confirmSoldOutRecovery(d, prevStatus)
    } else {
      try {
        await applyImmediate(d, { public_status: prevStatus })
      } catch {
        /* applyImmediate already alerted */
      }
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

  const openMoreMenu = (d: DraftDrink) => setMoreMenu(d)

  const loadPendingKegChange = async (
    operationTenantId: string,
    drinkId: string,
  ): Promise<PendingKegChange | null> => {
    const cached = pendingKegChangesRef.current.get(drinkId)
    if (cached) return cached

    const storageKey = pendingKegChangeKey(operationTenantId, drinkId)
    try {
      const raw = await AsyncStorage.getItem(storageKey)
      const stored = parsePendingKegChange(raw)
      if (stored) {
        pendingKegChangesRef.current.set(drinkId, stored)
        return stored
      }
      if (raw) await AsyncStorage.removeItem(storageKey)
    } catch {
      throw new Error('暂时无法确认上次换桶状态，请稍后重试')
    }
    return null
  }

  const persistPendingKegChange = async (
    operationTenantId: string,
    drinkId: string,
    pending: PendingKegChange,
  ) => {
    pendingKegChangesRef.current.set(drinkId, pending)
    try {
      await AsyncStorage.setItem(
        pendingKegChangeKey(operationTenantId, drinkId),
        JSON.stringify(pending),
      )
    } catch {
      const current = pendingKegChangesRef.current.get(drinkId)
      if (current?.operationId === pending.operationId) {
        pendingKegChangesRef.current.delete(drinkId)
      }
      throw new Error('无法保存换桶请求，请重试')
    }
  }

  const clearPendingKegChange = async (
    operationTenantId: string,
    drinkId: string,
    operationId: string,
  ) => {
    const current = pendingKegChangesRef.current.get(drinkId)
    if (current && current.operationId !== operationId) return
    if (tenantIdRef.current === operationTenantId) {
      pendingKegChangesRef.current.delete(drinkId)
    }

    const storageKey = pendingKegChangeKey(operationTenantId, drinkId)
    try {
      const stored = parsePendingKegChange(await AsyncStorage.getItem(storageKey))
      if (!stored || stored.operationId === operationId) {
        await AsyncStorage.removeItem(storageKey)
      }
    } catch {
      // The server result is authoritative; stale local state still requires an explicit choice.
    }
  }

  const executeKegChange = async (
    d: DraftDrink,
    pending: PendingKegChange,
    persistBeforeRequest: boolean,
  ) => {
    const operationTenantId = tenantId
    if (!operationTenantId) {
      showKegChangeMessage('无法记录换桶', '未找到当前门店，请刷新后重试。')
      return
    }

    setBusyDrinkId(d.id)
    try {
      if (persistBeforeRequest) {
        await persistPendingKegChange(operationTenantId, d.id, pending)
      }

      const result = await recordTapKegChange(d.id, pending.operationId)
      await clearPendingKegChange(operationTenantId, d.id, pending.operationId)

      if (tenantIdRef.current !== operationTenantId) return

      if (soldOutUndo?.drinkId === d.id) clearSoldOutUndo()
      if (result.replayed) {
        try {
          await refreshDraft()
        } catch {
          // The RPC succeeded; focus refresh will reconcile the current public status later.
        }
      } else {
        setDraft((current) =>
          current
            ? {
                ...current,
                drinks: current.drinks.map((drink) =>
                  drink.id === d.id
                    ? { ...drink, public_status: result.public_status }
                    : drink,
                ),
              }
            : current,
        )
      }

      setMoreMenu((current) => (current?.id === d.id ? null : current))
      showKegChangeMessage(
        result.replayed ? '上次换桶已确认' : '换桶已记录',
        result.replayed
          ? `#${result.tap_number} 酒头的上次换桶记录已确认，不会重复记录。`
          : d.public_status === 'sold_out'
            ? `#${result.tap_number} 酒头已从现在开始记录新桶和新的在枪周期，并已恢复在售。`
            : `#${result.tap_number} 酒头已从现在开始记录新桶。`,
      )
    } catch (error) {
      if (error instanceof TapOperationConflictError) {
        await clearPendingKegChange(operationTenantId, d.id, pending.operationId)
      }
      showKegChangeMessage('记录失败', error instanceof Error ? error.message : '请重试')
    } finally {
      if (tenantIdRef.current === operationTenantId) setBusyDrinkId(null)
    }
  }

  const confirmNewKegChange = (d: DraftDrink) => {
    const tapNumber = Number(d.public_sort_order)
    if (!Number.isInteger(tapNumber) || tapNumber < 1) {
      showKegChangeMessage('无法记录换桶', '这款酒当前没有分配酒头。')
      return
    }

    const name = d.display_name || d.name
    const resumesSale = d.public_status === 'sold_out'
    const message = resumesSale
      ? `「${name}」仍在 #${tapNumber}。上一周期已在标记售罄时结束；将从现在开始记录新桶和新的在枪周期，并恢复为在售状态，不改变酒单排序。`
      : `「${name}」仍在 #${tapNumber}。将结束上一桶计时，并从现在开始记录新桶；不会创建新的在枪周期，也不会改变顾客端状态或酒单排序。`

    if (Platform.OS === 'web') {
      setMoreMenu(null)
      setWebKegChangeDialog({
        kind: 'confirm',
        drink: d,
        pending: {
          operationId: newTapOperationId(),
          attemptedAt: new Date().toISOString(),
          tapNumber,
        },
        title: '确认已换桶？',
        message,
        confirmLabel: resumesSale ? '换桶并恢复在售' : '确认换桶',
      })
      return
    }

    Alert.alert(
      '确认已换桶？',
      message,
      [
        { text: '取消', style: 'cancel' },
        {
          text: resumesSale ? '换桶并恢复在售' : '确认换桶',
          onPress: () => {
            const pending: PendingKegChange = {
              operationId: newTapOperationId(),
              attemptedAt: new Date().toISOString(),
              tapNumber,
            }
            void executeKegChange(d, pending, true)
          },
        },
      ],
    )
  }

  const handleKegChange = async (d: DraftDrink, alreadyConfirmed = false) => {
    if (!tenantId) {
      showKegChangeMessage('无法记录换桶', '未找到当前门店，请刷新后重试。')
      return
    }

    let pending: PendingKegChange | null
    try {
      pending = await loadPendingKegChange(tenantId, d.id)
    } catch (error) {
      showKegChangeMessage('暂时无法操作', error instanceof Error ? error.message : '请稍后重试')
      return
    }
    if (tenantIdRef.current !== tenantId) return
    if (!pending) {
      if (alreadyConfirmed) {
        const tapNumber = Number(d.public_sort_order)
        if (!Number.isInteger(tapNumber) || tapNumber < 1) {
          showKegChangeMessage('无法记录换桶', '这款酒当前没有分配酒头。')
          return
        }
        void executeKegChange(
          d,
          {
            operationId: newTapOperationId(),
            attemptedAt: new Date().toISOString(),
            tapNumber,
          },
          true,
        )
      } else {
        confirmNewKegChange(d)
      }
      return
    }

    const attemptedAt = formatPendingKegChangeTime(pending.attemptedAt)
    const attemptLabel = attemptedAt
      ? `${attemptedAt} · #${pending.tapNumber}`
      : `#${pending.tapNumber}`
    const message = `${attemptLabel} 酒头的上次请求可能已经成功。若仍在确认同一次换桶，请重试上次；只有确实又换了一桶，才记录新的换桶。`

    if (Platform.OS === 'web') {
      setMoreMenu(null)
      setWebKegChangeDialog({
        kind: 'pending',
        drink: d,
        pending,
        title: '上次换桶尚未确认',
        message,
      })
      return
    }

    Alert.alert(
      '上次换桶尚未确认',
      message,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '重试上次',
          onPress: () => void executeKegChange(d, pending, false),
        },
        {
          text: '记录新换桶',
          onPress: () => confirmNewKegChange(d),
        },
      ],
    )
  }

  const resumeSoldOutWithoutKegChange = async (
    d: DraftDrink,
    targetStatus: 'new' | 'available' | 'low',
  ) => {
    clearSoldOutUndo()
    try {
      await applyImmediate(d, { public_status: targetStatus })
    } catch {
      /* applyImmediate already alerted */
    }
  }

  const confirmSoldOutRecovery = (
    d: DraftDrink,
    targetStatus: 'new' | 'available' | 'low',
  ) => {
    const name = d.display_name || d.name
    const statusLabel = targetStatus === 'new' ? '上新' : targetStatus === 'low' ? '少量' : '在售'
    const message = `「${name}」的上一周期已在标记售罄时结束。\n\n仅恢复供应：从现在开启新的在枪周期，恢复为${statusLabel}，不记录换桶。\n换桶并恢复在售：从现在记录新桶和新的在枪周期，恢复为在售。`

    if (Platform.OS === 'web') {
      setMoreMenu(null)
      setWebKegChangeDialog({
        kind: 'recover',
        drink: d,
        targetStatus,
        title: '如何恢复供应？',
        message,
      })
      return
    }

    Alert.alert(
      '如何恢复供应？',
      message,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '仅恢复供应',
          onPress: () => void resumeSoldOutWithoutKegChange(d, targetStatus),
        },
        {
          text: '换桶并恢复在售',
          onPress: () => void handleKegChange(d, true),
        },
      ],
    )
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

  const openCreateFromPicker = (
    mode: 'recognition' | 'manual',
    asset?: LocalImageAsset,
    targetTapNumber?: number | null,
  ) => {
    setPickerTapNumber(null)
    if (!targetTapNumber || targetTapNumber < 1) {
      Alert.alert('无法确定酒头', '请返回酒单，从目标空酒头重新上酒。')
      return
    }
    setEditorTapNumber(targetTapNumber)
    setEditorRecognitionAsset(mode === 'recognition' ? asset ?? null : null)
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
    setEditorRecognitionAsset(null)
  }

  const replaceEditingDrink = () => {
    const tapNumber = editing?.public_sort_order
    if (!tapNumber) return
    closeEditor()
    openTapPicker(tapNumber)
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
                  {canSwitchStore ? (
                    <TouchableOpacity
                      style={styles.storeSwitcher}
                      onPress={() => router.push('/(tabs)/house/switch-tenant')}
                      activeOpacity={0.72}
                      accessibilityRole="button"
                      accessibilityLabel="切换门店"
                      accessibilityHint={`当前门店：${draft.tenant.display_name || draft.tenant.name}`}
                    >
                      <Text style={[styles.barName, styles.storeSwitcherName]} numberOfLines={1}>
                        {draft.tenant.display_name || draft.tenant.name}
                      </Text>
                      <Ionicons name="chevron-down" size={20} color={T.gold} />
                    </TouchableOpacity>
                  ) : (
                    <Text style={styles.barName} numberOfLines={1}>
                      {draft.tenant.display_name || draft.tenant.name}
                    </Text>
                  )}
                </View>
                <View style={styles.headerActions}>
                  <TouchableOpacity
                    style={styles.shareTonightBtn}
                    onPress={() => setTonightShareOpen(true)}
                    activeOpacity={0.72}
                    accessibilityLabel="导出酒单图片"
                  >
                    <Ionicons name="share-outline" size={21} color={T.gold} />
                    <Text style={styles.shareTonightText}>酒单图片</Text>
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
              onMore={() => {
                if (drink) openMoreMenu(drink)
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
            <Text style={styles.snackbarUndo}>
              {soldOutUndo.previousStatus === 'coming_soon' ? '恢复预告' : '恢复供应'}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <DrinkStatusSheet
        drink={moreMenu}
        busy={!!moreMenu && busyDrinkId === moreMenu.id}
        onClose={() => setMoreMenu(null)}
        onSelectStatus={(status) => {
          const drink = moreMenu
          setMoreMenu(null)
          if (!drink) return
          if (status === 'sold_out') confirmMarkSoldOut(drink)
          else if (
            drink.public_status === 'sold_out' &&
            (status === 'new' || status === 'available')
          ) {
            confirmSoldOutRecovery(drink, status)
          } else if (status === 'new') void markAsNew(drink)
          else if (status === 'coming_soon') void markComingSoon(drink)
          else void markAsAvailable(drink)
        }}
        onToggleVisibility={() => {
          const drink = moreMenu
          setMoreMenu(null)
          if (drink) void applyImmediate(drink, { is_public_visible: !drink.is_public_visible }).catch(() => {})
        }}
        onHistory={() => {
          const drink = moreMenu
          setMoreMenu(null)
          if (drink) setHistoryDrink(drink)
        }}
        onKegChange={() => {
          const drink = moreMenu
          if (drink) void handleKegChange(drink)
        }}
      />
      <Modal
        visible={Platform.OS === 'web' && webKegChangeDialog !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setWebKegChangeDialog(null)}
      >
        <View style={styles.webKegDialogOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setWebKegChangeDialog(null)}
            accessibilityRole="button"
            accessibilityLabel="关闭换桶确认"
          />
          {webKegChangeDialog ? (
            <View style={styles.webKegDialogCard}>
              <Text style={styles.webKegDialogTitle}>{webKegChangeDialog.title}</Text>
              <Text style={styles.webKegDialogMessage}>{webKegChangeDialog.message}</Text>

              {webKegChangeDialog.kind === 'confirm' ? (
                <View style={styles.webKegDialogActions}>
                  <TouchableOpacity
                    style={styles.webKegDialogSecondary}
                    onPress={() => setWebKegChangeDialog(null)}
                    accessibilityRole="button"
                  >
                    <Text style={styles.webKegDialogSecondaryText}>取消</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.webKegDialogPrimary}
                    accessibilityRole="button"
                    onPress={() => {
                      const { drink, pending } = webKegChangeDialog
                      setWebKegChangeDialog(null)
                      void executeKegChange(drink, pending, true)
                    }}
                  >
                    <Text style={styles.webKegDialogPrimaryText}>
                      {webKegChangeDialog.confirmLabel}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : webKegChangeDialog.kind === 'pending' ? (
                <View style={styles.webKegDialogActionsStacked}>
                  <TouchableOpacity
                    style={styles.webKegDialogPrimary}
                    accessibilityRole="button"
                    onPress={() => {
                      const { drink, pending } = webKegChangeDialog
                      setWebKegChangeDialog(null)
                      void executeKegChange(drink, pending, false)
                    }}
                  >
                    <Text style={styles.webKegDialogPrimaryText}>重试上次</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.webKegDialogSecondary}
                    accessibilityRole="button"
                    onPress={() => {
                      const { drink } = webKegChangeDialog
                      setWebKegChangeDialog(null)
                      confirmNewKegChange(drink)
                    }}
                  >
                    <Text style={styles.webKegDialogSecondaryText}>记录新换桶</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.webKegDialogCancel}
                    onPress={() => setWebKegChangeDialog(null)}
                    accessibilityRole="button"
                  >
                    <Text style={styles.webKegDialogCancelText}>取消</Text>
                  </TouchableOpacity>
                </View>
              ) : webKegChangeDialog.kind === 'recover' ? (
                <View style={styles.webKegDialogActionsStacked}>
                  <TouchableOpacity
                    style={styles.webKegDialogPrimary}
                    accessibilityRole="button"
                    onPress={() => {
                      const { drink } = webKegChangeDialog
                      setWebKegChangeDialog(null)
                      void handleKegChange(drink, true)
                    }}
                  >
                    <Text style={styles.webKegDialogPrimaryText}>换桶并恢复在售</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.webKegDialogSecondary}
                    accessibilityRole="button"
                    onPress={() => {
                      const { drink, targetStatus } = webKegChangeDialog
                      setWebKegChangeDialog(null)
                      void resumeSoldOutWithoutKegChange(drink, targetStatus)
                    }}
                  >
                    <Text style={styles.webKegDialogSecondaryText}>仅恢复供应</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.webKegDialogCancel}
                    onPress={() => setWebKegChangeDialog(null)}
                    accessibilityRole="button"
                  >
                    <Text style={styles.webKegDialogCancelText}>取消</Text>
                  </TouchableOpacity>
                </View>
              ) : webKegChangeDialog.kind === 'sold_out' ? (
                <View style={styles.webKegDialogActions}>
                  <TouchableOpacity
                    style={styles.webKegDialogSecondary}
                    onPress={() => setWebKegChangeDialog(null)}
                    accessibilityRole="button"
                  >
                    <Text style={styles.webKegDialogSecondaryText}>取消</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.webKegDialogPrimary}
                    accessibilityRole="button"
                    onPress={() => {
                      const { drink } = webKegChangeDialog
                      setWebKegChangeDialog(null)
                      void markSoldOut(drink)
                    }}
                  >
                    <Text style={styles.webKegDialogPrimaryText}>确认售罄</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.webKegDialogPrimary}
                  onPress={() => setWebKegChangeDialog(null)}
                  accessibilityRole="button"
                >
                  <Text style={styles.webKegDialogPrimaryText}>知道了</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : null}
        </View>
      </Modal>
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
        targetTapNumber={pickerTapNumber}
        onClose={() => setPickerTapNumber(null)}
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
        initialRecognitionAsset={editorRecognitionAsset}
        catalogDrinks={draft.drinks}
        onPickLocalDrink={handlePickLocalDrink}
        onReplaceDrink={!creating && editing?.public_sort_order ? replaceEditingDrink : undefined}
        onClose={closeEditor}
        onSaved={handleEditorSaved}
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
  storeSwitcher: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, maxWidth: '100%' },
  storeSwitcherName: { flexShrink: 1 },
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
  webKegDialogOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: 'rgba(0,0,0,0.68)',
  },
  webKegDialogCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surfaceSolid,
    padding: 22,
    gap: 14,
  },
  webKegDialogTitle: { color: T.text, fontSize: 20, fontWeight: '800' },
  webKegDialogMessage: { color: T.muted, fontSize: 15, lineHeight: 23 },
  webKegDialogActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  webKegDialogActionsStacked: { gap: 10, marginTop: 4 },
  webKegDialogPrimary: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
    paddingHorizontal: 16,
    backgroundColor: T.gold,
  },
  webKegDialogPrimaryText: { color: T.background, fontSize: 15, fontWeight: '800' },
  webKegDialogSecondary: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
    borderWidth: 1,
    borderColor: T.goldBorder,
    paddingHorizontal: 16,
    backgroundColor: T.goldFill,
  },
  webKegDialogSecondaryText: { color: T.goldSoft, fontSize: 15, fontWeight: '700' },
  webKegDialogCancel: {
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  webKegDialogCancelText: { color: T.muted, fontSize: 14, fontWeight: '600' },
})
