export type OpeningHourJson = {
  open: string
  close: string
  closes_next_day?: boolean
}

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function parseHm(value: string): { hour: number; minute: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null
  return { hour, minute }
}

function formatHm24(hm: string): string | null {
  const parsed = parseHm(hm)
  if (!parsed) return null
  return `${pad2(parsed.hour)}:${pad2(parsed.minute)}`
}

/** e.g. `16:00–01:00` */
export function formatOpeningHourLabel(value: OpeningHourJson | null | undefined): string | null {
  if (!value?.open || !value?.close) return null
  const open = formatHm24(value.open)
  const close = formatHm24(value.close)
  if (!open || !close) return null
  return `${open}–${close}`
}

export function formatOpeningStatusLabel(value: {
  opening_hour?: OpeningHourJson | null
  is_open_now?: boolean | null
}, language: 'zh' | 'en' = 'zh'): string | null {
  const range = formatOpeningHourLabel(value.opening_hour)
  if (value.is_open_now === true) {
    const status = language === 'en' ? 'Open now' : '营业中'
    return range ? `${status} · ${range}` : status
  }
  if (value.is_open_now === false) {
    const status = language === 'en' ? 'Closed' : '已打烊'
    return range ? `${status} · ${range}` : status
  }
  return range
}

export function formatRoadmapHoursLabel(stop: {
  isOpenNow?: boolean | null
  todayOpensAt?: string | null
  todayClosesAt?: string | null
  opensLaterToday?: boolean | null
}, language: 'zh' | 'en' = 'zh'): string | null {
  if (stop.isOpenNow == null && !stop.todayOpensAt && !stop.todayClosesAt) return null

  const range = formatOpeningHourLabel(
    stop.todayOpensAt && stop.todayClosesAt
      ? { open: stop.todayOpensAt, close: stop.todayClosesAt }
      : null,
  )

  if (stop.isOpenNow === true) {
    const status = language === 'en' ? 'Open now' : '营业中'
    return range ? `${status} · ${range}` : status
  }
  if (stop.opensLaterToday === true) {
    const open = stop.todayOpensAt ? formatHm24(stop.todayOpensAt) : null
    if (!open) return range
    return language === 'en' ? `Opens at ${open}` : `${open} 营业`
  }
  return range
}
