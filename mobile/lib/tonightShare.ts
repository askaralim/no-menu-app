import type { DraftDrink, TaplistDraft } from './taplistOwnerApi'

export const TONIGHT_SHARE_MAX_DRINKS = 5

export function defaultTonightShareDrinkIds(drinks: DraftDrink[]): string[] {
  const markedNew = drinks.filter((drink) => drink.public_status === 'new')
  return (markedNew.length ? markedNew : drinks)
    .slice(0, TONIGHT_SHARE_MAX_DRINKS)
    .map((drink) => drink.id)
}

export function shareableTonightDrinks(draft: TaplistDraft): DraftDrink[] {
  return draft.drinks
    .filter(
      (drink) =>
        drink.enabled &&
        drink.is_public_visible &&
        drink.public_status !== 'sold_out' &&
        drink.public_status !== 'coming_soon' &&
        typeof drink.public_sort_order === 'number' &&
        drink.public_sort_order > 0,
    )
    .sort((a, b) => (a.public_sort_order ?? 0) - (b.public_sort_order ?? 0))
}

export function breweryName(drink: DraftDrink): string {
  const primary = (drink.profile.brewery || drink.brand_name || '').trim()
  const collabs = (drink.profile.collab_breweries ?? [])
    .map((name) => name.trim())
    .filter((name) => name && name !== primary)
  return [primary, ...collabs].filter(Boolean).join(' × ') || '未知酒厂'
}

export function displayDrinkName(drink: DraftDrink): string {
  return (drink.display_name || drink.name).trim()
}

export function posterTapLabel(drink: DraftDrink, index: number): string {
  return typeof drink.public_sort_order === 'number' && drink.public_sort_order > 0
    ? `#${drink.public_sort_order}`
    : `#${index + 1}`
}

export function drinkShareDescription(drink: DraftDrink): string {
  return (drink.display_description || drink.profile.description || '').trim()
}

export function styleAndAbv(drink: DraftDrink): string {
  return [
    drink.profile.beer_style?.trim() || null,
    typeof drink.profile.abv === 'number' ? `ABV ${formatNumber(drink.profile.abv)}%` : null,
  ]
    .filter(Boolean)
    .join(' · ')
}

export function sharePrices(drink: DraftDrink, showPrices: boolean): string[] {
  if (!showPrices) return []
  return drink.servings
    .filter((serving) => !serving._deleted && serving.is_active && Number(serving.price) > 0)
    .sort((a, b) => {
      if (a.is_default !== b.is_default) return a.is_default ? -1 : 1
      return a.public_sort_order - b.public_sort_order
    })
    .map((serving) => {
      const label = serving.label?.trim() || ''
      const volume = serving.volume_ml ? `${formatNumber(serving.volume_ml)}ml` : ''
      const details = [label, volume].filter(
        (value, index, values) => value && values.indexOf(value) === index,
      )
      return `${details.length ? `${details.join(' ')} ` : ''}¥${formatNumber(Number(serving.price))}`
    })
}

export function buildTonightShareText(
  barName: string,
  drinks: DraftDrink[],
  showPrices: boolean,
  taplistUrl?: string | null,
): string {
  const lines = [barName.trim(), '今晚上新', '']
  drinks.forEach((drink, index) => {
    lines.push(`${posterTapLabel(drink, index)} ${breweryName(drink)} · ${displayDrinkName(drink)}`)
    const meta = styleAndAbv(drink)
    if (meta) lines.push(meta)
    const description = drinkShareDescription(drink)
    if (description) lines.push(description)
    const prices = sharePrices(drink, showPrices)
    if (prices.length) lines.push(prices.join(' / '))
    if (index < drinks.length - 1) lines.push('')
  })
  const url = taplistUrl?.trim()
  if (url) {
    lines.push('')
    lines.push(url)
  }
  return lines.join('\n')
}

export function posterDate(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value || ''
  return `${value('year')}.${value('month')}.${value('day')}`
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(1)))
}
