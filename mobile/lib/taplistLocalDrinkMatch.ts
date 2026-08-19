import type { DraftDrink } from './taplistOwnerApi'

/** Case-insensitive substring match on name / display / brand / brewery.
 * Includes archived (enabled=false) drinks so create-flow can dedupe off-shelf catalog. */
export function matchLocalDrinks(drinks: DraftDrink[], query: string, limit = 8): DraftDrink[] {
  const q = query.trim().toLowerCase()
  if (!q) return []

  const scored: { drink: DraftDrink; score: number }[] = []
  for (const d of drinks) {
    const name = (d.name || '').toLowerCase()
    const display = (d.display_name || '').toLowerCase()
    const brand = (d.brand_name || '').toLowerCase()
    const brewery = (d.profile?.brewery || '').toLowerCase()
    const hay = `${name} ${display} ${brand} ${brewery}`
    if (!hay.includes(q)) continue

    // Prefer name/display prefix hits, then brand/brewery; prefer enabled over archived.
    let score = 3
    if (name.startsWith(q) || display.startsWith(q)) score = 0
    else if (name.includes(q) || display.includes(q)) score = 1
    else if (brand.includes(q) || brewery.includes(q)) score = 2
    if (!d.enabled) score += 10
    scored.push({ drink: d, score })
  }

  scored.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score
    return (a.drink.name || '').localeCompare(b.drink.name || '', 'zh')
  })
  return scored.slice(0, limit).map((x) => x.drink)
}
