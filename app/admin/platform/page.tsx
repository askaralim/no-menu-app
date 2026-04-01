'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import type { TenantInfo, UserRole } from '@/lib/types'

export default function PlatformAdminPage() {
  const [tenants, setTenants] = useState<TenantInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [role, setRole] = useState<UserRole | null>(null)
  const [updating, setUpdating] = useState<string | null>(null)

  useEffect(() => {
    const checkRoleAndFetch = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) {
          setError('请先登录')
          setLoading(false)
          return
        }

        const { data: roleData } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', session.user.id)
          .single()

        if (!roleData || roleData.role !== 'super_admin') {
          setRole(roleData?.role as UserRole || null)
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
      setTenants((data || []) as TenantInfo[])
    } catch (e: any) {
      setError(e?.message || '加载租户列表失败')
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

  if (error && role !== 'super_admin') {
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
        </div>
      </div>
    )
  }

  return (
    <div className="admin-container">
      <div className="admin-header">
        <h1>平台管理</h1>
        <p style={{ color: '#888', marginTop: '0.5rem' }}>
          管理所有注册酒吧 · 共 {tenants.length} 家
        </p>
      </div>

      {/* Stats overview */}
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

      {/* Tenant list */}
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
                      background: '#1a1a2e',
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
                    {new Date(tenant.created_at).toLocaleDateString('zh-CN')}
                  </td>
                  <td style={tdStyle}>
                    <button
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
  color: '#888',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
}

const tdStyle: React.CSSProperties = {
  padding: '14px 16px',
  fontSize: '0.95rem',
}
