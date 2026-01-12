'use client'

import { Drink } from '@/lib/types'
import DrinkItem from './DrinkItem'

interface CategorySectionProps {
  name: string
  drinks: Drink[]
}

export default function CategorySection({ name, drinks }: CategorySectionProps) {
  // 只显示已启用的酒品（禁用饮品已在数据层过滤）
  if (drinks.length === 0) {
    return null
  }

  return (
    <section className="menu-section">
      <h2 className="section-title">{name}</h2>
      <ul className="drink-list">
        {drinks.map((drink) => (
          <DrinkItem key={drink.id} drink={drink} disabled={!drink.enabled} />
        ))}
      </ul>
    </section>
  )
}

