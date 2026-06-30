'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import type { AdminTaplistCityRow, UserRole } from '@/lib/types'

type CityForm = {
  city: string
  label: string
  country: string
  sort_order: string
  is_enabled: boolean
}

const EMPTY_FORM: CityForm = {
  city: '',
  label: '',
  country: 'China',
  sort_order: '100',
  is_enabled: true,
}

function consumerVisible(city: AdminTaplistCityRow) {
  return city.is_enabled && city.public_bar_count > 0
}

export default function PlatformCitiesPage() {
  const [cities, setCities] = useState<AdminTaplistCityRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [role, setRole] = useState<UserRole | null>(null)
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [editingCity, setEditingCity] = useState<string | null>(null)
  const [form, setForm] = useState<CityForm>(EMPTY_FORM)

  const loadCities = useCallback(async () => {
    const { data, error: rpcError } = await supabase.rpc('admin_list_taplist_cities')
    if (rpcError) throw rpcError
    const payload = data as { ok?: boolean; cities?: AdminTaplistCityRow[] }
    if (!payload || payload.ok !== true || !Array.isArray(payload.cities)) {
      throw new Error('城市列表返回格式异常')
    }
    setCities(payload.cities)
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
        await loadCities()
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : '加载失败')
      } finally {
        setLoading(false)
      }
    }

    void init()
  }, [loadCities])

  const resetForm = () => {
    setEditingCity(null)
    setForm(EMPTY_FORM)
  }

  const startEdit = (city: AdminTaplistCityRow) => {
    setEditingCity(city.city)
    setForm({
      city: city.city,
      label: city.label,
      country: city.country,
      sort_order: String(city.sort_order),
      is_enabled: city.is_enabled,
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const city = form.city.trim()
    const label = form.label.trim()
    const country = form.country.trim() || 'China'
    const sortOrder = Number.parseInt(form.sort_order, 10)

    if (!city) {
      alert('请填写城市 key（如 Shanghai、Beijing）')
      return
    }
    if (!label) {
      alert('请填写中文展示名')
      return
    }
    if (!Number.isFinite(sortOrder)) {
      alert('排序值必须是数字')
      return
    }

    setSaving(true)
    try {
      const { error: rpcError } = await supabase.rpc('admin_upsert_taplist_city', {
        p_city: city,
        p_label: label,
        p_country: country,
        p_sort_order: sortOrder,
        p_is_enabled: form.is_enabled,
      })
      if (rpcError) throw rpcError
      resetForm()
      await loadCities()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleSync = async () => {
    setSyncing(true)
    try {
      const { data, error: rpcError } = await supabase.rpc('admin_sync_taplist_cities_from_tenants')
      if (rpcError) throw rpcError
      const payload = data as { ok?: boolean; inserted?: number }
      await loadCities()
      alert(`已从门店同步，新增 ${payload?.inserted ?? 0} 个城市条目。`)
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : '同步失败')
    } finally {
      setSyncing(false)
    }
  }

  const handleToggleEnabled = async (city: AdminTaplistCityRow) => {
    const nextEnabled = !city.is_enabled
    const action = nextEnabled ? '启用' : '停用'
    if (!confirm(`确定要${action}「${city.label}」吗？`)) return

    setSaving(true)
    try {
      const { error: rpcError } = await supabase.rpc('admin_upsert_taplist_city', {
        p_city: city.city,
        p_label: city.label,
        p_country: city.country,
        p_sort_order: city.sort_order,
        p_is_enabled: nextEnabled,
      })
      if (rpcError) throw rpcError
      await loadCities()
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
          <h1>城市管理</h1>
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
          <h1>城市管理</h1>
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
        <h1>城市管理</h1>
        <p style={{ color: '#4b5563', marginTop: '0.5rem' }}>
          配置 No Menu 消费者 App 可选城市 · 共 {cities.length} 条 · App 内可见{' '}
          {cities.filter(consumerVisible).length} 个
        </p>
      </div>

      <div className="admin-section" style={{ marginBottom: '2rem' }}>
        <h2 style={{ marginBottom: '0.75rem' }}>{editingCity ? `编辑 ${editingCity}` : '添加城市'}</h2>
        <p style={{ color: '#6b7280', marginBottom: '1rem', fontSize: '0.95rem', maxWidth: 720 }}>
          <strong>city</strong> 必须与 Tap List 门店信息里的城市字段一致（如 <code>Shanghai</code>）。
          App 仅展示已启用且至少有 1 家公开门店的城市。
        </p>
        <form onSubmit={handleSubmit} className="admin-form" style={{ maxWidth: 520 }}>
          <input
            className="admin-input"
            placeholder="城市 key（如 Beijing）"
            value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })}
            disabled={!!editingCity}
            autoCapitalize="none"
          />
          <input
            className="admin-input"
            placeholder="中文展示名（如 北京）"
            value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
          />
          <input
            className="admin-input"
            placeholder="国家（默认 China）"
            value={form.country}
            onChange={(e) => setForm({ ...form, country: e.target.value })}
          />
          <input
            className="admin-input"
            placeholder="排序（越小越靠前，上海建议 10）"
            value={form.sort_order}
            onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
            inputMode="numeric"
          />
          <label className="admin-label admin-label-checkbox" style={{ marginTop: 4 }}>
            <input
              type="checkbox"
              checked={form.is_enabled}
              onChange={(e) => setForm({ ...form, is_enabled: e.target.checked })}
            />
            <span>启用（停用后 App 不展示，但条目保留）</span>
          </label>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
            <button type="submit" className="admin-button admin-button-primary" disabled={saving}>
              {saving ? '保存中…' : editingCity ? '保存修改' : '添加城市'}
            </button>
            {editingCity ? (
              <button type="button" className="admin-button admin-button-secondary" onClick={resetForm}>
                取消编辑
              </button>
            ) : null}
          </div>
        </form>
      </div>

      <div className="admin-section" style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0 }}>城市目录</h2>
          <button
            type="button"
            className="admin-button admin-button-secondary"
            onClick={() => void handleSync()}
            disabled={syncing || saving}>
            {syncing ? '同步中…' : '从活跃门店同步缺失城市'}
          </button>
        </div>
        <div style={{ overflowX: 'auto', marginTop: '1rem' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #333' }}>
                <th style={thStyle}>展示名</th>
                <th style={thStyle}>City key</th>
                <th style={thStyle}>排序</th>
                <th style={thStyle}>公开酒吧</th>
                <th style={thStyle}>活跃门店</th>
                <th style={thStyle}>状态</th>
                <th style={thStyle}>App 可见</th>
                <th style={thStyle}>操作</th>
              </tr>
            </thead>
            <tbody>
              {cities.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ ...tdStyle, color: '#6b7280', textAlign: 'center' }}>
                    暂无城市。可先添加，或从门店同步。
                  </td>
                </tr>
              ) : (
                cities.map((city) => (
                  <tr key={city.city} style={{ borderBottom: '1px solid #222' }}>
                    <td style={tdStyle}>
                      <strong>{city.label}</strong>
                    </td>
                    <td style={tdStyle}>
                      <code style={codeStyle}>{city.city}</code>
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>{city.sort_order}</td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>{city.public_bar_count}</td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>{city.active_bar_count}</td>
                    <td style={tdStyle}>
                      <span
                        style={{
                          ...badgeStyle,
                          background: city.is_enabled ? '#052e16' : '#450a0a',
                          color: city.is_enabled ? '#4ade80' : '#fca5a5',
                        }}>
                        {city.is_enabled ? '启用' : '停用'}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <span
                        style={{
                          ...badgeStyle,
                          background: consumerVisible(city) ? '#172554' : '#1f2937',
                          color: consumerVisible(city) ? '#93c5fd' : '#9ca3af',
                        }}>
                        {consumerVisible(city) ? '是' : '否'}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        <button
                          type="button"
                          className="admin-button admin-button-secondary"
                          style={{ fontSize: '0.85rem' }}
                          onClick={() => startEdit(city)}
                          disabled={saving}>
                          编辑
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleToggleEnabled(city)}
                          disabled={saving}
                          style={{
                            padding: '6px 14px',
                            borderRadius: '6px',
                            border: '1px solid',
                            borderColor: city.is_enabled ? '#ef4444' : '#22c55e',
                            background: 'transparent',
                            color: city.is_enabled ? '#ef4444' : '#22c55e',
                            cursor: saving ? 'wait' : 'pointer',
                            fontSize: '0.85rem',
                          }}>
                          {city.is_enabled ? '停用' : '启用'}
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
            <li>门店城市在 Tap List 管理 → 门店信息 中设置，需与上表 city key 一致。</li>
            <li>「App 可见」= 已启用 + 至少 1 家 active 且公开可见的酒吧。</li>
            <li>排序越小，App 城市列表越靠前；上海默认 10。</li>
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
