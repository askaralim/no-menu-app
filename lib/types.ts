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

export type OrderStatus = 'active' | 'checked_out' | 'finished'

export interface Order {
  id: string
  customer_name: string
  status: OrderStatus
  order_date: string
  total_amount: number
  notes: string | null
  created_at: string
  updated_at: string
  checked_out_at: string | null
}

export interface OrderItem {
  id: string
  order_id: string
  drink_id: string
  quantity_cup: number
  quantity_bottle: number
  unit_price_cup: number
  unit_price_bottle: number | null
  created_at: string
}

export interface OrderWithItems extends Order {
  items: (OrderItem & {
    drink: Drink
  })[]
}

