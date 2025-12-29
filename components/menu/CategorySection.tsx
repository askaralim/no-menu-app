'use client'

import { Drink } from '@/lib/types'
import DrinkItem from './DrinkItem'

interface CategorySectionProps {
  name: string
  drinks: Drink[]
}

export default function CategorySection({ name, drinks }: CategorySectionProps) {
  // 展示页只显示 enabled 的酒品
  const enabledDrinks = drinks.filter((d) => d.enabled)

  if (enabledDrinks.length === 0) {
    return null
  }

  return (
    <section className="menu-section">
      <h2 className="section-title">{name}</h2>
      <ul className="drink-list">
        {enabledDrinks.map((drink) => (
          <DrinkItem key={drink.id} drink={drink} />
        ))}
      </ul>
    </section>
  )
}

