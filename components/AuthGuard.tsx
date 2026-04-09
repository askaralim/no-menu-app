'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabaseClient'
import type { Session } from '@supabase/supabase-js'

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [hasBarRole, setHasBarRole] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [signingIn, setSigningIn] = useState(false)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const applySession = async (next: Session | null) => {
    if (!mounted.current) return

    if (!next) {
      setSession(null)
      setHasBarRole(false)
      setLoading(false)
      return
    }

    setSession(next)
    const { data, error: roleError } = await supabase
      .from('user_roles')
      .select('id')
      .eq('user_id', next.user.id)
      .limit(1)

    if (!mounted.current) return

    if (roleError) {
      setHasBarRole(false)
      setLoading(false)
      return
    }

    setHasBarRole((data?.length ?? 0) > 0)
    setLoading(false)
  }

  useEffect(() => {
    setLoading(true)
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      applySession(s)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setLoading(true)
        applySession(nextSession)
      }
    )

    return () => subscription.unsubscribe()
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
          <p className="auth-subtitle">
            您的账号尚未绑定酒吧。请使用 No Menu App 完成注册并创建酒吧，或联系管理员将您添加为员工。
          </p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
