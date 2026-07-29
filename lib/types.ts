export interface Category {
  id: string
  name: string
  sort_order: number
  enabled: boolean
  created_at: string
  /** Tap List: when false, drinks in this category are hidden from public RPCs */
  is_public_visible?: boolean
}

export interface DrinkServingOption {
  id: string
  label: string | null
  volume_ml: number | null
  price: number
  serving_type?: string | null
  is_default?: boolean
  is_active?: boolean
}

export interface Drink {
  id: string
  category_id: string
  brand_name?: string | null
  name: string
  volume_ml?: number | null
  /** @deprecated POS uses drink_serving_options */
  price: number
  price_unit: string
  price_bottle: number | null
  price_unit_bottle: string
  sort_order: number
  enabled: boolean
  stock?: number | null
  ml_per_cup?: number | null
  ml_per_bottle?: number | null
  created_at: string
  image_url?: string | null
  is_public_visible?: boolean
  public_status?: string | null
  public_sort_order?: number | null
  product_id?: string | null
  display_name?: string | null
  display_description?: string | null
  drink_serving_options?: DrinkServingOption[]
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

export type OrderStatus = 'active' | 'checked_out' | 'finished' // finished = legacy settled

export interface BusinessDay {
  id: string
  business_date: string
  opened_at: string
  closed_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface Order {
  id: string
  customer_name: string
  status: OrderStatus
  order_date: string
  business_day_id: string | null
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
  serving_option_id: string
  quantity: number
  unit_price: number
  label_snapshot: string | null
  created_at: string
}

export interface OrderWithItems extends Order {
  items: (OrderItem & {
    drink: Drink
  })[]
}

export interface CartItem {
  drink_id: string
  drink: Drink
  serving_option_id: string
  serving_label: string
  unit_price: number
  quantity: number
}

export type UserRole = 'owner' | 'staff' | 'super_admin'

export interface TenantInfo {
  id: string
  name: string
  slug: string
  status: string
  created_at: string
  owner_email: string
  staff_count: number
  ordering_enabled?: boolean
}

/** Row from `admin_list_taplist_cities` */
export interface AdminTaplistCityRow {
  city: string
  label: string
  country: string
  sort_order: number
  is_enabled: boolean
  updated_at: string
  active_bar_count: number
  public_bar_count: number
}

export type DrinkCompanyEntityType =
  | 'brewery'
  | 'brand'
  | 'brewery_brand'
  | 'cidery'
  | 'meadery'
  | 'distillery'
  | 'importer'
  | 'other'

export type DrinkCompanyReviewStatus = 'pending' | 'reviewed' | 'rejected'

export type DrinkCompanyConfidence = 'high' | 'medium' | 'low'

export type DrinkCompanyStatus = 'active' | 'archived'

export type DrinkCompanyAliasLanguage = 'zh' | 'en' | 'mixed' | 'unknown'

export type DrinkCompanyAliasType =
  | 'name'
  | 'legal_name'
  | 'old_name'
  | 'spelling'
  | 'translation'
  | 'collaboration_text'
  | 'source_value'

/** Row from `admin_list_drink_companies` */
export interface AdminDrinkCompanyRow {
  id: string
  normalized_key: string
  canonical_name: string
  canonical_name_en: string | null
  display_name: string
  entity_type: DrinkCompanyEntityType
  country: string | null
  country_code: string | null
  origin_region: string | null
  raw_country_values: string[]
  confidence: DrinkCompanyConfidence
  review_status: DrinkCompanyReviewStatus
  source: string | null
  source_note: string | null
  status: DrinkCompanyStatus
  created_at: string
  updated_at: string
  alias_count: number
  global_alias_collision_count: number
}

/** Row from `admin_list_drink_company_aliases` */
export interface AdminDrinkCompanyAliasRow {
  id: string
  company_id: string
  alias: string
  alias_language: DrinkCompanyAliasLanguage | null
  alias_type: DrinkCompanyAliasType
  source: string | null
  created_at: string
  collision_company_count: number
}

export type DrinkProductReviewStatus = 'pending' | 'reviewed' | 'rejected'

export type DrinkProductStatus = 'active' | 'archived'

/** Row from `admin_list_drink_products` */
export interface AdminDrinkProductRow {
  id: string
  name: string
  name_en: string | null
  aliases: string[]
  brand_name: string | null
  brewery: string | null
  beer_style: string | null
  abv: number | null
  ibu: number | null
  country: string | null
  origin_region: string | null
  image_url: string | null
  description: string | null
  tasting_note: string | null
  status: DrinkProductStatus
  source: string | null
  company_id: string | null
  normalized_key: string | null
  review_status: DrinkProductReviewStatus
  review_note: string | null
  beer_verification_status: string | null
  brewery_verification_status: string | null
  created_at: string
  updated_at: string
  company_display_name: string | null
  company_normalized_key: string | null
  linked_drink_count: number
}

