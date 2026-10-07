'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import type { UserRole } from '@/lib/types'

type ConsumerSource = 'wechat' | 'apple' | 'both'

type ConsumerUserRow = {
  user_ref: string
  username: string
  has_custom_username: boolean
  source: ConsumerSource
  registered_at: string
  last_login_at: string | null
  last_core_at: string | null
  tap_count: number
  follow_count: number
  activated_within_24h: boolean
  app_linked: boolean
  is_internal: boolean
}

type ConsumerSummary = {
  consumers: number
  wechat_users: number
  apple_only_users: number
  wechat_new_today: number
  wechat_new_7d: number
  wechat_users_with_taps: number
  wechat_tap_count: number
  wechat_users_with_follows: number
  wechat_follow_count: number
  wechat_custom_usernames: number
  wechat_app_linked: number
}

const SOURCE_LABEL: Record<ConsumerSource, string> = {
  wechat: '微信',
  apple: 'App',
  both: '微信 + App',
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '10px 12px',
  fontSize: 13,
  color: '#6b7280',
  whiteSpace: 'nowrap',
}

const tdStyle: React.CSSProperties = {
  padding: '10px 12px',
  fontSize: 14,
  verticalAlign: 'top',
}

function formatTime(value: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
}

export default function PlatformUsersPage() {
  const [summary, setSummary] = useState<ConsumerSummary | null>(null)
  const [users, setUsers] = useState<ConsumerUserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [role, setRole] = useState<UserRole | null>(null)
  const [query, setQuery] = useState('')
  const [source, setSource] = useState<ConsumerSource | ''>('')

  const loadUsers = useCallback(async () => {
    const { data, error: rpcError } = await supabase.rpc('admin_list_consumer_users')
    if (rpcError) throw rpcError
    const payload = data as { ok?: boolean; summary?: ConsumerSummary; users?: ConsumerUserRow[] }
    if (!payload || payload.ok !== true || !payload.summary || !Array.isArray(payload.users)) {
      throw new Error('用户列表返回格式异常')
    }
    setSummary(payload.summary)
    setUsers(payload.users)
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
        await loadUsers()
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : '加载失败')
      } finally {
        setLoading(false)
      }
    }

    void init()
  }, [loadUsers])

  const visibleUsers = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return users.filter((user) => {
      if (source && user.source !== source) return false
      if (!needle) return true
      return (
        user.username.toLowerCase().includes(needle) ||
        user.user_ref.toLowerCase().includes(needle)
      )
    })
  }, [query, source, users])

  if (loading) {
    return (
      <div className="admin-container">
        <div className="admin-header">
          <h1>用户</h1>
        </div>
        <div style={{ textAlign: 'center', padding: '4rem' }}>
          <div className="auth-spinner" />
        </div>
      </div>
    )
  }

  if (error || role !== 'super_admin') {
    return (
      <div className="admin-container">
        <div className="admin-header">
          <h1>用户</h1>
        </div>
        <div style={{ textAlign: 'center', padding: '4rem', color: '#ef4444' }}>
          {error || '权限不足'}
        </div>
      </div>
    )
  }

  const cards = summary
    ? [
        ['微信用户', summary.wechat_users],
        ['仅 App', summary.apple_only_users],
        ['今日新增微信', summary.wechat_new_today],
        ['近 7 天新增微信', summary.wechat_new_7d],
        ['记录过酒款', `${summary.wechat_users_with_taps} 人 · ${summary.wechat_tap_count} 条`],
        ['关注过酒吧', `${summary.wechat_users_with_follows} 人 · ${summary.wechat_follow_count} 条`],
        ['自定义昵称', summary.wechat_custom_usernames],
        ['微信已关联 App', summary.wechat_app_linked],
      ]
    : []

  return (
    <div className="admin-container">
      <div className="admin-header">
        <p style={{ marginBottom: '0.5rem' }}>
          <Link href="/admin/platform" style={{ color: '#6b7280', textDecoration: 'none' }}>
            ← 平台管理
          </Link>
        </p>
        <h1>用户</h1>
        <p style={{ color: '#4b5563', marginTop: '0.5rem', maxWidth: 720 }}>
          只读现有注册用户，不含门店账号。酒款记录是每人每款酒一行。不显示 openid、手机号、邮箱和完整用户 ID。
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 12,
          marginBottom: '1.5rem',
        }}
      >
        {cards.map(([label, value]) => (
          <div
            key={String(label)}
            style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: '14px 16px', background: '#fff' }}
          >
            <div style={{ color: '#6b7280', fontSize: 13 }}>{label}</div>
            <div style={{ fontSize: 22, fontWeight: 600, marginTop: 6 }}>{value}</div>
          </div>
        ))}
      </div>

      <div className="admin-section">
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <input
            className="admin-input"
            placeholder="搜索昵称或标识"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ maxWidth: 280 }}
          />
          <select
            className="admin-input"
            value={source}
            onChange={(e) => setSource(e.target.value as ConsumerSource | '')}
            style={{ maxWidth: 180 }}
          >
            <option value="">全部来源</option>
            <option value="wechat">微信</option>
            <option value="apple">仅 App</option>
            <option value="both">微信 + App</option>
          </select>
          <span style={{ alignSelf: 'center', color: '#6b7280' }}>
            {visibleUsers.length} / {users.length}
          </span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #333' }}>
                <th style={thStyle}>昵称</th>
                <th style={thStyle}>来源</th>
                <th style={thStyle}>注册</th>
                <th style={thStyle}>最近微信登录</th>
                <th style={thStyle}>最近记录/关注</th>
                <th style={thStyle}>酒款</th>
                <th style={thStyle}>关注</th>
                <th style={thStyle}>24 小时内激活</th>
                <th style={thStyle}>标识</th>
              </tr>
            </thead>
            <tbody>
              {visibleUsers.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ ...tdStyle, color: '#6b7280', textAlign: 'center' }}>
                    没有匹配的用户
                  </td>
                </tr>
              ) : (
                visibleUsers.map((user) => (
                  <tr key={user.user_ref} style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <td style={tdStyle}>
                      <strong>{user.username}</strong>
                      {user.is_internal ? (
                        <span style={{ marginLeft: 8, color: '#b45309', fontSize: 12 }}>内部</span>
                      ) : null}
                      {!user.has_custom_username ? (
                        <div style={{ color: '#9ca3af', fontSize: 12 }}>默认昵称</div>
                      ) : null}
                    </td>
                    <td style={tdStyle}>{SOURCE_LABEL[user.source]}</td>
                    <td style={tdStyle}>{formatTime(user.registered_at)}</td>
                    <td style={tdStyle}>{formatTime(user.last_login_at)}</td>
                    <td style={tdStyle}>{formatTime(user.last_core_at)}</td>
                    <td style={tdStyle}>{user.tap_count}</td>
                    <td style={tdStyle}>{user.follow_count}</td>
                    <td style={tdStyle}>{user.activated_within_24h ? '是' : '否'}</td>
                    <td style={tdStyle}>
                      <code style={{ fontSize: 12 }}>{user.user_ref}</code>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
