/**
 * DTO shapes for `get_public_taplist_*` RPC JSON.
 * Adjust when RPC payloads evolve (additive fields OK).
 */

/** `tenants.opening_hour` — daily hours as 24h `HH:mm`. */
export type OpeningHourJson = {
  open: string
  close: string
}

/** Counts from `get_public_taplist_bars.status_counts` (Chinese labels, public drinks only). */
export type PublicBarStatusCounts = {
  上新: number
  在售: number
  少量: number
  售罄: number
  即将上新: number
}

export type BrewingType = 'house_brand' | 'on_site_brewery'

export type PublicBarTag = {
  key: string
  label: string
}

export type PublicBarRow = {
  id: string
  slug: string
  name: string
  display_name: string
  district: string | null
  address: string | null
  opening_hour: OpeningHourJson | null
  description: string | null
  cover_image_url: string | null
  city: string
  country: string
  last_menu_updated_at: string | null
  status_counts?: PublicBarStatusCounts
  brewing_type?: BrewingType | null
  brewing_label?: string | null
}

export type PublicTenantDetail = {
  id: string
  slug: string
  name: string
  display_name: string
  district: string | null
  address: string | null
  opening_hour: OpeningHourJson | null
  description: string | null
  cover_image_url: string | null
  city: string
  country: string
  last_menu_updated_at: string | null
  tags?: PublicBarTag[]
  brewing_type?: BrewingType | null
  brewing_label?: string | null
}

export type PublicBeerProfile = {
  brewery: string | null
  beer_style: string | null
  abv: number | null
  ibu: number | null
  country: string | null
  description: string | null
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

export type PublicSearchServingOption = {
  label: string | null
  volume_ml: number | null
  price: number | null
}

export type PublicDrinkRow = {
  id: string
  category_id: string
  brand_name: string | null
  name: string
  image_url: string | null
  /** Chinese label from RPC (`上新` / `在售` / `少量` / `售罄` / `即将上新`). */
  public_status: string
  public_sort_order: number
  /** Canonical Product Pool link when bar drink is linked (additive). */
  product_id?: string | null
  beer: PublicBeerProfile | null
  serving_options: PublicServingOption[]
}

/** RPC `get_public_taplist_tenant` JSON union */
export type PublicTaplistTenantRpc =
  | { ok: true; tenant: PublicTenantDetail }
  | { ok: false; code: string; name?: string }

/** RPC `get_public_taplist_drinks` JSON union */
export type PublicTaplistDrinksRpc =
  | { ok: true; drinks: PublicDrinkRow[] }
  | { ok: false; code: string }

/** Row from `search_public_taplist` */
export type PublicTaplistSearchResult = {
  drink_id: string
  name: string
  brand_name: string | null
  image_url: string | null
  public_status: string
  /** Canonical Product Pool link when bar drink is linked (additive). */
  product_id?: string | null
  tenant_id: string
  tenant_slug: string
  tenant_display_name: string
  tenant_district: string | null
  tenant_address: string | null
  brewery: string | null
  beer_style: string | null
  abv: number | null
  default_serving: PublicSearchServingOption | null
}

export type PublicNewTapRow = PublicTaplistSearchResult

export type PublicEventDisplayState = 'TONIGHT' | 'ONGOING' | 'UPCOMING'

export type PublicEventRow = {
  id: string
  title: string
  subtitle: string | null
  description: string | null
  event_type: string
  event_type_label: string
  image_url: string | null
  start_at: string | null
  end_at: string | null
  date_label: string | null
  time_label: string | null
  display_state: PublicEventDisplayState
  display_time: string | null
  tenant_id: string
  tenant_slug: string
  tenant_display_name: string
  tenant_district: string | null
  tenant_address: string | null
  tenant_cover_image_url: string | null
}

/** RPC `search_public_taplist` JSON union */
export type PublicTaplistSearchRpc =
  | { ok: true; results: PublicTaplistSearchResult[] }
  | { ok: false; code?: string }

/** RPC `get_public_taplist_new_drinks` JSON union */
export type PublicTaplistNewDrinksRpc =
  | { ok: true; results: PublicNewTapRow[] }
  | { ok: false; code?: string }

/** RPC `get_public_taplist_events` JSON union */
export type PublicTaplistEventsRpc =
  | { ok: true; results: PublicEventRow[] }
  | { ok: false; code?: string }

/** RPC `get_public_taplist_event` JSON union */
export type PublicTaplistEventRpc =
  | { ok: true; event: PublicEventRow }
  | { ok: false; code: 'expired' | 'cancelled' | 'not_found' | 'not_public' | string }

export type BeerRoadmapStop = {
  tenantId: string
  tenantSlug: string
  displayName: string
  district: string | null
  address: string | null
  latitude: number
  longitude: number
  qualifyingNewTapCount: number
  newTapNames: string[]
}

export type BeerRoadmapLeg = {
  fromStopIndex: 0 | 1
  toStopIndex: 1 | 2
}

export type BeerRoadmapRoute = {
  routeId: string
  startTenantId: string
  stops: [BeerRoadmapStop, BeerRoadmapStop, BeerRoadmapStop]
  legs: [BeerRoadmapLeg, BeerRoadmapLeg]
  generatedAt: string
}

export type BeerRoadmapFailureCode =
  | 'FEATURE_DISABLED'
  | 'INVALID_START_TENANT'
  | 'START_NOT_ELIGIBLE'
  | 'INSUFFICIENT_CANDIDATES'
  | 'NO_VALID_ROUTE'
  | string

export type BeerRoadmapResponse =
  | { ok: true; route: BeerRoadmapRoute }
  | { ok: false; code: BeerRoadmapFailureCode }
