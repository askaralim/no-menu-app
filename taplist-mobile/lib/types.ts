/**
 * DTO shapes for `get_public_taplist_*` RPC JSON.
 * Adjust when RPC payloads evolve (additive fields OK).
 */

export type PublicBarRow = {
  id: string
  slug: string
  name: string
  display_name: string
  district: string | null
  cover_image_url: string | null
  city: string
  country: string
  last_menu_updated_at: string | null
}

export type PublicTenantDetail = {
  id: string
  slug: string
  name: string
  display_name: string
  district: string | null
  cover_image_url: string | null
  city: string
  country: string
  last_menu_updated_at: string | null
}

export type PublicBeerProfile = {
  brewery: string | null
  beer_style: string | null
  abv: number | null
  ibu: number | null
  country: string | null
}

export type PublicServingOption = {
  id: string
  serving_type: string
  label: string
  volume_ml: number | null
  price: number
  is_default: boolean
  is_active: boolean
  public_sort_order: number
}

export type PublicDrinkRow = {
  id: string
  category_id: string
  brand_name: string | null
  name: string
  image_url: string | null
  public_status: string
  public_sort_order: number
  beer: PublicBeerProfile | null
  serving_options: PublicServingOption[]
}
