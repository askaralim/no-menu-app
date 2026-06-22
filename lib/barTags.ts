export type BrewingType = 'house_brand' | 'on_site_brewery'

export const BREWING_TYPE_OPTIONS: {
  value: BrewingType | ''
  label: string
  hint: string
}[] = [
  { value: '', label: '无（仅售他人酒款）', hint: '' },
  { value: 'house_brand', label: '自有品牌', hint: '门店拥有自有啤酒品牌' },
  { value: 'on_site_brewery', label: '店内自酿', hint: '在门店内酿造啤酒' },
]

export type BarTagDefinition = {
  key: string
  label_zh: string
  category: string
  sort_order: number
}

export const BAR_TAG_CATEGORY_ORDER = ['座位规模', '空间', '友好政策', '设施'] as const

export function groupBarTagsByCategory(tags: BarTagDefinition[]): Record<string, BarTagDefinition[]> {
  const grouped: Record<string, BarTagDefinition[]> = {}
  for (const tag of tags) {
    if (!grouped[tag.category]) grouped[tag.category] = []
    grouped[tag.category].push(tag)
  }
  for (const list of Object.values(grouped)) {
    list.sort((a, b) => a.sort_order - b.sort_order || a.key.localeCompare(b.key))
  }
  return grouped
}
