export interface Category {
  id: string
  name: string
  sort_order: number
  enabled: boolean
  created_at: string
}

export interface Drink {
  id: string
  category_id: string
  name: string
  price: number
  price_unit: string
  price_bottle: number | null
  price_unit_bottle: string
  sort_order: number
  enabled: boolean
  created_at: string
}

export interface CategoryWithDrinks extends Category {
  drinks: Drink[]
}

export interface Settings {
  id: string
  theme: 'dark' | 'minimal' | 'luxury'
  auto_refresh: boolean
  refresh_interval: number
  updated_at: string
}

