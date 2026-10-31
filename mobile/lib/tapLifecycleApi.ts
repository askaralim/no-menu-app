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
  | 'keg_change'
  | 'cancel'
  | 'plan'
  | 'baseline'
  | (string & {})

export type TapLifecycleAccuracy = 'exact' | 'partial_start' | 'unclassified'
export type TapLifecycleSessionStatus = 'completed' | 'active'

export type TapLifecycleOperation = {
  operation_id: string
  operation_key?: string | null
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
  keg_change: number | null
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

export type TapLifecycleCursor = {
  occurred_at: string
  operation_key: string
}

export type TapLifecyclePagination = {
  page_size: number | null
  has_more: boolean
  next_cursor: TapLifecycleCursor | null
}

export type TapLifecycleSummary = Omit<TapLifecycleOverview, 'operations'>

export type TapLifecycleDashboardPage = {
  ok: true
  summary: TapLifecycleSummary | null
  operations: TapLifecycleOperation[]
  pagination: TapLifecyclePagination
}

export type TapLifecycleSession = {
  session_id: string
  drink_id: string | null
  drink_name: string | null
  brewery_name: string | null
  state: TapLifecycleSessionStatus
  accuracy: TapLifecycleAccuracy
  current_tap: number | null
  started_at: string | null
  ended_at: string | null
  duration_seconds: number | null
  end_reason: string | null
  actor_name: string | null
  keg_change_count: number | null
  current_keg_started_at: string | null
  current_keg_duration_seconds: number | null
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
      keg_change: finiteNumber(rawCounts.keg_change),
    },
    operations: Array.isArray(payload.operations)
      ? (payload.operations as TapLifecycleOperation[])
      : [],
  }
}

/** One cursor-paginated page of the dashboard ledger. Summary fields are only requested on page one. */
export async function getTapLifecycleDashboardPage(
  tenantId: string,
  {
    limit = 20,
    beforeCursor = null,
    includeSummary = beforeCursor == null,
  }: {
    limit?: number
    beforeCursor?: TapLifecycleCursor | null
    includeSummary?: boolean
  } = {},
): Promise<TapLifecycleDashboardPage> {
  const { data, error } = await supabase.rpc('get_tap_lifecycle_dashboard_page', {
    p_tenant_id: tenantId,
    p_limit: limit,
    p_before_occurred_at: beforeCursor?.occurred_at ?? null,
    p_before_operation_key: beforeCursor?.operation_key ?? null,
    p_include_summary: includeSummary,
  })
  if (error) throw new Error(error.message || '加载酒头数据失败')

  const payload = data as Record<string, unknown> | null
  if (!payload || payload.ok !== true) {
    throw new Error(rpcMessage(payload, '加载酒头数据失败'))
  }

  const rawPagination =
    payload.pagination && typeof payload.pagination === 'object'
      ? (payload.pagination as Record<string, unknown>)
      : {}
  const rawCursor =
    rawPagination.next_cursor && typeof rawPagination.next_cursor === 'object'
      ? (rawPagination.next_cursor as Record<string, unknown>)
      : null
  const cursorOccurredAt = rawCursor ? nullableString(rawCursor.occurred_at) : null
  const cursorOperationKey = rawCursor ? nullableString(rawCursor.operation_key) : null
  const nextCursor =
    cursorOccurredAt && cursorOperationKey
      ? { occurred_at: cursorOccurredAt, operation_key: cursorOperationKey }
      : null
  const hasMore = rawPagination.has_more === true

  if (hasMore && !nextCursor) {
    throw new Error('分页数据不完整，请重试')
  }

  const rawCounts =
    payload.counts && typeof payload.counts === 'object'
      ? (payload.counts as Record<string, unknown>)
      : {}

  return {
    ok: true,
    summary: includeSummary
      ? {
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
            keg_change: finiteNumber(rawCounts.keg_change),
          },
        }
      : null,
    operations: Array.isArray(payload.operations)
      ? (payload.operations as TapLifecycleOperation[])
      : [],
    pagination: {
      page_size: finiteNumber(rawPagination.page_size),
      has_more: hasMore,
      next_cursor: nextCursor,
    },
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
