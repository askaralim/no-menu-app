'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { supabase } from '@/lib/supabaseClient'
import { withOssImageStyle } from '@/lib/ossImageUrl'
import { assertImageFile, uploadTaplistDrinkImage } from '@/lib/taplistStorage'
import type { Category, Drink } from '@/lib/types'
import type { DrinkProductDetail, DrinkProductSearchRow } from '@/components/admin/ProductPoolLinkSection'

const PUBLIC_STATUS = ['new', 'available', 'low', 'sold_out', 'coming_soon'] as const
const PUBLIC_STATUS_LABELS: Record<(typeof PUBLIC_STATUS)[number], string> = {
  new: '上新',
  available: '在售',
  low: '少量',
  sold_out: '售罄',
  coming_soon: '即将上新',
}
const SERVING_TYPES = ['draft', 'can', 'bottle', 'flight', 'other'] as const

type LocalDrinkHit = {
  id: string
  name: string
  brand_name: string | null
  display_name: string | null
  enabled: boolean
}

type CreateForm = {
  category_id: string
  name: string
  brewery: string
  beer_style: string
  abv: string
  ibu: string
  country: string
  description: string
  image_url: string
  product_id: string | null
  serving_type: (typeof SERVING_TYPES)[number]
  serving_label: string
  volume_ml: string
  price: string
  public_status: (typeof PUBLIC_STATUS)[number]
  public_sort_order: number | ''
  is_public_visible: boolean
}

function emptyForm(categoryId: string): CreateForm {
  return {
    category_id: categoryId,
    name: '',
    brewery: '',
    beer_style: '',
    abv: '',
    ibu: '',
    country: '',
    description: '',
    image_url: '',
    product_id: null,
    serving_type: 'draft',
    serving_label: '',
    volume_ml: '',
    price: '',
    public_status: 'new',
    public_sort_order: '',
    is_public_visible: false,
  }
}

function formatProductMeta(row: DrinkProductSearchRow): string {
  const parts = [
    row.brewery ?? row.brand_name,
    row.beer_style,
    row.abv != null ? `ABV ${row.abv}%` : null,
    row.country,
  ].filter(Boolean)
  return parts.join(' · ') || '—'
}

function listingErrorMessage(data: unknown, fallback: string): string {
  if (!data || typeof data !== 'object') return fallback
  const errors = (data as { errors?: unknown }).errors
  if (!Array.isArray(errors) || errors.length === 0) return fallback
  return errors
    .map((e) => {
      if (typeof e === 'string') return e
      if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message)
      return JSON.stringify(e)
    })
    .join('；')
}

function matchLocalDrinks(drinks: LocalDrinkHit[], query: string, limit = 8): LocalDrinkHit[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const scored: { drink: LocalDrinkHit; score: number }[] = []
  for (const d of drinks) {
    const name = (d.name || '').toLowerCase()
    const display = (d.display_name || '').toLowerCase()
    const brand = (d.brand_name || '').toLowerCase()
    const hay = `${name} ${display} ${brand}`
    if (!hay.includes(q)) continue
    let score = 3
    if (name.startsWith(q) || display.startsWith(q)) score = 0
    else if (name.includes(q) || display.includes(q)) score = 1
    else if (brand.includes(q)) score = 2
    if (!d.enabled) score += 10
    scored.push({ drink: d, score })
  }
  scored.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score
    return (a.drink.name || '').localeCompare(b.drink.name || '', 'zh')
  })
  return scored.slice(0, limit).map((x) => x.drink)
}

function numOrNull(value: string): number | null {
  const t = value.trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

function intOrNull(value: string): number | null {
  const n = numOrNull(value)
  if (n == null) return null
  return Math.round(n)
}

function drinkToHit(d: Drink): LocalDrinkHit {
  return {
    id: d.id,
    name: d.name,
    brand_name: d.brand_name ?? null,
    display_name: d.display_name ?? null,
    enabled: d.enabled,
  }
}

function applyProductToForm(form: CreateForm, product: DrinkProductDetail): CreateForm {
  return {
    ...form,
    product_id: product.id,
    name: product.name || form.name,
    brewery: product.brewery || product.brand_name || form.brewery,
    beer_style: product.beer_style || form.beer_style,
    abv: product.abv != null ? String(product.abv) : form.abv,
    ibu: product.ibu != null ? String(product.ibu) : form.ibu,
    country: product.country || form.country,
    description: product.tasting_note || product.description || form.description,
    image_url: form.image_url || product.image_url || '',
  }
}

type Props = {
  tenantId: string
  categories: Category[]
  drinks: Drink[]
  onDrinkReady: (drinkId: string) => void | Promise<void>
}

export function TaplistDrinkCreateForm({ tenantId, categories, drinks, onDrinkReady }: Props) {
  const firstCategoryId = categories[0]?.id ?? ''
  const [form, setForm] = useState<CreateForm>(() => emptyForm(firstCategoryId))
  const [catalog, setCatalog] = useState<LocalDrinkHit[]>([])
  const [searching, setSearching] = useState(false)
  const [poolResults, setPoolResults] = useState<DrinkProductSearchRow[]>([])
  const [searchDone, setSearchDone] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [includeServing, setIncludeServing] = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState<string | null>(null)
  const imageFileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    return () => {
      if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl)
    }
  }, [pendingPreviewUrl])

  useEffect(() => {
    setForm((prev) => (prev.category_id || !firstCategoryId ? prev : { ...prev, category_id: firstCategoryId }))
  }, [firstCategoryId])

  const loadCatalog = useCallback(async () => {
    const { data, error } = await supabase
      .from('drinks')
      .select('id,name,brand_name,display_name,enabled')
      .eq('tenant_id', tenantId)
      .order('name')
    if (error) {
      console.error(error)
      return
    }
    setCatalog((data ?? []) as LocalDrinkHit[])
  }, [tenantId])

  useEffect(() => {
    setCatalog(drinks.map(drinkToHit))
    void loadCatalog()
  }, [loadCatalog, drinks])

  const nameQuery = form.name.trim()
  const localMatches = useMemo(
    () => (form.product_id ? [] : matchLocalDrinks(catalog, nameQuery)),
    [catalog, form.product_id, nameQuery]
  )

  useEffect(() => {
    if (form.product_id) {
      setPoolResults([])
      setSearchDone(false)
      setSearching(false)
      setSearchError(null)
      return
    }
    if (nameQuery.length < 1) {
      setPoolResults([])
      setSearchDone(false)
      setSearching(false)
      setSearchError(null)
      return
    }

    const timer = window.setTimeout(() => {
      void (async () => {
        setSearching(true)
        setSearchError(null)
        try {
          const { data, error } = await supabase.rpc('search_drink_products', { p_query: nameQuery })
          if (error) throw error
          const payload = (data ?? {}) as { ok?: boolean; results?: DrinkProductSearchRow[] }
          setPoolResults(payload.results ?? [])
        } catch (err) {
          console.error(err)
          setPoolResults([])
          setSearchError(err instanceof Error ? err.message : '搜索失败')
        } finally {
          setSearching(false)
          setSearchDone(true)
        }
      })()
    }, 250)

    return () => window.clearTimeout(timer)
  }, [form.product_id, nameQuery])

  const clearPendingImage = () => {
    setPendingPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    setPendingFile(null)
    if (imageFileRef.current) imageFileRef.current.value = ''
  }

  const resetForm = () => {
    setForm(emptyForm(form.category_id || firstCategoryId))
    setPoolResults([])
    setSearchDone(false)
    setSearchError(null)
    setIncludeServing(false)
    clearPendingImage()
  }

  const handleImageFile = (file: File) => {
    try {
      assertImageFile(file)
    } catch (err) {
      alert(err instanceof Error ? err.message : '图片不符合要求')
      if (imageFileRef.current) imageFileRef.current.value = ''
      return
    }
    setPendingFile(file)
    setPendingPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return URL.createObjectURL(file)
    })
  }

  const applyProduct = async (row: DrinkProductSearchRow) => {
    setPoolResults([])
    setSearchDone(false)
    setSearching(false)
    setSearchError(null)
    setForm((prev) => {
      const next = applyProductToForm(prev, row)
      return pendingFile ? { ...next, image_url: prev.image_url } : next
    })
    try {
      const { data, error } = await supabase
        .from('drink_products')
        .select(
          'id,name,name_en,aliases,brand_name,brewery,beer_style,abv,ibu,country,image_url,description,tasting_note'
        )
        .eq('id', row.id)
        .maybeSingle()
      if (error) throw error
      if (data) {
        setForm((prev) => {
          if (prev.product_id !== row.id) return prev
          const next = applyProductToForm(prev, data as DrinkProductDetail)
          return pendingFile ? { ...next, image_url: prev.image_url } : next
        })
      }
    } catch (err) {
      console.error(err)
    }
  }

  const handlePickExisting = async (hit: LocalDrinkHit) => {
    try {
      if (!hit.enabled) {
        const { error } = await supabase.from('drinks').update({ enabled: true }).eq('id', hit.id)
        if (error) throw error
        alert('已重新上架本店已有酒款，正在打开编辑')
      }
      await onDrinkReady(hit.id)
      resetForm()
    } catch (err) {
      console.error(err)
      alert(err instanceof Error ? err.message : '打开已有酒款失败')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = form.name.trim()
    if (!name) {
      alert('请填写酒品名称')
      return
    }
    if (categories.length > 0 && !form.category_id) {
      alert('请选择分类')
      return
    }

    const exactLocal = catalog.find(
      (d) => d.enabled && (d.name || '').trim().toLowerCase() === name.toLowerCase()
    )
    if (exactLocal) {
      const reuse = window.confirm('本店已有同名酒款。点「确定」打开已有酒款，点「取消」继续新增一款。')
      if (reuse) {
        await handlePickExisting(exactLocal)
        return
      }
    }

    const tap =
      form.public_sort_order === '' ? null : Math.min(99, Math.max(1, Math.floor(Number(form.public_sort_order))))
    if (form.is_public_visible && !tap) {
      alert('公开到顾客端前请填写酒头编号（1–99）')
      return
    }

    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        category_id: form.category_id || undefined,
        name,
        brand_name: form.brewery.trim() || undefined,
        image_url: form.image_url.trim() || undefined,
        profile: {
          brewery: form.brewery.trim() || null,
          beer_style: form.beer_style.trim() || null,
          abv: numOrNull(form.abv),
          ibu: intOrNull(form.ibu),
          country: form.country.trim() || null,
          description: form.description.trim() || null,
        },
      }
      if (includeServing) {
        payload.servings = [
          {
            serving_type: form.serving_type,
            label: form.serving_label.trim() || '杯',
            volume_ml: intOrNull(form.volume_ml),
            price: numOrNull(form.price) ?? 0,
            is_default: true,
            is_active: true,
            public_sort_order: 0,
          },
        ]
      }

      const { data, error } = await supabase.rpc('upsert_drink_product', {
        p_tenant_id: tenantId,
        p_drink: payload,
      })
      if (error) throw error
      const result = (data ?? {}) as { ok?: boolean; drink_id?: string }
      if (!result.ok || !result.drink_id) {
        throw new Error(listingErrorMessage(data, '新增酒款失败'))
      }
      const drinkId = result.drink_id

      if (form.product_id) {
        const { error: linkError } = await supabase.rpc('link_drink_to_product', {
          p_drink_id: drinkId,
          p_product_id: form.product_id,
        })
        if (linkError) throw linkError
      }

      let imageWarning = ''
      if (pendingFile) {
        try {
          const publicUrl = await uploadTaplistDrinkImage(supabase, tenantId, drinkId, pendingFile)
          const { error: imageError } = await supabase
            .from('drinks')
            .update({ image_url: publicUrl })
            .eq('id', drinkId)
          if (imageError) throw imageError
        } catch (imageErr) {
          console.error(imageErr)
          imageWarning = imageErr instanceof Error ? imageErr.message : '图片上传失败'
        }
      }

      if (tap) {
        const { data: listing, error: listingError } = await supabase.rpc('set_drink_taplist_listing', {
          p_drink_id: drinkId,
          p_is_public_visible: form.is_public_visible,
          p_public_status: form.public_status,
          p_public_sort_order: tap,
        })
        if (listingError) throw listingError
        if (listing && typeof listing === 'object' && (listing as { ok?: boolean }).ok === false) {
          throw new Error(listingErrorMessage(listing, '酒款已创建，但加入今晚酒单失败'))
        }
      }

      if (imageWarning) {
        alert(`酒款已新增，但图片上传失败：${imageWarning}。请在下方编辑里重试。`)
      } else {
        alert(form.product_id ? '已从商品池填充并新增酒款' : '酒款已新增')
      }
      resetForm()
      await onDrinkReady(drinkId)
      await loadCatalog()
    } catch (err) {
      console.error(err)
      alert(err instanceof Error ? err.message : '新增失败，请重试')
    } finally {
      setSaving(false)
    }
  }

  const showPool = !form.product_id && poolResults.length > 0
  const showEmptyHint =
    nameQuery.length >= 1 &&
    !form.product_id &&
    searchDone &&
    !searching &&
    !searchError &&
    localMatches.length === 0 &&
    poolResults.length === 0

  const previewSrc =
    pendingPreviewUrl || (form.image_url ? withOssImageStyle(form.image_url, 'nm-card') || form.image_url : null)

  return (
    <div className="taplist-drink-panel" style={{ marginTop: 0, marginBottom: 16 }}>
      <h3 style={{ margin: '0 0 6px', fontSize: '1.05rem' }}>新增酒款</h3>
      <p className="taplist-drink-panel-section-hint" style={{ marginBottom: 12 }}>
        输入酒名可匹配本店已有或商品池。商品池命中后会自动填充酒厂、风格、酒精度等字段，也可直接新建。
      </p>
      <form onSubmit={handleSubmit} className="admin-form" style={{ marginBottom: 0, alignItems: 'stretch' }}>
        <div className="taplist-panel-grid" style={{ width: '100%' }}>
          <div className="taplist-field">
            <label htmlFor="taplist-create-category">分类</label>
            <select
              id="taplist-create-category"
              className="admin-input"
              required={categories.length > 0}
              value={form.category_id}
              onChange={(e) => setForm({ ...form, category_id: e.target.value })}
            >
              {categories.length === 0 ? <option value="">暂无分类</option> : null}
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>
          <div className="taplist-field taplist-field-span-2" style={{ position: 'relative' }}>
            <label htmlFor="taplist-create-name">酒品名称</label>
            <input
              id="taplist-create-name"
              className="admin-input"
              required
              autoComplete="off"
              placeholder="输入酒名，可匹配已有或商品池"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            {searching ? (
              <p style={{ margin: '4px 0 0', fontSize: 12, color: '#6b7280' }}>搜索中…</p>
            ) : null}
            {searchError ? (
              <p style={{ margin: '4px 0 0', fontSize: 12, color: '#dc2626' }}>{searchError}</p>
            ) : null}

            {localMatches.length > 0 ? (
              <div className="taplist-create-suggest">
                <div className="taplist-create-suggest-title">本店已有</div>
                {localMatches.map((hit) => (
                  <button
                    key={hit.id}
                    type="button"
                    className="taplist-create-suggest-row"
                    onClick={() => void handlePickExisting(hit)}
                  >
                    <span>
                      <strong>{hit.display_name || hit.name}</strong>
                      <span className="taplist-create-suggest-meta">
                        {[hit.brand_name, hit.enabled ? null : '已下架'].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <span className="taplist-create-suggest-action">{hit.enabled ? '打开' : '重新上架'}</span>
                  </button>
                ))}
              </div>
            ) : null}

            {showPool ? (
              <div className="taplist-create-suggest">
                <div className="taplist-create-suggest-title">商品池</div>
                {poolResults.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    className="taplist-create-suggest-row"
                    onClick={() => void applyProduct(row)}
                  >
                    <span>
                      <strong>{row.name}</strong>
                      <span className="taplist-create-suggest-meta">{formatProductMeta(row)}</span>
                    </span>
                    <span className="taplist-create-suggest-action">填充</span>
                  </button>
                ))}
              </div>
            ) : null}

            {showEmptyHint ? (
              <p style={{ margin: '4px 0 0', fontSize: 12, color: '#6b7280' }}>未找到匹配，保存后将新建</p>
            ) : null}
          </div>
        </div>

        {form.product_id ? (
          <div className="taplist-create-linked">
            <span>已匹配商品池，对应字段已填充</span>
            <button
              type="button"
              className="admin-button admin-button-secondary"
              onClick={() => setForm({ ...form, product_id: null })}
            >
              取消关联
            </button>
          </div>
        ) : (
          <p style={{ margin: 0, fontSize: 12, color: '#6b7280', width: '100%' }}>
            后台会审核新建商品，可能会修改商品属性，请理解。
          </p>
        )}

        <div className="taplist-panel-grid" style={{ width: '100%' }}>
          <div className="taplist-field">
            <label htmlFor="taplist-create-brewery">酒厂 / 品牌</label>
            <input
              id="taplist-create-brewery"
              className="admin-input"
              value={form.brewery}
              onChange={(e) => setForm({ ...form, brewery: e.target.value })}
            />
          </div>
          <div className="taplist-field">
            <label htmlFor="taplist-create-style">风格</label>
            <input
              id="taplist-create-style"
              className="admin-input"
              value={form.beer_style}
              onChange={(e) => setForm({ ...form, beer_style: e.target.value })}
            />
          </div>
          <div className="taplist-field">
            <label htmlFor="taplist-create-abv">ABV %</label>
            <input
              id="taplist-create-abv"
              className="admin-input"
              value={form.abv}
              onChange={(e) => setForm({ ...form, abv: e.target.value })}
            />
          </div>
          <div className="taplist-field">
            <label htmlFor="taplist-create-ibu">IBU</label>
            <input
              id="taplist-create-ibu"
              className="admin-input"
              value={form.ibu}
              onChange={(e) => setForm({ ...form, ibu: e.target.value })}
            />
          </div>
          <div className="taplist-field">
            <label htmlFor="taplist-create-country">国家 / 产地</label>
            <input
              id="taplist-create-country"
              className="admin-input"
              value={form.country}
              onChange={(e) => setForm({ ...form, country: e.target.value })}
            />
          </div>
          <div className="taplist-field taplist-field-span-2">
            <label htmlFor="taplist-create-desc">酒款介绍</label>
            <textarea
              id="taplist-create-desc"
              className="admin-input"
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="taplist-field taplist-field-span-2">
            <label>酒款图片</label>
            <p style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>
              JPEG / PNG / WebP，最大 2MB。本地图片会在保存后上传。
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginTop: 6 }}>
              {previewSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewSrc}
                  alt=""
                  style={{
                    width: 120,
                    height: 68,
                    objectFit: 'cover',
                    borderRadius: 6,
                    border: '1px solid #e5e7eb',
                    background: '#fff',
                  }}
                />
              ) : null}
              <label
                className="admin-button admin-button-secondary"
                style={{ cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}
              >
                <input
                  ref={imageFileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={saving}
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleImageFile(file)
                  }}
                />
                {pendingFile ? '更换图片' : '上传图片'}
              </label>
              {pendingFile || form.image_url ? (
                <button
                  type="button"
                  className="admin-button admin-button-secondary"
                  disabled={saving}
                  onClick={() => {
                    clearPendingImage()
                    setForm({ ...form, image_url: '' })
                  }}
                >
                  清除图片
                </button>
              ) : null}
            </div>
            <input
              id="taplist-create-image"
              className="admin-input"
              style={{ marginTop: 8 }}
              placeholder="商品池命中后会自动带入，也可粘贴外链"
              value={form.image_url}
              onChange={(e) => setForm({ ...form, image_url: e.target.value })}
            />
          </div>
        </div>

        <div className="taplist-panel-grid" style={{ width: '100%' }}>
          <div className="taplist-field taplist-field-span-2">
            <label className="admin-label-checkbox" style={{ marginTop: 4 }}>
              <input
                type="checkbox"
                checked={includeServing}
                onChange={(e) => setIncludeServing(e.target.checked)}
              />
              <span>同时添加规格 / 价格</span>
            </label>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#6b7280' }}>
              默认不写入规格，可在添加后展开酒款再填。
            </p>
          </div>
          {includeServing ? (
            <>
              <div className="taplist-field">
                <label htmlFor="taplist-create-serving-type">规格类型</label>
                <select
                  id="taplist-create-serving-type"
                  className="admin-input"
                  value={form.serving_type}
                  onChange={(e) =>
                    setForm({ ...form, serving_type: e.target.value as (typeof SERVING_TYPES)[number] })
                  }
                >
                  {SERVING_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div className="taplist-field">
                <label htmlFor="taplist-create-serving-label">价格单位</label>
                <input
                  id="taplist-create-serving-label"
                  className="admin-input"
                  placeholder="杯 / 品脱"
                  value={form.serving_label}
                  onChange={(e) => setForm({ ...form, serving_label: e.target.value })}
                />
              </div>
              <div className="taplist-field">
                <label htmlFor="taplist-create-volume">容量 (ml)</label>
                <input
                  id="taplist-create-volume"
                  className="admin-input"
                  type="number"
                  min={0}
                  placeholder="可选"
                  value={form.volume_ml}
                  onChange={(e) => setForm({ ...form, volume_ml: e.target.value })}
                />
              </div>
              <div className="taplist-field">
                <label htmlFor="taplist-create-price">价格</label>
                <input
                  id="taplist-create-price"
                  className="admin-input"
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="可选"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                />
              </div>
            </>
          ) : null}
          <div className="taplist-field">
            <label htmlFor="taplist-create-tap">酒头编号（今晚）</label>
            <input
              id="taplist-create-tap"
              className="admin-input"
              type="number"
              min={1}
              max={99}
              placeholder="留空=仅入库"
              value={form.public_sort_order}
              onChange={(e) => {
                const raw = e.target.value
                if (raw === '') {
                  setForm({ ...form, public_sort_order: '', is_public_visible: false })
                  return
                }
                const n = parseInt(raw, 10)
                setForm({
                  ...form,
                  public_sort_order: Number.isFinite(n) ? n : '',
                  is_public_visible: Number.isFinite(n),
                })
              }}
            />
          </div>
          <div className="taplist-field">
            <label htmlFor="taplist-create-status">公开状态</label>
            <select
              id="taplist-create-status"
              className="admin-input"
              value={form.public_status}
              onChange={(e) =>
                setForm({ ...form, public_status: e.target.value as (typeof PUBLIC_STATUS)[number] })
              }
            >
              {PUBLIC_STATUS.map((s) => (
                <option key={s} value={s}>
                  {PUBLIC_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="taplist-field">
            <label className="admin-label-checkbox" style={{ marginTop: 22 }}>
              <input
                type="checkbox"
                checked={form.is_public_visible}
                onChange={(e) => setForm({ ...form, is_public_visible: e.target.checked })}
              />
              <span>加入今晚并公开</span>
            </label>
          </div>
        </div>

        <div className="taplist-panel-actions" style={{ width: '100%' }}>
          <button
            type="submit"
            className="admin-button admin-button-primary"
            disabled={saving || categories.length === 0}
          >
            {saving ? '添加中…' : '添加酒款'}
          </button>
          <button type="button" className="admin-button admin-button-secondary" disabled={saving} onClick={resetForm}>
            重置
          </button>
        </div>
        {categories.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: '#b45309' }}>请先在「分类管理」中添加分类，再新增酒款。</p>
        ) : null}
      </form>
    </div>
  )
}
