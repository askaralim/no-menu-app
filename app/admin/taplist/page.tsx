'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import {
  DEFAULT_OPENING_HOUR_PICKER,
  OPENING_HOUR_HOURS,
  OPENING_HOUR_MINUTES,
  openingHourJsonToPicker,
  pickerToOpeningHourJson,
  type OpeningHourJson,
  type OpeningHourPicker,
} from '@/lib/openingHour'
import {
  BAR_TAG_CATEGORY_ORDER,
  BREWING_TYPE_OPTIONS,
  groupBarTagsByCategory,
  type BarTagDefinition,
  type BrewingType,
} from '@/lib/barTags'
import { BeerBulkImportPanel } from '@/components/admin/BeerBulkImportPanel'
import { ProductPoolLinkSection } from '@/components/admin/ProductPoolLinkSection'
import { uploadTaplistCover, uploadTaplistDrinkImage } from '@/lib/taplistStorage'
import type { Category, Drink } from '@/lib/types'

type UserRole = 'owner' | 'staff' | 'super_admin' | null

type TenantTaplistRow = {
  id: string
  name: string
  slug: string
  is_public_visible: boolean
  display_name: string | null
  district: string | null
  address: string | null
  cover_image_url: string | null
  city: string
  country: string
  opening_hour: OpeningHourJson | null
  description: string | null
  brewing_type: BrewingType | null
}

type DrinkBeerProfile = {
  drink_id: string
  tenant_id: string
  brewery: string | null
  beer_style: string | null
  abv: number | null
  ibu: number | null
  country: string | null
  description: string | null
}

type DrinkServingRow = {
  id: string
  tenant_id: string
  drink_id: string
  serving_type: string
  label: string
  volume_ml: number | null
  price: number
  is_default: boolean
  is_active: boolean
  public_sort_order: number
}

const PUBLIC_STATUS = ['new', 'available', 'low', 'sold_out', 'coming_soon'] as const
const SERVING_TYPES = ['draft', 'can', 'bottle', 'flight', 'other'] as const

const PLATFORM_SLUG = '__platform__'

type BarOption = { id: string; name: string; slug: string }

function TaplistAdminPageInner() {
  const [role, setRole] = useState<UserRole>(null)
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [tenant, setTenant] = useState<TenantTaplistRow | null>(null)
  const [tenantForm, setTenantForm] = useState({
    display_name: '',
    district: '',
    address: '',
    cover_image_url: '',
    city: 'Shanghai',
    description: '',
  })
  const [openingHourPicker, setOpeningHourPicker] = useState<OpeningHourPicker>({
    ...DEFAULT_OPENING_HOUR_PICKER,
  })
  const [openingHourEnabled, setOpeningHourEnabled] = useState(false)
  const [tagCatalog, setTagCatalog] = useState<BarTagDefinition[]>([])
  const [selectedTagKeys, setSelectedTagKeys] = useState<string[]>([])
  const [brewingType, setBrewingType] = useState<BrewingType | ''>('')
  const [storefrontReady, setStorefrontReady] = useState(false)
  const [storefrontLoadError, setStorefrontLoadError] = useState<string | null>(null)
  const storefrontLoadGenRef = useRef(0)
  const [categories, setCategories] = useState<(Category & { is_public_visible?: boolean })[]>([])
  const [drinks, setDrinks] = useState<Drink[]>([])
  const [loading, setLoading] = useState(true)
  const [savingTenant, setSavingTenant] = useState(false)
  const [uploadingCover, setUploadingCover] = useState(false)
  const coverFileRef = useRef<HTMLInputElement>(null)
  const [visibilityBusy, setVisibilityBusy] = useState(false)
  const [expandedDrinkId, setExpandedDrinkId] = useState<string | null>(null)
  const [barOptions, setBarOptions] = useState<BarOption[]>([])
  const router = useRouter()
  const searchParams = useSearchParams()

  const isOwner = role === 'owner' || role === 'super_admin'
  const isSuperAdmin = role === 'super_admin'

  const loadRoleAndTenant = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: roles } = await supabase.from('user_roles').select('role, tenant_id').eq('user_id', user.id)
    const list = roles ?? []
    const urlTenant = searchParams.get('tenant')
    let tid: string | null = null

    if (list.some((r) => r.role === 'super_admin')) {
      setRole('super_admin')
      type AdminTenantRow = { id: string; slug: string | null; name: string }
      const { data: tenants, error: tenantsErr } = await supabase.rpc('admin_list_tenants')
      const bars = tenantsErr
        ? []
        : ((tenants ?? []) as AdminTenantRow[]).filter(
            (t) => t.slug != null && t.slug !== PLATFORM_SLUG
          )
      if (tenantsErr) console.error(tenantsErr)
      setBarOptions(bars.map((t) => ({ id: t.id, name: t.name, slug: t.slug! })))
      if (urlTenant && bars.some((t) => t.id === urlTenant)) tid = urlTenant
      else if (bars.length > 0) tid = bars[0].id
    } else {
      const ownerRows = list.filter((r) => r.role === 'owner')
      if (ownerRows.length > 0) {
        setRole('owner')
        const allowed = ownerRows.map((r) => r.tenant_id)
        const { data: ownerBars } = await supabase
          .from('tenants')
          .select('id, name, slug')
          .in('id', allowed)
        const options = (ownerBars ?? [])
          .filter((t) => t.slug !== PLATFORM_SLUG)
          .map((t) => ({ id: t.id, name: t.name, slug: t.slug }))
        setBarOptions(options)
        if (urlTenant && allowed.includes(urlTenant)) tid = urlTenant
        else tid = ownerRows[0].tenant_id
      } else if (list[0]) {
        setRole(list[0].role as UserRole)
        tid = list[0].tenant_id
      }
    }
    setTenantId(tid)
  }, [searchParams])

  const loadTagCatalog = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_bar_tag_catalog')
    if (error) {
      console.error(error)
      return
    }
    setTagCatalog((data ?? []) as BarTagDefinition[])
  }, [])

  const resetStorefrontForm = useCallback(() => {
    setSelectedTagKeys([])
    setBrewingType('')
    setStorefrontReady(false)
    setStorefrontLoadError(null)
  }, [])

  const loadTenant = useCallback(async (tid: string, loadGen: number) => {
    resetStorefrontForm()

    const { data, error } = await supabase
      .from('tenants')
      .select('id,name,slug,is_public_visible,display_name,district,address,opening_hour,description,cover_image_url,city,country,brewing_type')
      .eq('id', tid)
      .single()
    if (loadGen !== storefrontLoadGenRef.current) return
    if (error) {
      console.error(error)
      setStorefrontLoadError('门店信息加载失败，请刷新后重试')
      return
    }
    if (!data) return

    const row = data as TenantTaplistRow
    setTenant(row)
    setTenantForm({
      display_name: row.display_name ?? '',
      district: row.district ?? '',
      address: row.address ?? '',
      cover_image_url: row.cover_image_url ?? '',
      city: row.city ?? 'Shanghai',
      description: row.description ?? '',
    })
    const hasHours = row.opening_hour != null
    setOpeningHourEnabled(hasHours)
    setOpeningHourPicker(
      hasHours ? openingHourJsonToPicker(row.opening_hour) : { ...DEFAULT_OPENING_HOUR_PICKER }
    )
    setBrewingType(row.brewing_type ?? '')

    const { data: tagRows, error: tagError } = await supabase
      .from('tenant_bar_tags')
      .select('tag_key')
      .eq('tenant_id', tid)
    if (loadGen !== storefrontLoadGenRef.current) return
    if (tagError) {
      console.error(tagError)
      setStorefrontLoadError('门店标签加载失败，暂不可保存标签与酿造信息')
      return
    }

    setSelectedTagKeys((tagRows ?? []).map((r) => r.tag_key as string))
    setStorefrontReady(true)
  }, [resetStorefrontForm])

  const buildOpeningHourPayload = (): OpeningHourJson | null => {
    if (!openingHourEnabled) return null
    return pickerToOpeningHourJson(openingHourPicker)
  }

  const buildStorefrontRpcPayload = () => ({
    p_display_name: tenantForm.display_name,
    p_district: tenantForm.district,
    p_address: tenantForm.address,
    p_cover_image_url: tenantForm.cover_image_url,
    p_city: tenantForm.city || 'Shanghai',
    p_opening_hour: buildOpeningHourPayload(),
    p_description: tenantForm.description,
    ...(storefrontReady
      ? {
          p_update_storefront_extras: true,
          p_tag_keys: selectedTagKeys,
          p_brewing_type: brewingType || null,
        }
      : { p_update_storefront_extras: false }),
  })

  const storefrontSaveBlocked = !storefrontReady || Boolean(storefrontLoadError)

  const groupedTags = useMemo(() => groupBarTagsByCategory(tagCatalog), [tagCatalog])

  const toggleTagKey = (key: string) => {
    setSelectedTagKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))
  }

  const loadCategories = useCallback(async (tid: string) => {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('tenant_id', tid)
      .order('sort_order')
    if (error) {
      console.error(error)
      return
    }
    setCategories((data ?? []) as (Category & { is_public_visible?: boolean })[])
  }, [])

  const loadDrinks = useCallback(async (tid: string) => {
    const { data, error } = await supabase
      .from('drinks')
      .select(
        'id,category_id,brand_name,name,volume_ml,price,price_unit,price_bottle,price_unit_bottle,sort_order,enabled,stock,ml_per_cup,ml_per_bottle,created_at,image_url,is_public_visible,public_status,public_sort_order,product_id,display_name,display_description'
      )
      .eq('tenant_id', tid)
      .eq('enabled', true)
      .order('sort_order')
    if (error) {
      console.error(error)
      return
    }
    setDrinks((data ?? []) as Drink[])
  }, [])

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      await Promise.all([loadRoleAndTenant(), loadTagCatalog()])
      setLoading(false)
    })()
  }, [loadRoleAndTenant, loadTagCatalog])

  useEffect(() => {
    if (!tenantId || !isOwner) return
    const loadGen = ++storefrontLoadGenRef.current
    ;(async () => {
      await Promise.all([
        loadTenant(tenantId, loadGen),
        loadCategories(tenantId),
        loadDrinks(tenantId),
      ])
    })()
  }, [tenantId, isOwner, loadTenant, loadCategories, loadDrinks])

  const handleCoverFile = async (file: File) => {
    if (!tenantId || storefrontSaveBlocked) return
    setUploadingCover(true)
    try {
      const publicUrl = await uploadTaplistCover(supabase, tenantId, file)
      const nextForm = { ...tenantForm, cover_image_url: publicUrl }
      setTenantForm(nextForm)
      const { error } = await supabase.rpc('set_tenant_taplist_storefront', {
        p_tenant_id: tenantId,
        ...buildStorefrontRpcPayload(),
        p_cover_image_url: publicUrl,
      })
      if (error) throw error
      alert('封面已上传并保存')
      const loadGen = ++storefrontLoadGenRef.current
      await loadTenant(tenantId, loadGen)
    } catch (err) {
      console.error(err)
      alert(err instanceof Error ? err.message : '封面上传失败')
    } finally {
      setUploadingCover(false)
      if (coverFileRef.current) coverFileRef.current.value = ''
    }
  }

  const handleSaveStorefront = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!tenantId || storefrontSaveBlocked) return
    setSavingTenant(true)
    try {
      const { error } = await supabase.rpc('set_tenant_taplist_storefront', {
        p_tenant_id: tenantId,
        ...buildStorefrontRpcPayload(),
      })
      if (error) throw error
      alert('门店 Tap List 信息已保存')
      const loadGen = ++storefrontLoadGenRef.current
      await loadTenant(tenantId, loadGen)
    } catch (err) {
      console.error(err)
      alert('保存失败（请在 Supabase 执行最新 install_all_in_one / taplist_mvp_patch，含 set_tenant_taplist_storefront）')
    } finally {
      setSavingTenant(false)
    }
  }

  const togglePublicVisibility = async () => {
    if (!tenantId || !tenant) return
    setVisibilityBusy(true)
    try {
      const next = !tenant.is_public_visible
      const { error } = await supabase.rpc('set_tenant_public_visibility', {
        p_tenant_id: tenantId,
        p_visible: next,
      })
      if (error) throw error
      setTenant({ ...tenant, is_public_visible: next })
    } catch (err) {
      console.error(err)
      alert('更新公开可见性失败')
    } finally {
      setVisibilityBusy(false)
    }
  }


  const drinksByCategory = useMemo(() => {
    const map: Record<string, Drink[]> = {}
    for (const d of drinks) {
      if (!map[d.category_id]) map[d.category_id] = []
      map[d.category_id].push(d)
    }
    return map
  }, [drinks])

  const switchTenant = (id: string) => {
    router.push(`/admin/taplist?tenant=${id}`)
  }

  const toggleDrinkPublic = async (drink: Drink, nextVisible: boolean) => {
    try {
      const { error } = await supabase.rpc('set_drink_taplist_consumer_fields', {
        p_drink_id: drink.id,
        p_image_url: drink.image_url ?? '',
        p_is_public_visible: nextVisible,
        p_public_status: drink.public_status || 'available',
        p_public_sort_order: drink.public_sort_order ?? 0,
      })
      if (error) throw error
      if (tenantId) await loadDrinks(tenantId)
    } catch (err) {
      console.error(err)
      alert(err instanceof Error ? err.message : '更新酒款公开状态失败')
    }
  }

  const toggleCategoryVisible = async (cat: Category & { is_public_visible?: boolean }) => {
    const next = !(cat.is_public_visible !== false)
    const { error } = await supabase.from('categories').update({ is_public_visible: next }).eq('id', cat.id)
    if (error) {
      console.error(error)
      alert('更新分类失败')
      return
    }
    setCategories((prev) => prev.map((c) => (c.id === cat.id ? { ...c, is_public_visible: next } : c)))
  }

  if (loading) {
    return (
      <div className="admin-container">
        <p>加载中...</p>
      </div>
    )
  }

  if (!isOwner) {
    return (
      <div className="admin-container">
        <div className="admin-header">
          <h1>Tap List 发布</h1>
        </div>
        <p>仅店主可管理 Tap List 公开设置与酒款展示字段。</p>
      </div>
    )
  }

  if (!tenantId) {
    return (
      <div className="admin-container">
        <div className="admin-header">
          <h1>Tap List 发布</h1>
        </div>
        <p>
          当前账号未绑定门店。超级管理员请先在{' '}
          <a href="/admin/platform">平台管理</a> 创建酒吧，或通过「编辑 Tap List」进入指定门店。
        </p>
      </div>
    )
  }

  if (!tenant) {
    return (
      <div className="admin-container">
        <p>未找到门店。</p>
      </div>
    )
  }

  return (
    <div className="admin-container">
      <div className="admin-header">
        <h1>Tap List 发布</h1>
        <p style={{ color: '#4b5563', marginTop: '0.5rem' }}>
          当前编辑门店：<strong>{tenant.display_name || tenant.name}</strong>
          <code style={{ marginLeft: 8, fontSize: '0.9rem' }}>{tenant.slug}</code>
        </p>
        {barOptions.length > 1 ? (
          <div style={{ marginTop: '0.75rem' }}>
            <label className="admin-label" htmlFor="tenant-picker">
              切换门店
            </label>
            <select
              id="tenant-picker"
              className="admin-input"
              style={{ maxWidth: 360, marginTop: 4 }}
              value={tenantId ?? ''}
              onChange={(e) => switchTenant(e.target.value)}
            >
              {barOptions.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.slug})
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      <div className="admin-section">
        <h2>门店公开可见</h2>
        <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
          开启后，符合条件的酒款会出现在消费者 Tap List App（仍受分类/酒款单独开关与数据库规则约束）。
        </p>
        <label className="admin-label admin-label-checkbox">
          <input
            type="checkbox"
            checked={tenant.is_public_visible}
            disabled={visibilityBusy}
            onChange={togglePublicVisibility}
          />
          <span>{tenant.is_public_visible ? '已对消费者公开' : '未公开'}</span>
        </label>
      </div>

      <div className="admin-section">
        <h2>门店展示信息</h2>
        <form onSubmit={handleSaveStorefront} className="admin-form">
          <input
            className="admin-input"
            placeholder="展示名称（空则使用店名）"
            value={tenantForm.display_name}
            onChange={(e) => setTenantForm({ ...tenantForm, display_name: e.target.value })}
          />
          <input
            className="admin-input"
            placeholder="区域 / 商圈"
            value={tenantForm.district}
            onChange={(e) => setTenantForm({ ...tenantForm, district: e.target.value })}
          />
          <input
            className="admin-input"
            placeholder="详细地址"
            value={tenantForm.address}
            onChange={(e) => setTenantForm({ ...tenantForm, address: e.target.value })}
          />
          <textarea
            className="admin-input"
            placeholder="门店简介"
            rows={4}
            value={tenantForm.description}
            onChange={(e) => setTenantForm({ ...tenantForm, description: e.target.value })}
          />
          <div className="admin-form-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '0.5rem' }}>
            <span className="admin-label">酿造信息</span>
            {BREWING_TYPE_OPTIONS.map((option) => (
              <label key={option.value || 'none'} className="admin-label admin-label-checkbox">
                <input
                  type="radio"
                  name="brewing_type"
                  checked={brewingType === option.value}
                  disabled={storefrontSaveBlocked}
                  onChange={() => setBrewingType(option.value)}
                />
                <span>
                  {option.label}
                  {option.hint ? ` — ${option.hint}` : ''}
                </span>
              </label>
            ))}
          </div>
          {storefrontLoadError ? (
            <p style={{ color: '#b45309', margin: 0 }}>{storefrontLoadError}</p>
          ) : null}
          {tagCatalog.length > 0 ? (
            <div className="admin-form-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '0.75rem' }}>
              <span className="admin-label">门店标签</span>
              <p style={{ color: '#6b7280', margin: 0 }}>选择 3–6 个最能代表门店的标签</p>
              {BAR_TAG_CATEGORY_ORDER.map((category) => {
                const tags = groupedTags[category]
                if (!tags?.length) return null
                return (
                  <div key={category}>
                    <div style={{ color: '#374151', fontWeight: 600, marginBottom: '0.35rem' }}>{category}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem 1rem' }}>
                      {tags.map((tag) => (
                        <label key={tag.key} className="admin-label admin-label-checkbox">
                          <input
                            type="checkbox"
                            checked={selectedTagKeys.includes(tag.key)}
                            disabled={storefrontSaveBlocked}
                            onChange={() => toggleTagKey(tag.key)}
                          />
                          <span>{tag.label_zh}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : null}
          <div className="admin-form-row">
            <label className="admin-label admin-label-checkbox">
              <input
                type="checkbox"
                checked={openingHourEnabled}
                onChange={(e) => setOpeningHourEnabled(e.target.checked)}
              />
              <span>设置营业时间</span>
            </label>
          </div>
          {openingHourEnabled ? (
            <OpeningHourPickerFields picker={openingHourPicker} onChange={setOpeningHourPicker} />
          ) : null}
          <TaplistImageUploadField
            label="封面图"
            hint="JPEG / PNG / WebP，最大 2MB"
            busy={uploadingCover}
            disabled={storefrontSaveBlocked}
            previewUrl={tenantForm.cover_image_url || null}
            inputRef={coverFileRef}
            onFileSelected={handleCoverFile}
          />
          <input
            className="admin-input"
            placeholder="封面图 URL（可粘贴外链，或上方上传）"
            value={tenantForm.cover_image_url}
            onChange={(e) => setTenantForm({ ...tenantForm, cover_image_url: e.target.value })}
          />
          <input
            className="admin-input"
            placeholder="城市（默认 Shanghai）"
            value={tenantForm.city}
            onChange={(e) => setTenantForm({ ...tenantForm, city: e.target.value })}
          />
          <button
            type="submit"
            className="admin-button admin-button-primary"
            disabled={savingTenant || storefrontSaveBlocked}>
            {savingTenant ? '保存中…' : storefrontSaveBlocked ? '门店信息加载中…' : '保存门店信息'}
          </button>
        </form>
      </div>

      {isSuperAdmin && tenantId ? (
        <BeerBulkImportPanel
          tenantId={tenantId}
          onImported={() => {
            void loadDrinks(tenantId)
            void loadCategories(tenantId)
          }}
        />
      ) : null}

      <div className="admin-section">
        <h2>分类与酒款（Tap List）</h2>
        <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
          仅显示 POS 已启用（enabled）的酒款。未启用的酒请在「酒品管理」中上架。售价与容量以「供应规格」为准。
        </p>
        {categories.length === 0 ? (
          <p style={{ color: '#6b7280' }}>暂无分类，请先在「分类管理」中添加。</p>
        ) : (
          categories.map((c) => {
            const catDrinks = drinksByCategory[c.id] ?? []
            return (
              <div
                key={c.id}
                style={{
                  border: '1px solid #e5e7eb',
                  borderRadius: 8,
                  marginBottom: 16,
                  padding: 12,
                  background: '#fff',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: catDrinks.length > 0 ? 12 : 0,
                  }}
                >
                  <strong style={{ fontSize: '1.05rem' }}>{c.name}</strong>
                  <label className="admin-label-checkbox">
                    <input
                      type="checkbox"
                      checked={c.is_public_visible !== false}
                      onChange={() => toggleCategoryVisible(c)}
                    />
                    <span>公开</span>
                  </label>
                </div>
                {catDrinks.length === 0 ? (
                  <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>
                    该分类下暂无已上架酒款 — 请先在「酒品管理」中启用。
                  </p>
                ) : (
                  catDrinks.map((d) => (
                    <div key={d.id} style={{ marginLeft: 8, marginBottom: 8 }}>
                      <div
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          alignItems: 'center',
                          gap: 12,
                          padding: '8px 0',
                          borderBottom: expandedDrinkId === d.id ? 'none' : '1px solid #f3f4f6',
                        }}
                      >
                        <span style={{ flex: '1 1 200px', minWidth: 0 }}>
                          {[d.brand_name, d.name].filter(Boolean).join(' · ')}
                        </span>
                        <label className="admin-label-checkbox">
                          <input
                            type="checkbox"
                            checked={!!d.is_public_visible}
                            onChange={(e) => void toggleDrinkPublic(d, e.target.checked)}
                          />
                          <span>公开</span>
                        </label>
                        <button
                          type="button"
                          className="admin-button admin-button-secondary"
                          onClick={() => setExpandedDrinkId((id) => (id === d.id ? null : d.id))}
                        >
                          {expandedDrinkId === d.id ? '收起' : '编辑 Tap List'}
                        </button>
                      </div>
                      {expandedDrinkId === d.id ? (
                        <DrinkTaplistPanel
                          drink={d}
                          tenantId={tenantId}
                          isSuperAdmin={isSuperAdmin}
                          expanded
                          onToggle={() => setExpandedDrinkId(null)}
                          onDrinkSaved={() => tenantId && loadDrinks(tenantId)}
                          hideHeader
                        />
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

function servingRowToPatch(row: DrinkServingRow) {
  return {
    serving_type: row.serving_type,
    label: row.label,
    volume_ml: row.volume_ml,
    price: row.price,
    is_default: row.is_default,
    is_active: row.is_active,
    public_sort_order: row.public_sort_order,
  }
}

function DrinkTaplistPanel({
  drink,
  tenantId,
  isSuperAdmin,
  expanded,
  onToggle,
  onDrinkSaved,
  hideHeader = false,
}: {
  drink: Drink
  tenantId: string
  isSuperAdmin: boolean
  expanded: boolean
  onToggle: () => void
  onDrinkSaved: () => void
  hideHeader?: boolean
}) {
  const [form, setForm] = useState({
    image_url: drink.image_url ?? '',
    is_public_visible: !!drink.is_public_visible,
    public_status: (drink.public_status as (typeof PUBLIC_STATUS)[number]) || 'available',
    public_sort_order: drink.public_sort_order ?? 0,
  })
  const [beer, setBeer] = useState({
    brewery: '',
    beer_style: '',
    abv: '' as string | number,
    ibu: '' as string | number,
    country: '',
    description: '',
  })
  const [servings, setServings] = useState<DrinkServingRow[]>([])
  const servingsRef = useRef(servings)
  const [initialLoading, setInitialLoading] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [beerProfileCollapsed, setBeerProfileCollapsed] = useState(false)
  const drinkImageFileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    servingsRef.current = servings
  }, [servings])

  useEffect(() => {
    setForm({
      image_url: drink.image_url ?? '',
      is_public_visible: !!drink.is_public_visible,
      public_status: (drink.public_status as (typeof PUBLIC_STATUS)[number]) || 'available',
      public_sort_order: drink.public_sort_order ?? 0,
    })
  }, [drink.id])

  const fetchServings = useCallback(async () => {
    const { data: so, error } = await supabase
      .from('drink_serving_options')
      .select('*')
      .eq('drink_id', drink.id)
      .order('public_sort_order')
    if (error) {
      console.error(error)
      return
    }
    setServings((so ?? []) as DrinkServingRow[])
  }, [drink.id])

  const loadPanel = useCallback(async () => {
    setInitialLoading(true)
    try {
      const { data: prof } = await supabase
        .from('drink_beer_profiles')
        .select('*')
        .eq('drink_id', drink.id)
        .maybeSingle()
      if (prof) {
        const p = prof as DrinkBeerProfile
        setBeer({
          brewery: p.brewery ?? '',
          beer_style: p.beer_style ?? '',
          abv: p.abv ?? '',
          ibu: p.ibu ?? '',
          country: p.country ?? '',
          description: p.description ?? '',
        })
      } else {
        setBeer({ brewery: '', beer_style: '', abv: '', ibu: '', country: '', description: '' })
      }
      await fetchServings()
    } finally {
      setInitialLoading(false)
    }
  }, [drink.id, fetchServings])

  useEffect(() => {
    if (expanded) void loadPanel()
  }, [expanded, loadPanel])

  useEffect(() => {
    setBeerProfileCollapsed(!!drink.product_id)
  }, [drink.id, drink.product_id])

  const persistServing = useCallback(
    async (id: string) => {
      const row = servingsRef.current.find((s) => s.id === id)
      if (!row) return
      const { error } = await supabase
        .from('drink_serving_options')
        .update(servingRowToPatch(row))
        .eq('id', id)
      if (error) {
        console.error(error)
        alert('更新规格失败')
        await fetchServings()
      }
    },
    [fetchServings]
  )

  const changeServing = useCallback(
    (id: string, patch: Partial<DrinkServingRow>, persist = false) => {
      let updatedRow: DrinkServingRow | undefined
      setServings((prev) => {
        const next = prev.map((s) => {
          if (s.id !== id) return s
          updatedRow = { ...s, ...patch }
          return updatedRow
        })
        servingsRef.current = next
        return next
      })
      if (persist && updatedRow) {
        void (async () => {
          const { error } = await supabase
            .from('drink_serving_options')
            .update(servingRowToPatch(updatedRow!))
            .eq('id', id)
          if (error) {
            console.error(error)
            alert('更新规格失败')
            await fetchServings()
          }
        })()
      }
    },
    [fetchServings]
  )

  const persistDrinkConsumerFields = async (patch: Partial<typeof form>) => {
    const next = { ...form, ...patch }
    if (next.is_public_visible && !drink.enabled) {
      throw new Error('请先在上架 POS（酒品管理）中启用该酒款，再对消费者公开 Tap List。')
    }
    const { error } = await supabase.rpc('set_drink_taplist_consumer_fields', {
      p_drink_id: drink.id,
      p_image_url: next.image_url,
      p_is_public_visible: next.is_public_visible,
      p_public_status: next.public_status,
      p_public_sort_order: next.public_sort_order,
    })
    if (error) throw error
    setForm(next)
  }

  const handleDrinkImageFile = async (file: File) => {
    setUploadingImage(true)
    try {
      const publicUrl = await uploadTaplistDrinkImage(supabase, tenantId, drink.id, file)
      await persistDrinkConsumerFields({ image_url: publicUrl })
      alert('酒款图片已上传并保存')
      onDrinkSaved()
    } catch (err) {
      console.error(err)
      alert(err instanceof Error ? err.message : '酒款图片上传失败')
    } finally {
      setUploadingImage(false)
      if (drinkImageFileRef.current) drinkImageFileRef.current.value = ''
    }
  }

  const saveDrink = async () => {
    try {
      await persistDrinkConsumerFields({})
      alert('酒款 Tap List 字段已保存')
      onDrinkSaved()
    } catch (err) {
      console.error(err)
      alert(err instanceof Error ? err.message : '保存酒款失败')
    }
  }

  const saveBeer = async () => {
    const row = {
      tenant_id: tenantId,
      drink_id: drink.id,
      brewery: beer.brewery || null,
      beer_style: beer.beer_style || null,
      abv: beer.abv === '' ? null : Number(beer.abv),
      ibu: beer.ibu === '' ? null : Number(beer.ibu),
      country: beer.country || null,
      description: beer.description || null,
    }
    const { error } = await supabase.from('drink_beer_profiles').upsert(row, { onConflict: 'drink_id' })
    if (error) {
      console.error(error)
      alert('保存啤酒档案失败')
      return
    }
    alert('啤酒档案已保存')
  }

  const addServing = async () => {
    const sort = servingsRef.current.length
    const { data, error } = await supabase
      .from('drink_serving_options')
      .insert([
        {
          tenant_id: tenantId,
          drink_id: drink.id,
          serving_type: 'draft',
          label: '品脱',
          volume_ml: 473,
          price: 0,
          is_default: sort === 0,
          is_active: true,
          public_sort_order: sort,
        },
      ])
      .select('*')
    if (error) {
      console.error(error)
      alert('添加规格失败')
      return
    }
    const row = (data?.[0] ?? null) as DrinkServingRow | null
    if (row) setServings((prev) => [...prev, row])
    else await fetchServings()
  }

  const deleteServing = async (id: string) => {
    if (!confirm('删除该供应规格？')) return
    const { error } = await supabase.from('drink_serving_options').delete().eq('id', id)
    if (error) {
      console.error(error)
      alert('删除失败')
      return
    }
    setServings((prev) => prev.filter((s) => s.id !== id))
  }

  if (!expanded) return null

  return (
    <div className="taplist-drink-panel">
      {!hideHeader ? (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong>{drink.name}</strong>
            <button type="button" className="admin-button admin-button-secondary" onClick={onToggle}>
              收起
            </button>
          </div>
          <label className="admin-label-checkbox" style={{ marginTop: 8 }}>
            <input
              type="checkbox"
              checked={form.is_public_visible}
              onChange={(e) => setForm({ ...form, is_public_visible: e.target.checked })}
            />
            <span>对消费者公开（Tap List）</span>
          </label>
        </>
      ) : null}

      {initialLoading ? (
        <p className="taplist-drink-panel-loading">加载酒款详情…</p>
      ) : (
        <>
          <ProductPoolLinkSection
            drink={drink}
            isSuperAdmin={isSuperAdmin}
            beerProfile={beer}
            onLinked={onDrinkSaved}
            onBeerProfileCollapseChange={setBeerProfileCollapsed}
          />

          <section className="taplist-drink-panel-section">
            <h4 className="taplist-drink-panel-section-title">展示字段</h4>
            <p className="taplist-drink-panel-section-hint">消费者 App 看到的图片、库存状态与排序</p>
            <TaplistImageUploadField
              label="酒款图片"
              hint="JPEG / PNG / WebP，最大 2MB"
              busy={uploadingImage}
              previewUrl={form.image_url || null}
              inputRef={drinkImageFileRef}
              onFileSelected={handleDrinkImageFile}
            />
            <div className="taplist-panel-grid" style={{ marginTop: 12 }}>
              <div className="taplist-field taplist-field-span-2">
                <label htmlFor={`${drink.id}-image-url`}>图片 URL</label>
                <input
                  id={`${drink.id}-image-url`}
                  className="admin-input"
                  placeholder="可粘贴外链，或上方上传"
                  value={form.image_url}
                  onChange={(e) => setForm({ ...form, image_url: e.target.value })}
                />
              </div>
              <div className="taplist-field">
                <label htmlFor={`${drink.id}-public-status`}>库存状态</label>
                <select
                  id={`${drink.id}-public-status`}
                  className="admin-input"
                  value={form.public_status}
                  onChange={(e) =>
                    setForm({ ...form, public_status: e.target.value as (typeof PUBLIC_STATUS)[number] })
                  }
                >
                  {PUBLIC_STATUS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="taplist-field">
                <label htmlFor={`${drink.id}-public-sort`}>Tap List 排序</label>
                <input
                  id={`${drink.id}-public-sort`}
                  className="admin-input"
                  type="number"
                  value={form.public_sort_order}
                  onChange={(e) =>
                    setForm({ ...form, public_sort_order: parseInt(e.target.value, 10) || 0 })
                  }
                />
              </div>
            </div>
            <div className="taplist-panel-actions">
              <button type="button" className="admin-button admin-button-primary" onClick={saveDrink}>
                保存酒款
              </button>
            </div>
          </section>

          <section className="taplist-drink-panel-section">
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                marginBottom: beerProfileCollapsed ? 0 : 4,
              }}
            >
              <div>
                <h4 className="taplist-drink-panel-section-title" style={{ marginBottom: 4 }}>
                  啤酒档案
                </h4>
                <p className="taplist-drink-panel-section-hint" style={{ margin: 0 }}>
                  {beerProfileCollapsed
                    ? '本地备用档案（仅当商品池对应字段为空时生效）'
                    : '酒厂、风格、酒精度等详情页信息'}
                </p>
              </div>
              {beerProfileCollapsed ? (
                <button
                  type="button"
                  className="admin-button admin-button-secondary"
                  onClick={() => setBeerProfileCollapsed(false)}
                >
                  展开备用档案
                </button>
              ) : null}
            </div>
            {!beerProfileCollapsed ? (
              <>
                <div className="taplist-panel-grid">
                  <div className="taplist-field">
                    <label htmlFor={`${drink.id}-brewery`}>酒厂</label>
                    <input
                      id={`${drink.id}-brewery`}
                      className="admin-input"
                      value={beer.brewery}
                      onChange={(e) => setBeer({ ...beer, brewery: e.target.value })}
                    />
                  </div>
                  <div className="taplist-field">
                    <label htmlFor={`${drink.id}-style`}>风格</label>
                    <input
                      id={`${drink.id}-style`}
                      className="admin-input"
                      value={beer.beer_style}
                      onChange={(e) => setBeer({ ...beer, beer_style: e.target.value })}
                    />
                  </div>
                  <div className="taplist-field">
                    <label htmlFor={`${drink.id}-abv`}>ABV %</label>
                    <input
                      id={`${drink.id}-abv`}
                      className="admin-input"
                      value={beer.abv}
                      onChange={(e) => setBeer({ ...beer, abv: e.target.value })}
                    />
                  </div>
                  <div className="taplist-field">
                    <label htmlFor={`${drink.id}-ibu`}>IBU</label>
                    <input
                      id={`${drink.id}-ibu`}
                      className="admin-input"
                      value={beer.ibu}
                      onChange={(e) => setBeer({ ...beer, ibu: e.target.value })}
                    />
                  </div>
                  <div className="taplist-field">
                    <label htmlFor={`${drink.id}-country`}>国家</label>
                    <input
                      id={`${drink.id}-country`}
                      className="admin-input"
                      value={beer.country}
                      onChange={(e) => setBeer({ ...beer, country: e.target.value })}
                    />
                  </div>
                  <div className="taplist-field taplist-field-span-2">
                    <label htmlFor={`${drink.id}-desc`}>酒款介绍</label>
                    <textarea
                      id={`${drink.id}-desc`}
                      className="admin-input"
                      rows={3}
                      value={beer.description}
                      onChange={(e) => setBeer({ ...beer, description: e.target.value })}
                    />
                  </div>
                </div>
                <div className="taplist-panel-actions">
                  <button type="button" className="admin-button admin-button-primary" onClick={saveBeer}>
                    保存啤酒档案
                  </button>
                  {drink.product_id ? (
                    <button
                      type="button"
                      className="admin-button admin-button-secondary"
                      onClick={() => setBeerProfileCollapsed(true)}
                    >
                      收起
                    </button>
                  ) : null}
                </div>
              </>
            ) : null}
          </section>

          <section className="taplist-drink-panel-section">
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                marginBottom: 4,
              }}
            >
              <div>
                <h4 className="taplist-drink-panel-section-title" style={{ marginBottom: 4 }}>
                  供应规格（容量与价格）
                </h4>
                <p className="taplist-drink-panel-section-hint" style={{ margin: 0 }}>
                  编辑时自动保存；失焦或切换选项后写入数据库，不会刷新整页
                </p>
              </div>
              <button type="button" className="admin-button admin-button-secondary" onClick={addServing}>
                新增规格
              </button>
            </div>
            {servings.length === 0 ? (
              <p style={{ fontSize: 13, color: '#6b7280', margin: '12px 0 0' }}>暂无规格，点击「新增规格」添加。</p>
            ) : (
              <div className="taplist-serving-list">
                {servings.map((s) => (
                  <ServingOptionCard
                    key={s.id}
                    row={s}
                    onChange={changeServing}
                    onBlurPersist={persistServing}
                    onDelete={deleteServing}
                  />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}

function ServingOptionCard({
  row,
  onChange,
  onBlurPersist,
  onDelete,
}: {
  row: DrinkServingRow
  onChange: (id: string, patch: Partial<DrinkServingRow>, persist?: boolean) => void
  onBlurPersist: (id: string) => void
  onDelete: (id: string) => void
}) {
  return (
    <div className="taplist-serving-card">
      <div className="taplist-serving-card-top">
        <div className="taplist-field">
          <label>类型</label>
          <select
            className="admin-input"
            value={row.serving_type}
            onChange={(e) => onChange(row.id, { serving_type: e.target.value }, true)}
          >
            {SERVING_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className="admin-button admin-button-danger taplist-serving-card-delete"
          onClick={() => onDelete(row.id)}
        >
          删除
        </button>
      </div>
      <div className="taplist-serving-card-grid">
        <div className="taplist-field">
          <label>标签</label>
          <input
            className="admin-input"
            value={row.label}
            onChange={(e) => onChange(row.id, { label: e.target.value })}
            onBlur={() => onBlurPersist(row.id)}
          />
        </div>
        <div className="taplist-field">
          <label>容量 (ml)</label>
          <input
            className="admin-input"
            type="number"
            value={row.volume_ml ?? ''}
            onChange={(e) => {
              const v = e.target.value
              onChange(row.id, { volume_ml: v === '' ? null : parseInt(v, 10) })
            }}
            onBlur={() => onBlurPersist(row.id)}
          />
        </div>
        <div className="taplist-field">
          <label>价格</label>
          <input
            className="admin-input"
            type="number"
            step="0.01"
            value={row.price}
            onChange={(e) => onChange(row.id, { price: parseFloat(e.target.value) || 0 })}
            onBlur={() => onBlurPersist(row.id)}
          />
        </div>
        <div className="taplist-field">
          <label>排序</label>
          <input
            className="admin-input"
            type="number"
            value={row.public_sort_order}
            onChange={(e) =>
              onChange(row.id, { public_sort_order: parseInt(e.target.value, 10) || 0 })
            }
            onBlur={() => onBlurPersist(row.id)}
          />
        </div>
      </div>
      <div className="taplist-serving-toggles">
        <label>
          <input
            type="checkbox"
            checked={row.is_default}
            onChange={(e) => onChange(row.id, { is_default: e.target.checked }, true)}
          />
          默认规格
        </label>
        <label>
          <input
            type="checkbox"
            checked={row.is_active}
            onChange={(e) => onChange(row.id, { is_active: e.target.checked }, true)}
          />
          启用
        </label>
      </div>
    </div>
  )
}

function TaplistImageUploadField({
  label,
  hint,
  busy,
  disabled = false,
  previewUrl,
  inputRef,
  onFileSelected,
}: {
  label: string
  hint: string
  busy: boolean
  disabled?: boolean
  previewUrl: string | null
  inputRef: React.RefObject<HTMLInputElement>
  onFileSelected: (file: File) => void | Promise<void>
}) {
  const inputDisabled = busy || disabled
  return (
    <div style={{ marginBottom: 8 }}>
      <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 6 }}>{hint}</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt=""
            style={{ width: 120, height: 68, objectFit: 'cover', borderRadius: 6, border: '1px solid #e5e7eb' }}
          />
        ) : null}
        <label
          className="admin-button admin-button-secondary"
          style={{ cursor: inputDisabled ? 'not-allowed' : 'pointer', opacity: inputDisabled ? 0.6 : 1 }}>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={inputDisabled}
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void onFileSelected(file)
            }}
          />
          {busy ? '上传中…' : inputDisabled && disabled ? '加载中…' : `上传${label}`}
        </label>
      </div>
    </div>
  )
}

function OpeningHourPickerFields({
  picker,
  onChange,
}: {
  picker: OpeningHourPicker
  onChange: (next: OpeningHourPicker) => void
}) {
  const selectStyle: React.CSSProperties = {
    padding: '8px 10px',
    borderRadius: 6,
    border: '1px solid #d1d5db',
    background: '#fff',
    fontSize: 14,
  }

  return (
    <div style={{ marginBottom: 12 }}>
      <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 8 }}>营业时间（每日相同）</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 14, color: '#374151' }}>从</span>
        <select
          style={selectStyle}
          value={picker.fromHour}
          onChange={(e) => onChange({ ...picker, fromHour: e.target.value })}
        >
          {OPENING_HOUR_HOURS.map((h) => (
            <option key={`from-h-${h}`} value={h}>
              {h}
            </option>
          ))}
        </select>
        <span>:</span>
        <select
          style={selectStyle}
          value={picker.fromMinute}
          onChange={(e) => onChange({ ...picker, fromMinute: e.target.value })}
        >
          {OPENING_HOUR_MINUTES.map((m) => (
            <option key={`from-m-${m}`} value={m}>
              {m}
            </option>
          ))}
        </select>
        <select
          style={selectStyle}
          value={picker.fromPeriod}
          onChange={(e) => onChange({ ...picker, fromPeriod: e.target.value as OpeningHourPicker['fromPeriod'] })}
        >
          <option value="AM">AM</option>
          <option value="PM">PM</option>
        </select>
        <span style={{ fontSize: 14, color: '#374151', marginLeft: 4 }}>至</span>
        <select
          style={selectStyle}
          value={picker.toHour}
          onChange={(e) => onChange({ ...picker, toHour: e.target.value })}
        >
          {OPENING_HOUR_HOURS.map((h) => (
            <option key={`to-h-${h}`} value={h}>
              {h}
            </option>
          ))}
        </select>
        <span>:</span>
        <select
          style={selectStyle}
          value={picker.toMinute}
          onChange={(e) => onChange({ ...picker, toMinute: e.target.value })}
        >
          {OPENING_HOUR_MINUTES.map((m) => (
            <option key={`to-m-${m}`} value={m}>
              {m}
            </option>
          ))}
        </select>
        <select
          style={selectStyle}
          value={picker.toPeriod}
          onChange={(e) => onChange({ ...picker, toPeriod: e.target.value as OpeningHourPicker['toPeriod'] })}
        >
          <option value="AM">AM</option>
          <option value="PM">PM</option>
        </select>
      </div>
    </div>
  )
}



export default function TaplistAdminPage() {
  return (
    <Suspense fallback={
      <div className="admin-container">
        <p>加载中...</p>
      </div>
    }>
      <TaplistAdminPageInner />
    </Suspense>
  )
}
