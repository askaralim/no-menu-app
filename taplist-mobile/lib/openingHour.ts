export type OpeningHourJson = {
  open: string
  close: string
}

type AmPm = 'AM' | 'PM'

function pad2(n: number) {
  return String(n).padStart(2, '0')
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

function formatHmEn(hm: string): string | null {
  const parsed = parseHm(hm)
  if (!parsed) return null
  const { hour12, period } = from24h(parsed.hour)
  const suffix = period.toLowerCase()
  if (parsed.minute === 0) return `${hour12} ${suffix}`
  return `${hour12}:${pad2(parsed.minute)} ${suffix}`
}

/** e.g. `2 pm - 2 am` (lowercase am/pm, omits `:00` minutes) */
export function formatOpeningHourLabel(value: OpeningHourJson | null | undefined): string | null {
  if (!value?.open || !value?.close) return null
  const open = formatHmEn(value.open)
  const close = formatHmEn(value.close)
  if (!open || !close) return null
  return `${open} - ${close}`
}
