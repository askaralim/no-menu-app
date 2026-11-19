'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabaseClient'
import type { Session } from '@supabase/supabase-js'

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [hasBarRole, setHasBarRole] = useState(false)
  const [roleUnreachable, setRoleUnreachable] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [signingIn, setSigningIn] = useState(false)
  const mounted = useRef(true)
  const checkSeq = useRef(0)
  const confirmedRole = useRef(false)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const lookupBarRole = async (userId: string, seq: number) => {
    let emptyCount = 0
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (attempt > 0) await new Promise((resolve) => window.setTimeout(resolve, 700 * attempt))
      if (!mounted.current || seq !== checkSeq.current) return 'stale' as const
      const { data, error: roleError } = await supabase
        .from('user_roles')
        .select('id')
        .eq('user_id', userId)
        .limit(1)
      if (!mounted.current || seq !== checkSeq.current) return 'stale' as const
      if (!roleError && (data?.length ?? 0) > 0) return 'ready' as const
      if (!roleError) {
        emptyCount += 1
        if (emptyCount >= 2) return 'unbound' as const
      }
    }
    return 'offline' as const
  }

  const applySession = async (next: Session | null) => {
    if (!mounted.current) return

    if (!next) {
      checkSeq.current += 1
      confirmedRole.current = false
      setSession(null)
      setHasBarRole(false)
      setRoleUnreachable(false)
      setLoading(false)
      return
    }

    const seq = ++checkSeq.current
    setSession(next)
    if (!confirmedRole.current) setLoading(true)
    const result = await lookupBarRole(next.user.id, seq)
    if (!mounted.current || seq !== checkSeq.current || result === 'stale') return

    if (result === 'ready') {
      confirmedRole.current = true
      setHasBarRole(true)
      setRoleUnreachable(false)
      setLoading(false)
      return
    }

    if (confirmedRole.current) {
      setLoading(false)
      return
    }

    setHasBarRole(false)
    setRoleUnreachable(result === 'offline')
    setLoading(false)
  }

  useEffect(() => {
    let active = true

    void supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (!active) return
      window.setTimeout(() => {
        if (active) void applySession(s)
      }, 0)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, nextSession) => {
        if (!active) return
        if (event === 'INITIAL_SESSION') return
        // A large admin query often refreshes the access token. Unmounting the
        // page, or treating a failed re-check as "no bar", drops a valid session.
        if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
          if (nextSession) setSession(nextSession)
          return
        }
        void applySession(nextSession)
      }
    )

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSigningIn(true)

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError(error.message)
    }
    setSigningIn(false)
  }

  if (loading) {
    return (
      <div className="auth-loading">
        <div className="auth-spinner" />
      </div>
    )
  }

  if (!session) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <h1 className="auth-title">管理后台</h1>
          <p className="auth-subtitle">请登录以继续</p>
          <form onSubmit={handleLogin} className="auth-form">
            <div className="auth-field">
              <label htmlFor="email">邮箱</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
              />
            </div>
            <div className="auth-field">
              <label htmlFor="password">密码</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
            {error && <div className="auth-error">{error}</div>}
            <button
              type="submit"
              className="auth-button"
              disabled={signingIn}
            >
              {signingIn ? '登录中...' : '登录'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  if (!hasBarRole) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <h1 className="auth-title">管理后台</h1>
          {roleUnreachable ? (
            <>
              <p className="auth-subtitle">
                网络不稳定，暂时无法确认账号权限。请检查网络或 VPN 后重试。
              </p>
              <button
                type="button"
                className="auth-button"
                onClick={() => {
                  if (session) void applySession(session)
                }}
              >
                重试
              </button>
            </>
          ) : (
            <p className="auth-subtitle">
              您的账号尚未绑定酒吧。请使用 No Menu App 完成注册并创建酒吧，或联系管理员将您添加为员工。
            </p>
          )}
        </div>
      </div>
    )
  }

  return <>{children}</>
}
