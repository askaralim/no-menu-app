'use client'

import { Drink } from '@/lib/types'

interface DrinkItemProps {
  drink: Drink
  disabled?: boolean
}

export default function DrinkItem({ drink, disabled }: DrinkItemProps) {
  const priceUnit = drink.price_unit || '杯'
  const hasBottlePrice = drink.price_bottle && drink.price_bottle > 0
  const bottleUnit = drink.price_unit_bottle || '瓶'
  const displayName = [drink.brand_name?.trim(), drink.name, drink.volume_ml ? `${drink.volume_ml}ml` : '']
    .filter(Boolean)
    .join(' ')

  return (
    <li className={`drink-row ${disabled ? 'disabled' : ''}`}>
      <span className="drink-name">{displayName}</span>
      <div className="drink-prices">
        <span className="drink-price-cup">
          {drink.price ? `¥${drink.price.toFixed(0)}/${priceUnit}` : ''}
        </span>
        <span className="drink-price-bottle">
          {hasBottlePrice ? `¥${drink.price_bottle!.toFixed(0)}/${bottleUnit}` : ''}
        </span>
      </div>
    </li>
  )
}

