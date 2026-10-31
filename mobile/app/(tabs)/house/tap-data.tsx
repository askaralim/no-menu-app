import { useCallback, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect, useRouter } from 'expo-router'
import { HouseSubheader } from '../../../components/house/HouseSubheader'
import { Screen } from '../../../components/ui'
import { useAuth } from '../../../lib/authProvider'
import {
  getTapLifecycleDashboardPage,
  type TapLifecycleCursor,
  type TapLifecycleOperation,
  type TapLifecycleOverview,
  type TapLifecyclePagination,
} from '../../../lib/tapLifecycleApi'
import { LAYOUT, RADIUS, SPACING, THEME } from '../../../lib/theme'

const SHANGHAI_TIME_ZONE = 'Asia/Shanghai'
const OPERATION_PAGE_SIZE = 20

type OperationVisual = {
  title: string
  detail: string | null
  icon: keyof typeof Ionicons.glyphMap
  color: string
}

type OperationGroup = {
  key: string
  label: string
  items: TapLifecycleOperation[]
}

function finiteNumber(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function validDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function shanghaiDateKey(value: string | Date): string | null {
  const date = typeof value === 'string' ? validDate(value) : value
  if (!date) return null
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: SHANGHAI_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

function formatLongDate(value: string | null | undefined): string | null {
  const date = validDate(value)
  if (!date) return null
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: SHANGHAI_TIME_ZONE,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date)
}

function formatTime(value: string | null | undefined): string | null {
  const date = validDate(value)
  if (!date) return null
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: SHANGHAI_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

function formatGroupLabel(key: string): string {
  const today = shanghaiDateKey(new Date())
  if (key === today) return '今天'

  if (today) {
    const yesterday = new Date(`${today}T00:00:00+08:00`)
    yesterday.setUTCDate(yesterday.getUTCDate() - 1)
    if (key === shanghaiDateKey(yesterday)) return '昨天'
  }

  const date = new Date(`${key}T00:00:00+08:00`)
  if (Number.isNaN(date.getTime())) return key
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: SHANGHAI_TIME_ZONE,
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(date)
}

function formatDuration(seconds: number | null | undefined): string | null {
  const value = finiteNumber(seconds)
  if (value == null || value < 0) return null
  if (value < 60) return '不足1分钟'

  const minutes = Math.floor(value / 60)
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const remainingMinutes = minutes % 60
  if (days > 0) return `${days}天${hours > 0 ? `${hours}小时` : ''}`
  if (hours > 0) return `${hours}小时${remainingMinutes > 0 ? `${remainingMinutes}分钟` : ''}`
  return `${minutes}分钟`
}

function tapLabel(value: number | null | undefined): string | null {
  const number = finiteNumber(value)
  return number != null && number >= 1 ? `#${number}` : null
}

function withTap(label: string, tap: number | null | undefined): string {
  const prefix = tapLabel(tap)
  return prefix ? `${prefix} ${label}` : label
}

function operationDetail(operation: TapLifecycleOperation): string | null {
  if (operation.action === 'replace') {
    const previous = operation.previous_drink_name?.trim()
    const next = operation.next_drink_name?.trim()
    if (previous && next) return `${previous} → ${next}`
    return next || previous || operation.drink_name?.trim() || null
  }

  if (operation.action === 'swap') {
    const previous = operation.previous_drink_name?.trim()
    const next = operation.next_drink_name?.trim()
    if (previous && next) return `${previous} / ${next}`
  }

  return operation.drink_name?.trim() || null
}

function clearLabel(reason: string | null | undefined): string {
  switch (reason) {
    case 'sold_out':
      return '售罄结束'
    case 'archive':
    case 'archived':
      return '归档下枪'
    case 'manual_clear':
      return '手动下枪'
    default:
      return '下枪'
  }
}

function operationVisual(operation: TapLifecycleOperation): OperationVisual {
  const detail = operationDetail(operation)
  switch (operation.action) {
    case 'plan': {
      const from = tapLabel(operation.from_tap)
      const to = tapLabel(operation.to_tap)
      if (!from && to) {
        return { title: `${to} 安排即将上新`, detail, icon: 'time-outline', color: THEME.goldSoft }
      }
      if (from && !to) {
        return { title: `${from} 取消即将上新`, detail, icon: 'close-outline', color: THEME.faint }
      }
      return {
        title: from && to ? `${from} → ${to} 调整预告位置` : '调整即将上新',
        detail,
        icon: 'time-outline',
        color: THEME.goldSoft,
      }
    }
    case 'assign':
      return {
        title: withTap('上枪', operation.to_tap),
        detail,
        icon: 'add-outline',
        color: THEME.success,
      }
    case 'clear':
      return {
        title: withTap(clearLabel(operation.end_reason), operation.from_tap),
        detail,
        icon: 'remove-outline',
        color: THEME.danger,
      }
    case 'replace':
      return {
        title: withTap('换酒', operation.to_tap ?? operation.from_tap),
        detail,
        icon: 'repeat-outline',
        color: THEME.gold,
      }
    case 'move': {
      const from = tapLabel(operation.from_tap)
      const to = tapLabel(operation.to_tap)
      return {
        title: from && to ? `${from} → ${to} 移枪` : '移枪',
        detail,
        icon: 'arrow-forward-outline',
        color: THEME.goldSoft,
      }
    }
    case 'swap': {
      const from = tapLabel(operation.from_tap)
      const to = tapLabel(operation.to_tap)
      return {
        title: from && to ? `${from} ↔ ${to} 调换位置` : '调换位置',
        detail,
        icon: 'swap-horizontal-outline',
        color: THEME.goldSoft,
      }
    }
    case 'sold_out':
      return {
        title: withTap('标记售罄', operation.from_tap ?? operation.to_tap),
        detail,
        icon: 'remove-circle-outline',
        color: THEME.danger,
      }
    case 'reactivate':
      return {
        title: withTap('恢复在售', operation.to_tap ?? operation.from_tap),
        detail,
        icon: 'refresh-outline',
        color: THEME.success,
      }
    case 'archive':
      return {
        title: withTap('归档下枪', operation.from_tap),
        detail,
        icon: 'archive-outline',
        color: THEME.faint,
      }
    case 'keg_change':
      return {
        title: withTap('换桶', operation.to_tap ?? operation.from_tap),
        detail,
        icon: 'reload-outline',
        color: THEME.gold,
      }
    case 'cancel':
      return {
        title: withTap('撤销上枪', operation.from_tap ?? operation.to_tap),
        detail,
        icon: 'arrow-undo-outline',
        color: THEME.faint,
      }
    case 'baseline':
      return {
        title: withTap('记录起点', operation.to_tap ?? operation.from_tap),
        detail,
        icon: 'flag-outline',
        color: THEME.faint,
      }
    default:
      return {
        title: withTap('其他操作', operation.to_tap ?? operation.from_tap),
        detail,
        icon: 'ellipsis-horizontal-outline',
        color: THEME.faint,
      }
  }
}

function groupOperations(operations: TapLifecycleOperation[]): OperationGroup[] {
  const visible = operations
    .filter(
      (operation) =>
        (operation.accuracy === 'exact' || operation.accuracy === 'unclassified') &&
        operation.action !== 'baseline' &&
        validDate(operation.occurred_at) != null,
    )
    .slice()
    .sort(
      (a, b) =>
        (validDate(b.occurred_at)?.getTime() ?? 0) -
        (validDate(a.occurred_at)?.getTime() ?? 0),
    )

  const groups = new Map<string, TapLifecycleOperation[]>()
  for (const operation of visible) {
    const key = shanghaiDateKey(operation.occurred_at)
    if (!key) continue
    const items = groups.get(key) ?? []
    items.push(operation)
    groups.set(key, items)
  }

  return Array.from(groups, ([key, items]) => ({
    key,
    label: formatGroupLabel(key),
    items,
  }))
}

function operationIdentity(operation: TapLifecycleOperation): string {
  const operationId = operation.operation_id?.trim()
  if (operationId) return `id:${operationId}`

  const operationKey = operation.operation_key?.trim()
  if (operationKey) return `key:${operationKey}`

  return [
    operation.occurred_at,
    operation.action,
    operation.from_tap ?? '',
    operation.to_tap ?? '',
    operation.drink_id ?? '',
    operation.previous_drink_id ?? '',
    operation.next_drink_id ?? '',
  ].join('|')
}

function mergeOperations(
  current: TapLifecycleOperation[],
  incoming: TapLifecycleOperation[],
): TapLifecycleOperation[] {
  const seen = new Set(current.map(operationIdentity))
  const merged = current.slice()
  for (const operation of incoming) {
    const key = operationIdentity(operation)
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(operation)
  }
  return merged
}

function MetricCard({ label, value }: { label: string; value: number | null | undefined }) {
  const count = finiteNumber(value)
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <View style={styles.metricValueRow}>
        <Text style={styles.metricValue}>{count == null ? '—' : count}</Text>
        {count == null ? null : <Text style={styles.metricUnit}>次</Text>}
      </View>
    </View>
  )
}

function OperationRow({ operation, last }: { operation: TapLifecycleOperation; last: boolean }) {
  const visual = operationVisual(operation)
  const isUnclassified = operation.accuracy === 'unclassified'
  const time = formatTime(operation.occurred_at)
  const actor = operation.actor_name?.trim()
  const meta = [time, actor ? `操作人【${actor}】` : null].filter(Boolean).join(' · ')
  const duration = formatDuration(operation.duration_seconds)
  const showsDuration =
    !isUnclassified &&
    duration != null &&
    ['clear', 'replace', 'sold_out', 'archive', 'keg_change'].includes(operation.action)

  return (
    <View style={[styles.operationRow, isUnclassified && styles.operationRowMuted, !last && styles.operationRowBorder]}>
      <View style={[styles.operationIcon, { borderColor: isUnclassified ? THEME.border : visual.color }]}>
        <Ionicons name={visual.icon} size={16} color={isUnclassified ? THEME.faint : visual.color} />
      </View>
      <View style={styles.operationBody}>
        <Text style={[styles.operationTitle, isUnclassified && styles.operationTextMuted]}>{visual.title}</Text>
        {visual.detail ? (
          <Text style={[styles.operationDetail, isUnclassified && styles.operationTextMuted]} numberOfLines={2}>
            {visual.detail}
          </Text>
        ) : null}
        {meta ? <Text style={styles.operationMeta}>{meta}</Text> : null}
        {isUnclassified ? (
          <Text style={styles.unclassifiedText}>历史起点不完整 · 不计算相关周期时长</Text>
        ) : null}
        {showsDuration ? (
          <Text style={styles.operationDuration}>
            {operation.action === 'keg_change' ? '上一桶 ' : '在枪 '}
            {duration}
          </Text>
        ) : null}
      </View>
    </View>
  )
}

export default function TapDataScreen() {
  const router = useRouter()
  const { tenantId } = useAuth()
  const [overview, setOverview] = useState<TapLifecycleOverview | null>(null)
  const [pagination, setPagination] = useState<TapLifecyclePagination | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null)
  const requestIdRef = useRef(0)
  const loadingMoreRef = useRef(false)
  const loadedTenantIdRef = useRef<string | null>(null)

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current
    loadingMoreRef.current = false
    setLoadingMore(false)
    setPagination(null)
    setLoadMoreError(null)
    if (!tenantId) {
      if (requestId === requestIdRef.current) {
        loadedTenantIdRef.current = null
        setOverview(null)
        setError('未找到当前门店')
        setLoading(false)
      }
      return
    }

    if (loadedTenantIdRef.current !== tenantId) setOverview(null)

    setLoading(true)
    setError(null)
    try {
      const page = await getTapLifecycleDashboardPage(tenantId, {
        limit: OPERATION_PAGE_SIZE,
        beforeCursor: null,
        includeSummary: true,
      })
      if (!page.summary) throw new Error('酒头数据概览不完整')
      if (requestId === requestIdRef.current) {
        loadedTenantIdRef.current = tenantId
        setOverview({ ...page.summary, operations: page.operations })
        setPagination(page.pagination)
      }
    } catch (e) {
      if (requestId === requestIdRef.current) {
        setError(e instanceof Error ? e.message : '加载酒头数据失败')
      }
    } finally {
      if (requestId === requestIdRef.current) setLoading(false)
    }
  }, [tenantId])

  const loadMore = useCallback(async () => {
    const cursor: TapLifecycleCursor | null = pagination?.next_cursor ?? null
    if (
      !tenantId ||
      loading ||
      loadingMoreRef.current ||
      pagination?.has_more !== true ||
      !cursor
    ) {
      return
    }

    const requestId = requestIdRef.current
    loadingMoreRef.current = true
    setLoadingMore(true)
    setLoadMoreError(null)
    try {
      const page = await getTapLifecycleDashboardPage(tenantId, {
        limit: OPERATION_PAGE_SIZE,
        beforeCursor: cursor,
        includeSummary: false,
      })
      if (requestId !== requestIdRef.current) return

      setOverview((current) =>
        current
          ? { ...current, operations: mergeOperations(current.operations, page.operations) }
          : current,
      )
      setPagination(page.pagination)
    } catch (e) {
      if (requestId === requestIdRef.current) {
        setLoadMoreError(e instanceof Error ? e.message : '加载更多记录失败')
      }
    } finally {
      if (requestId === requestIdRef.current) {
        loadingMoreRef.current = false
        setLoadingMore(false)
      }
    }
  }, [loading, pagination, tenantId])

  useFocusEffect(
    useCallback(() => {
      void load()
      return () => {
        requestIdRef.current += 1
      }
    }, [load]),
  )

  const visibleOverview = loadedTenantIdRef.current === tenantId ? overview : null
  const operationGroups = useMemo(
    () => groupOperations(visibleOverview?.operations ?? []),
    [visibleOverview?.operations],
  )

  const assignedCount = finiteNumber(visibleOverview?.current_on_tap_count)
  const capacityConfirmed = visibleOverview?.tap_count_confirmed === true
  const tapCount = capacityConfirmed ? finiteNumber(visibleOverview?.tap_count) : null
  const emptyTapCount = capacityConfirmed ? finiteNumber(visibleOverview?.empty_tap_count) : null
  const dataSince = formatLongDate(visibleOverview?.data_since)
  const windowDays = finiteNumber(visibleOverview?.window_days) ?? 30

  return (
    <Screen scroll contentStyle={styles.screenContent}>
      <HouseSubheader title="酒头数据" />

      {loading && !visibleOverview ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={THEME.gold} />
        </View>
      ) : null}

      {error ? (
        <View style={styles.errorCard}>
          <Ionicons name="alert-circle-outline" size={20} color={THEME.danger} />
          <View style={styles.errorBody}>
            <Text style={styles.errorTitle}>暂时无法加载</Text>
            <Text style={styles.errorText}>{error}</Text>
          </View>
          <TouchableOpacity onPress={() => void load()} style={styles.retryButton}>
            <Text style={styles.retryText}>重试</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {visibleOverview ? (
        <>
          <View style={styles.currentCard}>
            <Text style={styles.currentLabel}>当前在枪</Text>
            <View style={styles.currentValueRow}>
              <Text style={styles.currentValue}>{assignedCount == null ? '—' : assignedCount}</Text>
              {tapCount == null ? null : <Text style={styles.currentCapacity}> / {tapCount}</Text>}
            </View>
            {tapCount != null && emptyTapCount != null ? (
              <Text style={styles.currentMeta}>空 {emptyTapCount} 个酒头</Text>
            ) : null}

            <View style={styles.currentDivider} />
            <TouchableOpacity
              onPress={() => router.push('/(tabs)/house/tap-sessions' as any)}
              activeOpacity={0.75}
              style={styles.sessionsLink}
              accessibilityRole="button"
              accessibilityLabel="查看在枪周期"
            >
              <View style={styles.sessionsLinkIcon}>
                <Ionicons name="time-outline" size={19} color={THEME.gold} />
              </View>
              <View style={styles.sessionsLinkBody}>
                <Text style={styles.sessionsLinkTitle}>在枪周期</Text>
                <Text style={styles.sessionsLinkText}>查看已完成与进行中的准确周期</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={THEME.faint} />
            </TouchableOpacity>
          </View>

          <View style={styles.dataSinceRow}>
            <Ionicons
              name={dataSince ? 'checkmark-circle-outline' : 'ellipse-outline'}
              size={17}
              color={dataSince ? THEME.success : THEME.faint}
            />
            <Text style={styles.dataSinceText}>
              {dataSince ? `准确记录始于 ${dataSince}` : '准确记录尚未开始'}
            </Text>
          </View>

          <View style={styles.sectionHeading}>
            <Text style={styles.sectionTitle}>近 {windowDays} 天操作</Text>
            <Text style={styles.sectionHint}>仅准确记录</Text>
          </View>
          <View style={styles.metricGrid}>
            <MetricCard label="上枪" value={visibleOverview.counts.assign} />
            <MetricCard label="下枪" value={visibleOverview.counts.clear} />
            <MetricCard label="换酒" value={visibleOverview.counts.replace} />
            <MetricCard label="移枪" value={visibleOverview.counts.move} />
            <MetricCard label="换桶" value={visibleOverview.counts.keg_change} />
          </View>
          <Text style={styles.metricFootnote}>换酒会同时计入一次上枪和一次下枪。</Text>

          <View style={styles.sectionHeading}>
            <Text style={styles.sectionTitle}>操作记录</Text>
            <Text style={styles.sectionHint}>近 {windowDays} 天</Text>
          </View>

          {operationGroups.length === 0 && pagination?.has_more ? (
            <View style={styles.emptyPageCard}>
              <Text style={styles.emptyPageText}>本页没有可显示的准确记录，可继续查看更早操作。</Text>
            </View>
          ) : operationGroups.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="receipt-outline" size={28} color={THEME.faint} />
              <Text style={styles.emptyTitle}>还没有准确操作记录</Text>
              <Text style={styles.emptyText}>在酒单中完成上枪、换酒、换桶、下枪或移枪后，记录会出现在这里。</Text>
            </View>
          ) : (
            operationGroups.map((group) => (
              <View key={group.key} style={styles.operationGroup}>
                <Text style={styles.dateLabel}>{group.label}</Text>
                <View style={styles.ledgerCard}>
                  {group.items.map((operation, index) => (
                    <OperationRow
                      key={operation.operation_id || `${operation.occurred_at}-${index}`}
                      operation={operation}
                      last={index === group.items.length - 1}
                    />
                  ))}
                </View>
              </View>
            ))
          )}

          {pagination && (visibleOverview.operations.length > 0 || pagination.has_more) ? (
            <View style={styles.paginationFooter}>
              {loadingMore ? (
                <View style={styles.paginationLoading}>
                  <ActivityIndicator size="small" color={THEME.gold} />
                  <Text style={styles.paginationText}>正在加载更早记录…</Text>
                </View>
              ) : loadMoreError ? (
                <View style={styles.paginationError}>
                  <Text style={styles.paginationErrorText}>{loadMoreError}</Text>
                  <TouchableOpacity
                    onPress={() => void loadMore()}
                    accessibilityRole="button"
                    accessibilityLabel="重试加载更早记录"
                  >
                    <Text style={styles.paginationRetryText}>重试</Text>
                  </TouchableOpacity>
                </View>
              ) : pagination?.has_more ? (
                <TouchableOpacity
                  onPress={() => void loadMore()}
                  activeOpacity={0.75}
                  style={styles.loadMoreButton}
                  accessibilityRole="button"
                  accessibilityLabel="加载更早记录"
                >
                  <Text style={styles.loadMoreText}>加载更早记录</Text>
                  <Ionicons name="chevron-down" size={16} color={THEME.goldSoft} />
                </TouchableOpacity>
              ) : (
                <Text style={styles.paginationEndText}>已显示近 {windowDays} 天全部记录</Text>
              )}
            </View>
          ) : null}
        </>
      ) : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  screenContent: { paddingBottom: LAYOUT.listPadBottom },
  loadingWrap: { paddingVertical: 64, alignItems: 'center' },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,107,94,0.30)',
    borderRadius: RADIUS.md,
    backgroundColor: 'rgba(255,107,94,0.08)',
  },
  errorBody: { flex: 1 },
  errorTitle: { color: THEME.text, fontSize: 14, fontWeight: '700' },
  errorText: { color: THEME.muted, fontSize: 12, lineHeight: 18, marginTop: 2 },
  retryButton: { paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs },
  retryText: { color: THEME.gold, fontSize: 13, fontWeight: '700' },
  currentCard: {
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: THEME.goldBorder,
    backgroundColor: THEME.card,
    padding: SPACING.lg,
  },
  currentLabel: { color: THEME.muted, fontSize: 13, fontWeight: '600' },
  currentValueRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: SPACING.xs },
  currentValue: { color: THEME.text, fontSize: 42, lineHeight: 48, fontWeight: '800' },
  currentCapacity: { color: THEME.faint, fontSize: 22, fontWeight: '600' },
  currentMeta: { color: THEME.goldSoft, fontSize: 13, marginTop: 2 },
  currentDivider: { height: 1, backgroundColor: THEME.borderFaint, marginVertical: SPACING.lg },
  sessionsLink: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  sessionsLinkIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: THEME.goldBorder,
    backgroundColor: THEME.goldFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sessionsLinkBody: { flex: 1 },
  sessionsLinkTitle: { color: THEME.text, fontSize: 15, fontWeight: '700' },
  sessionsLinkText: { color: THEME.muted, fontSize: 12, marginTop: 2 },
  dataSinceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.md,
    paddingHorizontal: SPACING.xs,
  },
  dataSinceText: { flex: 1, color: THEME.muted, fontSize: 12, lineHeight: 18 },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: SPACING.xl,
    marginBottom: SPACING.sm,
  },
  sectionTitle: { color: THEME.text, fontSize: 17, fontWeight: '700' },
  sectionHint: { color: THEME.faint, fontSize: 12 },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  metricCard: {
    width: '48.5%',
    minHeight: 92,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: THEME.borderFaint,
    backgroundColor: THEME.surface,
    padding: SPACING.md,
    justifyContent: 'space-between',
  },
  metricLabel: { color: THEME.muted, fontSize: 13, fontWeight: '600' },
  metricValueRow: { flexDirection: 'row', alignItems: 'baseline' },
  metricValue: { color: THEME.text, fontSize: 28, fontWeight: '800' },
  metricUnit: { color: THEME.faint, fontSize: 12, marginLeft: SPACING.xs },
  metricFootnote: { color: THEME.faint, fontSize: 11, lineHeight: 17, marginTop: SPACING.sm },
  operationGroup: { marginBottom: SPACING.lg },
  dateLabel: {
    color: THEME.goldSoft,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: SPACING.sm,
  },
  ledgerCard: {
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: THEME.borderFaint,
    backgroundColor: THEME.card,
    overflow: 'hidden',
  },
  operationRow: { flexDirection: 'row', gap: SPACING.md, padding: SPACING.lg },
  operationRowMuted: { opacity: 0.66 },
  operationRowBorder: { borderBottomWidth: 1, borderBottomColor: THEME.borderFaint },
  operationIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: THEME.surfaceMuted,
  },
  operationBody: { flex: 1, minWidth: 0 },
  operationTitle: { color: THEME.text, fontSize: 15, fontWeight: '700' },
  operationDetail: { color: THEME.textSoft, fontSize: 14, lineHeight: 20, marginTop: 3 },
  operationTextMuted: { color: THEME.muted },
  operationMeta: { color: THEME.faint, fontSize: 12, marginTop: SPACING.xs },
  unclassifiedText: { color: THEME.goldSoft, fontSize: 12, marginTop: SPACING.xs },
  operationDuration: { color: THEME.goldSoft, fontSize: 12, fontWeight: '600', marginTop: SPACING.xs },
  emptyCard: {
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.xxl,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: THEME.borderFaint,
    backgroundColor: THEME.surfaceMuted,
  },
  emptyTitle: { color: THEME.text, fontSize: 15, fontWeight: '700', marginTop: SPACING.md },
  emptyText: { color: THEME.muted, fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: SPACING.sm },
  emptyPageCard: {
    padding: SPACING.lg,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: THEME.borderFaint,
    backgroundColor: THEME.surfaceMuted,
  },
  emptyPageText: { color: THEME.muted, fontSize: 13, lineHeight: 20, textAlign: 'center' },
  paginationFooter: { alignItems: 'center', minHeight: 48, justifyContent: 'center' },
  paginationLoading: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  paginationText: { color: THEME.muted, fontSize: 12 },
  paginationError: { alignItems: 'center', gap: SPACING.xs },
  paginationErrorText: { color: THEME.danger, fontSize: 12, textAlign: 'center' },
  paginationRetryText: { color: THEME.gold, fontSize: 13, fontWeight: '700' },
  loadMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    minHeight: 40,
    paddingHorizontal: SPACING.xl,
  },
  loadMoreText: { color: THEME.goldSoft, fontSize: 13, fontWeight: '600' },
  paginationEndText: { color: THEME.faint, fontSize: 12 },
})
