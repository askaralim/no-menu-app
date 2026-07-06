'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import type {
  AdminDrinkCompanyRow,
  AdminDrinkProductRow,
  DrinkProductReviewStatus,
  DrinkProductStatus,
  UserRole,
} from '@/lib/types'

type ProductForm = {
  name: string
  name_en: string
  aliases_text: string
  brand_name: string
  brewery: string
  beer_style: string
  abv: string
  ibu: string
  country: string
  origin_region: string
  image_url: string
  description: string
  tasting_note: string
  company_id: string
  normalized_key: string
  review_status: DrinkProductReviewStatus
  review_note: string
  beer_verification_status: string
  brewery_verification_status: string
  source: string
  status: DrinkProductStatus
}

type Filters = {
  query: string
  review_status: DrinkProductReviewStatus | ''
  status: DrinkProductStatus | 'all'
  unlinked_company_only: boolean
}

const REVIEW_STATUSES: DrinkProductReviewStatus[] = ['pending', 'reviewed', 'rejected']

const REVIEW_STATUS_LABELS: Record<DrinkProductReviewStatus, string> = {
  pending: '待审核',
  reviewed: '已审核',
  rejected: '已拒绝',
}

const EMPTY_FORM: ProductForm = {
  name: '',
  name_en: '',
  aliases_text: '',
  brand_name: '',
  brewery: '',
  beer_style: '',
  abv: '',
  ibu: '',
  country: '',
  origin_region: '',
  image_url: '',
  description: '',
  tasting_note: '',
  company_id: '',
  normalized_key: '',
  review_status: 'pending',
  review_note: '',
  beer_verification_status: '',
  brewery_verification_status: '',
  source: '',
  status: 'active',
}

const DEFAULT_FILTERS: Filters = {
  query: '',
  review_status: '',
  status: 'active',
  unlinked_company_only: false,
}

function suggestNormalizedKey(brandName: string, productName: string) {
  const brand = brandName.trim().toLowerCase().replace(/\s+/g, ' ')
  const name = productName.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!brand || !name) return ''
  return `${brand}|${name}`
}

function aliasesToText(values: string[]) {
  return values.join(', ')
}

function textToAliases(text: string) {
  return text
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
}

export default function PlatformProductsPage() {
  const [products, setProducts] = useState<AdminDrinkProductRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [role, setRole] = useState<UserRole | null>(null)
  const [saving, setSaving] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<ProductForm>(EMPTY_FORM)
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [normalizedKeyTouched, setNormalizedKeyTouched] = useState(false)
  const [companyQuery, setCompanyQuery] = useState('')
  const [companyOptions, setCompanyOptions] = useState<AdminDrinkCompanyRow[]>([])
  const [companyLoading, setCompanyLoading] = useState(false)

  const loadProducts = useCallback(async () => {
    const { data, error: rpcError } = await supabase.rpc('admin_list_drink_products', {
      p_query: filters.query.trim() || null,
      p_review_status: filters.review_status || null,
      p_status: filters.status,
      p_unlinked_company_only: filters.unlinked_company_only,
    })
    if (rpcError) throw rpcError
    const payload = data as { ok?: boolean; products?: AdminDrinkProductRow[] }
    if (!payload || payload.ok !== true || !Array.isArray(payload.products)) {
      throw new Error('产品池列表返回格式异常')
    }
    setProducts(payload.products)
  }, [filters])

  const loadCompanies = useCallback(async (query: string) => {
    setCompanyLoading(true)
    try {
      const { data, error: rpcError } = await supabase.rpc('admin_list_drink_companies', {
        p_query: query.trim() || null,
        p_entity_type: null,
        p_review_status: null,
        p_status: 'active',
      })
      if (rpcError) throw rpcError
      const payload = data as { ok?: boolean; companies?: AdminDrinkCompanyRow[] }
      setCompanyOptions(payload?.companies ?? [])
    } finally {
      setCompanyLoading(false)
    }
  }, [])

  const resetForm = useCallback(() => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setNormalizedKeyTouched(false)
    setCompanyQuery('')
    setCompanyOptions([])
  }, [])

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false)
    resetForm()
  }, [resetForm])

  useEffect(() => {
    const init = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()
        if (!session) {
          setError('请先登录')
          return
        }

        const { data: roleRows } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', session.user.id)

        const isSuper = (roleRows ?? []).some((r) => r.role === 'super_admin')
        if (!isSuper) {
          setRole((roleRows?.[0]?.role as UserRole) || null)
          setError('权限不足: 需要超级管理员权限')
          return
        }

        setRole('super_admin')
        await loadProducts()
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : '加载失败')
      } finally {
        setLoading(false)
      }
    }

    void init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (role !== 'super_admin' || loading) return
    const timer = window.setTimeout(() => {
      void loadProducts().catch((e: unknown) => {
        alert(e instanceof Error ? e.message : '刷新列表失败')
      })
    }, 300)
    return () => window.clearTimeout(timer)
  }, [filters, role, loading, loadProducts])

  useEffect(() => {
    if (!drawerOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) closeDrawer()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [drawerOpen, saving, closeDrawer])

  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [drawerOpen])

  useEffect(() => {
    if (!drawerOpen) return
    const timer = window.setTimeout(() => {
      void loadCompanies(companyQuery)
    }, 250)
    return () => window.clearTimeout(timer)
  }, [drawerOpen, companyQuery, loadCompanies])

  const stats = useMemo(() => {
    const pendingReview = products.filter((p) => p.review_status === 'pending').length
    const unlinked = products.filter((p) => !p.company_id).length
    return { total: products.length, pendingReview, unlinked }
  }, [products])

  const openCreate = () => {
    resetForm()
    setDrawerOpen(true)
  }

  const openEdit = (product: AdminDrinkProductRow) => {
    setEditingId(product.id)
    setForm({
      name: product.name,
      name_en: product.name_en ?? '',
      aliases_text: aliasesToText(product.aliases ?? []),
      brand_name: product.brand_name ?? '',
      brewery: product.brewery ?? '',
      beer_style: product.beer_style ?? '',
      abv: product.abv != null ? String(product.abv) : '',
      ibu: product.ibu != null ? String(product.ibu) : '',
      country: product.country ?? '',
      origin_region: product.origin_region ?? '',
      image_url: product.image_url ?? '',
      description: product.description ?? '',
      tasting_note: product.tasting_note ?? '',
      company_id: product.company_id ?? '',
      normalized_key: product.normalized_key ?? '',
      review_status: product.review_status,
      review_note: product.review_note ?? '',
      beer_verification_status: product.beer_verification_status ?? '',
      brewery_verification_status: product.brewery_verification_status ?? '',
      source: product.source ?? '',
      status: product.status,
    })
    setNormalizedKeyTouched(true)
    setCompanyQuery(product.company_display_name ?? product.brand_name ?? '')
    setDrawerOpen(true)
  }

  const handleNameOrBrandChange = (field: 'name' | 'brand_name', value: string) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value }
      if (!editingId && !normalizedKeyTouched) {
        next.normalized_key = suggestNormalizedKey(
          field === 'brand_name' ? value : prev.brand_name,
          field === 'name' ? value : prev.name
        )
      }
      return next
    })
  }

  const selectCompany = (company: AdminDrinkCompanyRow) => {
    setForm((prev) => ({
      ...prev,
      company_id: company.id,
      brand_name: company.display_name,
      brewery: company.canonical_name,
      normalized_key:
        !editingId && !normalizedKeyTouched
          ? suggestNormalizedKey(company.normalized_key, prev.name)
          : prev.normalized_key,
    }))
    setCompanyQuery(company.display_name)
  }

  const clearCompany = () => {
    setForm((prev) => ({ ...prev, company_id: '' }))
    setCompanyQuery('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = form.name.trim()
    const normalizedKey = form.normalized_key.trim()

    if (!name) {
      alert('请填写产品名称')
      return
    }
    if (!editingId && !normalizedKey) {
      alert('请填写 normalized_key')
      return
    }

    setSaving(true)
    try {
      const payload = {
        p_id: editingId,
        p_name: name,
        p_name_en: form.name_en.trim() || null,
        p_aliases: textToAliases(form.aliases_text),
        p_brand_name: form.brand_name.trim() || null,
        p_brewery: form.brewery.trim() || null,
        p_beer_style: form.beer_style.trim() || null,
        p_abv: form.abv.trim() ? Number(form.abv) : null,
        p_ibu: form.ibu.trim() ? Number.parseInt(form.ibu, 10) : null,
        p_country: form.country.trim() || null,
        p_origin_region: form.origin_region.trim() || null,
        p_image_url: form.image_url.trim() || null,
        p_description: form.description.trim() || null,
        p_tasting_note: form.tasting_note.trim() || null,
        p_company_id: form.company_id || null,
        p_normalized_key: editingId ? null : normalizedKey,
        p_review_status: form.review_status,
        p_review_note: form.review_note.trim() || null,
        p_beer_verification_status: form.beer_verification_status.trim() || null,
        p_brewery_verification_status: form.brewery_verification_status.trim() || null,
        p_status: form.status,
        p_source: form.source.trim() || null,
      }

      const { data, error: rpcError } = await supabase.rpc('admin_upsert_drink_product', payload)
      if (rpcError) throw rpcError

      const result = data as { ok?: boolean; id?: string }
      const savedId = result?.id ?? editingId
      const wasCreate = !editingId

      if (!editingId && savedId) {
        setEditingId(savedId)
        setNormalizedKeyTouched(true)
      }

      await loadProducts()
      alert(wasCreate ? '已创建产品' : '已保存修改')
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleArchiveToggle = async (product: AdminDrinkProductRow) => {
    const nextStatus: DrinkProductStatus = product.status === 'active' ? 'archived' : 'active'
    const action = nextStatus === 'archived' ? '归档' : '恢复'
    if (!confirm(`确定要${action}「${product.name}」吗？`)) return

    setSaving(true)
    try {
      const { error: rpcError } = await supabase.rpc('admin_upsert_drink_product', {
        p_id: product.id,
        p_name: product.name,
        p_name_en: product.name_en,
        p_aliases: product.aliases ?? [],
        p_brand_name: product.brand_name,
        p_brewery: product.brewery,
        p_beer_style: product.beer_style,
        p_abv: product.abv,
        p_ibu: product.ibu,
        p_country: product.country,
        p_origin_region: product.origin_region,
        p_image_url: product.image_url,
        p_description: product.description,
        p_tasting_note: product.tasting_note,
        p_company_id: product.company_id,
        p_review_status: product.review_status,
        p_review_note: product.review_note,
        p_beer_verification_status: product.beer_verification_status,
        p_brewery_verification_status: product.brewery_verification_status,
        p_status: nextStatus,
        p_source: product.source,
      })
      if (rpcError) throw rpcError
      await loadProducts()
      if (editingId === product.id) {
        setForm((prev) => ({ ...prev, status: nextStatus }))
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : '操作失败')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="admin-container">
        <div className="admin-header">
          <h1>产品池管理</h1>
        </div>
        <div style={{ textAlign: 'center', padding: '4rem' }}>
          <div className="auth-spinner" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="admin-container">
        <div className="admin-header">
          <h1>产品池管理</h1>
        </div>
        <div style={{ textAlign: 'center', padding: '4rem', color: '#ef4444' }}>{error}</div>
      </div>
    )
  }

  const drawerTitle = editingId ? form.name || '编辑产品' : '添加产品'

  return (
    <div className="admin-container" style={{ paddingBottom: drawerOpen ? 0 : undefined }}>
      <div className="admin-header" style={{ marginBottom: '1rem' }}>
        <p style={{ marginBottom: '0.5rem' }}>
          <Link href="/admin/platform" style={{ color: '#6b7280', textDecoration: 'none' }}>
            ← 平台管理
          </Link>
        </p>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ marginBottom: '0.35rem' }}>产品池管理</h1>
            <p style={{ color: '#6b7280', fontSize: '0.95rem', margin: 0 }}>
              规范酒款目录 · 点击行内「编辑」在侧栏修改
            </p>
          </div>
          <button type="button" className="admin-button admin-button-primary" onClick={openCreate}>
            + 添加产品
          </button>
        </div>
      </div>

      <div style={stickyToolbarStyle}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <StatPill label="当前列表" value={stats.total} />
          <StatPill
            label="待审核"
            value={stats.pendingReview}
            active={filters.review_status === 'pending'}
            onClick={() =>
              setFilters((prev) => ({
                ...prev,
                review_status: prev.review_status === 'pending' ? '' : 'pending',
              }))
            }
          />
          <StatPill
            label="无品牌关联"
            value={stats.unlinked}
            tone="warn"
            active={filters.unlinked_company_only}
            onClick={() =>
              setFilters((prev) => ({ ...prev, unlinked_company_only: !prev.unlinked_company_only }))
            }
          />
        </div>

        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'minmax(220px, 2fr) repeat(2, minmax(140px, 1fr)) auto' }}>
          <input
            className="admin-input"
            placeholder="搜索名称、品牌、风格、key…"
            value={filters.query}
            onChange={(e) => setFilters({ ...filters, query: e.target.value })}
            style={{ margin: 0 }}
          />
          <select
            className="admin-input"
            value={filters.review_status}
            onChange={(e) =>
              setFilters({ ...filters, review_status: e.target.value as DrinkProductReviewStatus | '' })
            }
            style={{ margin: 0 }}>
            <option value="">全部审核</option>
            {REVIEW_STATUSES.map((s) => (
              <option key={s} value={s}>
                {REVIEW_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <select
            className="admin-input"
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value as Filters['status'] })}
            style={{ margin: 0 }}>
            <option value="active">仅 active</option>
            <option value="archived">仅 archived</option>
            <option value="all">全部状态</option>
          </select>
          <button
            type="button"
            className="admin-button admin-button-secondary"
            onClick={() => setFilters(DEFAULT_FILTERS)}
            style={{ whiteSpace: 'nowrap' }}>
            重置
          </button>
        </div>
      </div>

      <div className="admin-section" style={{ marginBottom: '1.5rem', padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto', maxHeight: 'calc(100vh - 280px)', overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 2, background: '#f9fafb' }}>
              <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                <th style={thStyle}>名称</th>
                <th style={thStyle}>品牌/酒厂</th>
                <th style={thStyle}>风格</th>
                <th style={thStyle}>ABV</th>
                <th style={thStyle}>审核</th>
                <th style={thStyle}>品牌关联</th>
                <th style={thStyle}>关联酒品</th>
                <th style={thStyle}>状态</th>
                <th style={{ ...thStyle, width: 120 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {products.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ ...tdStyle, color: '#6b7280', textAlign: 'center', padding: '2rem' }}>
                    无匹配结果。试试调整筛选条件。
                  </td>
                </tr>
              ) : (
                products.map((product) => {
                  const isSelected = drawerOpen && editingId === product.id
                  return (
                    <tr
                      key={product.id}
                      style={{
                        borderBottom: '1px solid #eef0f3',
                        background: isSelected ? '#eff6ff' : undefined,
                      }}>
                      <td style={tdStyle}>
                        <strong style={{ fontSize: '0.92rem' }}>{product.name}</strong>
                        {product.name_en ? (
                          <div style={{ color: '#6b7280', fontSize: '0.8rem', marginTop: 2 }}>{product.name_en}</div>
                        ) : null}
                      </td>
                      <td style={tdStyle}>
                        <div>{product.brand_name ?? '—'}</div>
                        {product.brewery && product.brewery !== product.brand_name ? (
                          <div style={{ color: '#6b7280', fontSize: '0.8rem', marginTop: 2 }}>{product.brewery}</div>
                        ) : null}
                      </td>
                      <td style={{ ...tdStyle, fontSize: '0.85rem' }}>{product.beer_style ?? '—'}</td>
                      <td style={{ ...tdStyle, fontSize: '0.85rem' }}>{product.abv != null ? `${product.abv}%` : '—'}</td>
                      <td style={tdStyle}>
                        <ReviewBadge status={product.review_status} />
                      </td>
                      <td style={tdStyle}>
                        {product.company_id ? (
                          <span style={{ fontSize: '0.85rem' }}>{product.company_display_name ?? '已关联'}</span>
                        ) : (
                          <span style={{ ...badgeStyle, background: '#451a03', color: '#fdba74' }}>未关联</span>
                        )}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center', fontSize: '0.85rem' }}>
                        {product.linked_drink_count}
                      </td>
                      <td style={tdStyle}>
                        <span
                          style={{
                            ...badgeStyle,
                            background: product.status === 'active' ? '#052e16' : '#1f2937',
                            color: product.status === 'active' ? '#4ade80' : '#9ca3af',
                          }}>
                          {product.status}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <button
                            type="button"
                            className="admin-button admin-button-secondary"
                            style={{ fontSize: '0.8rem', padding: '5px 10px' }}
                            onClick={() => openEdit(product)}
                            disabled={saving}>
                            {isSelected ? '编辑中…' : '编辑'}
                          </button>
                          <button
                            type="button"
                            className="admin-button admin-button-secondary"
                            style={{ fontSize: '0.8rem', padding: '5px 10px' }}
                            onClick={() => void handleArchiveToggle(product)}
                            disabled={saving}>
                            {product.status === 'active' ? '归档' : '恢复'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {drawerOpen ? (
        <>
          <div style={drawerBackdropStyle} onClick={() => !saving && closeDrawer()} aria-hidden />
          <aside style={drawerPanelStyle} role="dialog" aria-modal="true" aria-label={drawerTitle}>
            <div style={drawerHeaderStyle}>
              <button type="button" style={drawerCloseStyle} onClick={closeDrawer} aria-label="关闭">
                ×
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 style={{ margin: 0, fontSize: '1.1rem' }}>{drawerTitle}</h2>
                {editingId && form.normalized_key ? (
                  <code style={{ ...codeStyle, display: 'inline-block', marginTop: 6 }}>{form.normalized_key}</code>
                ) : null}
              </div>
            </div>

            <form onSubmit={handleSubmit} style={{ padding: '16px 20px 24px', display: 'grid', gap: 14 }}>
              <Field label="产品名称 *">
                <input
                  className="admin-input"
                  value={form.name}
                  onChange={(e) => handleNameOrBrandChange('name', e.target.value)}
                  required
                  style={{ margin: 0 }}
                />
              </Field>
              <Field label="英文名">
                <input
                  className="admin-input"
                  value={form.name_en}
                  onChange={(e) => setForm({ ...form, name_en: e.target.value })}
                  style={{ margin: 0 }}
                />
              </Field>
              <Field label="别名（逗号分隔）">
                <input
                  className="admin-input"
                  value={form.aliases_text}
                  onChange={(e) => setForm({ ...form, aliases_text: e.target.value })}
                  style={{ margin: 0 }}
                />
              </Field>

              <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 12 }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 8 }}>品牌/酒厂关联</div>
                <input
                  className="admin-input"
                  placeholder="搜索品牌/酒厂…"
                  value={companyQuery}
                  onChange={(e) => setCompanyQuery(e.target.value)}
                  style={{ margin: '0 0 8px' }}
                />
                {form.company_id ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: '0.85rem', color: '#059669' }}>已选: {form.brand_name || form.company_id}</span>
                    <button type="button" className="admin-button admin-button-secondary" style={{ fontSize: '0.75rem', padding: '4px 8px' }} onClick={clearCompany}>
                      清除
                    </button>
                  </div>
                ) : null}
                {companyLoading ? (
                  <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>搜索中…</div>
                ) : companyOptions.length > 0 ? (
                  <div style={{ maxHeight: 140, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: 8 }}>
                    {companyOptions.slice(0, 12).map((company) => (
                      <button
                        key={company.id}
                        type="button"
                        onClick={() => selectCompany(company)}
                        style={{
                          display: 'block',
                          width: '100%',
                          textAlign: 'left',
                          padding: '8px 12px',
                          border: 'none',
                          borderBottom: '1px solid #f3f4f6',
                          background: form.company_id === company.id ? '#eff6ff' : '#fff',
                          cursor: 'pointer',
                          fontSize: '0.85rem',
                        }}>
                        <strong>{company.display_name}</strong>
                        <span style={{ color: '#9ca3af', marginLeft: 8 }}>{company.normalized_key}</span>
                      </button>
                    ))}
                  </div>
                ) : companyQuery ? (
                  <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>无匹配品牌</div>
                ) : null}
              </div>

              <Field label="展示品牌名">
                <input
                  className="admin-input"
                  value={form.brand_name}
                  onChange={(e) => handleNameOrBrandChange('brand_name', e.target.value)}
                  style={{ margin: 0 }}
                />
              </Field>
              <Field label="酒厂/规范名">
                <input
                  className="admin-input"
                  value={form.brewery}
                  onChange={(e) => setForm({ ...form, brewery: e.target.value })}
                  style={{ margin: 0 }}
                />
              </Field>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Field label="风格">
                  <input
                    className="admin-input"
                    value={form.beer_style}
                    onChange={(e) => setForm({ ...form, beer_style: e.target.value })}
                    style={{ margin: 0 }}
                  />
                </Field>
                <Field label="ABV">
                  <input
                    className="admin-input"
                    value={form.abv}
                    onChange={(e) => setForm({ ...form, abv: e.target.value })}
                    style={{ margin: 0 }}
                  />
                </Field>
                <Field label="IBU">
                  <input
                    className="admin-input"
                    value={form.ibu}
                    onChange={(e) => setForm({ ...form, ibu: e.target.value })}
                    style={{ margin: 0 }}
                  />
                </Field>
                <Field label="国家">
                  <input
                    className="admin-input"
                    value={form.country}
                    onChange={(e) => setForm({ ...form, country: e.target.value })}
                    style={{ margin: 0 }}
                  />
                </Field>
              </div>

              <Field label="产地/城市">
                <input
                  className="admin-input"
                  value={form.origin_region}
                  onChange={(e) => setForm({ ...form, origin_region: e.target.value })}
                  style={{ margin: 0 }}
                />
              </Field>
              <Field label="图片 URL">
                <input
                  className="admin-input"
                  value={form.image_url}
                  onChange={(e) => setForm({ ...form, image_url: e.target.value })}
                  style={{ margin: 0 }}
                />
              </Field>
              <Field label="描述">
                <textarea
                  className="admin-input"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={3}
                  style={{ margin: 0, resize: 'vertical' }}
                />
              </Field>
              <Field label="品鉴笔记">
                <textarea
                  className="admin-input"
                  value={form.tasting_note}
                  onChange={(e) => setForm({ ...form, tasting_note: e.target.value })}
                  rows={2}
                  style={{ margin: 0, resize: 'vertical' }}
                />
              </Field>

              {!editingId ? (
                <Field label="normalized_key *" hint="创建后不可修改">
                  <input
                    className="admin-input"
                    value={form.normalized_key}
                    onChange={(e) => {
                      setNormalizedKeyTouched(true)
                      setForm({ ...form, normalized_key: e.target.value })
                    }}
                    required
                    style={{ margin: 0 }}
                  />
                </Field>
              ) : null}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Field label="审核状态">
                  <select
                    className="admin-input"
                    value={form.review_status}
                    onChange={(e) =>
                      setForm({ ...form, review_status: e.target.value as DrinkProductReviewStatus })
                    }
                    style={{ margin: 0 }}>
                    {REVIEW_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {REVIEW_STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="状态">
                  <select
                    className="admin-input"
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value as DrinkProductStatus })}
                    style={{ margin: 0 }}>
                    <option value="active">active</option>
                    <option value="archived">archived</option>
                  </select>
                </Field>
              </div>

              <Field label="审核备注">
                <textarea
                  className="admin-input"
                  value={form.review_note}
                  onChange={(e) => setForm({ ...form, review_note: e.target.value })}
                  rows={2}
                  style={{ margin: 0, resize: 'vertical' }}
                />
              </Field>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Field label="酒款验证">
                  <input
                    className="admin-input"
                    value={form.beer_verification_status}
                    onChange={(e) => setForm({ ...form, beer_verification_status: e.target.value })}
                    style={{ margin: 0 }}
                  />
                </Field>
                <Field label="酒厂验证">
                  <input
                    className="admin-input"
                    value={form.brewery_verification_status}
                    onChange={(e) => setForm({ ...form, brewery_verification_status: e.target.value })}
                    style={{ margin: 0 }}
                  />
                </Field>
              </div>

              <Field label="来源">
                <input
                  className="admin-input"
                  value={form.source}
                  onChange={(e) => setForm({ ...form, source: e.target.value })}
                  style={{ margin: 0 }}
                  readOnly={Boolean(editingId && form.source.startsWith('beer_products_web_verified.csv:'))}
                />
              </Field>

              <div style={{ display: 'flex', gap: 10, paddingTop: 8 }}>
                <button type="submit" className="admin-button admin-button-primary" disabled={saving}>
                  {saving ? '保存中…' : editingId ? '保存修改' : '创建产品'}
                </button>
                <button type="button" className="admin-button admin-button-secondary" onClick={closeDrawer} disabled={saving}>
                  取消
                </button>
              </div>
            </form>
          </aside>
        </>
      ) : null}
    </div>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 6 }}>{label}</span>
      {hint ? (
        <span style={{ display: 'block', fontSize: '0.75rem', color: '#9ca3af', marginBottom: 4 }}>{hint}</span>
      ) : null}
      {children}
    </label>
  )
}

function StatPill({
  label,
  value,
  tone,
  active,
  onClick,
}: {
  label: string
  value: number
  tone?: 'warn'
  active?: boolean
  onClick?: () => void
}) {
  const clickable = Boolean(onClick)
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!clickable}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 12px',
        borderRadius: 999,
        border: active ? '1px solid #2563eb' : '1px solid #e5e7eb',
        background: active ? '#eff6ff' : '#fff',
        color: tone === 'warn' ? '#c2410c' : '#374151',
        fontSize: '0.85rem',
        cursor: clickable ? 'pointer' : 'default',
      }}>
      <span>{label}</span>
      <strong>{value}</strong>
    </button>
  )
}

function ReviewBadge({ status }: { status: DrinkProductReviewStatus }) {
  const colors =
    status === 'reviewed'
      ? { bg: '#052e16', fg: '#4ade80' }
      : status === 'pending'
        ? { bg: '#451a03', fg: '#fdba74' }
        : { bg: '#450a0a', fg: '#fca5a5' }
  return (
    <span style={{ ...badgeStyle, background: colors.bg, color: colors.fg }}>
      {REVIEW_STATUS_LABELS[status]}
    </span>
  )
}

const stickyToolbarStyle: React.CSSProperties = {
  position: 'sticky',
  top: 0,
  zIndex: 5,
  background: 'rgba(255,255,255,0.96)',
  backdropFilter: 'blur(8px)',
  borderBottom: '1px solid #e5e7eb',
  padding: '12px 0 14px',
  marginBottom: '1rem',
}

const drawerBackdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(15, 23, 42, 0.45)',
  zIndex: 1000,
}

const drawerPanelStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  right: 0,
  bottom: 0,
  width: 'min(520px, 100vw)',
  background: '#fff',
  zIndex: 1001,
  boxShadow: '-8px 0 32px rgba(0,0,0,0.12)',
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
}

const drawerHeaderStyle: React.CSSProperties = {
  position: 'sticky',
  top: 0,
  zIndex: 1,
  display: 'flex',
  alignItems: 'flex-start',
  gap: 12,
  padding: '16px 20px',
  borderBottom: '1px solid #e5e7eb',
  background: '#fff',
}

const drawerCloseStyle: React.CSSProperties = {
  border: '1px solid #e5e7eb',
  background: '#fff',
  borderRadius: 8,
  width: 36,
  height: 36,
  cursor: 'pointer',
  fontSize: '1rem',
  lineHeight: 1,
  flexShrink: 0,
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '10px 12px',
  fontSize: '0.78rem',
  color: '#6b7280',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}

const tdStyle: React.CSSProperties = {
  padding: '10px 12px',
  fontSize: '0.9rem',
  color: '#111827',
  verticalAlign: 'top',
}

const codeStyle: React.CSSProperties = {
  background: '#1e293b',
  color: '#f1f5f9',
  padding: '2px 6px',
  borderRadius: '4px',
  fontSize: '0.75rem',
  wordBreak: 'break-all',
}

const badgeStyle: React.CSSProperties = {
  padding: '2px 8px',
  borderRadius: '12px',
  fontSize: '0.75rem',
  fontWeight: 600,
  whiteSpace: 'nowrap',
}
