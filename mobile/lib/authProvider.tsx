import { createContext, useContext, useEffect, useState, useRef } from 'react'
import { Session, User } from '@supabase/supabase-js'
import { supabase } from './supabase'

type AuthContextType = {
  session: Session | null
  user: User | null
  tenantId: string | null
  isLoading: boolean
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  tenantId: null,
  isLoading: true,
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [tenantId, setTenantId] = useState<string | null>(null)
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
          await fetchTenantId(s.user.id)
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
        fetchTenantId(session.user.id)
      } else {
        setTenantId(null)
        setIsLoading(false)
      }
    })

    return () => {
      clearTimeout(timeout)
      subscription.unsubscribe()
    }
  }, [])

  const fetchTenantId = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('tenant_id')
        .eq('user_id', userId)
        .single()

      if (!error && data) {
        setTenantId(data.tenant_id)
      }
    } catch (e) {
      console.error('fetchTenantId error:', e)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <AuthContext.Provider value={{ session, user, tenantId, isLoading }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
