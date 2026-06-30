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
    // Initial auth + load only; filter changes reload via debounced effect below.
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

  const stats = useMemo(() => {
    const pendingReview = companies.filter((c) => c.review_status === 'pending').length
    const withCollisions = companies.filter((c) => c.global_alias_collision_count > 0).length
    return { total: companies.length, pendingReview, withCollisions }
  }, [companies])

  const resetForm = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setAliases([])
    setAliasForm(EMPTY_ALIAS_FORM)
    setEditingAliasId(null)
    setNormalizedKeyTouched(false)
  }

  const startEdit = async (company: AdminDrinkCompanyRow) => {
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

      if (!editingId && savedId) {
        setEditingId(savedId)
        setNormalizedKeyTouched(true)
      }

      await loadCompanies()
      if (savedId) {
        await loadAliases(savedId)
      }
      alert(editingId ? '已保存修改' : '已创建品牌/酒厂')
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

  return (
    <div className="admin-container">
      <div className="admin-header">
        <p style={{ marginBottom: '0.5rem' }}>
          <Link href="/admin/platform" style={{ color: '#6b7280', textDecoration: 'none' }}>
            ← 平台管理
          </Link>
        </p>
        <h1>品牌/酒厂管理</h1>
        <p style={{ color: '#4b5563', marginTop: '0.5rem' }}>
          Product Pool 品牌/酒厂规范数据 · 共 {stats.total} 条 · 待审核 {stats.pendingReview} · 别名冲突{' '}
          {stats.withCollisions}
        </p>
        <p style={{ color: '#6b7280', marginTop: '0.35rem', fontSize: '0.95rem' }}>
          内部管理用途，不影响消费者 App 展示。
        </p>
      </div>

      <div className="admin-section" style={{ marginBottom: '2rem' }}>
        <h2 style={{ marginBottom: '0.75rem' }}>筛选</h2>
        <div className="admin-form" style={{ maxWidth: 960, display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          <input
            className="admin-input"
            placeholder="搜索名称、key、别名…"
            value={filters.query}
            onChange={(e) => setFilters({ ...filters, query: e.target.value })}
          />
          <select
            className="admin-input"
            value={filters.entity_type}
            onChange={(e) => setFilters({ ...filters, entity_type: e.target.value as DrinkCompanyEntityType | '' })}>
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
            onChange={(e) => setFilters({ ...filters, review_status: e.target.value as DrinkCompanyReviewStatus | '' })}>
            <option value="">全部审核状态</option>
            {REVIEW_STATUSES.map((s) => (
              <option key={s} value={s}>
                {REVIEW_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <select
            className="admin-input"
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value as Filters['status'] })}>
            <option value="active">仅 active</option>
            <option value="archived">仅 archived</option>
            <option value="all">全部状态</option>
          </select>
        </div>
      </div>

      <div className="admin-section" style={{ marginBottom: '2rem' }}>
        <h2 style={{ marginBottom: '0.75rem' }}>{editingId ? '编辑品牌/酒厂' : '添加品牌/酒厂'}</h2>
        <p style={{ color: '#6b7280', marginBottom: '1rem', fontSize: '0.95rem', maxWidth: 820 }}>
          <strong>normalized_key</strong> 用于未来批量导入幂等 upsert：创建时默认取规范中文名的小写并合并空白；创建后不可修改。
        </p>
        <form onSubmit={handleSubmit} className="admin-form" style={{ maxWidth: 720 }}>
          <input
            className="admin-input"
            placeholder="normalized_key"
            value={form.normalized_key}
            onChange={(e) => {
              setNormalizedKeyTouched(true)
              setForm({ ...form, normalized_key: e.target.value })
            }}
            disabled={!!editingId}
            autoCapitalize="none"
          />
          <input
            className="admin-input"
            placeholder="规范中文名 *"
            value={form.canonical_name}
            onChange={(e) => handleCanonicalNameChange(e.target.value)}
          />
          <input
            className="admin-input"
            placeholder="规范英文名"
            value={form.canonical_name_en}
            onChange={(e) => setForm({ ...form, canonical_name_en: e.target.value })}
          />
          <input
            className="admin-input"
            placeholder="展示名 *"
            value={form.display_name}
            onChange={(e) => setForm({ ...form, display_name: e.target.value })}
          />
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
          <input
            className="admin-input"
            placeholder="国家（规范）"
            value={form.country}
            onChange={(e) => setForm({ ...form, country: e.target.value })}
          />
          <input
            className="admin-input"
            placeholder="国家代码（如 CN、US）"
            value={form.country_code}
            onChange={(e) => setForm({ ...form, country_code: e.target.value })}
          />
          <input
            className="admin-input"
            placeholder="产区/地区"
            value={form.origin_region}
            onChange={(e) => setForm({ ...form, origin_region: e.target.value })}
          />
          <textarea
            className="admin-input"
            placeholder="原始国家/产地值（逗号分隔，如 上海, 英国x美国）"
            value={form.raw_country_values_text}
            onChange={(e) => setForm({ ...form, raw_country_values_text: e.target.value })}
            rows={2}
            style={{ resize: 'vertical' }}
          />
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr 1fr' }}>
            <select
              className="admin-input"
              value={form.confidence}
              onChange={(e) => setForm({ ...form, confidence: e.target.value as DrinkCompanyConfidence })}>
              {CONFIDENCE_LEVELS.map((c) => (
                <option key={c} value={c}>
                  置信度: {CONFIDENCE_LABELS[c]}
                </option>
              ))}
            </select>
            <select
              className="admin-input"
              value={form.review_status}
              onChange={(e) => setForm({ ...form, review_status: e.target.value as DrinkCompanyReviewStatus })}>
              {REVIEW_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {REVIEW_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
            <select
              className="admin-input"
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as DrinkCompanyStatus })}>
              <option value="active">active</option>
              <option value="archived">archived</option>
            </select>
          </div>
          <input
            className="admin-input"
            placeholder="来源"
            value={form.source}
            onChange={(e) => setForm({ ...form, source: e.target.value })}
          />
          <textarea
            className="admin-input"
            placeholder="来源备注"
            value={form.source_note}
            onChange={(e) => setForm({ ...form, source_note: e.target.value })}
            rows={2}
            style={{ resize: 'vertical' }}
          />
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
            <button type="submit" className="admin-button admin-button-primary" disabled={saving}>
              {saving ? '保存中…' : editingId ? '保存修改' : '创建'}
            </button>
            {editingId ? (
              <button type="button" className="admin-button admin-button-secondary" onClick={resetForm}>
                取消编辑
              </button>
            ) : null}
          </div>
        </form>
      </div>

      {editingId ? (
        <div className="admin-section" style={{ marginBottom: '2rem' }}>
          <h2 style={{ marginBottom: '0.75rem' }}>别名管理</h2>
          <p style={{ color: '#6b7280', marginBottom: '1rem', fontSize: '0.95rem' }}>
            同一别名可存在于不同公司；若发生冲突，会在列表中标注，需人工审核，不会自动合并。
          </p>
          <form onSubmit={handleAliasSubmit} className="admin-form" style={{ maxWidth: 720, marginBottom: '1.5rem' }}>
            <input
              className="admin-input"
              placeholder="别名 *"
              value={aliasForm.alias}
              onChange={(e) => setAliasForm({ ...aliasForm, alias: e.target.value })}
            />
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
              <select
                className="admin-input"
                value={aliasForm.alias_language}
                onChange={(e) =>
                  setAliasForm({ ...aliasForm, alias_language: e.target.value as DrinkCompanyAliasLanguage | '' })
                }>
                <option value="">语言（可选）</option>
                {ALIAS_LANGUAGES.map((lang) => (
                  <option key={lang} value={lang}>
                    {ALIAS_LANGUAGE_LABELS[lang]}
                  </option>
                ))}
              </select>
              <select
                className="admin-input"
                value={aliasForm.alias_type}
                onChange={(e) => setAliasForm({ ...aliasForm, alias_type: e.target.value as DrinkCompanyAliasType })}>
                {ALIAS_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {ALIAS_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
            <input
              className="admin-input"
              placeholder="来源（可选）"
              value={aliasForm.source}
              onChange={(e) => setAliasForm({ ...aliasForm, source: e.target.value })}
            />
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <button type="submit" className="admin-button admin-button-primary" disabled={aliasSaving || saving}>
                {aliasSaving ? '保存中…' : editingAliasId ? '保存别名' : '添加别名'}
              </button>
              {editingAliasId ? (
                <button type="button" className="admin-button admin-button-secondary" onClick={resetAliasForm}>
                  取消
                </button>
              ) : null}
            </div>
          </form>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #333' }}>
                  <th style={thStyle}>别名</th>
                  <th style={thStyle}>语言</th>
                  <th style={thStyle}>类型</th>
                  <th style={thStyle}>冲突</th>
                  <th style={thStyle}>操作</th>
                </tr>
              </thead>
              <tbody>
                {aliases.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ ...tdStyle, color: '#6b7280', textAlign: 'center' }}>
                      暂无别名
                    </td>
                  </tr>
                ) : (
                  aliases.map((alias) => (
                    <tr key={alias.id} style={{ borderBottom: '1px solid #222' }}>
                      <td style={tdStyle}>{alias.alias}</td>
                      <td style={tdStyle}>{alias.alias_language ? ALIAS_LANGUAGE_LABELS[alias.alias_language] : '—'}</td>
                      <td style={tdStyle}>{ALIAS_TYPE_LABELS[alias.alias_type]}</td>
                      <td style={tdStyle}>
                        {alias.collision_company_count > 0 ? (
                          <span style={{ ...badgeStyle, background: '#451a03', color: '#fdba74' }}>
                            {alias.collision_company_count} 家
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          <button
                            type="button"
                            className="admin-button admin-button-secondary"
                            style={{ fontSize: '0.85rem' }}
                            onClick={() => startEditAlias(alias)}
                            disabled={aliasSaving || saving}>
                            编辑
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeleteAlias(alias)}
                            disabled={aliasSaving || saving}
                            style={{
                              padding: '6px 14px',
                              borderRadius: '6px',
                              border: '1px solid #ef4444',
                              background: 'transparent',
                              color: '#ef4444',
                              cursor: aliasSaving || saving ? 'wait' : 'pointer',
                              fontSize: '0.85rem',
                            }}>
                            删除
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div className="admin-section" style={{ marginBottom: '2rem' }}>
        <h2 style={{ margin: 0, marginBottom: '1rem' }}>品牌/酒厂目录</h2>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #333' }}>
                <th style={thStyle}>展示名</th>
                <th style={thStyle}>规范名</th>
                <th style={thStyle}>类型</th>
                <th style={thStyle}>国家</th>
                <th style={thStyle}>审核</th>
                <th style={thStyle}>别名</th>
                <th style={thStyle}>冲突</th>
                <th style={thStyle}>状态</th>
                <th style={thStyle}>操作</th>
              </tr>
            </thead>
            <tbody>
              {companies.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ ...tdStyle, color: '#6b7280', textAlign: 'center' }}>
                    暂无数据。可手动添加，或等待下一步批量导入。
                  </td>
                </tr>
              ) : (
                companies.map((company) => (
                  <tr key={company.id} style={{ borderBottom: '1px solid #222' }}>
                    <td style={tdStyle}>
                      <strong>{company.display_name}</strong>
                      {company.canonical_name_en ? (
                        <div style={{ color: '#6b7280', fontSize: '0.85rem', marginTop: 4 }}>{company.canonical_name_en}</div>
                      ) : null}
                    </td>
                    <td style={tdStyle}>
                      <div>{company.canonical_name}</div>
                      <code style={codeStyle}>{company.normalized_key}</code>
                    </td>
                    <td style={tdStyle}>{ENTITY_TYPE_LABELS[company.entity_type]}</td>
                    <td style={tdStyle}>
                      {company.country ?? '—'}
                      {company.country_code ? ` (${company.country_code})` : ''}
                    </td>
                    <td style={tdStyle}>
                      <span
                        style={{
                          ...badgeStyle,
                          background:
                            company.review_status === 'reviewed'
                              ? '#052e16'
                              : company.review_status === 'pending'
                                ? '#451a03'
                                : '#450a0a',
                          color:
                            company.review_status === 'reviewed'
                              ? '#4ade80'
                              : company.review_status === 'pending'
                                    ? '#fdba74'
                                    : '#fca5a5',
                        }}>
                        {REVIEW_STATUS_LABELS[company.review_status]}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>{company.alias_count}</td>
                    <td style={tdStyle}>
                      {company.global_alias_collision_count > 0 ? (
                        <span style={{ ...badgeStyle, background: '#451a03', color: '#fdba74' }}>
                          {company.global_alias_collision_count}
                        </span>
                      ) : (
                        '—'
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
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        <button
                          type="button"
                          className="admin-button admin-button-secondary"
                          style={{ fontSize: '0.85rem' }}
                          onClick={() => void startEdit(company)}
                          disabled={saving}>
                          编辑
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleArchiveToggle(company)}
                          disabled={saving}
                          style={{
                            padding: '6px 14px',
                            borderRadius: '6px',
                            border: '1px solid',
                            borderColor: company.status === 'active' ? '#ef4444' : '#22c55e',
                            background: 'transparent',
                            color: company.status === 'active' ? '#ef4444' : '#22c55e',
                            cursor: saving ? 'wait' : 'pointer',
                            fontSize: '0.85rem',
                          }}>
                          {company.status === 'active' ? '归档' : '恢复'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {role === 'super_admin' ? (
        <div className="admin-section">
          <h3 style={{ marginBottom: '0.75rem' }}>说明</h3>
          <ul style={{ color: '#6b7280', lineHeight: 1.7, paddingLeft: '1.25rem', margin: 0 }}>
            <li>此目录为 Product Pool 未来使用的品牌/酒厂规范层，当前不影响消费者 App。</li>
            <li>Product Pool 导入仍使用 `drink_products.brand_name` / `brewery` 文本字段。</li>
            <li>别名全局冲突仅作提示，不会自动合并或关联产品。</li>
          </ul>
        </div>
      ) : null}
    </div>
  )
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '12px 16px',
  fontSize: '0.85rem',
  color: '#374151',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
}

const tdStyle: React.CSSProperties = {
  padding: '14px 16px',
  fontSize: '0.95rem',
  color: '#111827',
}

const codeStyle: React.CSSProperties = {
  background: '#1e293b',
  color: '#f1f5f9',
  padding: '2px 8px',
  borderRadius: '4px',
  fontSize: '0.85rem',
}

const badgeStyle: React.CSSProperties = {
  padding: '3px 10px',
  borderRadius: '12px',
  fontSize: '0.8rem',
  fontWeight: 600,
}
