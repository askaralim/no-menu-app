'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import { supabase } from '@/lib/supabaseClient'
import type { Drink } from '@/lib/types'

export type DrinkProductSearchRow = {
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

export type DrinkProductDetail = DrinkProductSearchRow & {
  aliases?: string[]
  ibu?: number | null
  description?: string | null
  tasting_note?: string | null
}

type Props = {
  drink: Drink
  isSuperAdmin: boolean
  beerProfile: {
    brewery: string
    beer_style: string
    abv: string | number
    ibu: string | number
    country: string
    description: string
  }
  onLinked: () => void
  onBeerProfileCollapseChange?: (collapsed: boolean) => void
}

type CreateForm = {
  name: string
  name_en: string
  aliases: string
  brand_name: string
  brewery: string
  beer_style: string
  abv: string
  ibu: string
  country: string
  image_url: string
  description: string
  tasting_note: string
}

function emptyCreateForm(): CreateForm {
  return {
    name: '',
    name_en: '',
    aliases: '',
    brand_name: '',
    brewery: '',
    beer_style: '',
    abv: '',
    ibu: '',
    country: '',
    image_url: '',
    description: '',
    tasting_note: '',
  }
}

function createFormFromDrink(
  drink: Drink,
  beerProfile: Props['beerProfile']
): CreateForm {
  return {
    name: drink.name ?? '',
    name_en: '',
    aliases: '',
    brand_name: drink.brand_name ?? '',
    brewery: beerProfile.brewery || drink.brand_name || '',
    beer_style: beerProfile.beer_style,
    abv: beerProfile.abv === '' ? '' : String(beerProfile.abv),
    ibu: beerProfile.ibu === '' ? '' : String(beerProfile.ibu),
    country: beerProfile.country,
    image_url: drink.image_url ?? '',
    description: beerProfile.description,
    tasting_note: '',
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

export function ProductPoolLinkSection({
  drink,
  isSuperAdmin,
  beerProfile,
  onLinked,
  onBeerProfileCollapseChange,
}: Props) {
  const [searchQuery, setSearchQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<DrinkProductSearchRow[]>([])
  const [searchError, setSearchError] = useState<string | null>(null)
  const [linkedProduct, setLinkedProduct] = useState<DrinkProductDetail | null>(null)
  const [loadingProduct, setLoadingProduct] = useState(false)
  const [displayName, setDisplayName] = useState(drink.display_name ?? '')
  const [displayDescription, setDisplayDescription] = useState(drink.display_description ?? '')
  const [busy, setBusy] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState<CreateForm>(emptyCreateForm())

  const isLinked = !!drink.product_id

  const loadLinkedProduct = useCallback(async (productId: string) => {
    setLoadingProduct(true)
    try {
      const { data, error } = await supabase
        .from('drink_products')
        .select(
          'id,name,name_en,aliases,brand_name,brewery,beer_style,abv,ibu,country,image_url,description,tasting_note'
        )
        .eq('id', productId)
        .maybeSingle()
      if (error) throw error
      setLinkedProduct((data as DrinkProductDetail | null) ?? null)
    } catch (err) {
      console.error(err)
      setLinkedProduct(null)
    } finally {
      setLoadingProduct(false)
    }
  }, [])

  useEffect(() => {
    setDisplayName(drink.display_name ?? '')
    setDisplayDescription(drink.display_description ?? '')
  }, [drink.id, drink.display_name, drink.display_description])

  useEffect(() => {
    if (drink.product_id) {
      void loadLinkedProduct(drink.product_id)
    } else {
      setLinkedProduct(null)
    }
  }, [drink.product_id, loadLinkedProduct])

  useEffect(() => {
    onBeerProfileCollapseChange?.(isLinked)
  }, [isLinked, onBeerProfileCollapseChange])

  useEffect(() => {
    const q = searchQuery.trim()
    if (q.length < 1) {
      setSearchResults([])
      setSearchError(null)
      return
    }

    const timer = window.setTimeout(() => {
      void (async () => {
        setSearching(true)
        setSearchError(null)
        try {
          const { data, error } = await supabase.rpc('search_drink_products', { p_query: q })
          if (error) throw error
          const payload = (data ?? {}) as { ok?: boolean; results?: DrinkProductSearchRow[] }
          setSearchResults(payload.results ?? [])
        } catch (err) {
          console.error(err)
          setSearchResults([])
          setSearchError(err instanceof Error ? err.message : '搜索失败')
        } finally {
          setSearching(false)
        }
      })()
    }, 300)

    return () => window.clearTimeout(timer)
  }, [searchQuery])

  const handleLink = async (productId: string) => {
    setBusy(true)
    try {
      const { error } = await supabase.rpc('link_drink_to_product', {
        p_drink_id: drink.id,
        p_product_id: productId,
        p_display_name: displayName || null,
        p_display_description: displayDescription || null,
      })
      if (error) throw error
      alert('已关联商品池酒款')
      onLinked()
    } catch (err) {
      console.error(err)
      alert(err instanceof Error ? err.message : '关联失败')
    } finally {
      setBusy(false)
    }
  }

  const handleUnlink = async () => {
    if (!confirm('取消与商品池的关联？展示覆盖字段也会被清除。')) return
    setBusy(true)
    try {
      const { error } = await supabase.rpc('unlink_drink_product', { p_drink_id: drink.id })
      if (error) throw error
      setDisplayName('')
      setDisplayDescription('')
      alert('已取消关联')
      onLinked()
    } catch (err) {
      console.error(err)
      alert(err instanceof Error ? err.message : '取消关联失败')
    } finally {
      setBusy(false)
    }
  }

  const handleSaveOverrides = async () => {
    if (!drink.product_id) return
    setBusy(true)
    try {
      const { error } = await supabase.rpc('link_drink_to_product', {
        p_drink_id: drink.id,
        p_product_id: drink.product_id,
        p_display_name: displayName || null,
        p_display_description: displayDescription || null,
      })
      if (error) throw error
      alert('展示覆盖已保存')
      onLinked()
    } catch (err) {
      console.error(err)
      alert(err instanceof Error ? err.message : '保存失败')
    } finally {
      setBusy(false)
    }
  }

  const handleCreateProduct = async (autoLink: boolean) => {
    if (!createForm.name.trim()) {
      alert('请填写酒款名称')
      return
    }
    setBusy(true)
    try {
      const aliases = createForm.aliases
        .split(/[,，]/)
        .map((s) => s.trim())
        .filter(Boolean)

      const { data, error } = await supabase.rpc('admin_create_drink_product', {
        p_name: createForm.name.trim(),
        p_name_en: createForm.name_en || null,
        p_aliases: aliases,
        p_brand_name: createForm.brand_name || null,
        p_brewery: createForm.brewery || null,
        p_beer_style: createForm.beer_style || null,
        p_abv: createForm.abv === '' ? null : Number(createForm.abv),
        p_ibu: createForm.ibu === '' ? null : Number(createForm.ibu),
        p_country: createForm.country || null,
        p_origin_region: null,
        p_image_url: createForm.image_url || null,
        p_description: createForm.description || null,
        p_tasting_note: createForm.tasting_note || null,
        p_source: 'admin_create',
      })
      if (error) throw error

      const payload = (data ?? {}) as { ok?: boolean; product_id?: string }
      if (!payload.product_id) throw new Error('创建失败')

      if (autoLink) {
        const { error: linkError } = await supabase.rpc('link_drink_to_product', {
          p_drink_id: drink.id,
          p_product_id: payload.product_id,
          p_display_name: displayName || null,
          p_display_description: displayDescription || null,
        })
        if (linkError) throw linkError
      }

      setShowCreate(false)
      setCreateForm(emptyCreateForm())
      alert(autoLink ? '商品池酒款已创建并关联' : '商品池酒款已创建')
      onLinked()
    } catch (err) {
      console.error(err)
      alert(err instanceof Error ? err.message : '创建失败')
    } finally {
      setBusy(false)
    }
  }

  const handleImportFromDrink = async () => {
    if (!confirm('从当前酒款数据创建商品池酒款并自动关联？')) return
    setBusy(true)
    try {
      const { error } = await supabase.rpc('admin_create_drink_product_from_drink', {
        p_drink_id: drink.id,
        p_auto_link: true,
      })
      if (error) throw error
      alert('已从当前酒款创建商品池记录并关联')
      onLinked()
    } catch (err) {
      console.error(err)
      alert(err instanceof Error ? err.message : '导入失败')
    } finally {
      setBusy(false)
    }
  }

  const inheritedPreview = useMemo(() => {
    if (!linkedProduct) return null
    return {
      name: linkedProduct.name,
      brewery: linkedProduct.brewery ?? linkedProduct.brand_name,
      style: linkedProduct.beer_style,
      abv: linkedProduct.abv,
      ibu: linkedProduct.ibu,
      country: linkedProduct.country,
      description: linkedProduct.tasting_note ?? linkedProduct.description,
      image: linkedProduct.image_url,
    }
  }, [linkedProduct])

  return (
    <section className="taplist-drink-panel-section">
      <h4 className="taplist-drink-panel-section-title">商品池关联</h4>
      <p className="taplist-drink-panel-section-hint">
        关联后消费者 App 优先使用商品池的标准化信息；价格与规格仍在本页下方编辑。
      </p>

      {isLinked ? (
        <div style={{ marginBottom: 12 }}>
          <p style={{ margin: '0 0 8px', fontSize: 13, color: '#374151' }}>
            <strong>已关联</strong>
            {loadingProduct ? ' · 加载商品信息…' : linkedProduct ? ` · ${linkedProduct.name}` : ''}
          </p>
          {inheritedPreview ? (
            <div
              style={{
                fontSize: 13,
                color: '#4b5563',
                background: '#f3f4f6',
                borderRadius: 6,
                padding: '10px 12px',
                marginBottom: 10,
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 4 }}>继承字段（只读）</div>
              <div>名称：{inheritedPreview.name}</div>
              {inheritedPreview.brewery ? <div>酒厂：{inheritedPreview.brewery}</div> : null}
              {inheritedPreview.style ? <div>风格：{inheritedPreview.style}</div> : null}
              {inheritedPreview.abv != null ? <div>ABV：{inheritedPreview.abv}%</div> : null}
              {inheritedPreview.ibu != null ? <div>IBU：{inheritedPreview.ibu}</div> : null}
              {inheritedPreview.country ? <div>国家：{inheritedPreview.country}</div> : null}
              {inheritedPreview.description ? (
                <div style={{ marginTop: 6 }}>介绍：{inheritedPreview.description}</div>
              ) : null}
            </div>
          ) : null}
          <div className="taplist-panel-grid" style={{ marginBottom: 10 }}>
            <div className="taplist-field taplist-field-span-2">
              <label htmlFor={`${drink.id}-display-name`}>展示名称覆盖（可选）</label>
              <input
                id={`${drink.id}-display-name`}
                className="admin-input"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="留空则使用商品池名称"
              />
            </div>
            <div className="taplist-field taplist-field-span-2">
              <label htmlFor={`${drink.id}-display-desc`}>展示介绍覆盖（可选）</label>
              <textarea
                id={`${drink.id}-display-desc`}
                className="admin-input"
                rows={2}
                value={displayDescription}
                onChange={(e) => setDisplayDescription(e.target.value)}
                placeholder="留空则使用商品池介绍"
              />
            </div>
          </div>
          <div className="taplist-panel-actions">
            <button
              type="button"
              className="admin-button admin-button-primary"
              disabled={busy}
              onClick={() => void handleSaveOverrides()}
            >
              保存覆盖
            </button>
            <button
              type="button"
              className="admin-button admin-button-secondary"
              disabled={busy}
              onClick={() => void handleUnlink()}
            >
              取消关联
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="taplist-field" style={{ marginBottom: 10 }}>
            <label htmlFor={`${drink.id}-product-search`}>搜索已有酒款</label>
            <input
              id={`${drink.id}-product-search`}
              className="admin-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="酒名、酒厂、风格、别名…"
            />
          </div>
          {searching ? (
            <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 10px' }}>搜索中…</p>
          ) : null}
          {searchError ? (
            <p style={{ fontSize: 13, color: '#dc2626', margin: '0 0 10px' }}>{searchError}</p>
          ) : null}
          {searchResults.length > 0 ? (
            <div style={{ marginBottom: 12 }}>
              <table className="admin-table" style={{ fontSize: 13 }}>
                <thead>
                  <tr>
                    <th>酒款</th>
                    <th>信息</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {searchResults.map((row) => (
                    <tr key={row.id}>
                      <td>{row.name}</td>
                      <td style={{ color: '#6b7280' }}>{formatProductMeta(row)}</td>
                      <td>
                        <button
                          type="button"
                          className="admin-button admin-button-secondary"
                          disabled={busy}
                          onClick={() => void handleLink(row.id)}
                        >
                          复用此酒款
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : searchQuery.trim() && !searching && !searchError ? (
            <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 10px' }}>未找到匹配酒款。</p>
          ) : null}

          {isSuperAdmin ? (
            <div className="taplist-panel-actions" style={{ flexWrap: 'wrap' }}>
              <button
                type="button"
                className="admin-button admin-button-secondary"
                disabled={busy}
                onClick={() => {
                  setCreateForm(createFormFromDrink(drink, beerProfile))
                  setShowCreate(true)
                }}
              >
                创建商品池酒款
              </button>
              <button
                type="button"
                className="admin-button admin-button-secondary"
                disabled={busy}
                onClick={() => void handleImportFromDrink()}
              >
                从当前酒款创建
              </button>
            </div>
          ) : null}
        </>
      )}

      {showCreate && isSuperAdmin ? (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            border: '1px solid #e5e7eb',
            borderRadius: 8,
            background: '#fff',
          }}
        >
          <h5 style={{ margin: '0 0 10px', fontSize: 14 }}>新建商品池酒款</h5>
          <div className="taplist-panel-grid">
            <div className="taplist-field taplist-field-span-2">
              <label>名称 *</label>
              <input
                className="admin-input"
                value={createForm.name}
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
              />
            </div>
            <div className="taplist-field">
              <label>英文名</label>
              <input
                className="admin-input"
                value={createForm.name_en}
                onChange={(e) => setCreateForm({ ...createForm, name_en: e.target.value })}
              />
            </div>
            <div className="taplist-field">
              <label>别名（逗号分隔）</label>
              <input
                className="admin-input"
                value={createForm.aliases}
                onChange={(e) => setCreateForm({ ...createForm, aliases: e.target.value })}
              />
            </div>
            <div className="taplist-field">
              <label>酒厂</label>
              <input
                className="admin-input"
                value={createForm.brewery}
                onChange={(e) => setCreateForm({ ...createForm, brewery: e.target.value })}
              />
            </div>
            <div className="taplist-field">
              <label>品牌</label>
              <input
                className="admin-input"
                value={createForm.brand_name}
                onChange={(e) => setCreateForm({ ...createForm, brand_name: e.target.value })}
              />
            </div>
            <div className="taplist-field">
              <label>风格</label>
              <input
                className="admin-input"
                value={createForm.beer_style}
                onChange={(e) => setCreateForm({ ...createForm, beer_style: e.target.value })}
              />
            </div>
            <div className="taplist-field">
              <label>ABV %</label>
              <input
                className="admin-input"
                value={createForm.abv}
                onChange={(e) => setCreateForm({ ...createForm, abv: e.target.value })}
              />
            </div>
            <div className="taplist-field">
              <label>IBU</label>
              <input
                className="admin-input"
                value={createForm.ibu}
                onChange={(e) => setCreateForm({ ...createForm, ibu: e.target.value })}
              />
            </div>
            <div className="taplist-field">
              <label>国家</label>
              <input
                className="admin-input"
                value={createForm.country}
                onChange={(e) => setCreateForm({ ...createForm, country: e.target.value })}
              />
            </div>
            <div className="taplist-field taplist-field-span-2">
              <label>图片 URL</label>
              <input
                className="admin-input"
                value={createForm.image_url}
                onChange={(e) => setCreateForm({ ...createForm, image_url: e.target.value })}
              />
            </div>
            <div className="taplist-field taplist-field-span-2">
              <label>介绍</label>
              <textarea
                className="admin-input"
                rows={2}
                value={createForm.description}
                onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
              />
            </div>
            <div className="taplist-field taplist-field-span-2">
              <label>品饮笔记</label>
              <textarea
                className="admin-input"
                rows={2}
                value={createForm.tasting_note}
                onChange={(e) => setCreateForm({ ...createForm, tasting_note: e.target.value })}
              />
            </div>
          </div>
          <div className="taplist-panel-actions" style={{ marginTop: 10 }}>
            <button
              type="button"
              className="admin-button admin-button-primary"
              disabled={busy}
              onClick={() => void handleCreateProduct(true)}
            >
              创建并关联
            </button>
            <button
              type="button"
              className="admin-button admin-button-secondary"
              disabled={busy}
              onClick={() => void handleCreateProduct(false)}
            >
              仅创建
            </button>
            <button
              type="button"
              className="admin-button admin-button-secondary"
              disabled={busy}
              onClick={() => setShowCreate(false)}
            >
              取消
            </button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
