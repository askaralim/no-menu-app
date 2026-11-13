'use client'

import { Drink } from '@/lib/types'
import { displayGroupTitle, getDisplayGroupMode, groupDisplayDrinks } from '@/lib/displayMenuGroups'
import DrinkItem from './DrinkItem'

interface CategorySectionProps {
  name: string
  drinks: Drink[]
  language?: 'zh' | 'en'
}

function DrinkList({ drinks, language }: { drinks: Drink[]; language: 'zh' | 'en' }) {
  return (
    <ul className="drink-list">
      {drinks.map((drink) => (
        <DrinkItem key={drink.id} drink={drink} disabled={!drink.enabled} language={language} />
      ))}
    </ul>
  )
}

export default function CategorySection({ name, drinks, language = 'zh' }: CategorySectionProps) {
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
              <h3 className="subsection-title">{displayGroupTitle(group, language)}</h3>
              <DrinkList drinks={group.drinks} language={language} />
            </div>
          ))}
        </div>
      ) : (
        <DrinkList drinks={groups[0]?.drinks ?? drinks} language={language} />
      )}
    </section>
  )
}
