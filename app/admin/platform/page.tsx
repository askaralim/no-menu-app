'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { generateTempOwnerPassword } from '@/lib/ownerAuth'
import type { TenantInfo, UserRole } from '@/lib/types'

const PLATFORM_SLUG = '__platform__'

function isRealBar(t: TenantInfo) {
  return t.slug != null && t.slug !== PLATFORM_SLUG
}

type BoundOwnerCreds = {
  tenantName: string
  mobile: string
  loginEmail: string
  temporaryPassword: string
  created: boolean
}

export default function PlatformAdminPage() {
  const [tenants, setTenants] = useState<TenantInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [role, setRole] = useState<UserRole | null>(null)
  const [updating, setUpdating] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [createForm, setCreateForm] = useState({
    name: '',
    slug: '',
    ownerMobile: '',
    ownerPassword: '',
  })
  const [lastBound, setLastBound] = useState<BoundOwnerCreds | null>(null)
  const [bindingId, setBindingId] = useState<string | null>(null)

  useEffect(() => {
    const checkRoleAndFetch = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
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
        await fetchTenants()
      } catch (e) {
        setError('加载失败')
      } finally {
        setLoading(false)
      }
    }

    checkRoleAndFetch()
  }, [])

  const fetchTenants = async () => {
    try {
      const { data, error: rpcError } = await supabase.rpc('admin_list_tenants')
      if (rpcError) throw rpcError
      setError('')
      setTenants(((data || []) as TenantInfo[]).filter(isRealBar))
    } catch (e: any) {
      setError(e?.message || '加载租户列表失败')
    }
  }

  const bindOwner = async (
    tenantId: string,
    tenantName: string,
    ownerMobile: string,
    ownerPassword?: string,
  ) => {
    const mobile = ownerMobile.trim()
    if (!mobile) {
      alert('请填写店主手机号')
      return
    }

    const password = (ownerPassword || '').trim() || generateTempOwnerPassword(mobile)
    setBindingId(tenantId)
    try {
      const { data, error: rpcError } = await supabase.rpc('admin_provision_owner', {
        p_tenant_id: tenantId,
        p_mobile: mobile,
        p_password: password,
      })
      if (rpcError) throw rpcError

      const json = data as {
        ok?: boolean
        created?: boolean
        mobile?: string
        login_email?: string
        temporary_password?: string
      }

      setLastBound({
        tenantName,
        mobile: json.mobile || mobile,
        loginEmail: json.login_email || '',
        temporaryPassword: json.temporary_password || password,
        created: !!json.created,
      })
      await fetchTenants()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : '绑定店主失败')
    } finally {
      setBindingId(null)
    }
  }

  const handleCreateBar = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = createForm.name.trim()
    const slug = createForm.slug.trim().toLowerCase()
    const ownerMobile = createForm.ownerMobile.trim()
    const ownerPassword = createForm.ownerPassword.trim()
    if (!name || !slug) {
      alert('请填写酒吧名称和 slug')
      return
    }
    setCreating(true)
    try {
      const { data, error: rpcError } = await supabase.rpc('admin_create_bar', {
        p_name: name,
        p_slug: slug,
      })
      if (rpcError) throw rpcError
      const id = data as string
      setCreateForm({ name: '', slug: '', ownerMobile: '', ownerPassword: '' })
      await fetchTenants()
      if (id && ownerMobile) {
        await bindOwner(id, name, ownerMobile, ownerPassword)
      } else if (id && confirm('酒吧已创建。是否现在编辑 Tap List？')) {
        window.location.href = `/admin/taplist?tenant=${id}`
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : '创建失败')
    } finally {
      setCreating(false)
    }
  }

  const handleToggleStatus = async (tenant: TenantInfo) => {
    const newStatus = tenant.status === 'active' ? 'suspended' : 'active'
    const action = newStatus === 'suspended' ? '暂停' : '恢复'

    if (!confirm(`确定要${action} "${tenant.name}" 吗？`)) return

    setUpdating(tenant.id)
    try {
      const { error: rpcError } = await supabase.rpc('admin_set_tenant_status', {
        target_tenant_id: tenant.id,
        new_status: newStatus,
      })
      if (rpcError) throw rpcError
      await fetchTenants()
    } catch (e: any) {
      alert(e?.message || '操作失败')
    } finally {
      setUpdating(null)
    }
  }

  const handleToggleOrdering = async (tenant: TenantInfo) => {
    const next = !tenant.ordering_enabled
    const action = next ? '开启点单/订单' : '关闭点单/订单'
    if (!confirm(`确定要为「${tenant.name}」${action}吗？`)) return

    setUpdating(tenant.id)
    try {
      const { error: rpcError } = await supabase.rpc('admin_set_tenant_ordering_enabled', {
        p_tenant_id: tenant.id,
        p_enabled: next,
      })
      if (rpcError) throw rpcError
      await fetchTenants()
    } catch (e: any) {
      alert(e?.message || '操作失败')
    } finally {
      setUpdating(null)
    }
  }

  if (loading) {
    return (
      <div className="admin-container">
        <div className="admin-header">
          <h1>平台管理</h1>
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
          <h1>平台管理</h1>
        </div>
        <div style={{
          textAlign: 'center',
          padding: '4rem',
          color: '#ef4444',
          fontSize: '1.1rem',
        }}>
          {error}
          {role === 'super_admin' && (
            <p style={{ color: '#888', marginTop: '1rem', fontSize: '0.95rem', maxWidth: '36rem', marginLeft: 'auto', marginRight: 'auto' }}>
              若提示 permission denied 或 function 不存在，请在 Supabase SQL Editor 执行{' '}
              <code style={{ color: '#ccc' }}>supabase/migrations/20260720130000_admin_provision_owner.sql</code>
              （以及 <code style={{ color: '#ccc' }}>20260720120000_admin_bind_owner.sql</code>）
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="admin-container">
      <div className="admin-header">
        <h1>平台管理</h1>
        <p style={{ color: '#4b5563', marginTop: '0.5rem' }}>
          管理所有注册酒吧 · 共 {tenants.length} 家
        </p>
        <p style={{ marginTop: '0.75rem', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Link
            href="/admin/platform/cities"
            className="admin-button admin-button-secondary"
            style={{ textDecoration: 'none', display: 'inline-block', fontSize: '0.9rem' }}>
            城市管理 →
          </Link>
          <Link
            href="/admin/platform/companies"
            className="admin-button admin-button-secondary"
            style={{ textDecoration: 'none', display: 'inline-block', fontSize: '0.9rem' }}>
            品牌/酒厂管理 →
          </Link>
          <Link
            href="/admin/platform/products"
            className="admin-button admin-button-secondary"
            style={{ textDecoration: 'none', display: 'inline-block', fontSize: '0.9rem' }}>
            产品池管理 →
          </Link>
        </p>
      </div>

      <div className="admin-section" style={{ marginBottom: '2rem' }}>
        <h2 style={{ marginBottom: '1rem' }}>创建酒吧并绑定店主</h2>
        <p style={{ color: '#6b7280', marginBottom: '1rem', fontSize: '0.95rem' }}>
          填写店主手机号后会创建 No Menu Tonight 账号（手机号 + 临时密码），并直接绑定为该店 owner。
          把账号发给微信即可，无需邀请码 / 短信验证码。密码留空则自动生成。
        </p>
        <form onSubmit={handleCreateBar} className="admin-form" style={{ maxWidth: 480 }}>
          <input
            className="admin-input"
            placeholder="酒吧名称"
            value={createForm.name}
            onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
          />
          <input
            className="admin-input"
            placeholder="slug（小写，如 midnightswim）"
            value={createForm.slug}
            onChange={(e) => setCreateForm({ ...createForm, slug: e.target.value })}
            autoCapitalize="none"
          />
          <input
            className="admin-input"
            placeholder="店主手机号（可选，创建并绑定）"
            value={createForm.ownerMobile}
            onChange={(e) => setCreateForm({ ...createForm, ownerMobile: e.target.value })}
            autoCapitalize="none"
          />
          <input
            className="admin-input"
            placeholder="临时密码（可选，留空自动生成）"
            value={createForm.ownerPassword}
            onChange={(e) => setCreateForm({ ...createForm, ownerPassword: e.target.value })}
            autoCapitalize="none"
          />
          <button type="submit" className="admin-button admin-button-primary" disabled={creating}>
            {creating ? '创建中…' : '创建酒吧'}
          </button>
        </form>

        {lastBound ? (
          <div
            style={{
              marginTop: '1.25rem',
              padding: '1rem',
              borderRadius: 8,
              border: '1px solid #ca8a04',
              background: '#1c1917',
              maxWidth: 520,
            }}
          >
            <strong style={{ color: '#fbbf24' }}>
              店主账号已{lastBound.created ? '创建并' : ''}绑定（请复制发给微信）
            </strong>
            <p style={{ margin: '0.5rem 0 0', color: '#e5e7eb', fontSize: '0.95rem' }}>
              门店：{lastBound.tenantName}
              <br />
              手机号：{lastBound.mobile}
              <br />
              临时密码：
              <code style={{ fontSize: '1.15rem', letterSpacing: 1 }}>{lastBound.temporaryPassword}</code>
              <br />
              <span style={{ color: '#9ca3af', fontSize: '0.85rem' }}>
                No Menu Tonight 使用手机号 + 密码登录；首次登录会要求改密码。
              </span>
            </p>
            <button
              type="button"
              className="admin-button admin-button-secondary"
              style={{ marginTop: 12 }}
              onClick={() => {
                const text = `【No Menu Tonight】${lastBound.tenantName}\n手机号：${lastBound.mobile}\n临时密码：${lastBound.temporaryPassword}\n请打开 No Menu Tonight 登录后修改密码。`
                void navigator.clipboard.writeText(text)
                alert('已复制微信文案')
              }}
            >
              复制微信文案
            </button>
          </div>
        ) : null}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem', marginBottom: '2rem' }}>
        <div className="admin-section">
          <h3>总酒吧数</h3>
          <p style={{ fontSize: '2rem', fontWeight: 600 }}>{tenants.length}</p>
        </div>
        <div className="admin-section">
          <h3>活跃酒吧</h3>
          <p style={{ fontSize: '2rem', fontWeight: 600, color: '#22c55e' }}>
            {tenants.filter(t => t.status === 'active').length}
          </p>
        </div>
        <div className="admin-section">
          <h3>总用户数</h3>
          <p style={{ fontSize: '2rem', fontWeight: 600 }}>
            {tenants.reduce((sum, t) => sum + t.staff_count, 0)}
          </p>
        </div>
      </div>

      <div className="admin-section">
        <h2 style={{ marginBottom: '1rem' }}>酒吧列表</h2>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #333' }}>
                <th style={thStyle}>名称</th>
                <th style={thStyle}>Slug</th>
                <th style={thStyle}>店主</th>
                <th style={thStyle}>成员</th>
                <th style={thStyle}>状态</th>
                <th style={thStyle}>点单</th>
                <th style={thStyle}>注册时间</th>
                <th style={thStyle}>操作</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((tenant) => (
                <tr key={tenant.id} style={{ borderBottom: '1px solid #222' }}>
                  <td style={tdStyle}>
                    <strong>{tenant.name}</strong>
                  </td>
                  <td style={tdStyle}>
                    <code style={{
                      background: '#1e293b',
                      color: '#f1f5f9',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '0.85rem',
                    }}>
                      {tenant.slug}
                    </code>
                  </td>
                  <td style={tdStyle}>{tenant.owner_email || '-'}</td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>{tenant.staff_count}</td>
                  <td style={tdStyle}>
                    <span style={{
                      padding: '3px 10px',
                      borderRadius: '12px',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      background: tenant.status === 'active' ? '#052e16' : '#450a0a',
                      color: tenant.status === 'active' ? '#4ade80' : '#fca5a5',
                    }}>
                      {tenant.status === 'active' ? '活跃' : '已暂停'}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <button
                      type="button"
                      onClick={() => void handleToggleOrdering(tenant)}
                      disabled={updating === tenant.id}
                      style={{
                        padding: '3px 10px',
                        borderRadius: '12px',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        border: '1px solid',
                        cursor: updating === tenant.id ? 'wait' : 'pointer',
                        background: tenant.ordering_enabled ? '#052e16' : '#1e293b',
                        borderColor: tenant.ordering_enabled ? '#166534' : '#334155',
                        color: tenant.ordering_enabled ? '#4ade80' : '#94a3b8',
                      }}
                      title="平台开关：控制运营端是否显示点单/订单"
                    >
                      {tenant.ordering_enabled ? '已开启' : '未开启'}
                    </button>
                  </td>
                  <td style={tdStyle}>
                    {new Date(tenant.created_at).toLocaleDateString('zh-CN')}
                  </td>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      <Link
                        href={`/admin/taplist?tenant=${tenant.id}`}
                        className="admin-button admin-button-secondary"
                        style={{ fontSize: '0.85rem', textDecoration: 'none', display: 'inline-block' }}
                      >
                        编辑 Tap List
                      </Link>
                      <button
                        type="button"
                        onClick={() => {
                          const mobile = window.prompt('店主手机号', '')
                          if (!mobile) return
                          const pwd = window.prompt('临时密码（留空自动生成）', '') ?? ''
                          void bindOwner(tenant.id, tenant.name, mobile, pwd)
                        }}
                        disabled={bindingId === tenant.id}
                        className="admin-button admin-button-secondary"
                        style={{ fontSize: '0.85rem' }}
                      >
                        {bindingId === tenant.id ? '绑定中…' : '绑定店主'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(tenant)}
                        disabled={updating === tenant.id}
                        style={{
                          padding: '6px 14px',
                          borderRadius: '6px',
                          border: '1px solid',
                          borderColor: tenant.status === 'active' ? '#ef4444' : '#22c55e',
                          background: 'transparent',
                          color: tenant.status === 'active' ? '#ef4444' : '#22c55e',
                          cursor: updating === tenant.id ? 'wait' : 'pointer',
                          opacity: updating === tenant.id ? 0.5 : 1,
                          fontSize: '0.85rem',
                        }}
                      >
                        {tenant.status === 'active' ? '暂停' : '恢复'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
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
