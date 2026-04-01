import { createContext, useContext, useEffect, useState, useRef } from 'react'
import { Session, User } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { UserRole } from './types'

type AuthContextType = {
  session: Session | null
  user: User | null
  tenantId: string | null
  role: UserRole | null
  isLoading: boolean
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  tenantId: null,
  role: null,
  isLoading: true,
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [role, setRole] = useState<UserRole | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const initialized = useRef(false)

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    const timeout = setTimeout(() => {
      console.warn('Auth init timed out after 10s, proceeding without session')
      setIsLoading(false)
    }, 10000)

    const init = async () => {
      try {
        const { data, error } = await supabase.auth.getSession()
        if (error) {
          console.error('getSession error:', error)
          setIsLoading(false)
          return
        }
        const s = data.session
        setSession(s)
        setUser(s?.user ?? null)
        if (s?.user) {
          await fetchUserRole(s.user.id)
        } else {
          setIsLoading(false)
        }
      } catch (err) {
        console.error('Auth init error:', err)
        setIsLoading(false)
      } finally {
        clearTimeout(timeout)
      }
    }

    init()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchUserRole(session.user.id)
      } else {
        setTenantId(null)
        setRole(null)
        setIsLoading(false)
      }
    })

    return () => {
      clearTimeout(timeout)
      subscription.unsubscribe()
    }
  }, [])

  const fetchUserRole = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('tenant_id, role')
        .eq('user_id', userId)
        .single()

      if (!error && data) {
        setTenantId(data.tenant_id)
        setRole(data.role as UserRole)
      } else {
        setTenantId(null)
        setRole(null)
      }
    } catch (e) {
      console.error('fetchUserRole error:', e)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <AuthContext.Provider value={{ session, user, tenantId, role, isLoading }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
