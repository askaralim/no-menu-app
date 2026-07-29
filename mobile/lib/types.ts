export interface Category {
  id: string
  tenant_id?: string
  name: string
  sort_order: number
  enabled: boolean
  is_public_visible?: boolean
  created_at: string
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
  tenant_id?: string
  category_id: string
  brand_name: string | null
  name: string
  volume_ml: number | null
  /** @deprecated POS uses drink_serving_options; kept for legacy reads */
  price: number
  price_unit: string
  price_bottle: number | null
  price_unit_bottle: string
  sort_order: number
  enabled: boolean
  stock: number | null
  ml_per_cup: number | null
  ml_per_bottle: number | null
  image_url?: string | null
  is_public_visible?: boolean
  public_status?: PublicStatus
  public_sort_order?: number
  product_id?: string | null
  display_name?: string | null
  display_description?: string | null
  created_at: string
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

export interface StaffMember {
  user_id: string
  email: string
  role: string
  created_at: string
}

export interface TenantInfo {
  id: string
  name: string
  slug: string
  status: string
  created_at: string
  owner_email: string
  staff_count: number
}

// ---------------------------------------------------------------------------
// Tap List (酒单 / Tonight Control) types
// ---------------------------------------------------------------------------

// The five statuses the DB accepts. Editor offers new / available / coming_soon;
// tonight list offers new↔available + sold_out as quick actions. `low` kept for compatibility.
export type PublicStatus = 'new' | 'available' | 'low' | 'sold_out' | 'coming_soon'

export type ServingType = 'draft' | 'can' | 'bottle' | 'flight' | 'other'

export interface TaplistTenant {
  id: string
  slug: string
  name: string
  display_name: string | null
  is_public_visible: boolean
  last_menu_updated_at: string | null
  status: string
  public_price_mode?: 'show' | 'hide'
}

export interface TaplistCategory {
  id: string
  name: string
  sort_order: number
  enabled: boolean
  is_public_visible: boolean
}

export interface TaplistDrink {
  id: string
  category_id: string | null
  brand_name: string | null
  name: string
  enabled: boolean
  image_url: string | null
  is_public_visible: boolean
  public_status: PublicStatus
  public_sort_order: number | null
  product_id: string | null
  display_name: string | null
  display_description: string | null
  created_at?: string | null
  updated_at?: string | null
}

export interface TaplistBeerProfile {
  drink_id: string
  brewery: string | null
  beer_style: string | null
  abv: number | null
  ibu: number | null
  country: string | null
  description: string | null
}

export interface TaplistServingOption {
  id: string
  drink_id: string
  serving_type: ServingType
  label: string
  volume_ml: number | null
  price: number
  is_default: boolean
  is_active: boolean
  public_sort_order: number
}

export interface OwnerTaplistPayload {
  ok: boolean
  code?: 'no_tenant' | 'forbidden'
  is_owner: boolean
  tenant: TaplistTenant
  categories: TaplistCategory[]
  drinks: TaplistDrink[]
  beer_profiles: TaplistBeerProfile[]
  serving_options: TaplistServingOption[]
}

// Result of upsert_taplist_drink (create or update one beer atomically).
export interface DrinkUpsertError {
  field?: string
  message: string
}

export interface DrinkUpsertResult {
  ok: boolean
  drink_id?: string
  created?: boolean
  pos_orderable?: boolean
  missing_price_warning?: boolean
  public_cleared?: boolean
  public_sort_order?: number | null
  errors?: DrinkUpsertError[]
}

export type DrinkSaveIntent = 'product_only' | 'save_and_add_to_tonight'
