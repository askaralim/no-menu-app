'use client'

import { useState } from 'react'
import { Drink, DrinkServingOption } from '@/lib/types'

interface DrinkItemProps {
  drink: Drink
  disabled?: boolean
}

function activeServings(drink: Drink): DrinkServingOption[] {
  return (drink.drink_serving_options ?? []).filter((s) => s.is_active !== false)
}

type PriceLine = { amount: string; spec: string }

function servingPrice(s: DrinkServingOption): PriceLine {
  const label = (s.label || '').trim()
  const volume = s.volume_ml != null && s.volume_ml > 0 ? `${s.volume_ml}ml` : ''
  return {
    amount: `¥${Number(s.price).toFixed(0)}`,
    spec: [label, volume].filter(Boolean).join(' '),
  }
}

/** Legacy cup/bottle columns — only when no serving options exist yet. */
function legacyPrices(drink: Drink): PriceLine[] {
  const out: PriceLine[] = []
  if (drink.price && drink.price > 0) {
    out.push({ amount: `¥${Number(drink.price).toFixed(0)}`, spec: drink.price_unit || '杯' })
  }
  if (drink.price_bottle && drink.price_bottle > 0) {
    out.push({
      amount: `¥${Number(drink.price_bottle).toFixed(0)}`,
      spec: drink.price_unit_bottle || '瓶',
    })
  }
  return out
}

function splitBreweryAndName(drink: Drink): { brewery: string; name: string } {
  const name = (drink.name || '').trim()
  const brewery = (drink.brand_name || '').trim()
  if (!brewery) return { brewery: '', name }
  if (name.toLowerCase().startsWith(brewery.toLowerCase())) {
    const rest = name.slice(brewery.length).replace(/^[\s·\-–—]+/, '').trim()
    return { brewery, name: rest || name }
  }
  return { brewery, name }
}

export default function DrinkItem({ drink, disabled }: DrinkItemProps) {
  const servings = activeServings(drink)
  const prices = servings.length > 0 ? servings.map(servingPrice) : legacyPrices(drink)
  const { brewery, name } = splitBreweryAndName(drink)
  const origin = (drink.origin_region || '').trim()
  const beerStyle = (drink.beer_style || '').trim()
  const identity = `${brewery} ${name}`.toLowerCase()
  const styleAlreadyInName = beerStyle !== '' && identity.includes(beerStyle.toLowerCase())
  const [imageFailed, setImageFailed] = useState(false)
  const imageUrl = imageFailed ? '' : (drink.image_url || '').trim()

  return (
    <li className={`drink-row ${disabled ? 'disabled' : ''}`}>
      <span className="drink-thumb">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            onError={() => setImageFailed(true)}
          />
        ) : null}
      </span>
      <span className="drink-origin">{origin}</span>
      <span className="drink-copy">
        {brewery ? <span className="drink-brewery">{brewery}</span> : null}
        <span className="drink-title">{name}</span>
        {beerStyle && !styleAlreadyInName ? (
          <span className="drink-style">{beerStyle}</span>
        ) : null}
      </span>
      <div className="drink-prices">
        {prices.map((price, i) => (
          <span key={`${drink.id}-price-${i}`} className="drink-price">
            <span className="drink-price-amount">{price.amount}</span>
            {price.spec ? <span className="drink-price-spec">{price.spec}</span> : null}
          </span>
        ))}
      </div>
    </li>
  )
}
