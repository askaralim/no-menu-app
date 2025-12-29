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

  return (
    <li className={`drink-row ${disabled ? 'disabled' : ''}`}>
      <span className="drink-name">{drink.name}</span>
      <span className="drink-price">
        {hasBottlePrice ? (
          <>
            <span>¥{drink.price.toFixed(0)}/{priceUnit} </span>
            <span>¥{drink.price_bottle!.toFixed(0)}/{bottleUnit}</span>
          </>
        ) : (
          <span>¥{drink.price.toFixed(0)}/{priceUnit}</span>
        )}
      </span>
    </li>
  )
}

