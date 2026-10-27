import { useCallback, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from 'expo-router'
import { HouseSubheader } from '../../../components/house/HouseSubheader'
import { Screen, SegmentedControl } from '../../../components/ui'
import { useAuth } from '../../../lib/authProvider'
import {
  listTapLifecycleSessions,
  type TapLifecycleSession,
  type TapLifecycleSessions,
  type TapLifecycleSessionStatus,
} from '../../../lib/tapLifecycleApi'
import { LAYOUT, RADIUS, SPACING, THEME } from '../../../lib/theme'

const SHANGHAI_TIME_ZONE = 'Asia/Shanghai'

const STATUS_OPTIONS: { key: TapLifecycleSessionStatus; label: string }[] = [
  { key: 'completed', label: '已完成' },
  { key: 'active', label: '进行中' },
]

function finiteNumber(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function validDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
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

function formatDateTime(value: string | null | undefined): string | null {
  const date = validDate(value)
  if (!date) return null
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: SHANGHAI_TIME_ZONE,
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
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

function exactDurationSeconds(session: TapLifecycleSession): number | null {
  if (session.accuracy !== 'exact') return null
  const supplied = finiteNumber(session.duration_seconds)
  if (supplied != null && supplied >= 0) return supplied

  const started = validDate(session.started_at)
  if (!started) return null
  const ended = session.state === 'active' ? new Date() : validDate(session.ended_at)
  if (!ended) return null
  const seconds = Math.floor((ended.getTime() - started.getTime()) / 1000)
  return seconds >= 0 ? seconds : null
}

function currentKegDurationSeconds(session: TapLifecycleSession): number | null {
  const supplied = finiteNumber(session.current_keg_duration_seconds)
  if (supplied != null && supplied >= 0) return supplied

  const started = validDate(session.current_keg_started_at)
  if (!started) return null
  const ended = session.state === 'active' ? new Date() : validDate(session.ended_at)
  if (!ended) return null
  const seconds = Math.floor((ended.getTime() - started.getTime()) / 1000)
  return seconds >= 0 ? seconds : null
}

function tapLabel(value: number | null | undefined): string | null {
  const number = finiteNumber(value)
  return number != null && number >= 1 ? `#${number}` : null
}

function endReasonLabel(reason: string | null | undefined): string | null {
  switch (reason) {
    case 'sold_out':
      return '售罄下枪'
    case 'replace':
    case 'replaced':
      return '换酒下枪'
    case 'clear':
    case 'manual_clear':
      return '手动下枪'
    case 'archive':
    case 'archived':
      return '归档下枪'
    default:
      return null
  }
}

function sessionTimeline(session: TapLifecycleSession): string | null {
  const started = formatDateTime(session.started_at)
  const ended = formatDateTime(session.ended_at)

  if (session.accuracy === 'partial_start') {
    return ended ? `${ended} 下枪` : null
  }
  if (started && ended) return `${started} 上枪 · ${ended} 下枪`
  if (started) return `${started} 上枪`
  if (ended) return `${ended} 下枪`
  return null
}

function sortSessions(items: TapLifecycleSession[], status: TapLifecycleSessionStatus): TapLifecycleSession[] {
  const visible = items.filter(
    (item) =>
      item.state === status &&
      (item.accuracy === 'exact' || item.accuracy === 'partial_start'),
  )
  if (status === 'active') {
    return visible.slice().sort((a, b) => {
      const left = finiteNumber(a.current_tap) ?? Number.MAX_SAFE_INTEGER
      const right = finiteNumber(b.current_tap) ?? Number.MAX_SAFE_INTEGER
      return left - right
    })
  }
  return visible.slice().sort((a, b) => {
    const left = validDate(a.ended_at)?.getTime() ?? 0
    const right = validDate(b.ended_at)?.getTime() ?? 0
    return right - left
  })
}

function SessionRow({ session, last }: { session: TapLifecycleSession; last: boolean }) {
  const isPartial = session.accuracy === 'partial_start'
  const tap = tapLabel(session.current_tap)
  const name = session.drink_name?.trim() || '酒款名称未记录'
  const duration = formatDuration(exactDurationSeconds(session))
  const currentKegDuration = formatDuration(currentKegDurationSeconds(session))
  const rawKegChangeCount = finiteNumber(session.keg_change_count)
  const kegChangeCount =
    rawKegChangeCount == null ? null : Math.max(0, Math.floor(rawKegChangeCount))
  const kegSummary =
    kegChangeCount == null
      ? null
      : isPartial
        ? kegChangeCount > 0
          ? `准确记录后换桶 ${kegChangeCount} 次`
          : null
        : `共 ${kegChangeCount + 1} 桶 · 换桶 ${kegChangeCount} 次`
  const timeline = sessionTimeline(session)
  const endReason = session.state === 'completed' ? endReasonLabel(session.end_reason) : null

  return (
    <View style={[styles.sessionRow, !last && styles.sessionRowBorder]}>
      <View style={styles.sessionTopRow}>
        <Text style={styles.sessionName} numberOfLines={2}>
          {tap ? `${tap} · ${name}` : name}
        </Text>
        <View style={[styles.accuracyBadge, isPartial && styles.partialBadge]}>
          <Text style={[styles.accuracyBadgeText, isPartial && styles.partialBadgeText]}>
            {isPartial ? '起点不完整' : '准确周期'}
          </Text>
        </View>
      </View>

      {isPartial ? (
        <>
          <Text style={styles.partialTitle}>记录开始时已在枪</Text>
          <Text style={styles.partialText}>不计算完整在枪时长</Text>
        </>
      ) : (
        <Text style={styles.durationText}>
          {session.state === 'active' ? '已在枪 ' : '在枪 '}
          {duration ?? '—'}
        </Text>
      )}

      {currentKegDuration || kegSummary ? (
        <View style={styles.kegSummary}>
          {currentKegDuration ? (
            <Text style={styles.kegDurationText}>
              {session.state === 'active' ? '本桶 ' : '末桶 '}
              {currentKegDuration}
            </Text>
          ) : null}
          {kegSummary ? <Text style={styles.kegSummaryText}>{kegSummary}</Text> : null}
        </View>
      ) : null}

      {timeline ? <Text style={styles.sessionMeta}>{timeline}</Text> : null}
      {endReason || session.actor_name?.trim() ? (
        <Text style={styles.sessionMeta}>
          {[endReason, session.actor_name?.trim() ? `操作人 ${session.actor_name.trim()}` : null]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      ) : null}
    </View>
  )
}

export default function TapLifecycleSessionsScreen() {
  const { tenantId } = useAuth()
  const [status, setStatus] = useState<TapLifecycleSessionStatus>('completed')
  const [result, setResult] = useState<TapLifecycleSessions | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const requestIdRef = useRef(0)

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current
    if (!tenantId) {
      if (requestId === requestIdRef.current) {
        setResult(null)
        setError('未找到当前门店')
        setLoading(false)
      }
      return
    }

    setLoading(true)
    setError(null)
    try {
      const next = await listTapLifecycleSessions(tenantId, status)
      if (requestId === requestIdRef.current) setResult(next)
    } catch (e) {
      if (requestId === requestIdRef.current) {
        setError(e instanceof Error ? e.message : '加载在枪周期失败')
      }
    } finally {
      if (requestId === requestIdRef.current) setLoading(false)
    }
  }, [status, tenantId])

  useFocusEffect(
    useCallback(() => {
      void load()
      return () => {
        requestIdRef.current += 1
      }
    }, [load]),
  )

  const visibleResult = result?.status === status ? result : null
  const sessions = useMemo(
    () => sortSessions(visibleResult?.items ?? [], status),
    [status, visibleResult?.items],
  )
  const hasPartial = sessions.some((session) => session.accuracy === 'partial_start')
  const dataSince = formatLongDate(visibleResult?.data_since ?? result?.data_since)

  return (
    <Screen scroll contentStyle={styles.screenContent}>
      <HouseSubheader title="在枪周期" />
      <Text style={styles.intro}>一个周期从上枪开始，到下枪结束。只用准确酒头操作计算时长，已完成默认显示近 30 天。</Text>

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

      <View style={styles.segmentWrap}>
        <SegmentedControl segments={STATUS_OPTIONS} value={status} onChange={setStatus} />
      </View>

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

      {loading && !visibleResult ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={THEME.gold} />
        </View>
      ) : null}

      {!loading && visibleResult ? (
        <>
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionTitle}>{status === 'completed' ? '近 30 天已完成周期' : '进行中周期'}</Text>
            <Text style={styles.sectionCount}>{sessions.length} 条</Text>
          </View>

          {hasPartial ? (
            <View style={styles.partialNotice}>
              <Ionicons name="information-circle-outline" size={18} color={THEME.goldSoft} />
              <Text style={styles.partialNoticeText}>
                “起点不完整”表示准确记录开始时该酒已在枪，因此不计算完整时长。
              </Text>
            </View>
          ) : null}

          {sessions.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="time-outline" size={30} color={THEME.faint} />
              <Text style={styles.emptyTitle}>
                {status === 'completed' ? '近 30 天暂无已完成周期' : '当前没有进行中周期'}
              </Text>
              <Text style={styles.emptyText}>
                {status === 'completed'
                  ? '准确记录上枪和下枪后，会在这里形成完整周期。'
                  : '在酒单中完成上枪后，进行中周期会出现在这里。'}
              </Text>
            </View>
          ) : (
            <View style={styles.sessionsCard}>
              {sessions.map((session, index) => (
                <SessionRow
                  key={session.session_id || `${session.drink_id ?? 'drink'}-${index}`}
                  session={session}
                  last={index === sessions.length - 1}
                />
              ))}
            </View>
          )}
        </>
      ) : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  screenContent: { paddingBottom: LAYOUT.listPadBottom },
  intro: { color: THEME.muted, fontSize: 13, lineHeight: 20, marginBottom: SPACING.md },
  dataSinceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.xs,
  },
  dataSinceText: { flex: 1, color: THEME.muted, fontSize: 12, lineHeight: 18 },
  segmentWrap: { marginTop: SPACING.xl },
  loadingWrap: { paddingVertical: 64, alignItems: 'center' },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    padding: SPACING.md,
    marginTop: SPACING.lg,
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
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: SPACING.xl,
    marginBottom: SPACING.sm,
  },
  sectionTitle: { color: THEME.text, fontSize: 17, fontWeight: '700' },
  sectionCount: { color: THEME.faint, fontSize: 12 },
  partialNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    borderWidth: 1,
    borderColor: THEME.goldBorder,
    borderRadius: RADIUS.md,
    backgroundColor: THEME.goldFill,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  partialNoticeText: { flex: 1, color: THEME.textSoft, fontSize: 12, lineHeight: 18 },
  sessionsCard: {
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: THEME.borderFaint,
    backgroundColor: THEME.card,
    overflow: 'hidden',
  },
  sessionRow: { padding: SPACING.lg },
  sessionRowBorder: { borderBottomWidth: 1, borderBottomColor: THEME.borderFaint },
  sessionTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm },
  sessionName: { flex: 1, color: THEME.text, fontSize: 15, lineHeight: 21, fontWeight: '700' },
  accuracyBadge: {
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: 'rgba(123,216,143,0.32)',
    backgroundColor: 'rgba(123,216,143,0.10)',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
  },
  partialBadge: { borderColor: THEME.goldBorder, backgroundColor: THEME.goldFill },
  accuracyBadgeText: { color: THEME.success, fontSize: 11, fontWeight: '700' },
  partialBadgeText: { color: THEME.goldSoft },
  durationText: { color: THEME.goldSoft, fontSize: 20, fontWeight: '800', marginTop: SPACING.md },
  partialTitle: { color: THEME.goldSoft, fontSize: 15, fontWeight: '700', marginTop: SPACING.md },
  partialText: { color: THEME.muted, fontSize: 12, marginTop: 3 },
  kegSummary: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginTop: SPACING.sm },
  kegDurationText: { color: THEME.textSoft, fontSize: 12, fontWeight: '700' },
  kegSummaryText: { color: THEME.muted, fontSize: 12 },
  sessionMeta: { color: THEME.faint, fontSize: 12, lineHeight: 18, marginTop: SPACING.sm },
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
})
