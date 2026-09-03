'use client'

import { Drink } from '@/lib/types'
import { getDisplayGroupMode, groupDisplayDrinks } from '@/lib/displayMenuGroups'
import DrinkItem from './DrinkItem'

interface CategorySectionProps {
  name: string
  drinks: Drink[]
}

function DrinkList({ drinks }: { drinks: Drink[] }) {
  return (
    <ul className="drink-list">
      {drinks.map((drink) => (
        <DrinkItem key={drink.id} drink={drink} disabled={!drink.enabled} />
      ))}
    </ul>
  )
}

export default function CategorySection({ name, drinks }: CategorySectionProps) {
  if (drinks.length === 0) {
    return null
  }

  const groups = groupDisplayDrinks(name, drinks)
  const showSubsections = getDisplayGroupMode(name) !== 'none'

  return (
    <section className={`menu-section${showSubsections ? ' has-subsections' : ''}`}>
      <h2 className="section-title">{name}</h2>
      {showSubsections ? (
        <div className="menu-subsections">
          {groups.map((group) => (
            <div key={group.key} className="menu-subsection">
              <h3 className="subsection-title">{group.title}</h3>
              <DrinkList drinks={group.drinks} />
            </div>
          ))}
        </div>
      ) : (
        <DrinkList drinks={groups[0]?.drinks ?? drinks} />
      )}
    </section>
  )
}
