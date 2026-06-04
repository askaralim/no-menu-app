import type { PublicBarRow, PublicBarStatusCounts, PublicDrinkRow, PublicServingOption } from '@/lib/types'

const STATUS_DISPLAY_ORDER: (keyof PublicBarStatusCounts)[] = ['在售', '上新', '少量', '售罄', '即将上新']

/** Compact line for Tonight feed, e.g. "3 在售 · 1 上新" */
export function formatBarStatusSummary(counts?: PublicBarStatusCounts | null) {
  if (!counts) return null

  const parts = STATUS_DISPLAY_ORDER.filter((label) => (counts[label] ?? 0) > 0).map(
    (label) => `${counts[label]} ${label}`
  )

  if (parts.length === 0) return '暂无公开酒款'
  return parts.join(' · ')
}

export function formatRelativeUpdatedAt(value?: string | null): string | null {
  if (!value) return null
  const then = new Date(value).getTime()
  if (Number.isNaN(then)) return null

  const diffMs = Date.now() - then
  if (diffMs < 0) return null

  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return '刚刚更新'
  if (minutes < 60) return `${minutes} 分钟前更新`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前更新`

  const days = Math.floor(hours / 24)
  if (days === 1) return '昨天更新'
  if (days < 7) return `${days} 天前更新`

  return null
}

/** Tonight feed status chips: 正在供应、今晚 N 款上新、相对更新时间 */
export function formatBarFeedLabels(bar: PublicBarRow): string[] {
  const labels: string[] = []
  const onTap = bar.status_counts?.在售 ?? 0
  const newCount = bar.status_counts?.上新 ?? 0

  if (onTap > 0) labels.push('在售' + onTap)
  if (newCount > 0) labels.push('上新' + newCount)

  return labels
}

export function formatServing(option?: PublicServingOption | null) {
  if (!option) return null

  const parts = servingParts(option)
  return parts.length > 0 ? parts.join(' · ') : null
}

export function defaultServing(drink: PublicDrinkRow) {
  const visibleOptions = displayServingOptions(drink.serving_options)

  return (
    visibleOptions.find((option) => option.is_default) ??
    visibleOptions[0] ??
    null
  )
}

export function displayServingOptions(options: PublicServingOption[]) {
  const seen = new Set<string>()

  return options
    .filter((option) => option.is_active && option.price > 0)
    .filter((option) => {
      const key = `${option.label || option.serving_type}:${option.volume_ml ?? 'unknown'}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

export function beerStyleLine(drink: PublicDrinkRow) {
  return [drink.beer?.beer_style, typeof drink.beer?.abv === 'number' ? `${drink.beer.abv}%` : null]
    .filter(Boolean)
    .join(' · ')
}

export function menuUpdatedLabel(value?: string | null) {
  if (!value) return '酒单更新 · 待同步'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '酒单更新 · 待同步'

  return `酒单更新 · ${date.toLocaleDateString('zh-CN')}`
}

function localizeServingLabel(label: string) {
  const normalized = label.toLowerCase()
  const labels: Record<string, string> = {
    small: '小杯',
    medium: '标准杯',
    large: '大杯',
    pint: '品脱',
    glass: '杯装',
    bottle: '瓶装',
    can: '罐装',
    tulip: '郁金香杯',
  }

  return labels[normalized] ?? label
}

export function servingParts(option: Pick<PublicServingOption, 'label' | 'serving_type' | 'volume_ml' | 'price'>) {
  const label = option.label || option.serving_type
  return [
    label ? localizeServingLabel(label) : null,
    option.volume_ml ? `${option.volume_ml}ml` : null,
    option.price > 0 ? `¥${option.price}` : null,
  ].filter((part): part is string => Boolean(part))
}

/** Tonight feed order: matches `get_public_taplist_bars` (`ORDER BY last_menu_updated_at DESC NULLS LAST`). */
export function sortPublicBarsByMenuUpdated(bars: PublicBarRow[]): PublicBarRow[] {
  return [...bars].sort((a, b) => {
    const ta = a.last_menu_updated_at ? new Date(a.last_menu_updated_at).getTime() : null
    const tb = b.last_menu_updated_at ? new Date(b.last_menu_updated_at).getTime() : null
    if (ta === null && tb === null) return 0
    if (ta === null) return 1
    if (tb === null) return -1
    if (Number.isNaN(ta) && Number.isNaN(tb)) return 0
    if (Number.isNaN(ta)) return 1
    if (Number.isNaN(tb)) return -1
    return tb - ta
  })
}
