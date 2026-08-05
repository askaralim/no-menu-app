import { supabase } from './supabase'

export type BarTagDefinition = {
  key: string
  label_zh: string
  category: string
  sort_order: number
}

export type OpeningHourJson = {
  open: string
  close: string
}

export type TenantStorefront = {
  display_name: string | null
  district: string | null
  address: string | null
  description: string | null
  city: string | null
  opening_hour: OpeningHourJson | null
  tag_keys: string[]
}

/** Canonical city keys used by consumer city switcher (e.g. Shanghai). */
export type TaplistCityOption = {
  city: string
  label: string
  sort_order: number
}

export async function listEnabledTaplistCities(): Promise<TaplistCityOption[]> {
  const { data, error } = await supabase
    .from('taplist_public_cities')
    .select('city,label,sort_order')
    .eq('is_enabled', true)
    .order('sort_order', { ascending: true })
  if (error) throw new Error(error.message || '加载城市列表失败')
  return (data || []) as TaplistCityOption[]
}

export async function getBarTagCatalog(): Promise<BarTagDefinition[]> {
  const { data, error } = await supabase.rpc('get_bar_tag_catalog')
  if (error) throw new Error(error.message || '加载标签失败')
  return (Array.isArray(data) ? data : []) as BarTagDefinition[]
}

export async function loadTenantStorefront(tenantId: string): Promise<TenantStorefront> {
  const { data: row, error } = await supabase
    .from('tenants')
    .select('display_name,district,address,description,city,opening_hour')
    .eq('id', tenantId)
    .maybeSingle()
  if (error) throw new Error(error.message || '加载门店资料失败')

  const { data: tags, error: tagError } = await supabase
    .from('tenant_bar_tags')
    .select('tag_key')
    .eq('tenant_id', tenantId)
  if (tagError) throw new Error(tagError.message || '加载标签失败')

  const oh = row?.opening_hour
  let opening_hour: OpeningHourJson | null = null
  if (oh && typeof oh === 'object' && !Array.isArray(oh)) {
    const o = oh as Record<string, unknown>
    if (typeof o.open === 'string' && typeof o.close === 'string') {
      opening_hour = { open: o.open, close: o.close }
    }
  }

  return {
    display_name: row?.display_name ?? null,
    district: row?.district ?? null,
    address: row?.address ?? null,
    description: row?.description ?? null,
    city: row?.city ?? null,
    opening_hour,
    tag_keys: (tags || []).map((t) => t.tag_key as string),
  }
}

export async function saveTenantStorefront(
  tenantId: string,
  input: {
    display_name: string
    district: string
    address: string
    description: string
    city: string
    opening_hour: OpeningHourJson | null
    tag_keys: string[]
  },
): Promise<void> {
  const { error } = await supabase.rpc('set_tenant_taplist_storefront', {
    p_tenant_id: tenantId,
    p_display_name: input.display_name,
    p_district: input.district,
    p_address: input.address,
    p_cover_image_url: null,
    p_city: input.city || 'Shanghai',
    p_opening_hour: input.opening_hour,
    p_description: input.description,
    p_update_storefront_extras: true,
    p_tag_keys: input.tag_keys,
    p_brewing_type: null,
  })
  if (error) throw new Error(error.message || '保存失败')
}

export function groupTagsByCategory(tags: BarTagDefinition[]): Record<string, BarTagDefinition[]> {
  const out: Record<string, BarTagDefinition[]> = {}
  for (const t of tags) {
    const cat = t.category || '其他'
    if (!out[cat]) out[cat] = []
    out[cat].push(t)
  }
  return out
}

/** Tenant「常用杯型」template row (no price). */
export type DefaultCupSize = {
  label: string | null
  volume_ml: number | null
  sort_order: number
}

export async function getTenantDefaultCupSizes(tenantId: string): Promise<DefaultCupSize[]> {
  const { data, error } = await supabase.rpc('get_tenant_default_cup_sizes', {
    p_tenant_id: tenantId,
  })
  if (error) throw new Error(error.message || '加载常用杯型失败')
  const res = data as { ok?: boolean; items?: DefaultCupSize[] }
  const items = Array.isArray(res?.items) ? res.items : []
  return items
    .map((it, i) => ({
      label: it.label?.trim() ? it.label.trim() : null,
      volume_ml:
        typeof it.volume_ml === 'number' && Number.isFinite(it.volume_ml) && it.volume_ml > 0
          ? Math.round(it.volume_ml)
          : null,
      sort_order: typeof it.sort_order === 'number' ? it.sort_order : i,
    }))
    .filter((it) => it.label != null || it.volume_ml != null)
    .sort((a, b) => a.sort_order - b.sort_order)
}

export async function setTenantDefaultCupSizes(
  tenantId: string,
  items: { label: string | null; volume_ml: number | null }[],
): Promise<DefaultCupSize[]> {
  const payload = items.map((it, i) => ({
    label: it.label,
    volume_ml: it.volume_ml,
    sort_order: i,
  }))
  const { data, error } = await supabase.rpc('set_tenant_default_cup_sizes', {
    p_tenant_id: tenantId,
    p_items: payload,
  })
  if (error) throw new Error(error.message || '保存常用杯型失败')
  const res = data as { ok?: boolean; items?: DefaultCupSize[] }
  if (!res?.ok) throw new Error('保存常用杯型失败')
  return Array.isArray(res.items) ? res.items : []
}
