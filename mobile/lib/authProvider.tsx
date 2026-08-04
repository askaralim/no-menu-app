import { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Session, User } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { ensureUserProfile, getMyTenants, type MyTenant } from './membershipApi'
import type { UserRole } from './types'

const ACTIVE_TENANT_KEY = 'nomenu.activeTenantId'

type AuthContextType = {
  session: Session | null
  user: User | null
  tenantId: string | null
  role: UserRole | null
  orderingEnabled: boolean
  memberships: MyTenant[]
  needsTenantSelection: boolean
  isLoading: boolean
  refreshMembership: () => Promise<void>
  setActiveTenantId: (tenantId: string) => Promise<void>
}

// Ordering is opt-in. Missing flags fail closed so stale membership payloads
// never expose ordering surfaces for ordinary menu-management tenants.
function resolveOrdering(row: MyTenant | null | undefined): boolean {
  if (row && 'ordering_enabled' in row && row.ordering_enabled !== undefined) {
    return row.ordering_enabled === true
  }
  return false
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  tenantId: null,
  role: null,
  orderingEnabled: false,
  memberships: [],
  needsTenantSelection: false,
  isLoading: true,
  refreshMembership: async () => {},
  setActiveTenantId: async () => {},
})

function pickInitialTenant(
  memberships: MyTenant[],
  preferredId: string | null,
): MyTenant | null {
  if (!memberships.length) return null
  if (preferredId) {
    const preferred = memberships.find((m) => m.tenant_id === preferredId)
    if (preferred) return preferred
  }
  if (memberships.length === 1) return memberships[0]
  return null
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [role, setRole] = useState<UserRole | null>(null)
  const [orderingEnabled, setOrderingEnabled] = useState(false)
  const [memberships, setMemberships] = useState<MyTenant[]>([])
  const [needsTenantSelection, setNeedsTenantSelection] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const initialized = useRef(false)

  const applyMemberships = useCallback(async (rows: MyTenant[]) => {
    setMemberships(rows)
    const stored = await AsyncStorage.getItem(ACTIVE_TENANT_KEY)
    const chosen = pickInitialTenant(rows, stored)
    if (chosen) {
      setTenantId(chosen.tenant_id)
      setRole(chosen.role)
      setOrderingEnabled(resolveOrdering(chosen))
      setNeedsTenantSelection(false)
      if (stored !== chosen.tenant_id) {
        await AsyncStorage.setItem(ACTIVE_TENANT_KEY, chosen.tenant_id)
      }
    } else if (rows.length > 1) {
      setTenantId(null)
      setRole(null)
      setOrderingEnabled(false)
      setNeedsTenantSelection(true)
    } else {
      setTenantId(null)
      setRole(null)
      setOrderingEnabled(false)
      setNeedsTenantSelection(false)
      await AsyncStorage.removeItem(ACTIVE_TENANT_KEY)
    }
  }, [])

  const fetchMembership = useCallback(async (_userId: string) => {
    try {
      await ensureUserProfile()
      const rows = await getMyTenants()
      await applyMemberships(rows)
    } catch (e) {
      console.error('fetchMembership error:', e)
      setMemberships([])
      setTenantId(null)
      setRole(null)
      setOrderingEnabled(false)
      setNeedsTenantSelection(false)
    } finally {
      setIsLoading(false)
    }
  }, [applyMemberships])

  const refreshMembership = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    const uid = data.session?.user?.id
    if (uid) {
      setIsLoading(true)
      await fetchMembership(uid)
    }
  }, [fetchMembership])

  const setActiveTenantId = useCallback(async (nextId: string) => {
    const row = memberships.find((m) => m.tenant_id === nextId)
    if (!row) {
      setNeedsTenantSelection(true)
      return
    }
    await AsyncStorage.setItem(ACTIVE_TENANT_KEY, nextId)
    setTenantId(row.tenant_id)
    setRole(row.role)
    setOrderingEnabled(resolveOrdering(row))
    setNeedsTenantSelection(false)
  }, [memberships])

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
          await fetchMembership(s.user.id)
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

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setUser(nextSession?.user ?? null)
      const uid = nextSession?.user?.id
      setTimeout(() => {
        if (uid) {
          void fetchMembership(uid)
        } else {
          setMemberships([])
          setTenantId(null)
          setRole(null)
          setOrderingEnabled(false)
          setNeedsTenantSelection(false)
          setIsLoading(false)
          void AsyncStorage.removeItem(ACTIVE_TENANT_KEY)
        }
      }, 0)
    })

    return () => {
      clearTimeout(timeout)
      subscription.unsubscribe()
    }
  }, [fetchMembership])

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        tenantId,
        role,
        orderingEnabled,
        memberships,
        needsTenantSelection,
        isLoading,
        refreshMembership,
        setActiveTenantId,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
