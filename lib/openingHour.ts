/** Stored on `tenants.opening_hour` — daily hours in 24h `HH:mm`. */
export type OpeningHourJson = {
  open: string
  close: string
}

export type AmPm = 'AM' | 'PM'

export type OpeningHourPicker = {
  fromHour: string
  fromMinute: string
  fromPeriod: AmPm
  toHour: string
  toMinute: string
  toPeriod: AmPm
}

export const OPENING_HOUR_MINUTES = ['00', '15', '30', '45'] as const
export const OPENING_HOUR_HOURS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'] as const

export const DEFAULT_OPENING_HOUR_PICKER: OpeningHourPicker = {
  fromHour: '5',
  fromMinute: '00',
  fromPeriod: 'PM',
  toHour: '2',
  toMinute: '00',
  toPeriod: 'AM',
}

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function to24h(hour12: number, period: AmPm): number {
  if (hour12 < 1 || hour12 > 12) return 0
  if (period === 'AM') return hour12 === 12 ? 0 : hour12
  return hour12 === 12 ? 12 : hour12 + 12
}

function from24h(hour24: number): { hour12: number; period: AmPm } {
  const h = ((hour24 % 24) + 24) % 24
  if (h === 0) return { hour12: 12, period: 'AM' }
  if (h < 12) return { hour12: h, period: 'AM' }
  if (h === 12) return { hour12: 12, period: 'PM' }
  return { hour12: h - 12, period: 'PM' }
}

function parseHm(value: string): { hour: number; minute: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null
  return { hour, minute }
}

export function pickerToOpeningHourJson(picker: OpeningHourPicker): OpeningHourJson | null {
  const fromH = Number(picker.fromHour)
  const fromM = Number(picker.fromMinute)
  const toH = Number(picker.toHour)
  const toM = Number(picker.toMinute)
  if (!fromH || !toH) return null

  return {
    open: `${pad2(to24h(fromH, picker.fromPeriod))}:${pad2(fromM)}`,
    close: `${pad2(to24h(toH, picker.toPeriod))}:${pad2(toM)}`,
  }
}

export function openingHourJsonToPicker(value: unknown): OpeningHourPicker {
  if (!value || typeof value !== 'object') return { ...DEFAULT_OPENING_HOUR_PICKER }

  const row = value as Record<string, unknown>
  const open = typeof row.open === 'string' ? parseHm(row.open) : null
  const close = typeof row.close === 'string' ? parseHm(row.close) : null
  if (!open || !close) return { ...DEFAULT_OPENING_HOUR_PICKER }

  const from = from24h(open.hour)
  const to = from24h(close.hour)

  return {
    fromHour: String(from.hour12),
    fromMinute: pad2(open.minute),
    fromPeriod: from.period,
    toHour: String(to.hour12),
    toMinute: pad2(close.minute),
    toPeriod: to.period,
  }
}

function formatHmZh(hm: string): string {
  const parsed = parseHm(hm)
  if (!parsed) return hm
  const { hour12, period } = from24h(parsed.hour)
  const periodZh = period === 'AM' ? '上午' : '下午'
  return `${periodZh} ${hour12}:${pad2(parsed.minute)}`
}

export function formatOpeningHourLabel(value: OpeningHourJson | null | undefined): string | null {
  if (!value?.open || !value?.close) return null

  const open = parseHm(value.open)
  const close = parseHm(value.close)
  if (!open || !close) return null

  const openMins = open.hour * 60 + open.minute
  const closeMins = close.hour * 60 + close.minute
  const crossesMidnight = closeMins <= openMins
  const closeLabel = crossesMidnight ? `次日 ${formatHmZh(value.close)}` : formatHmZh(value.close)

  return `${formatHmZh(value.open)} – ${closeLabel}`
}
