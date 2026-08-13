'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { ProductPoolLinkSection } from '@/components/admin/ProductPoolLinkSection'
import { supabase } from '@/lib/supabaseClient'
import type { AdminUnlinkedDrinkRow, Drink, TenantInfo, UserRole } from '@/lib/types'

type Filters = {
  query: string
  tenant_id: string
  enabled_only: boolean
  public_only: boolean
}

const DEFAULT_FILTERS: Filters = {
  query: '',
  tenant_id: '',
  enabled_only: true,
  public_only: false,
}

const PLATFORM_SLUG = '__platform__'

function isRealBar(t: TenantInfo) {
  return t.slug != null && t.slug !== PLATFORM_SLUG
}

function tenantLabel(row: Pick<AdminUnlinkedDrinkRow, 'tenant_display_name' | 'tenant_name' | 'tenant_slug'>) {
  return row.tenant_display_name?.trim() || row.tenant_name || row.tenant_slug || '—'
}

function publicStatusLabel(status: string | null | undefined) {
  if (!status) return '—'
  const map: Record<string, string> = {
    available: '在售',
    new: '上新',
    sold_out: '售罄',
    售罄: '售罄',
    上新: '上新',
    在售: '在售',
  }
  return map[status] ?? status
}

function rowToDrink(row: AdminUnlinkedDrinkRow): Drink {
  return {
    id: row.id,
    category_id: row.category_id ?? '',
    brand_name: row.brand_name,
    name: row.name,
    price: 0,
    price_unit: '杯',
    price_bottle: null,
    price_unit_bottle: '',
    sort_order: 0,
    enabled: row.enabled,
    created_at: row.created_at,
    image_url: row.image_url,
    is_public_visible: row.is_public_visible,
    public_status: row.public_status,
    public_sort_order: row.public_sort_order,
    product_id: row.product_id,
    display_name: row.display_name,
    display_description: row.display_description,
  }
}

function rowBeerProfile(row: AdminUnlinkedDrinkRow) {
  return {
    brewery: row.brewery ?? '',
    beer_style: row.beer_style ?? '',
    abv: row.abv ?? '',
    ibu: row.ibu ?? '',
    country: row.country ?? '',
    description: row.description ?? '',
  }
}

function formatMeta(row: AdminUnlinkedDrinkRow) {
  const parts = [
    row.brewery || row.brand_name,
    row.beer_style,
    row.abv != null ? `ABV ${row.abv}%` : null,
  ].filter(Boolean)
  return parts.join(' · ') || '—'
}

function formatCreatedAt(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function UnlinkedDrinksInboxPage() {
  const [drinks, setDrinks] = useState<AdminUnlinkedDrinkRow[]>([])
  const [total, setTotal] = useState(0)
  const [unlinkedStats, setUnlinkedStats] = useState<number | null>(null)
  const [tenants, setTenants] = useState<TenantInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [role, setRole] = useState<UserRole | null>(null)
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creatingId, setCreatingId] = useState<string | null>(null)

  const selected = useMemo(
    () => drinks.find((d) => d.id === selectedId) ?? null,
    [drinks, selectedId],
  )

  const loadDrinks = useCallback(async () => {
    const { data, error: rpcError } = await supabase.rpc('admin_list_unlinked_drinks', {
      p_query: filters.query.trim() || null,
      p_tenant_id: filters.tenant_id || null,
      p_enabled_only: filters.enabled_only,
      p_public_only: filters.public_only,
      p_limit: 200,
    })
    if (rpcError) throw rpcError
    const payload = (data ?? {}) as { ok?: boolean; total?: number; drinks?: AdminUnlinkedDrinkRow[] }
    setDrinks(payload.drinks ?? [])
    setTotal(payload.total ?? 0)
  }, [filters])

  const loadStats = useCallback(async () => {
    const { data, error: rpcError } = await supabase.rpc('admin_get_drink_product_stats')
    if (rpcError) throw rpcError
    const payload = (data ?? {}) as { ok?: boolean; stats?: { unlinked_drinks?: number } }
    setUnlinkedStats(payload.stats?.unlinked_drinks ?? null)
  }, [])

  const loadTenants = useCallback(async () => {
    const { data, error: rpcError } = await supabase.rpc('admin_list_tenants')
    if (rpcError) throw rpcError
    setTenants(((data || []) as TenantInfo[]).filter(isRealBar))
  }, [])

  useEffect(() => {
    const boot = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()
        if (!session) {
          setError('请先登录')
          setLoading(false)
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
          setLoading(false)
          return
        }

        setRole('super_admin')
        await Promise.all([loadDrinks(), loadStats(), loadTenants()])
        setError('')
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : '加载失败')
      } finally {
        setLoading(false)
      }
    }
    void boot()
  }, [loadDrinks, loadStats, loadTenants])

  useEffect(() => {
    if (role !== 'super_admin') return
    const timer = setTimeout(() => {
      void loadDrinks().catch((e: unknown) => {
        setError(e instanceof Error ? e.message : '加载失败')
      })
    }, 300)
    return () => clearTimeout(timer)
  }, [filters, loadDrinks, role])

  const refreshAfterLink = useCallback(async () => {
    await Promise.all([loadDrinks(), loadStats()])
    setDrawerOpen(false)
    setSelectedId(null)
  }, [loadDrinks, loadStats])

  const openDrawer = (row: AdminUnlinkedDrinkRow) => {
    setSelectedId(row.id)
    setDrawerOpen(true)
  }

  const closeDrawer = () => {
    setDrawerOpen(false)
    setSelectedId(null)
  }

  const createFromDrink = async (row: AdminUnlinkedDrinkRow) => {
    const label = `${tenantLabel(row)} · ${row.name}`
    if (!window.confirm(`从「${label}」创建商品池条目并自动关联？`)) return
    setCreatingId(row.id)
    try {
      const { data, error: rpcError } = await supabase.rpc('admin_create_drink_product_from_drink', {
        p_drink_id: row.id,
        p_auto_link: true,
      })
      if (rpcError) throw rpcError
      const payload = (data ?? {}) as { ok?: boolean; product_id?: string }
      if (!payload.ok && !payload.product_id) throw new Error('创建失败')
      await Promise.all([loadDrinks(), loadStats()])
      if (selectedId === row.id) {
        setDrawerOpen(false)
        setSelectedId(null)
      }
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : '创建失败')
    } finally {
      setCreatingId(null)
    }
  }

  if (loading) {
    return (
      <div className="admin-container">
        <div className="admin-header">
          <h1>待关联酒款</h1>
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
          <h1>待关联酒款</h1>
        </div>
        <div style={{ textAlign: 'center', padding: '4rem', color: '#ef4444' }}>{error}</div>
      </div>
    )
  }

  return (
    <div className="admin-container" style={{ paddingBottom: drawerOpen ? 0 : undefined }}>
      <div className="admin-header" style={{ marginBottom: '1rem' }}>
        <p style={{ marginBottom: '0.5rem' }}>
          <Link href="/admin/platform" style={{ color: '#6b7280', textDecoration: 'none' }}>
            ← 平台管理
          </Link>
          {' · '}
          <Link href="/admin/platform/products" style={{ color: '#6b7280', textDecoration: 'none' }}>
            产品池
          </Link>
        </p>
        <div>
          <h1 style={{ marginBottom: '0.35rem' }}>待关联酒款</h1>
          <p style={{ color: '#6b7280', fontSize: '0.95rem', margin: 0 }}>
            跨店收件箱：门店酒款尚未挂到商品池时，在此搜索关联或一键建池
          </p>
        </div>
      </div>

      <div style={stickyToolbarStyle}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <StatPill label="当前匹配" value={total} />
          <StatPill
            label="启用且未关联"
            value={unlinkedStats ?? total}
            tone="warn"
          />
          <StatPill label="本页展示" value={drinks.length} />
        </div>

        <div
          style={{
            display: 'grid',
            gap: 10,
            gridTemplateColumns: 'minmax(200px, 2fr) minmax(160px, 1.2fr) auto auto auto',
            alignItems: 'center',
          }}>
          <input
            className="admin-input"
            placeholder="搜索酒名、酒厂、风格、店名…"
            value={filters.query}
            onChange={(e) => setFilters({ ...filters, query: e.target.value })}
            style={{ margin: 0 }}
          />
          <select
            className="admin-input"
            value={filters.tenant_id}
            onChange={(e) => setFilters({ ...filters, tenant_id: e.target.value })}
            style={{ margin: 0 }}>
            <option value="">全部门店</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <label style={toggleLabelStyle}>
            <input
              type="checkbox"
              checked={filters.enabled_only}
              onChange={(e) => setFilters({ ...filters, enabled_only: e.target.checked })}
            />
            仅启用
          </label>
          <label style={toggleLabelStyle}>
            <input
              type="checkbox"
              checked={filters.public_only}
              onChange={(e) => setFilters({ ...filters, public_only: e.target.checked })}
            />
            仅公开
          </label>
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
                <th style={thStyle}>门店</th>
                <th style={thStyle}>酒款</th>
                <th style={thStyle}>酒厂 / 风格</th>
                <th style={thStyle}>公开</th>
                <th style={thStyle}>创建时间</th>
                <th style={{ ...thStyle, width: 220 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {drinks.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ ...tdStyle, color: '#6b7280', textAlign: 'center', padding: '2rem' }}>
                    无匹配的未关联酒款。
                  </td>
                </tr>
              ) : (
                drinks.map((row) => {
                  const isSelected = drawerOpen && selectedId === row.id
                  return (
                    <tr
                      key={row.id}
                      style={{
                        borderBottom: '1px solid #eef0f3',
                        background: isSelected ? '#eff6ff' : undefined,
                      }}>
                      <td style={tdStyle}>
                        <strong style={{ fontSize: '0.92rem' }}>{tenantLabel(row)}</strong>
                        {row.tenant_slug ? (
                          <div style={{ color: '#6b7280', fontSize: '0.8rem', marginTop: 2 }}>{row.tenant_slug}</div>
                        ) : null}
                      </td>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                          {row.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={row.image_url}
                              alt=""
                              style={{
                                width: 40,
                                height: 40,
                                objectFit: 'cover',
                                borderRadius: 6,
                                background: '#f3f4f6',
                                flexShrink: 0,
                              }}
                            />
                          ) : (
                            <div
                              style={{
                                width: 40,
                                height: 40,
                                borderRadius: 6,
                                background: '#f3f4f6',
                                flexShrink: 0,
                              }}
                            />
                          )}
                          <div>
                            <strong style={{ fontSize: '0.92rem' }}>{row.name}</strong>
                            {row.brand_name ? (
                              <div style={{ color: '#6b7280', fontSize: '0.8rem', marginTop: 2 }}>{row.brand_name}</div>
                            ) : null}
                            {row.category_name ? (
                              <div style={{ color: '#9ca3af', fontSize: '0.75rem', marginTop: 2 }}>
                                {row.category_name}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td style={{ ...tdStyle, fontSize: '0.85rem' }}>{formatMeta(row)}</td>
                      <td style={tdStyle}>
                        <div style={{ fontSize: '0.85rem' }}>
                          {row.is_public_visible ? (
                            <span style={{ ...badgeStyle, background: '#052e16', color: '#4ade80' }}>公开</span>
                          ) : (
                            <span style={{ ...badgeStyle, background: '#1f2937', color: '#9ca3af' }}>未公开</span>
                          )}
                        </div>
                        <div style={{ color: '#6b7280', fontSize: '0.8rem', marginTop: 4 }}>
                          {publicStatusLabel(row.public_status)}
                          {row.public_sort_order != null ? ` · #${row.public_sort_order}` : ''}
                        </div>
                      </td>
                      <td style={{ ...tdStyle, fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                        {formatCreatedAt(row.created_at)}
                      </td>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <button
                            type="button"
                            className="admin-button admin-button-primary"
                            style={{ fontSize: '0.8rem', padding: '4px 10px' }}
                            onClick={() => openDrawer(row)}>
                            处理
                          </button>
                          <button
                            type="button"
                            className="admin-button admin-button-secondary"
                            style={{ fontSize: '0.8rem', padding: '4px 10px' }}
                            disabled={creatingId === row.id}
                            onClick={() => void createFromDrink(row)}>
                            {creatingId === row.id ? '创建中…' : '一键建池并关联'}
                          </button>
                          <Link
                            href={`/admin/taplist?tenant=${row.tenant_id}`}
                            className="admin-button admin-button-secondary"
                            style={{
                              fontSize: '0.8rem',
                              padding: '4px 10px',
                              textDecoration: 'none',
                              textAlign: 'center',
                            }}>
                            打开 Tap List
                          </Link>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
        {total > drinks.length ? (
          <p style={{ margin: 0, padding: '10px 12px', color: '#6b7280', fontSize: '0.85rem' }}>
            共 {total} 条未关联，本页最多展示 {drinks.length} 条。可缩小门店或搜索范围。
          </p>
        ) : null}
      </div>

      {drawerOpen && selected ? (
        <>
          <div style={drawerBackdropStyle} onClick={closeDrawer} />
          <aside style={drawerPanelStyle} aria-label="处理未关联酒款">
            <div style={drawerHeaderStyle}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 style={{ margin: 0, fontSize: '1.15rem' }}>{selected.name}</h2>
                <p style={{ margin: '6px 0 0', color: '#6b7280', fontSize: '0.85rem' }}>
                  {tenantLabel(selected)}
                  {selected.brand_name ? ` · ${selected.brand_name}` : ''}
                </p>
              </div>
              <button type="button" style={drawerCloseStyle} onClick={closeDrawer} aria-label="关闭">
                ×
              </button>
            </div>

            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div
                style={{
                  fontSize: 13,
                  color: '#4b5563',
                  background: '#f9fafb',
                  borderRadius: 8,
                  padding: '10px 12px',
                }}>
                <div>酒厂 / 风格：{formatMeta(selected)}</div>
                {selected.country ? <div>国家：{selected.country}</div> : null}
                {selected.description ? (
                  <div style={{ marginTop: 6 }}>介绍：{selected.description}</div>
                ) : null}
                <div style={{ marginTop: 8 }}>
                  <Link href="/admin/platform/products" style={{ color: '#2563eb' }}>
                    建池后可在产品池继续完善属性 →
                  </Link>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="admin-button admin-button-secondary"
                  disabled={creatingId === selected.id}
                  onClick={() => void createFromDrink(selected)}>
                  {creatingId === selected.id ? '创建中…' : '一键建池并关联'}
                </button>
                <Link
                  href={`/admin/taplist?tenant=${selected.tenant_id}`}
                  className="admin-button admin-button-secondary"
                  style={{ textDecoration: 'none' }}>
                  打开门店 Tap List
                </Link>
              </div>

              <ProductPoolLinkSection
                drink={rowToDrink(selected)}
                isSuperAdmin
                beerProfile={rowBeerProfile(selected)}
                onLinked={() => {
                  void refreshAfterLink()
                }}
              />
            </div>
          </aside>
        </>
      ) : null}
    </div>
  )
}

function StatPill({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone?: 'warn'
}) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 12px',
        borderRadius: 999,
        border: '1px solid #e5e7eb',
        background: '#fff',
        color: tone === 'warn' ? '#c2410c' : '#374151',
        fontSize: '0.85rem',
      }}>
      <span>{label}</span>
      <strong>{value}</strong>
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
  width: 'min(560px, 100vw)',
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

const badgeStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '2px 8px',
  borderRadius: 999,
  fontSize: '0.75rem',
  fontWeight: 600,
}

const toggleLabelStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  fontSize: '0.85rem',
  color: '#374151',
  whiteSpace: 'nowrap',
}
