import { supabase } from './supabase'
import {
  uploadEventImageFromAsset,
  type LocalImageAsset,
} from './taplistMedia'

export type BarEventStatus = 'scheduled' | 'cancelled'

export type BarEventRow = {
  id: string
  tenant_id: string
  title: string
  subtitle: string | null
  description: string | null
  event_type: string
  image_url: string | null
  start_at: string | null
  end_at: string | null
  visible_until_at: string | null
  date_label: string | null
  time_label: string | null
  status: BarEventStatus
  is_public_visible: boolean
  sort_order: number
  created_at?: string
  updated_at?: string
}

/** POS form payload before mapping into bar_events columns. */
export type BarEventSaveInput = {
  id?: string
  title: string
  subtitle?: string
  description?: string
  event_type: string
  image_url?: string | null
  /** YYYY-MM-DD in Asia/Shanghai calendar, optional */
  startDate?: string | null
  /** YYYY-MM-DD in Asia/Shanghai calendar, optional */
  endDate?: string | null
  /** Free-text slot like 18:00–24:00 */
  timeLabel?: string | null
  is_public_visible: boolean
}

export const POS_EVENT_TYPES = [
  { value: 'party', label: '店庆/派对' },
  { value: 'other', label: '畅饮/其他' },
  { value: 'dj', label: 'DJ·音乐' },
  { value: 'tap_takeover', label: '酒厂活动' },
  { value: 'happy_hour', label: '欢乐时段' },
  { value: 'tasting', label: '品鉴' },
  { value: 'guest_shift', label: 'Guest Shift' },
  { value: 'new_tap', label: '新酒上架' },
  { value: 'live_music', label: 'Live Music' },
  { value: 'quiz', label: 'Quiz Night' },
] as const

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function newEventId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export function isEvergreenEvent(row: Pick<BarEventRow, 'start_at' | 'end_at' | 'visible_until_at'>) {
  return row.start_at == null && row.end_at == null && row.visible_until_at == null
}

export function isEventExpired(row: Pick<BarEventRow, 'start_at' | 'end_at' | 'visible_until_at'>) {
  if (isEvergreenEvent(row)) return false
  const boundary =
    row.visible_until_at ||
    row.end_at ||
    (row.start_at ? new Date(new Date(row.start_at).getTime() + 18 * 60 * 60 * 1000).toISOString() : null)
  if (!boundary) return false
  return new Date(boundary).getTime() < Date.now()
}

export function eventTypeLabel(type: string): string {
  const hit = POS_EVENT_TYPES.find((t) => t.value === type)
  return hit?.label || type || '活动'
}

export function shanghaiTodayYmd(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

export function toShanghaiYmd(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

function shanghaiDayStartIso(ymd: string): string {
  return new Date(`${ymd}T00:00:00+08:00`).toISOString()
}

function shanghaiDayEndIso(ymd: string): string {
  return new Date(`${ymd}T23:59:59.999+08:00`).toISOString()
}

function formatDateLabel(startYmd: string, endYmd: string): string {
  const [, m1, d1] = startYmd.split('-').map((x) => Number(x))
  if (startYmd === endYmd) return `${m1}月${d1}日`
  const [, m2, d2] = endYmd.split('-').map((x) => Number(x))
  return `${m1}月${d1}日–${m2}月${d2}日`
}

function assertYmd(value: string, label: string) {
  if (!DATE_RE.test(value)) {
    throw new Error(`${label}格式应为 YYYY-MM-DD`)
  }
}

export async function listBarEvents(tenantId: string): Promise<BarEventRow[]> {
  const { data, error } = await supabase
    .from('bar_events')
    .select('*')
    .eq('tenant_id', tenantId)
    .neq('status', 'cancelled')
    .order('is_public_visible', { ascending: false })
    .order('start_at', { ascending: true, nullsFirst: false })
    .order('updated_at', { ascending: false })

  if (error) throw new Error(error.message || '加载活动失败')
  return (data || []) as BarEventRow[]
}

export async function getBarEvent(tenantId: string, eventId: string): Promise<BarEventRow | null> {
  const { data, error } = await supabase
    .from('bar_events')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('id', eventId)
    .maybeSingle()

  if (error) throw new Error(error.message || '加载活动失败')
  return (data as BarEventRow | null) ?? null
}

export function buildBarEventPayload(
  tenantId: string,
  input: BarEventSaveInput,
): Omit<BarEventRow, 'created_at' | 'updated_at'> {
  const title = input.title.trim()
  if (!title) throw new Error('请填写活动标题')

  const startDate = input.startDate?.trim() || ''
  const endDate = input.endDate?.trim() || startDate
  const hasDates = Boolean(startDate)

  if (hasDates) {
    assertYmd(startDate, '开始日期')
    assertYmd(endDate, '结束日期')
    if (endDate < startDate) throw new Error('结束日期不能早于开始日期')
  }

  if (input.is_public_visible && !input.image_url?.trim()) {
    throw new Error('公开活动需要上传海报图')
  }

  const start_at = hasDates ? shanghaiDayStartIso(startDate) : null
  const end_at = hasDates ? shanghaiDayEndIso(endDate) : null
  const visible_until_at = end_at
  const date_label = hasDates ? formatDateLabel(startDate, endDate) : null
  const time_label = input.timeLabel?.trim() || null

  return {
    id: input.id || newEventId(),
    tenant_id: tenantId,
    title,
    subtitle: input.subtitle?.trim() || null,
    description: input.description?.trim() || null,
    event_type: input.event_type || 'other',
    image_url: input.image_url?.trim() || null,
    start_at,
    end_at,
    visible_until_at,
    date_label,
    time_label,
    status: 'scheduled',
    is_public_visible: input.is_public_visible,
    sort_order: 0,
  }
}

export async function saveBarEvent(tenantId: string, input: BarEventSaveInput): Promise<BarEventRow> {
  const payload = buildBarEventPayload(tenantId, input)

  if (input.id) {
    const existing = await getBarEvent(tenantId, input.id)
    if (existing) {
      payload.sort_order = existing.sort_order ?? 0
      if (existing.status === 'cancelled') {
        payload.status = 'scheduled'
      } else {
        payload.status = existing.status
      }
    }
  }

  const { data, error } = await supabase
    .from('bar_events')
    .upsert(payload, { onConflict: 'id' })
    .select('*')
    .single()

  if (error) throw new Error(error.message || '保存活动失败')
  return data as BarEventRow
}

export async function setBarEventPublicVisible(
  tenantId: string,
  eventId: string,
  visible: boolean,
): Promise<void> {
  if (visible) {
    const existing = await getBarEvent(tenantId, eventId)
    if (!existing) throw new Error('活动不存在')
    if (!existing.image_url?.trim()) throw new Error('公开活动需要上传海报图')
  }

  const { error } = await supabase
    .from('bar_events')
    .update({ is_public_visible: visible })
    .eq('tenant_id', tenantId)
    .eq('id', eventId)

  if (error) throw new Error(error.message || '更新公开状态失败')
}

/** Soft-delete: mark cancelled + unpublish. Never hard-deletes the row. */
export async function softDeleteBarEvent(tenantId: string, eventId: string): Promise<void> {
  const { error } = await supabase
    .from('bar_events')
    .update({ status: 'cancelled', is_public_visible: false })
    .eq('tenant_id', tenantId)
    .eq('id', eventId)
    .neq('status', 'cancelled')

  if (error) throw new Error(error.message || '删除活动失败')
}

/**
 * Force YYYY-MM-DD while typing: digits only, auto-insert dashes.
 * Max 8 digits → 2026-08-04.
 */
export function maskYmdInput(raw: string): string {
  const digits = String(raw || '')
    .replace(/\D/g, '')
    .slice(0, 8)
  if (digits.length <= 4) return digits
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`
}

export async function uploadBarEventImage(
  tenantId: string,
  eventId: string,
  asset: LocalImageAsset,
): Promise<string> {
  return uploadEventImageFromAsset(tenantId, eventId, asset)
}

export function summarizeEvents(rows: BarEventRow[]): { showing: number; draft: number } {
  let showing = 0
  let draft = 0
  for (const row of rows) {
    if (row.status === 'cancelled') continue
    if (row.is_public_visible && !isEventExpired(row)) showing += 1
    else draft += 1
  }
  return { showing, draft }
}
