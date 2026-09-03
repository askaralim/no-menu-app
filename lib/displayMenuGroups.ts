import type { Drink } from '@/lib/types'

export type DisplayGroupMode = 'price' | 'style' | 'none'

export type DisplayDrinkGroup = {
  key: string
  title: string
  drinks: Drink[]
}

export const CRAFT_STYLE_ORDER = [
  'IPA',
  '拉格',
  '酸啤',
  '小麦',
  '世涛',
  '西打',
  '其他',
] as const

export type CraftStyleGroup = (typeof CRAFT_STYLE_ORDER)[number]

export function getDisplayGroupMode(categoryName: string): DisplayGroupMode {
  const name = categoryName.trim().toLowerCase()
  if (/调酒|cocktail/.test(name)) return 'price'
  if (/精酿|生啤|craft\s*beer|tap\s*beer/.test(name)) return 'style'
  return 'none'
}

/** Default serving price, else cheapest listed price. */
export function getDrinkDisplayPrice(drink: Drink): number | null {
  const servings = (drink.drink_serving_options ?? []).filter((s) => s.is_active !== false)
  if (servings.length > 0) {
    const preferred = servings.find((s) => s.is_default) ?? null
    const preferredPrice = preferred ? Number(preferred.price) : NaN
    if (Number.isFinite(preferredPrice) && preferredPrice > 0) return preferredPrice
    const prices = servings
      .map((s) => Number(s.price))
      .filter((price) => Number.isFinite(price) && price > 0)
    if (prices.length > 0) return Math.min(...prices)
  }

  const legacy = [drink.price, drink.price_bottle]
    .map((value) => Number(value))
    .filter((price) => Number.isFinite(price) && price > 0)
  if (legacy.length > 0) return Math.min(...legacy)
  return null
}

export function formatPriceGroupTitle(price: number | null): string {
  if (price == null) return '其他'
  return `¥${Math.round(price)}`
}

function classifyHaystack(raw: string, allowBareSour: boolean): CraftStyleGroup {
  const hay = raw.trim().toLowerCase()
  if (!hay) return '其他'

  if (/(ipa|印度淡色|西海岸|新英格兰|hazy|ddh|浑浊.{0,6}ipa|ipa.{0,6}浑浊)/i.test(hay)) return 'IPA'

  const sourPattern = allowBareSour
    ? /(酸|sour|gose|古斯|柏林酸|berliner|lambic)/i
    : /(酸啤|酸艾|sour|gose|古斯|柏林酸|berliner|lambic)/i
  if (sourPattern.test(hay)) return '酸啤'

  if (/(拉格|lager|pils|皮尔森|博克|bock|helles|海勒|科隆|kölsch|kolsch|ipl)/i.test(hay)) {
    return '拉格'
  }
  if (/(小麦|白啤|wheat|weizen|hefe|witbier)/i.test(hay)) return '小麦'
  if (/(世涛|波特|stout|porter)/i.test(hay)) return '世涛'
  if (/(西打|苹果酒|梨酒|cider|perry)/i.test(hay)) return '西打'
  return '其他'
}

export function classifyCraftStyle(drink: Drink): CraftStyleGroup {
  const style = (drink.beer_style || '').trim()
  if (style) {
    const fromStyle = classifyHaystack(style, true)
    if (fromStyle !== '其他') return fromStyle
  }

  const fromName = classifyHaystack(drink.name || '', false)
  if (fromName !== '其他') return fromName
  return '其他'
}

function groupByKey(
  drinks: Drink[],
  getGroup: (drink: Drink) => { key: string; title: string; order: number },
): DisplayDrinkGroup[] {
  const buckets = new Map<string, DisplayDrinkGroup & { order: number }>()

  for (const drink of drinks) {
    const group = getGroup(drink)
    const existing = buckets.get(group.key)
    if (existing) {
      existing.drinks.push(drink)
    } else {
      buckets.set(group.key, {
        key: group.key,
        title: group.title,
        drinks: [drink],
        order: group.order,
      })
    }
  }

  return Array.from(buckets.values())
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, 'zh-CN'))
    .map(({ key, title, drinks: grouped }) => ({ key, title, drinks: grouped }))
}

export function groupDisplayDrinks(categoryName: string, drinks: Drink[]): DisplayDrinkGroup[] {
  const mode = getDisplayGroupMode(categoryName)
  if (mode === 'none' || drinks.length === 0) {
    return [{ key: 'all', title: categoryName, drinks }]
  }

  if (mode === 'price') {
    return groupByKey(drinks, (drink) => {
      const price = getDrinkDisplayPrice(drink)
      return {
        key: price == null ? 'price:none' : `price:${Math.round(price)}`,
        title: formatPriceGroupTitle(price),
        order: price == null ? Number.POSITIVE_INFINITY : price,
      }
    })
  }

  const styleRank = new Map(CRAFT_STYLE_ORDER.map((style, index) => [style, index]))
  return groupByKey(drinks, (drink) => {
    const style = classifyCraftStyle(drink)
    return {
      key: `style:${style}`,
      title: style,
      order: styleRank.get(style) ?? styleRank.get('其他') ?? 99,
    }
  })
}
