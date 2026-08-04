import { supabase } from './supabase'
import type {
  DrinkUpsertResult,
  OwnerTaplistPayload,
  PublicStatus,
  ServingType,
  TaplistBeerProfile,
  TaplistCategory,
  TaplistDrink,
  TaplistServingOption,
  TaplistTenant,
} from './types'

// ---------------------------------------------------------------------------
// Draft model (editable, UI-runtime copy of the published payload)
// ---------------------------------------------------------------------------

export interface DraftServing extends TaplistServingOption {
  // Client-only identity for rows not yet persisted.
  client_id?: string
  _new?: boolean
  _deleted?: boolean
}

export interface DraftDrink extends TaplistDrink {
  profile: TaplistBeerProfile
  servings: DraftServing[]
}

export interface TaplistDraft {
  tenant: TaplistTenant
  isOwner: boolean
  categories: TaplistCategory[]
  drinks: DraftDrink[]
}

export interface ProductSearchResult {
  id: string
  name: string
  name_en: string | null
  brewery: string | null
  brand_name: string | null
  beer_style: string | null
  abv: number | null
  country: string | null
  image_url: string | null
}

function emptyProfile(drinkId: string): TaplistBeerProfile {
  return {
    drink_id: drinkId,
    brewery: null,
    collab_breweries: [],
    beer_style: null,
    abv: null,
    ibu: null,
    country: null,
    description: null,
  }
}

function normalizeCollabBreweries(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((x) => (typeof x === 'string' ? x.trim() : ''))
    .filter(Boolean)
    .slice(0, 3)
}

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

export async function loadOwnerTaplist(tenantId?: string | null): Promise<OwnerTaplistPayload> {
  const { data, error } = await supabase.rpc('get_owner_taplist_payload', {
    p_tenant_id: tenantId ?? null,
  })
  if (error) throw new Error(error.message)
  const payload = data as OwnerTaplistPayload
  if (!payload?.ok) {
    if (payload?.code === 'forbidden') throw new Error('没有权限查看该门店酒单')
    if (payload?.code === 'no_tenant') throw new Error('未找到关联门店')
    throw new Error('加载酒单失败')
  }
  return payload
}

export function buildDraft(payload: OwnerTaplistPayload): TaplistDraft {
  const profileByDrink = new Map<string, TaplistBeerProfile>()
  for (const p of payload.beer_profiles ?? []) profileByDrink.set(p.drink_id, p)

  const servingsByDrink = new Map<string, DraftServing[]>()
  for (const s of payload.serving_options ?? []) {
    const list = servingsByDrink.get(s.drink_id) ?? []
    list.push({ ...s })
    servingsByDrink.set(s.drink_id, list)
  }

  const drinks: DraftDrink[] = (payload.drinks ?? []).map((d) => {
    const profile = profileByDrink.get(d.id) ?? emptyProfile(d.id)
    return {
      ...d,
      profile: {
        ...profile,
        collab_breweries: normalizeCollabBreweries(profile.collab_breweries),
      },
      servings: (servingsByDrink.get(d.id) ?? []).sort(
        (a, b) => a.public_sort_order - b.public_sort_order,
      ),
    }
  })

  return {
    tenant: payload.tenant,
    isOwner: payload.is_owner,
    categories: [...(payload.categories ?? [])],
    drinks,
  }
}

// ---------------------------------------------------------------------------
// Per-beer save (create or update): immediate + atomic
// ---------------------------------------------------------------------------

const VALID_STATUSES: PublicStatus[] = ['new', 'available', 'low', 'sold_out', 'coming_soon']

/** Client-side validation; returns Chinese issues that block save. */
export function validateDraftDrink(d: DraftDrink): string[] {
  const issues: string[] = []
  if (!d.name.trim()) issues.push('请填写酒款名称')
  if (!VALID_STATUSES.includes(d.public_status)) issues.push('状态无效')
  for (const s of d.servings) {
    if (s._deleted) continue
    if (!Number.isFinite(s.price) || s.price < 0) issues.push('规格价格无效')
    if (s.volume_ml != null && (!Number.isFinite(s.volume_ml) || s.volume_ml < 0)) issues.push('规格容量无效')
  }
  if (d.profile.abv != null && (!Number.isFinite(d.profile.abv) || d.profile.abv < 0 || d.profile.abv > 100)) {
    issues.push('酒精度无效')
  }
  if (normalizeCollabBreweries(d.profile.collab_breweries).length > 3) {
    issues.push('合酿酒厂最多 3 个')
  }
  return Array.from(new Set(issues))
}

function serializeDraftDrink(d: DraftDrink): Record<string, unknown> {
  const servings: Record<string, unknown>[] = []
  let sort = 0
  d.servings.forEach((s) => {
    if (s._new && s._deleted) return // created then removed locally
    if (s._deleted) {
      if (s.id) servings.push({ id: s.id, drink_id: d.id, delete: true })
      return
    }
    const row: Record<string, unknown> = {
      drink_id: d.id || undefined,
      serving_type: s.serving_type,
      label: s.label,
      volume_ml: s.volume_ml,
      price: s.price,
      is_default: s.is_default,
      is_active: s.is_active,
      public_sort_order: sort++,
    }
    if (!s._new && s.id) row.id = s.id
    else if (s.client_id) row.client_id = s.client_id
    servings.push(row)
  })

  const brewery = nn(d.profile.brewery)
  return {
    id: d.id || undefined,
    category_id: d.category_id || undefined,
    name: d.name.trim(),
    // brand_name tracks primary brewery only
    brand_name: brewery,
    image_url: nn(d.image_url),
    is_public_visible: d.is_public_visible,
    public_status: d.public_status,
    profile: {
      brewery,
      collab_breweries: normalizeCollabBreweries(d.profile.collab_breweries),
      beer_style: nn(d.profile.beer_style),
      abv: d.profile.abv,
      ibu: d.profile.ibu,
      country: nn(d.profile.country),
      description: nn(d.profile.description),
    },
    servings,
  }
}

/** Create (no id) or update (id) one beer atomically. Owner or staff. */
export async function upsertTaplistDrink(tenantId: string, drink: DraftDrink): Promise<DrinkUpsertResult> {
  const { data, error } = await supabase.rpc('upsert_taplist_drink', {
    p_tenant_id: tenantId,
    p_drink: serializeDraftDrink(drink),
  })
  if (error) throw new Error(translateError(error.message))
  return data as DrinkUpsertResult
}

/** Catalog-only save: never writes tonight listing fields. */
export async function upsertDrinkProduct(tenantId: string, drink: DraftDrink): Promise<DrinkUpsertResult> {
  const { data, error } = await supabase.rpc('upsert_drink_product', {
    p_tenant_id: tenantId,
    p_drink: serializeDraftDrink(drink),
  })
  if (error) throw new Error(translateError(error.message))
  return data as DrinkUpsertResult
}

export type ListingResult = {
  ok: boolean
  drink_id?: string
  public_sort_order?: number
  is_public_visible?: boolean
  public_status?: PublicStatus
  swapped_with?: { drink_id: string; tap_number: number | null } | null
  errors?: { field?: string; message: string }[]
}

/** Join / update tonight listing (requires tap # >= 1). */
export async function setDrinkTaplistListing(
  drinkId: string,
  opts: {
    isPublicVisible: boolean
    publicStatus: PublicStatus
    publicSortOrder: number
  },
): Promise<ListingResult> {
  const { data, error } = await supabase.rpc('set_drink_taplist_listing', {
    p_drink_id: drinkId,
    p_is_public_visible: opts.isPublicVisible,
    p_public_status: opts.publicStatus,
    p_public_sort_order: opts.publicSortOrder,
  })
  if (error) throw new Error(translateError(error.message))
  return data as ListingResult
}

/** Remove from tonight: clears tap #, hides public, resets status to available. */
export async function removeDrinkFromTonight(drinkId: string): Promise<ListingResult> {
  const { data, error } = await supabase.rpc('remove_drink_from_tonight', {
    p_drink_id: drinkId,
  })
  if (error) throw new Error(translateError(error.message))
  return data as ListingResult
}

/**
 * Save by explicit intent (no guessing).
 * - product_only → upsert_drink_product
 * - save_and_add_to_tonight → product then set_drink_taplist_listing
 */
export async function saveDrinkWithIntent(
  tenantId: string,
  drink: DraftDrink,
  intent: 'product_only' | 'save_and_add_to_tonight',
  opts?: { tapNumber?: number | null },
): Promise<DrinkUpsertResult> {
  const product = await upsertDrinkProduct(tenantId, drink)
  if (!product.ok || !product.drink_id) return product

  // Pool pick: upsert does not write product_id — link after we have drink_id.
  if (drink.product_id) {
    try {
      await linkDrinkToProduct(product.drink_id, drink.product_id)
    } catch (e) {
      return {
        ok: false,
        drink_id: product.drink_id,
        created: product.created,
        errors: [
          {
            field: 'product_id',
            message: e instanceof Error ? e.message : '关联商品池失败',
          },
        ],
      }
    }
  }

  if (intent === 'product_only') return product

  const tap =
    (opts?.tapNumber && opts.tapNumber > 0 ? opts.tapNumber : null) ??
    (drink.public_sort_order && drink.public_sort_order > 0 ? drink.public_sort_order : null)

  if (!tap) {
    return {
      ok: false,
      drink_id: product.drink_id,
      created: product.created,
      errors: [{ field: 'public_sort_order', message: '加入酒单必须分配酒头编号（1–99）' }],
    }
  }

  const listing = await setDrinkTaplistListing(product.drink_id, {
    isPublicVisible: drink.is_public_visible,
    publicStatus: drink.public_status,
    publicSortOrder: tap,
  })

  if (!listing.ok) {
    return {
      ok: false,
      drink_id: product.drink_id,
      created: product.created,
      errors: listing.errors ?? [{ message: '加入酒单失败' }],
    }
  }

  return {
    ...product,
    ok: true,
    public_sort_order: listing.public_sort_order ?? tap,
  }
}

/** Next free wall tap # among enabled tonight drinks. */
export function nextFreeTapNumber(
  drinks: { public_sort_order?: number | null }[],
  preferred?: number | null,
): number {
  const used = new Set(
    drinks
      .map((d) => d.public_sort_order)
      .filter((n): n is number => typeof n === 'number' && n >= 1),
  )
  if (preferred && preferred >= 1 && preferred <= 99 && !used.has(preferred)) return preferred
  for (let i = 1; i <= 99; i++) {
    if (!used.has(i)) return i
  }
  return 1
}

function nn(v: string | null | undefined): string | null {
  const t = (v ?? '').trim()
  return t === '' ? null : t
}

// ---------------------------------------------------------------------------
// Immediate ops (owner + staff)
// ---------------------------------------------------------------------------

/** Immediate status + visibility change. */
export async function setDrinkStatusImmediate(
  drinkId: string,
  isVisible: boolean,
  status: PublicStatus,
): Promise<void> {
  const { error } = await supabase.rpc('set_drink_taplist_status', {
    p_drink_id: drinkId,
    p_is_public_visible: isVisible,
    p_public_status: status,
  })
  if (error) throw new Error(translateError(error.message))
}

export type DrinkStatusEvent = {
  id: string
  from_status: PublicStatus | null
  to_status: PublicStatus
  from_status_zh: string | null
  to_status_zh: string
  actor_user_id: string | null
  created_at: string
}

/** Recent public_status changes for a drink (owner/staff). */
export async function getDrinkStatusEvents(
  drinkId: string,
  limit = 12,
): Promise<DrinkStatusEvent[]> {
  const { data, error } = await supabase.rpc('get_drink_status_events', {
    p_drink_id: drinkId,
    p_limit: limit,
  })
  if (error) throw new Error(translateError(error.message))
  const res = data as { ok?: boolean; events?: DrinkStatusEvent[] }
  return res?.events ?? []
}

export type AssignTapResult = {
  ok: boolean
  drink_id: string
  tap_number: number
  swapped_with: { drink_id: string; tap_number: number } | null
}

/**
 * Assign this drink to wall tap #N (public_sort_order).
 * If another drink already occupies N, the two swap atomically.
 */
export async function assignDrinkTapNumber(
  drinkId: string,
  tapNumber: number,
): Promise<AssignTapResult> {
  const { data, error } = await supabase.rpc('assign_drink_tap_number', {
    p_drink_id: drinkId,
    p_tap_number: tapNumber,
  })
  if (error) throw new Error(translateError(error.message))
  return data as AssignTapResult
}

/** Default wall size when bar has few beers; picker always covers at least this many. */
export const DEFAULT_TAP_COUNT = 12

/** How many tap slots to offer in the picker. */
export function tapSlotCount(drinks: { public_sort_order?: number | null }[]): number {
  const maxAssigned = drinks.reduce((m, d) => Math.max(m, d.public_sort_order || 0), 0)
  return Math.min(99, Math.max(DEFAULT_TAP_COUNT, drinks.length, maxAssigned))
}

export type PublishReadiness = {
  ok: boolean
  errors: string[]
  public_drink_count?: number
  has_owner?: boolean
}

/** Minimum server-side readiness for 公开展示. */
export async function getTenantPublishReadiness(tenantId: string): Promise<PublishReadiness> {
  const { data, error } = await supabase.rpc('get_tenant_publish_readiness', {
    p_tenant_id: tenantId,
  })
  if (error) throw new Error(translateError(error.message))
  const res = data as { ok?: boolean; errors?: string[] | unknown; public_drink_count?: number; has_owner?: boolean }
  const errors = Array.isArray(res?.errors)
    ? (res.errors as unknown[]).map((e) => (typeof e === 'string' ? e : JSON.stringify(e)))
    : []
  return {
    ok: !!res?.ok,
    errors,
    public_drink_count: res?.public_drink_count,
    has_owner: res?.has_owner,
  }
}

/** Owner/super_admin only: publish or unpublish the consumer storefront. */
export async function setTenantPublicVisibility(
  tenantId: string,
  visible: boolean,
): Promise<void> {
  if (visible) {
    await publishTenant(tenantId)
  } else {
    await unpublishTenant(tenantId)
  }
}

export async function publishTenant(tenantId: string): Promise<void> {
  const { error } = await supabase.rpc('publish_tenant', { p_tenant_id: tenantId })
  if (error) throw new Error(translateError(error.message))
}

export async function unpublishTenant(tenantId: string): Promise<void> {
  const { error } = await supabase.rpc('unpublish_tenant', { p_tenant_id: tenantId })
  if (error) throw new Error(translateError(error.message))
}

export type PublicPriceMode = 'show' | 'hide'

/** Owner only: whether consumer taplist shows serving prices. */
export async function setTenantPublicPriceMode(
  tenantId: string,
  mode: PublicPriceMode,
): Promise<PublicPriceMode> {
  const { data, error } = await supabase.rpc('set_tenant_public_price_mode', {
    p_tenant_id: tenantId,
    p_mode: mode,
  })
  if (error) throw new Error(translateError(error.message))
  const res = data as { ok?: boolean; public_price_mode?: PublicPriceMode }
  if (!res?.ok || (res.public_price_mode !== 'show' && res.public_price_mode !== 'hide')) {
    throw new Error('更新价格展示模式失败')
  }
  return res.public_price_mode
}

export async function getTenantPublicPriceMode(tenantId: string): Promise<PublicPriceMode> {
  const { data, error } = await supabase
    .from('tenants')
    .select('public_price_mode')
    .eq('id', tenantId)
    .maybeSingle()
  if (!error) {
    const mode = (data as { public_price_mode?: string } | null)?.public_price_mode
    return mode === 'show' ? 'show' : 'hide'
  }
  // Fallback when direct tenants select is restricted by RLS.
  const payload = await loadOwnerTaplist(tenantId)
  return payload.tenant.public_price_mode === 'show' ? 'show' : 'hide'
}

/** Soft-archive a catalog drink: off POS, off tonight, not public. */
export async function archiveDrink(drinkId: string): Promise<void> {
  const { data, error } = await supabase.rpc('archive_drink', { p_drink_id: drinkId })
  if (error) throw new Error(translateError(error.message))
  const res = data as { ok?: boolean }
  if (res && res.ok === false) throw new Error('下架失败')
}

/** Restore an archived drink into catalog only (not tonight, not public). */
export async function restoreDrink(drinkId: string): Promise<void> {
  const { data, error } = await supabase.rpc('restore_drink', { p_drink_id: drinkId })
  if (error) throw new Error(translateError(error.message))
  const res = data as { ok?: boolean }
  if (res && res.ok === false) throw new Error('恢复失败')
}

/** Category public visibility (direct table update; RLS allows tenant members). */
export async function setCategoryVisibility(categoryId: string, visible: boolean): Promise<void> {
  const { error } = await supabase
    .from('categories')
    .update({ is_public_visible: visible })
    .eq('id', categoryId)
  if (error) throw new Error(translateError(error.message))
}

// ---------------------------------------------------------------------------
// Product pool: search -> autofill draft (keeps publish atomic)
// ---------------------------------------------------------------------------

export async function searchDrinkProducts(query: string): Promise<ProductSearchResult[]> {
  const q = query.trim()
  if (!q) return []
  const { data, error } = await supabase.rpc('search_drink_products', { p_query: q })
  if (error) throw new Error(error.message)
  const res = data as { ok: boolean; results?: ProductSearchResult[] }
  return res?.results ?? []
}

/** Apply a product-pool row onto a draft (profile/image + product_id for persist on save). */
export function applyProductToDraftDrink(drink: DraftDrink, product: ProductSearchResult): DraftDrink {
  return {
    ...drink,
    product_id: product.id,
    brand_name: product.brand_name || drink.brand_name,
    image_url: drink.image_url || product.image_url || null,
    profile: {
      ...drink.profile,
      brewery: product.brewery || product.brand_name || drink.profile.brewery,
      beer_style: product.beer_style || drink.profile.beer_style,
      abv: product.abv ?? drink.profile.abv,
      country: product.country || drink.profile.country,
    },
  }
}

/** Persist drinks.product_id via existing RPC (active products only). */
export async function linkDrinkToProduct(drinkId: string, productId: string): Promise<void> {
  const { data, error } = await supabase.rpc('link_drink_to_product', {
    p_drink_id: drinkId,
    p_product_id: productId,
  })
  if (error) throw new Error(translateError(error.message))
  const res = data as { ok?: boolean }
  if (res && res.ok === false) throw new Error('关联商品池失败')
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function newDraftServing(drinkId: string, sortOrder: number): DraftServing {
  return {
    id: '',
    client_id: `new-${drinkId || 'draft'}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    drink_id: drinkId,
    serving_type: 'draft' as ServingType,
    label: '',
    volume_ml: null,
    price: 0,
    is_default: sortOrder === 0,
    is_active: true,
    public_sort_order: sortOrder,
    _new: true,
  }
}

/** Blank drink for create mode. */
export function emptyDraftDrink(opts?: { entryPoint?: 'tonight' | 'catalog' }): DraftDrink {
  const forTonight = (opts?.entryPoint ?? 'tonight') === 'tonight'
  return {
    id: '',
    category_id: null,
    brand_name: null,
    name: '',
    enabled: true,
    image_url: null,
    is_public_visible: forTonight,
    public_status: forTonight ? 'new' : 'available',
    public_sort_order: null,
    product_id: null,
    display_name: null,
    display_description: null,
    profile: emptyProfile(''),
    servings: [],
  }
}

export function drinkHasOrderablePrice(drink: DraftDrink): boolean {
  return drink.servings.some((s) => !s._deleted && s.is_active && Number(s.price) > 0)
}

export function isOnTonight(drink: { public_sort_order?: number | null }): boolean {
  return typeof drink.public_sort_order === 'number' && drink.public_sort_order >= 1
}

function translateError(message: string): string {
  const m = message || ''
  if (m.includes('Invalid tap number')) return '枪号无效（请选择 1–99）'
  if (m.includes('Product not found') || m.includes('not active')) {
    return '商品池条目不存在或已停用'
  }
  if (m.includes('Forbidden')) return '没有权限执行该操作'
  if (m.includes('Not authenticated')) return '登录状态已失效，请重新登录'
  if (m.includes('disabled drink public')) return '未上架的酒款不能公开到酒单'
  if (m.includes('Invalid public_status')) return '状态值无效'
  if (m.includes('owner-only') || m.includes('only owner can publish')) {
    return '仅店主可发布或下线门店公开展示'
  }
  if (m.includes('Publish blocked')) {
    const match = m.match(/Publish blocked:\s*(.*)$/i)
    if (match?.[1]) {
      try {
        const parsed = JSON.parse(match[1])
        if (Array.isArray(parsed)) return parsed.join('\n')
      } catch {
        /* fall through */
      }
      return match[1]
    }
    return '尚未满足公开展示条件'
  }
  if (m.includes('only owner can change public price mode')) {
    return '仅店主可更改顾客端价格展示'
  }
  if (m.includes('Invalid public_price_mode')) {
    return '价格展示模式无效'
  }
  return m
}
