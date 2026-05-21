import { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react'
import { Session, User } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { UserRole } from './types'

type AuthContextType = {
  session: Session | null
  user: User | null
  tenantId: string | null
  role: UserRole | null
  isLoading: boolean
  /** Re-query `user_roles` after e.g. `register_bar` (session alone does not change). */
  refreshMembership: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  tenantId: null,
  role: null,
  isLoading: true,
  refreshMembership: async () => {},
})

type RoleRow = { tenant_id: string; role: string; created_at: string }

function deriveTenantAndRole(rows: RoleRow[] | null): { tenantId: string | null; role: UserRole | null } {
  if (!rows?.length) return { tenantId: null, role: null }

  if (rows.some((r) => r.role === 'super_admin')) {
    const row = rows.find((r) => r.role === 'super_admin')!
    return { tenantId: row.tenant_id, role: 'super_admin' }
  }

  const owners = rows.filter((r) => r.role === 'owner')
  if (owners.length) {
    return { tenantId: owners[0].tenant_id, role: 'owner' }
  }

  const staff = rows
    .filter((r) => r.role === 'staff')
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  if (staff.length) {
    return { tenantId: staff[0].tenant_id, role: 'staff' }
  }

  return { tenantId: null, role: null }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [role, setRole] = useState<UserRole | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const initialized = useRef(false)

  const fetchUserRole = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('tenant_id, role, created_at')
        .eq('user_id', userId)

      if (!error && data?.length) {
        const { tenantId: tid, role: r } = deriveTenantAndRole(data as RoleRow[])
        setTenantId(tid)
        setRole(r)
      } else {
        setTenantId(null)
        setRole(null)
      }
    } catch (e) {
      console.error('fetchUserRole error:', e)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const refreshMembership = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    const uid = data.session?.user?.id
    if (uid) {
      setIsLoading(true)
      await fetchUserRole(uid)
    }
  }, [fetchUserRole])

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
  }, [fetchUserRole])

  return (
    <AuthContext.Provider value={{ session, user, tenantId, role, isLoading, refreshMembership }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
