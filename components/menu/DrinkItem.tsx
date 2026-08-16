'use client'

import { Drink, DrinkServingOption } from '@/lib/types'

interface DrinkItemProps {
  drink: Drink
  disabled?: boolean
}

function activeServings(drink: Drink): DrinkServingOption[] {
  return (drink.drink_serving_options ?? []).filter((s) => s.is_active !== false)
}

function formatServingPrice(s: DrinkServingOption): string {
  const label = (s.label || '').trim()
  const volume = s.volume_ml != null && s.volume_ml > 0 ? `${s.volume_ml}ml` : ''
  const unit = [label, volume].filter(Boolean).join(' ')
  const price = `¥${Number(s.price).toFixed(0)}`
  return unit ? `${price}/${unit}` : price
}

/** Legacy cup/bottle columns — only when no serving options exist yet. */
function legacyPrices(drink: Drink): string[] {
  const out: string[] = []
  if (drink.price && drink.price > 0) {
    out.push(`¥${Number(drink.price).toFixed(0)}/${drink.price_unit || '杯'}`)
  }
  if (drink.price_bottle && drink.price_bottle > 0) {
    out.push(`¥${Number(drink.price_bottle).toFixed(0)}/${drink.price_unit_bottle || '瓶'}`)
  }
  return out
}

function formatDisplayName(drink: Drink): string {
  const name = (drink.name || '').trim()
  const brand = (drink.brand_name || '').trim()
  if (!brand) return name
  // Name already includes brand (e.g. "纸飞机 IPA") — don't duplicate.
  if (name.toLowerCase().startsWith(brand.toLowerCase())) return name
  return `${brand} ${name}`
}

export default function DrinkItem({ drink, disabled }: DrinkItemProps) {
  const servings = activeServings(drink)
  const priceTexts =
    servings.length > 0 ? servings.map(formatServingPrice) : legacyPrices(drink)

  const displayName = formatDisplayName(drink)

  return (
    <li className={`drink-row ${disabled ? 'disabled' : ''}`}>
      <span className="drink-name">{displayName}</span>
      <div className="drink-prices">
        {priceTexts.map((text, i) => (
          <span key={`${drink.id}-price-${i}`} className="drink-price">
            {text}
          </span>
        ))}
      </div>
    </li>
  )
}
