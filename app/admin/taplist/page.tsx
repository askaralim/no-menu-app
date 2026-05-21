'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
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

export default function TaplistAdminPage() {
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
  const [categories, setCategories] = useState<(Category & { is_public_visible?: boolean })[]>([])
  const [drinks, setDrinks] = useState<Drink[]>([])
  const [loading, setLoading] = useState(true)
  const [savingTenant, setSavingTenant] = useState(false)
  const [uploadingCover, setUploadingCover] = useState(false)
  const coverFileRef = useRef<HTMLInputElement>(null)
  const [visibilityBusy, setVisibilityBusy] = useState(false)
  const [expandedDrinkId, setExpandedDrinkId] = useState<string | null>(null)

  const isOwner = role === 'owner' || role === 'super_admin'

  const loadRoleAndTenant = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: roles } = await supabase.from('user_roles').select('role, tenant_id').eq('user_id', user.id)
    const list = roles ?? []
    let tid: string | null = null
    const urlTenant =
      typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('tenant') : null

    if (list.some((r) => r.role === 'super_admin')) {
      setRole('super_admin')
      type AdminTenantRow = { id: string; slug: string | null }
      const { data: tenants, error: tenantsErr } = await supabase.rpc('admin_list_tenants')
      if (tenantsErr) {
        console.error(tenantsErr)
        tid = list.find((r) => r.tenant_id)?.tenant_id ?? null
      } else {
        const bars = ((tenants ?? []) as AdminTenantRow[]).filter(
          (t) => t.slug != null && t.slug !== '__platform__'
        )
        if (urlTenant && bars.some((t) => t.id === urlTenant)) tid = urlTenant
        else {
          const preferred = bars.find((t) => t.slug === '226')
          tid = preferred?.id ?? bars[0]?.id ?? null
        }
      }
    } else if (list[0]) {
      setRole(list[0].role as UserRole)
      tid = list[0].tenant_id
    }
    setTenantId(tid)
  }, [])

  const loadTenant = useCallback(async (tid: string) => {
    const { data, error } = await supabase
      .from('tenants')
      .select('id,name,slug,is_public_visible,display_name,district,address,opening_hour,description,cover_image_url,city,country')
      .eq('id', tid)
      .single()
    if (error) {
      console.error(error)
      return
    }
    if (data) {
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
    }
  }, [])

  const buildOpeningHourPayload = (): OpeningHourJson | null => {
    if (!openingHourEnabled) return null
    return pickerToOpeningHourJson(openingHourPicker)
  }

  const loadCategories = useCallback(async () => {
    const { data, error } = await supabase.from('categories').select('*').order('sort_order')
    if (error) {
      console.error(error)
      return
    }
    setCategories((data ?? []) as (Category & { is_public_visible?: boolean })[])
  }, [])

  const loadDrinks = useCallback(async () => {
    const { data, error } = await supabase
      .from('drinks')
      .select(
        'id,category_id,brand_name,name,volume_ml,price,price_unit,price_bottle,price_unit_bottle,sort_order,enabled,stock,ml_per_cup,ml_per_bottle,created_at,image_url,is_public_visible,public_status,public_sort_order'
      )
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
      await loadRoleAndTenant()
      setLoading(false)
    })()
  }, [loadRoleAndTenant])

  useEffect(() => {
    if (!tenantId || !isOwner) return
    ;(async () => {
      await Promise.all([loadTenant(tenantId), loadCategories(), loadDrinks()])
    })()
  }, [tenantId, isOwner, loadTenant, loadCategories, loadDrinks])

  const handleCoverFile = async (file: File) => {
    if (!tenantId) return
    setUploadingCover(true)
    try {
      const publicUrl = await uploadTaplistCover(supabase, tenantId, file)
      const nextForm = { ...tenantForm, cover_image_url: publicUrl }
      setTenantForm(nextForm)
      const { error } = await supabase.rpc('set_tenant_taplist_storefront', {
        p_tenant_id: tenantId,
        p_display_name: nextForm.display_name,
        p_district: nextForm.district,
        p_address: nextForm.address,
        p_cover_image_url: publicUrl,
        p_city: nextForm.city || 'Shanghai',
        p_opening_hour: buildOpeningHourPayload(),
        p_description: tenantForm.description,
      })
      if (error) throw error
      alert('封面已上传并保存')
      await loadTenant(tenantId)
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
    if (!tenantId) return
    setSavingTenant(true)
    try {
      const { error } = await supabase.rpc('set_tenant_taplist_storefront', {
        p_tenant_id: tenantId,
        p_display_name: tenantForm.display_name,
        p_district: tenantForm.district,
        p_address: tenantForm.address,
        p_cover_image_url: tenantForm.cover_image_url,
        p_city: tenantForm.city || 'Shanghai',
        p_opening_hour: buildOpeningHourPayload(),
        p_description: tenantForm.description,
      })
      if (error) throw error
      alert('门店 Tap List 信息已保存')
      await loadTenant(tenantId)
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
        <p>当前账号未绑定门店（tenant_id）。超级管理员请从平台管理绑定门店后再编辑。</p>
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
          <button type="submit" className="admin-button admin-button-primary" disabled={savingTenant}>
            {savingTenant ? '保存中…' : '保存门店信息'}
          </button>
        </form>
      </div>

      <div className="admin-section">
        <h2>分类在 Tap List 可见</h2>
        <div className="admin-table-wrapper">
          <table className="admin-table">
            <thead>
              <tr>
                <th>分类</th>
                <th>Tap List</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>
                    <label className="admin-label-checkbox">
                      <input
                        type="checkbox"
                        checked={c.is_public_visible !== false}
                        onChange={() => toggleCategoryVisible(c)}
                      />
                      <span>公开</span>
                    </label>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="admin-section">
        <h2>酒款 Tap List</h2>
        <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
          上架 POS（enabled）的酒不能同时对消费者公开（数据库约束）。售价与容量以「供应规格」为准。
        </p>
        {drinks.map((d) => (
          <DrinkTaplistPanel
            key={d.id}
            drink={d}
            tenantId={tenantId}
            expanded={expandedDrinkId === d.id}
            onToggle={() => setExpandedDrinkId((id) => (id === d.id ? null : d.id))}
            onDrinkSaved={loadDrinks}
          />
        ))}
      </div>
    </div>
  )
}

function DrinkTaplistPanel({
  drink,
  tenantId,
  expanded,
  onToggle,
  onDrinkSaved,
}: {
  drink: Drink
  tenantId: string
  expanded: boolean
  onToggle: () => void
  onDrinkSaved: () => void
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
  const [loadingPanel, setLoadingPanel] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const drinkImageFileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setForm({
      image_url: drink.image_url ?? '',
      is_public_visible: !!drink.is_public_visible,
      public_status: (drink.public_status as (typeof PUBLIC_STATUS)[number]) || 'available',
      public_sort_order: drink.public_sort_order ?? 0,
    })
  }, [drink])

  const loadPanel = useCallback(async () => {
    setLoadingPanel(true)
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
      const { data: so } = await supabase
        .from('drink_serving_options')
        .select('*')
        .eq('drink_id', drink.id)
        .order('public_sort_order')
      setServings((so ?? []) as DrinkServingRow[])
    } finally {
      setLoadingPanel(false)
    }
  }, [drink.id])

  useEffect(() => {
    if (expanded) void loadPanel()
  }, [expanded, loadPanel])

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
    await loadPanel()
    alert('啤酒档案已保存')
  }

  const addServing = async () => {
    const { error } = await supabase.from('drink_serving_options').insert([
      {
        tenant_id: tenantId,
        drink_id: drink.id,
        serving_type: 'draft',
        label: '品脱',
        volume_ml: 473,
        price: 0,
        is_default: servings.length === 0,
        is_active: true,
        public_sort_order: servings.length,
      },
    ])
    if (error) {
      console.error(error)
      alert('添加规格失败')
      return
    }
    await loadPanel()
  }

  const updateServing = async (row: DrinkServingRow, patch: Partial<DrinkServingRow>) => {
    const { error } = await supabase.from('drink_serving_options').update(patch).eq('id', row.id)
    if (error) {
      console.error(error)
      alert('更新规格失败')
      return
    }
    await loadPanel()
  }

  const deleteServing = async (id: string) => {
    if (!confirm('删除该供应规格？')) return
    const { error } = await supabase.from('drink_serving_options').delete().eq('id', id)
    if (error) {
      console.error(error)
      alert('删除失败')
      return
    }
    await loadPanel()
  }

  return (
    <div
      style={{
        border: '1px solid #e5e7eb',
        borderRadius: 8,
        marginBottom: 12,
        padding: 12,
        background: '#fafafa',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong>{drink.name}</strong>
        <button type="button" className="admin-button admin-button-secondary" onClick={onToggle}>
          {expanded ? '收起' : '编辑 Tap List'}
        </button>
      </div>
      {!drink.enabled ? (
        <p style={{ fontSize: 13, color: '#b45309', marginTop: 8 }}>
          该酒款在 POS 中为「未启用」。数据库规则：只有已启用的酒款才能对消费者公开 Tap List。请先在「酒品管理」中启用后再勾选下方公开选项。
        </p>
      ) : null}
      <label className="admin-label-checkbox" style={{ marginTop: 8 }}>
        <input
          type="checkbox"
          checked={form.is_public_visible}
          disabled={!drink.enabled}
          onChange={(e) => setForm({ ...form, is_public_visible: e.target.checked })}
        />
        <span>对消费者公开（Tap List）</span>
      </label>
      {drink.enabled && !form.is_public_visible ? (
        <p style={{ fontSize: 12, color: '#6b7280', marginTop: 6 }}>
          已上架 POS；勾选上方即可同时出现在消费者 Tap List（需门店与分类也已公开）。
        </p>
      ) : null}

      {expanded ? (
        <div style={{ marginTop: 16 }}>
          {loadingPanel ? (
            <p>加载…</p>
          ) : (
            <>
              <h4 style={{ marginBottom: 8 }}>展示字段</h4>
              <TaplistImageUploadField
                label="酒款图片"
                hint="JPEG / PNG / WebP，最大 2MB"
                busy={uploadingImage}
                previewUrl={form.image_url || null}
                inputRef={drinkImageFileRef}
                onFileSelected={handleDrinkImageFile}
              />
              <input
                className="admin-input"
                placeholder="酒款图片 URL（可粘贴外链，或上方上传）"
                value={form.image_url}
                onChange={(e) => setForm({ ...form, image_url: e.target.value })}
              />
              <select
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
              <input
                className="admin-input"
                type="number"
                placeholder="Tap List 排序"
                value={form.public_sort_order}
                onChange={(e) => setForm({ ...form, public_sort_order: parseInt(e.target.value, 10) || 0 })}
              />
              <button type="button" className="admin-button admin-button-primary" onClick={saveDrink}>
                保存酒款
              </button>

              <h4 style={{ margin: '20px 0 8px' }}>啤酒档案</h4>
              <input
                className="admin-input"
                placeholder="酒厂"
                value={beer.brewery}
                onChange={(e) => setBeer({ ...beer, brewery: e.target.value })}
              />
              <input
                className="admin-input"
                placeholder="风格"
                value={beer.beer_style}
                onChange={(e) => setBeer({ ...beer, beer_style: e.target.value })}
              />
              <input
                className="admin-input"
                placeholder="ABV"
                value={beer.abv}
                onChange={(e) => setBeer({ ...beer, abv: e.target.value })}
              />
              <input
                className="admin-input"
                placeholder="IBU"
                value={beer.ibu}
                onChange={(e) => setBeer({ ...beer, ibu: e.target.value })}
              />
              <input
                className="admin-input"
                placeholder="国家"
                value={beer.country}
                onChange={(e) => setBeer({ ...beer, country: e.target.value })}
              />
              <textarea
                className="admin-input"
                placeholder="酒款介绍"
                rows={4}
                value={beer.description}
                onChange={(e) => setBeer({ ...beer, description: e.target.value })}
              />
              <button type="button" className="admin-button admin-button-primary" onClick={saveBeer}>
                保存啤酒档案
              </button>

              <h4 style={{ margin: '20px 0 8px' }}>供应规格（容量与价格）</h4>
              <button type="button" className="admin-button admin-button-secondary" onClick={addServing}>
                新增一行
              </button>
              <div className="admin-table-wrapper" style={{ marginTop: 8 }}>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>类型</th>
                      <th>标签</th>
                      <th>ml</th>
                      <th>价格</th>
                      <th>默认</th>
                      <th>启用</th>
                      <th>排序</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {servings.map((s) => (
                      <tr key={s.id}>
                        <td>
                          <select
                            className="admin-input"
                            style={{ minWidth: 90 }}
                            value={s.serving_type}
                            onChange={(e) => updateServing(s, { serving_type: e.target.value })}
                          >
                            {SERVING_TYPES.map((t) => (
                              <option key={t} value={t}>
                                {t}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <input
                            className="admin-input"
                            key={`${s.id}-label`}
                            defaultValue={s.label}
                            onBlur={(e) => {
                              void updateServing(s, { label: e.target.value })
                            }}
                          />
                        </td>
                        <td>
                          <input
                            className="admin-input"
                            type="number"
                            key={`${s.id}-vol`}
                            defaultValue={s.volume_ml ?? ''}
                            onBlur={(e) => {
                              const v = e.target.value
                              void updateServing(s, {
                                volume_ml: v ? parseInt(v, 10) : null,
                              })
                            }}
                          />
                        </td>
                        <td>
                          <input
                            className="admin-input"
                            type="number"
                            step="0.01"
                            key={`${s.id}-price`}
                            defaultValue={s.price}
                            onBlur={(e) => {
                              void updateServing(s, { price: parseFloat(e.target.value) || 0 })
                            }}
                          />
                        </td>
                        <td>
                          <input
                            type="checkbox"
                            checked={s.is_default}
                            onChange={(e) => updateServing(s, { is_default: e.target.checked })}
                          />
                        </td>
                        <td>
                          <input
                            type="checkbox"
                            checked={s.is_active}
                            onChange={(e) => updateServing(s, { is_active: e.target.checked })}
                          />
                        </td>
                        <td>
                          <input
                            className="admin-input"
                            type="number"
                            key={`${s.id}-sort`}
                            defaultValue={s.public_sort_order}
                            onBlur={(e) => {
                              void updateServing(s, {
                                public_sort_order: parseInt(e.target.value, 10) || 0,
                              })
                            }}
                          />
                        </td>
                        <td>
                          <button
                            type="button"
                            className="admin-button admin-button-danger"
                            onClick={() => deleteServing(s.id)}
                          >
                            删
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}

function TaplistImageUploadField({
  label,
  hint,
  busy,
  previewUrl,
  inputRef,
  onFileSelected,
}: {
  label: string
  hint: string
  busy: boolean
  previewUrl: string | null
  inputRef: React.RefObject<HTMLInputElement>
  onFileSelected: (file: File) => void | Promise<void>
}) {
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
        <label className="admin-button admin-button-secondary" style={{ cursor: busy ? 'wait' : 'pointer' }}>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={busy}
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void onFileSelected(file)
            }}
          />
          {busy ? '上传中…' : `上传${label}`}
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
