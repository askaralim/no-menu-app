import { supabase } from './supabase'

export type TapLifecycleAction =
  | 'assign'
  | 'replace'
  | 'clear'
  | 'move'
  | 'swap'
  | 'sold_out'
  | 'reactivate'
  | 'archive'
  | 'baseline'

export type TapLifecycleAccuracy = 'exact' | 'partial_start' | 'unclassified'
export type TapLifecycleSessionStatus = 'completed' | 'active'

export type TapLifecycleOperation = {
  operation_id: string
  action: TapLifecycleAction
  occurred_at: string
  actor_name: string | null
  from_tap: number | null
  to_tap: number | null
  drink_id: string | null
  drink_name: string | null
  previous_drink_id: string | null
  previous_drink_name: string | null
  next_drink_id: string | null
  next_drink_name: string | null
  duration_seconds: number | null
  accuracy: TapLifecycleAccuracy | null
  end_reason: string | null
}

export type TapLifecycleCounts = {
  assign: number | null
  clear: number | null
  replace: number | null
  move: number | null
}

export type TapLifecycleOverview = {
  ok: true
  data_since: string | null
  window_days: number | null
  tap_count: number | null
  tap_count_confirmed: boolean
  current_on_tap_count: number | null
  empty_tap_count: number | null
  counts: TapLifecycleCounts
  operations: TapLifecycleOperation[]
}

export type TapLifecycleSession = {
  session_id: string
  drink_id: string | null
  drink_name: string | null
  state: TapLifecycleSessionStatus
  accuracy: TapLifecycleAccuracy
  current_tap: number | null
  started_at: string | null
  ended_at: string | null
  duration_seconds: number | null
  end_reason: string | null
  actor_name: string | null
}

export type TapLifecycleSessions = {
  ok: true
  data_since: string | null
  status: TapLifecycleSessionStatus
  items: TapLifecycleSession[]
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function rpcMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>
    return nullableString(record.message) ?? nullableString(record.error) ?? fallback
  }
  return fallback
}

/** Exact tap activity for the current wall plus the rolling 30-day ledger. */
export async function getTapLifecycleOverview(tenantId: string): Promise<TapLifecycleOverview> {
  const { data, error } = await supabase.rpc('get_tap_lifecycle_overview', {
    p_tenant_id: tenantId,
  })
  if (error) throw new Error(error.message || '加载酒头数据失败')

  const payload = data as Record<string, unknown> | null
  if (!payload || payload.ok !== true) {
    throw new Error(rpcMessage(payload, '加载酒头数据失败'))
  }

  const rawCounts =
    payload.counts && typeof payload.counts === 'object'
      ? (payload.counts as Record<string, unknown>)
      : {}

  return {
    ok: true,
    data_since: nullableString(payload.data_since),
    window_days: finiteNumber(payload.window_days),
    tap_count: finiteNumber(payload.tap_count),
    tap_count_confirmed: payload.tap_count_confirmed === true,
    current_on_tap_count: finiteNumber(payload.current_on_tap_count),
    empty_tap_count: finiteNumber(payload.empty_tap_count),
    counts: {
      assign: finiteNumber(rawCounts.assign),
      clear: finiteNumber(rawCounts.clear),
      replace: finiteNumber(rawCounts.replace),
      move: finiteNumber(rawCounts.move),
    },
    operations: Array.isArray(payload.operations)
      ? (payload.operations as TapLifecycleOperation[])
      : [],
  }
}

/** Completed or currently open tap sessions. Partial-start sessions never imply a start time. */
export async function listTapLifecycleSessions(
  tenantId: string,
  status: TapLifecycleSessionStatus,
): Promise<TapLifecycleSessions> {
  const { data, error } = await supabase.rpc('list_tap_lifecycle_sessions', {
    p_tenant_id: tenantId,
    p_status: status,
  })
  if (error) throw new Error(error.message || '加载在枪周期失败')

  const payload = data as Record<string, unknown> | null
  if (!payload || payload.ok !== true) {
    throw new Error(rpcMessage(payload, '加载在枪周期失败'))
  }

  return {
    ok: true,
    data_since: nullableString(payload.data_since),
    status,
    items: Array.isArray(payload.items) ? (payload.items as TapLifecycleSession[]) : [],
  }
}
