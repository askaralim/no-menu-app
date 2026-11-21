'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import type { UserRole } from '@/lib/types'

type ConsumerSource = 'wechat' | 'apple' | 'both' | 'unbound'

type ConsumerUserRow = {
  user_ref: string
  username: string
  has_custom_username: boolean
  source: ConsumerSource
  semantics_version?: number
  wechat_linked_at?: string | null
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
  unbound_consumers?: number
  tap_count?: number
  follow_count?: number
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
  unbound: '未绑定微信/Apple',
  wechat: '微信身份',
  apple: 'Apple身份',
  both: '微信 + Apple身份',
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
  const [activity,setActivity] = useState<{ref:string;channels?:{channel:string;first_observed_at:string;last_observed_at:string;opens:number;sessions:number}[];error?:string}|null>(null)
  async function loadActivity(ref:string) {
    setActivity({ref})
    try {
      const {data:{session}}=await supabase.auth.getSession()
      if(!session) throw new Error('需要重新登录')
      const origin=(process.env.NEXT_PUBLIC_INTELLIGENCE_ORIGIN || 'https://nomenuapp.com').replace(/\/+$/,'')
      const response=await fetch(`${origin}/api/internal/v1/intelligence-report?user_ref=${encodeURIComponent(ref)}`,{headers:{Authorization:`Bearer ${session.access_token}`},signal:AbortSignal.timeout(8000),cache:'no-store'})
      if(!response.ok) throw new Error('渠道访问摘要暂不可用；不影响账号业务明细')
      const value=await response.json()
      if(!Array.isArray(value.channels)) throw new Error('渠道访问摘要格式异常')
      setActivity(current=>current?.ref===ref ? {ref,channels:value.channels} : current)
    } catch(e) {setActivity(current=>current?.ref===ref ? {ref,error:e instanceof Error?e.message:'读取失败'} : current)}
  }
  const [detail, setDetail] = useState<{ref:string;offset:number;data?:{taps:{name:string;recorded_at:string}[];follows:{name:string;followed_at:string}[];tap_count:number;follow_count:number};error?:string} | null>(null)
  async function openDetail(ref:string, offset=0) {
    setDetail({ref,offset})
    if(offset===0) void loadActivity(ref)
    try {
      const {data,error}=await supabase.rpc('admin_get_consumer_user_detail',{p_user_ref:ref,p_offset:offset})
      if(error || !data?.ok) throw new Error('账号明细暂不可用，请确认管理员RPC已更新。')
      setDetail(current=>current?.ref===ref && current.offset===offset ? {ref,offset,data} : current)
    } catch(e) { setDetail(current=>current?.ref===ref && current.offset===offset ? {ref,offset,error:e instanceof Error?e.message:'读取失败'} : current) }
  }
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
        ['全部消费者账号', summary.consumers],
        ['未绑定身份的业务账号', summary.unbound_consumers ?? '—'],
        ['全部现存 TAP', summary.tap_count ?? '—'],
        ['全部当前关注', summary.follow_count ?? '—'],
        ['微信用户', summary.wechat_users],
        ['仅 Apple 身份', summary.apple_only_users],
        ['今日新增微信', summary.wechat_new_today],
        ['近 7 天新增微信', summary.wechat_new_7d],
        ['微信账号现存 TAP', `${summary.wechat_users_with_taps} 人 · ${summary.wechat_tap_count} 条`],
        ['微信账号当前关注', `${summary.wechat_users_with_follows} 人 · ${summary.wechat_follow_count} 条`],
        ['自定义昵称', summary.wechat_custom_usernames],
        ['微信已绑定 Apple', summary.wechat_app_linked],
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
        <h1>用户</h1><Link href="/admin/platform/intelligence">查看每日访问与渠道行为</Link>
        <p style={{ color: '#4b5563', marginTop: '0.5rem', maxWidth: 720 }}>
          账号身份不是使用渠道；更新后的接口包含有微信/Apple身份或TAP/关注业务记录、且无管理角色的账号。未绑定身份不等于已验证的Taplist访问。账号创建、微信绑定不代表首次打开；展开账号可查看近90天可靠关联的渠道访问摘要；最早观测不是首次使用，未上报和登录前匿名历史不补归因。TAP与关注为当前保留记录，删除/取消后会减少。不显示 openid、手机号、邮箱和完整用户 ID。
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

      {detail && <section className="admin-section"><h2>账号 {detail.ref} 的当前记录</h2><button onClick={()=>setDetail(null)}>关闭</button>
        {detail.error ? <p role="alert">{detail.error}</p> : !detail.data ? <p>读取中…</p> : <>
          <h3>渠道访问（近90天观测）</h3>{activity?.ref!==detail.ref || (!activity.channels && !activity.error) ? <p>读取中…</p> : activity.error ? <p>{activity.error}</p> : <><p>仅保留期内、正式环境、可靠关联账号的已收事件；无记录不等于未使用。</p><ul>{activity.channels?.map(row=><li key={row.channel}>{row.channel==='taplist'?'Taplist':row.channel==='miniprogram'?'小程序':'消费者网页'}：最早 {formatTime(row.first_observed_at)}；最近 {formatTime(row.last_observed_at)}；打开 {row.opens} 次 / {row.sessions} 会话</li>)}</ul>{!activity.channels?.length && <p>暂无可靠关联记录</p>}</>}
          <h3>TAP（{detail.data.tap_count}）</h3><ul>{detail.data.taps.map((row,i)=><li key={i}>{row.name} · {formatTime(row.recorded_at)}</li>)}</ul>
          <h3>关注门店（{detail.data.follow_count}）</h3><ul>{detail.data.follows.map((row,i)=><li key={i}>{row.name} · {formatTime(row.followed_at)}</li>)}</ul>
          <button disabled={detail.offset===0} onClick={()=>void openDetail(detail.ref,Math.max(0,detail.offset-20))}>上一页</button>
          <button disabled={detail.offset+20>=Math.max(detail.data.tap_count,detail.data.follow_count)} onClick={()=>void openDetail(detail.ref,detail.offset+20)}>下一页</button>
        </>}</section>}
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
            <option value="">全部身份</option><option value="unbound">未绑定微信/Apple</option>
            <option value="wechat">微信</option>
            <option value="apple">仅 Apple 身份</option>
            <option value="both">微信 + Apple 身份</option>
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
                <th style={thStyle}>身份绑定</th>
                <th style={thStyle}>账号创建 / 微信绑定</th>
                <th style={thStyle}>最近微信登录</th>
                <th style={thStyle}>最近记录/关注</th>
                <th style={thStyle}>酒款</th>
                <th style={thStyle}>关注</th>
                <th style={thStyle}>创建后24小时内记录/关注</th>
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
                    <td style={tdStyle}>{user.semantics_version===2 ? <>{formatTime(user.registered_at)}<div>微信绑定：{formatTime(user.wechat_linked_at ?? null)}</div></> : <>旧接口混合日期：{formatTime(user.registered_at)}</>}</td>
                    <td style={tdStyle}>{formatTime(user.last_login_at)}</td>
                    <td style={tdStyle}>{formatTime(user.last_core_at)}</td>
                    <td style={tdStyle}>{user.tap_count}</td>
                    <td style={tdStyle}>{user.follow_count}</td>
                    <td style={tdStyle}>{user.semantics_version===2 ? (user.activated_within_24h ? '是（现存记录）' : '未发现现存证据') : '旧口径待更新'}</td>
                    <td style={tdStyle}>
                      <code style={{ fontSize: 12 }}>{user.user_ref}</code><br/><button onClick={()=>void openDetail(user.user_ref)}>查看TAP与关注</button>
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
