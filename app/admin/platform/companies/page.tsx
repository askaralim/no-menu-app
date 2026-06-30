'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import type {
  AdminDrinkCompanyAliasRow,
  AdminDrinkCompanyRow,
  DrinkCompanyAliasLanguage,
  DrinkCompanyAliasType,
  DrinkCompanyConfidence,
  DrinkCompanyEntityType,
  DrinkCompanyReviewStatus,
  DrinkCompanyStatus,
  UserRole,
} from '@/lib/types'

type CompanyForm = {
  normalized_key: string
  canonical_name: string
  canonical_name_en: string
  display_name: string
  entity_type: DrinkCompanyEntityType
  country: string
  country_code: string
  origin_region: string
  raw_country_values_text: string
  confidence: DrinkCompanyConfidence
  review_status: DrinkCompanyReviewStatus
  source: string
  source_note: string
  status: DrinkCompanyStatus
}

type AliasForm = {
  alias: string
  alias_language: DrinkCompanyAliasLanguage | ''
  alias_type: DrinkCompanyAliasType
  source: string
}

type Filters = {
  query: string
  entity_type: DrinkCompanyEntityType | ''
  review_status: DrinkCompanyReviewStatus | ''
  status: DrinkCompanyStatus | 'all'
  collisions_only: boolean
}

const ENTITY_TYPES: DrinkCompanyEntityType[] = [
  'brewery',
  'brand',
  'brewery_brand',
  'cidery',
  'meadery',
  'distillery',
  'importer',
  'other',
]

const ENTITY_TYPE_LABELS: Record<DrinkCompanyEntityType, string> = {
  brewery: '酒厂',
  brand: '品牌',
  brewery_brand: '酒厂品牌',
  cidery: '西打厂',
  meadery: '蜜酒厂',
  distillery: '蒸馏厂',
  importer: '进口商',
  other: '其他',
}

const REVIEW_STATUSES: DrinkCompanyReviewStatus[] = ['pending', 'reviewed', 'rejected']

const REVIEW_STATUS_LABELS: Record<DrinkCompanyReviewStatus, string> = {
  pending: '待审核',
  reviewed: '已审核',
  rejected: '已拒绝',
}

const CONFIDENCE_LEVELS: DrinkCompanyConfidence[] = ['high', 'medium', 'low']

const CONFIDENCE_LABELS: Record<DrinkCompanyConfidence, string> = {
  high: '高',
  medium: '中',
  low: '低',
}

const ALIAS_LANGUAGES: DrinkCompanyAliasLanguage[] = ['zh', 'en', 'mixed', 'unknown']

const ALIAS_LANGUAGE_LABELS: Record<DrinkCompanyAliasLanguage, string> = {
  zh: '中文',
  en: '英文',
  mixed: '混合',
  unknown: '未知',
}

const ALIAS_TYPES: DrinkCompanyAliasType[] = [
  'name',
  'legal_name',
  'old_name',
  'spelling',
  'translation',
  'collaboration_text',
  'source_value',
]

const ALIAS_TYPE_LABELS: Record<DrinkCompanyAliasType, string> = {
  name: '名称',
  legal_name: '法定名',
  old_name: '旧名',
  spelling: '拼写变体',
  translation: '译名',
  collaboration_text: '合酿文本',
  source_value: '来源值',
}

const EMPTY_FORM: CompanyForm = {
  normalized_key: '',
  canonical_name: '',
  canonical_name_en: '',
  display_name: '',
  entity_type: 'brewery',
  country: '',
  country_code: '',
  origin_region: '',
  raw_country_values_text: '',
  confidence: 'medium',
  review_status: 'reviewed',
  source: '',
  source_note: '',
  status: 'active',
}

const EMPTY_ALIAS_FORM: AliasForm = {
  alias: '',
  alias_language: '',
  alias_type: 'name',
  source: '',
}

const DEFAULT_FILTERS: Filters = {
  query: '',
  entity_type: '',
  review_status: '',
  status: 'active',
  collisions_only: false,
}

function suggestNormalizedKey(canonicalName: string) {
  return canonicalName.trim().toLowerCase().replace(/\s+/g, ' ')
}

function rawValuesToText(values: string[]) {
  return values.join(', ')
}

function textToRawValues(text: string) {
  return text
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
}

export default function PlatformCompaniesPage() {
  const [companies, setCompanies] = useState<AdminDrinkCompanyRow[]>([])
  const [aliases, setAliases] = useState<AdminDrinkCompanyAliasRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [role, setRole] = useState<UserRole | null>(null)
  const [saving, setSaving] = useState(false)
  const [aliasSaving, setAliasSaving] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingAliasId, setEditingAliasId] = useState<string | null>(null)
  const [form, setForm] = useState<CompanyForm>(EMPTY_FORM)
  const [aliasForm, setAliasForm] = useState<AliasForm>(EMPTY_ALIAS_FORM)
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [normalizedKeyTouched, setNormalizedKeyTouched] = useState(false)

  const loadCompanies = useCallback(async () => {
    const { data, error: rpcError } = await supabase.rpc('admin_list_drink_companies', {
      p_query: filters.query.trim() || null,
      p_entity_type: filters.entity_type || null,
      p_review_status: filters.review_status || null,
      p_status: filters.status,
    })
    if (rpcError) throw rpcError
    const payload = data as { ok?: boolean; companies?: AdminDrinkCompanyRow[] }
    if (!payload || payload.ok !== true || !Array.isArray(payload.companies)) {
      throw new Error('品牌/酒厂列表返回格式异常')
    }
    setCompanies(payload.companies)
  }, [filters])

  const loadAliases = useCallback(async (companyId: string) => {
    const { data, error: rpcError } = await supabase.rpc('admin_list_drink_company_aliases', {
      p_company_id: companyId,
    })
    if (rpcError) throw rpcError
    const payload = data as { ok?: boolean; aliases?: AdminDrinkCompanyAliasRow[] }
    if (!payload || payload.ok !== true || !Array.isArray(payload.aliases)) {
      throw new Error('别名列表返回格式异常')
    }
    setAliases(payload.aliases)
  }, [])

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
        await loadCompanies()
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
      void loadCompanies().catch((e: unknown) => {
        alert(e instanceof Error ? e.message : '刷新列表失败')
      })
    }, 300)
    return () => window.clearTimeout(timer)
  }, [filters, role, loading, loadCompanies])

  useEffect(() => {
    if (!drawerOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving && !aliasSaving) {
        closeDrawer()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [drawerOpen, saving, aliasSaving, closeDrawer])

  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [drawerOpen])

  const visibleCompanies = useMemo(() => {
    if (!filters.collisions_only) return companies
    return companies.filter((company) => company.global_alias_collision_count > 0)
  }, [companies, filters.collisions_only])

  const stats = useMemo(() => {
    const pendingReview = companies.filter((c) => c.review_status === 'pending').length
    const withCollisions = companies.filter((c) => c.global_alias_collision_count > 0).length
    return { total: companies.length, pendingReview, withCollisions, visible: visibleCompanies.length }
  }, [companies, visibleCompanies.length])

  const resetForm = useCallback(() => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setAliases([])
    setAliasForm(EMPTY_ALIAS_FORM)
    setEditingAliasId(null)
    setNormalizedKeyTouched(false)
  }, [])

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false)
    resetForm()
  }, [resetForm])

  const openCreate = () => {
    resetForm()
    setDrawerOpen(true)
  }

  const openEdit = async (company: AdminDrinkCompanyRow) => {
    setEditingId(company.id)
    setForm({
      normalized_key: company.normalized_key,
      canonical_name: company.canonical_name,
      canonical_name_en: company.canonical_name_en ?? '',
      display_name: company.display_name,
      entity_type: company.entity_type,
      country: company.country ?? '',
      country_code: company.country_code ?? '',
      origin_region: company.origin_region ?? '',
      raw_country_values_text: rawValuesToText(company.raw_country_values ?? []),
      confidence: company.confidence,
      review_status: company.review_status,
      source: company.source ?? '',
      source_note: company.source_note ?? '',
      status: company.status,
    })
    setNormalizedKeyTouched(true)
    setAliasForm(EMPTY_ALIAS_FORM)
    setEditingAliasId(null)
    setDrawerOpen(true)
    try {
      await loadAliases(company.id)
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : '加载别名失败')
    }
  }

  const handleCanonicalNameChange = (value: string) => {
    setForm((prev) => {
      const next = { ...prev, canonical_name: value }
      if (!editingId && !normalizedKeyTouched) {
        next.normalized_key = suggestNormalizedKey(value)
      }
      if (!prev.display_name || prev.display_name === prev.canonical_name) {
        next.display_name = value
      }
      return next
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const canonicalName = form.canonical_name.trim()
    const displayName = form.display_name.trim() || canonicalName
    const normalizedKey = form.normalized_key.trim()

    if (!canonicalName) {
      alert('请填写规范中文名')
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
        p_normalized_key: editingId ? null : normalizedKey,
        p_canonical_name: canonicalName,
        p_canonical_name_en: form.canonical_name_en.trim() || null,
        p_display_name: displayName,
        p_entity_type: form.entity_type,
        p_country: form.country.trim() || null,
        p_country_code: form.country_code.trim() || null,
        p_origin_region: form.origin_region.trim() || null,
        p_raw_country_values: textToRawValues(form.raw_country_values_text),
        p_confidence: form.confidence,
        p_review_status: form.review_status,
        p_source: form.source.trim() || null,
        p_source_note: form.source_note.trim() || null,
        p_status: form.status,
      }

      const { data, error: rpcError } = await supabase.rpc('admin_upsert_drink_company', payload)
      if (rpcError) throw rpcError

      const result = data as { ok?: boolean; id?: string }
      const savedId = result?.id ?? editingId
      const wasCreate = !editingId

      if (!editingId && savedId) {
        setEditingId(savedId)
        setNormalizedKeyTouched(true)
      }

      await loadCompanies()
      if (savedId) {
        await loadAliases(savedId)
      }
      alert(wasCreate ? '已创建品牌/酒厂' : '已保存修改')
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleArchiveToggle = async (company: AdminDrinkCompanyRow) => {
    const nextStatus: DrinkCompanyStatus = company.status === 'active' ? 'archived' : 'active'
    const action = nextStatus === 'archived' ? '归档' : '恢复'
    if (!confirm(`确定要${action}「${company.display_name}」吗？`)) return

    setSaving(true)
    try {
      const { error: rpcError } = await supabase.rpc('admin_upsert_drink_company', {
        p_id: company.id,
        p_canonical_name: company.canonical_name,
        p_canonical_name_en: company.canonical_name_en,
        p_display_name: company.display_name,
        p_entity_type: company.entity_type,
        p_country: company.country,
        p_country_code: company.country_code,
        p_origin_region: company.origin_region,
        p_raw_country_values: company.raw_country_values ?? [],
        p_confidence: company.confidence,
        p_review_status: company.review_status,
        p_source: company.source,
        p_source_note: company.source_note,
        p_status: nextStatus,
      })
      if (rpcError) throw rpcError
      await loadCompanies()
      if (editingId === company.id) {
        setForm((prev) => ({ ...prev, status: nextStatus }))
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : '操作失败')
    } finally {
      setSaving(false)
    }
  }

  const resetAliasForm = () => {
    setEditingAliasId(null)
    setAliasForm(EMPTY_ALIAS_FORM)
  }

  const startEditAlias = (alias: AdminDrinkCompanyAliasRow) => {
    setEditingAliasId(alias.id)
    setAliasForm({
      alias: alias.alias,
      alias_language: alias.alias_language ?? '',
      alias_type: alias.alias_type,
      source: alias.source ?? '',
    })
  }

  const handleAliasSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingId) {
      alert('请先保存品牌/酒厂，再添加别名')
      return
    }

    const alias = aliasForm.alias.trim()
    if (!alias) {
      alert('请填写别名')
      return
    }

    setAliasSaving(true)
    try {
      const { error: rpcError } = await supabase.rpc('admin_upsert_drink_company_alias', {
        p_id: editingAliasId,
        p_company_id: editingId,
        p_alias: alias,
        p_alias_language: aliasForm.alias_language || null,
        p_alias_type: aliasForm.alias_type,
        p_source: aliasForm.source.trim() || null,
      })
      if (rpcError) throw rpcError
      resetAliasForm()
      await loadAliases(editingId)
      await loadCompanies()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : '保存别名失败')
    } finally {
      setAliasSaving(false)
    }
  }

  const handleDeleteAlias = async (alias: AdminDrinkCompanyAliasRow) => {
    if (!confirm(`确定删除别名「${alias.alias}」吗？`)) return

    setAliasSaving(true)
    try {
      const { error: rpcError } = await supabase.rpc('admin_delete_drink_company_alias', {
        p_id: alias.id,
      })
      if (rpcError) throw rpcError
      if (editingAliasId === alias.id) {
        resetAliasForm()
      }
      if (editingId) {
        await loadAliases(editingId)
        await loadCompanies()
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : '删除别名失败')
    } finally {
      setAliasSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="admin-container">
        <div className="admin-header">
          <h1>品牌/酒厂管理</h1>
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
          <h1>品牌/酒厂管理</h1>
        </div>
        <div style={{ textAlign: 'center', padding: '4rem', color: '#ef4444' }}>{error}</div>
      </div>
    )
  }

  const drawerTitle = editingId ? form.display_name || form.canonical_name || '编辑品牌/酒厂' : '添加品牌/酒厂'

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
            <h1 style={{ marginBottom: '0.35rem' }}>品牌/酒厂管理</h1>
            <p style={{ color: '#6b7280', fontSize: '0.95rem', margin: 0 }}>
              内部 Product Pool 规范数据 · 点击行内「编辑」在侧栏修改，无需回到页顶
            </p>
          </div>
          <button type="button" className="admin-button admin-button-primary" onClick={openCreate}>
            + 添加品牌/酒厂
          </button>
        </div>
      </div>

      <div style={stickyToolbarStyle}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <StatPill label="当前列表" value={stats.visible} />
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
            label="别名冲突"
            value={stats.withCollisions}
            tone="warn"
            active={filters.collisions_only}
            onClick={() => setFilters((prev) => ({ ...prev, collisions_only: !prev.collisions_only }))}
          />
        </div>

        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'minmax(220px, 2fr) repeat(3, minmax(140px, 1fr)) auto' }}>
          <input
            className="admin-input"
            placeholder="搜索名称、key、别名…"
            value={filters.query}
            onChange={(e) => setFilters({ ...filters, query: e.target.value })}
            style={{ margin: 0 }}
          />
          <select
            className="admin-input"
            value={filters.entity_type}
            onChange={(e) => setFilters({ ...filters, entity_type: e.target.value as DrinkCompanyEntityType | '' })}
            style={{ margin: 0 }}>
            <option value="">全部类型</option>
            {ENTITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {ENTITY_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
          <select
            className="admin-input"
            value={filters.review_status}
            onChange={(e) =>
              setFilters({ ...filters, review_status: e.target.value as DrinkCompanyReviewStatus | '' })
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
                <th style={thStyle}>展示名</th>
                <th style={thStyle}>Key / 规范名</th>
                <th style={thStyle}>类型</th>
                <th style={thStyle}>国家</th>
                <th style={thStyle}>审核</th>
                <th style={thStyle}>别名</th>
                <th style={thStyle}>冲突</th>
                <th style={thStyle}>状态</th>
                <th style={{ ...thStyle, width: 120 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {visibleCompanies.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ ...tdStyle, color: '#6b7280', textAlign: 'center', padding: '2rem' }}>
                    无匹配结果。试试调整筛选条件。
                  </td>
                </tr>
              ) : (
                visibleCompanies.map((company) => {
                  const isSelected = drawerOpen && editingId === company.id
                  return (
                    <tr
                      key={company.id}
                      style={{
                        borderBottom: '1px solid #eef0f3',
                        background: isSelected ? '#eff6ff' : undefined,
                      }}>
                      <td style={tdStyle}>
                        <strong style={{ fontSize: '0.92rem' }}>{company.display_name}</strong>
                        {company.canonical_name_en ? (
                          <div style={{ color: '#6b7280', fontSize: '0.8rem', marginTop: 2 }}>
                            {company.canonical_name_en}
                          </div>
                        ) : null}
                      </td>
                      <td style={tdStyle}>
                        <code style={codeStyle}>{company.normalized_key}</code>
                        {company.canonical_name !== company.display_name ? (
                          <div style={{ color: '#6b7280', fontSize: '0.8rem', marginTop: 4 }}>{company.canonical_name}</div>
                        ) : null}
                      </td>
                      <td style={{ ...tdStyle, fontSize: '0.85rem' }}>{ENTITY_TYPE_LABELS[company.entity_type]}</td>
                      <td style={{ ...tdStyle, fontSize: '0.85rem' }}>
                        {company.country ?? '—'}
                        {company.country_code ? (
                          <span style={{ color: '#9ca3af' }}> ({company.country_code})</span>
                        ) : null}
                      </td>
                      <td style={tdStyle}>
                        <ReviewBadge status={company.review_status} />
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center', fontSize: '0.85rem' }}>{company.alias_count}</td>
                      <td style={tdStyle}>
                        {company.global_alias_collision_count > 0 ? (
                          <span style={{ ...badgeStyle, background: '#451a03', color: '#fdba74' }}>
                            {company.global_alias_collision_count}
                          </span>
                        ) : (
                          <span style={{ color: '#9ca3af' }}>—</span>
                        )}
                      </td>
                      <td style={tdStyle}>
                        <span
                          style={{
                            ...badgeStyle,
                            background: company.status === 'active' ? '#052e16' : '#1f2937',
                            color: company.status === 'active' ? '#4ade80' : '#9ca3af',
                          }}>
                          {company.status}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <button
                            type="button"
                            className="admin-button admin-button-secondary"
                            style={{ fontSize: '0.8rem', padding: '5px 10px' }}
                            onClick={() => void openEdit(company)}
                            disabled={saving}>
                            {isSelected ? '编辑中…' : '编辑'}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleArchiveToggle(company)}
                            disabled={saving}
                            style={{
                              padding: '5px 10px',
                              borderRadius: '6px',
                              border: '1px solid',
                              borderColor: company.status === 'active' ? '#ef4444' : '#22c55e',
                              background: 'transparent',
                              color: company.status === 'active' ? '#ef4444' : '#22c55e',
                              cursor: saving ? 'wait' : 'pointer',
                              fontSize: '0.8rem',
                            }}>
                            {company.status === 'active' ? '归档' : '恢复'}
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
          <div style={drawerBackdropStyle} onClick={closeDrawer} aria-hidden="true" />
          <aside style={drawerPanelStyle} role="dialog" aria-modal="true" aria-label={drawerTitle}>
            <div style={drawerHeaderStyle}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <p style={{ margin: 0, fontSize: '0.8rem', color: '#6b7280' }}>
                  {editingId ? '编辑品牌/酒厂' : '新建品牌/酒厂'}
                </p>
                <h2 style={{ margin: '4px 0 0', fontSize: '1.15rem', lineHeight: 1.3 }}>{drawerTitle}</h2>
              </div>
              <button type="button" onClick={closeDrawer} style={drawerCloseStyle} aria-label="关闭">
                ✕
              </button>
            </div>

            <div style={{ padding: '16px 20px 28px' }}>
              <form onSubmit={handleSubmit} className="admin-form" style={{ gap: 10 }}>
                <Field label="normalized_key" hint="创建后不可修改；用于批量导入幂等 upsert">
                  <input
                    className="admin-input"
                    value={form.normalized_key}
                    onChange={(e) => {
                      setNormalizedKeyTouched(true)
                      setForm({ ...form, normalized_key: e.target.value })
                    }}
                    disabled={!!editingId}
                    autoCapitalize="none"
                  />
                </Field>
                <Field label="规范中文名" required>
                  <input
                    className="admin-input"
                    value={form.canonical_name}
                    onChange={(e) => handleCanonicalNameChange(e.target.value)}
                  />
                </Field>
                <Field label="规范英文名">
                  <input
                    className="admin-input"
                    value={form.canonical_name_en}
                    onChange={(e) => setForm({ ...form, canonical_name_en: e.target.value })}
                  />
                </Field>
                <Field label="展示名" required>
                  <input
                    className="admin-input"
                    value={form.display_name}
                    onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                  />
                </Field>
                <div style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr' }}>
                  <Field label="类型">
                    <select
                      className="admin-input"
                      value={form.entity_type}
                      onChange={(e) => setForm({ ...form, entity_type: e.target.value as DrinkCompanyEntityType })}>
                      {ENTITY_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {ENTITY_TYPE_LABELS[t]}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="状态">
                    <select
                      className="admin-input"
                      value={form.status}
                      onChange={(e) => setForm({ ...form, status: e.target.value as DrinkCompanyStatus })}>
                      <option value="active">active</option>
                      <option value="archived">archived</option>
                    </select>
                  </Field>
                </div>
                <div style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr 100px' }}>
                  <Field label="国家">
                    <input
                      className="admin-input"
                      value={form.country}
                      onChange={(e) => setForm({ ...form, country: e.target.value })}
                    />
                  </Field>
                  <Field label="代码">
                    <input
                      className="admin-input"
                      value={form.country_code}
                      onChange={(e) => setForm({ ...form, country_code: e.target.value })}
                    />
                  </Field>
                </div>
                <Field label="产区/城市">
                  <input
                    className="admin-input"
                    value={form.origin_region}
                    onChange={(e) => setForm({ ...form, origin_region: e.target.value })}
                  />
                </Field>
                <Field label="原始产地值" hint="逗号分隔">
                  <textarea
                    className="admin-input"
                    value={form.raw_country_values_text}
                    onChange={(e) => setForm({ ...form, raw_country_values_text: e.target.value })}
                    rows={2}
                    style={{ resize: 'vertical' }}
                  />
                </Field>
                <div style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr' }}>
                  <Field label="置信度">
                    <select
                      className="admin-input"
                      value={form.confidence}
                      onChange={(e) => setForm({ ...form, confidence: e.target.value as DrinkCompanyConfidence })}>
                      {CONFIDENCE_LEVELS.map((c) => (
                        <option key={c} value={c}>
                          {CONFIDENCE_LABELS[c]}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="审核状态">
                    <select
                      className="admin-input"
                      value={form.review_status}
                      onChange={(e) =>
                        setForm({ ...form, review_status: e.target.value as DrinkCompanyReviewStatus })
                      }>
                      {REVIEW_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {REVIEW_STATUS_LABELS[s]}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <Field label="来源 URL">
                  <input
                    className="admin-input"
                    value={form.source}
                    onChange={(e) => setForm({ ...form, source: e.target.value })}
                  />
                </Field>
                <Field label="备注">
                  <textarea
                    className="admin-input"
                    value={form.source_note}
                    onChange={(e) => setForm({ ...form, source_note: e.target.value })}
                    rows={3}
                    style={{ resize: 'vertical' }}
                  />
                </Field>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
                  <button type="submit" className="admin-button admin-button-primary" disabled={saving || aliasSaving}>
                    {saving ? '保存中…' : editingId ? '保存修改' : '创建'}
                  </button>
                  <button
                    type="button"
                    className="admin-button admin-button-secondary"
                    onClick={closeDrawer}
                    disabled={saving || aliasSaving}>
                    关闭
                  </button>
                </div>
              </form>

              {editingId ? (
                <div style={{ marginTop: 28, paddingTop: 24, borderTop: '1px solid #e5e7eb' }}>
                  <h3 style={{ margin: '0 0 8px', fontSize: '1rem' }}>别名</h3>
                  <p style={{ color: '#6b7280', fontSize: '0.85rem', margin: '0 0 14px' }}>
                    全局冲突仅提示，不会自动合并。
                  </p>
                  <form onSubmit={handleAliasSubmit} className="admin-form" style={{ gap: 8, marginBottom: 16 }}>
                    <input
                      className="admin-input"
                      placeholder="别名 *"
                      value={aliasForm.alias}
                      onChange={(e) => setAliasForm({ ...aliasForm, alias: e.target.value })}
                    />
                    <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr' }}>
                      <select
                        className="admin-input"
                        value={aliasForm.alias_language}
                        onChange={(e) =>
                          setAliasForm({ ...aliasForm, alias_language: e.target.value as DrinkCompanyAliasLanguage | '' })
                        }>
                        <option value="">语言</option>
                        {ALIAS_LANGUAGES.map((lang) => (
                          <option key={lang} value={lang}>
                            {ALIAS_LANGUAGE_LABELS[lang]}
                          </option>
                        ))}
                      </select>
                      <select
                        className="admin-input"
                        value={aliasForm.alias_type}
                        onChange={(e) =>
                          setAliasForm({ ...aliasForm, alias_type: e.target.value as DrinkCompanyAliasType })
                        }>
                        {ALIAS_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {ALIAS_TYPE_LABELS[t]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        type="submit"
                        className="admin-button admin-button-primary"
                        disabled={aliasSaving || saving}
                        style={{ flex: 1 }}>
                        {aliasSaving ? '保存中…' : editingAliasId ? '保存别名' : '添加别名'}
                      </button>
                      {editingAliasId ? (
                        <button type="button" className="admin-button admin-button-secondary" onClick={resetAliasForm}>
                          取消
                        </button>
                      ) : null}
                    </div>
                  </form>

                  {aliases.length === 0 ? (
                    <p style={{ color: '#9ca3af', fontSize: '0.9rem' }}>暂无别名</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {aliases.map((alias) => (
                        <div
                          key={alias.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 10,
                            padding: '10px 12px',
                            borderRadius: 8,
                            background: editingAliasId === alias.id ? '#f3f4f6' : '#fafafa',
                            border: '1px solid #eef0f3',
                          }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: '0.92rem' }}>{alias.alias}</div>
                            <div style={{ color: '#6b7280', fontSize: '0.78rem', marginTop: 2 }}>
                              {ALIAS_TYPE_LABELS[alias.alias_type]}
                              {alias.alias_language ? ` · ${ALIAS_LANGUAGE_LABELS[alias.alias_language]}` : ''}
                              {alias.collision_company_count > 0
                                ? ` · 冲突 ${alias.collision_company_count} 家`
                                : ''}
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                            <button
                              type="button"
                              className="admin-button admin-button-secondary"
                              style={{ fontSize: '0.78rem', padding: '4px 8px' }}
                              onClick={() => startEditAlias(alias)}
                              disabled={aliasSaving || saving}>
                              编辑
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeleteAlias(alias)}
                              disabled={aliasSaving || saving}
                              style={{
                                padding: '4px 8px',
                                borderRadius: 6,
                                border: '1px solid #ef4444',
                                background: 'transparent',
                                color: '#ef4444',
                                fontSize: '0.78rem',
                                cursor: aliasSaving || saving ? 'wait' : 'pointer',
                              }}>
                              删
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </aside>
        </>
      ) : null}
    </div>
  )
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string
  hint?: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#374151', marginBottom: 4 }}>
        {label}
        {required ? ' *' : ''}
      </span>
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

function ReviewBadge({ status }: { status: DrinkCompanyReviewStatus }) {
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
