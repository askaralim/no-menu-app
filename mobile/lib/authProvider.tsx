import { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Session, User, type AuthChangeEvent } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { getMyTenants, setActiveTenant, type MyTenant } from './membershipApi'
import type { UserRole } from './types'

const ACTIVE_TENANT_KEY = 'nomenu.activeTenantId'
const MEMBERSHIP_REQUEST_TIMEOUT_MS = 15_000

type AuthContextType = {
  session: Session | null
  user: User | null
  tenantId: string | null
  role: UserRole | null
  orderingEnabled: boolean
  memberships: MyTenant[]
  needsTenantSelection: boolean
  isLoading: boolean
  authError: string | null
  refreshMembership: () => Promise<MyTenant[]>
  retryAuth: () => Promise<void>
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
  authError: null,
  refreshMembership: async () => [],
  retryAuth: async () => {},
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
  const [authError, setAuthError] = useState<string | null>(null)
  const initialized = useRef(false)
  const sessionRef = useRef<Session | null>(null)
  const membershipUserIdRef = useRef<string | null>(null)
  const loadedMembershipUserIdRef = useRef<string | null>(null)
  const membershipPromiseRef = useRef<Promise<MyTenant[]> | null>(null)
  const membershipAbortControllerRef = useRef<AbortController | null>(null)

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
      void setActiveTenant(chosen.tenant_id).catch((e) => {
        console.warn('set_active_tenant failed', e)
      })
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

  const fetchMembership = useCallback((userId: string) => {
    if (membershipUserIdRef.current === userId && membershipPromiseRef.current) {
      return membershipPromiseRef.current
    }

    membershipUserIdRef.current = userId
    membershipAbortControllerRef.current?.abort()
    let request: Promise<MyTenant[]>
    const controller = new AbortController()
    membershipAbortControllerRef.current = controller
    const timeout = setTimeout(() => controller.abort(), MEMBERSHIP_REQUEST_TIMEOUT_MS)
    request = getMyTenants(controller.signal)
      .then(async (rows) => {
        if (sessionRef.current?.user.id !== userId) return rows
        await applyMemberships(rows)
        loadedMembershipUserIdRef.current = userId
        return rows
      })
      .finally(() => {
        clearTimeout(timeout)
        if (membershipPromiseRef.current === request) {
          membershipPromiseRef.current = null
          membershipAbortControllerRef.current = null
        }
      })
    membershipPromiseRef.current = request
    return request
  }, [applyMemberships])

  const refreshMembership = useCallback(async () => {
    let currentSession = sessionRef.current
    if (!currentSession) {
      const { data, error } = await supabase.auth.getSession()
      if (error) throw error
      currentSession = data.session
      sessionRef.current = currentSession
    }
    if (!currentSession?.user?.id) return []
    return fetchMembership(currentSession.user.id)
  }, [fetchMembership])

  const clearAuthState = useCallback(() => {
    sessionRef.current = null
    membershipUserIdRef.current = null
    loadedMembershipUserIdRef.current = null
    membershipAbortControllerRef.current?.abort()
    membershipAbortControllerRef.current = null
    membershipPromiseRef.current = null
    setSession(null)
    setUser(null)
    setMemberships([])
    setTenantId(null)
    setRole(null)
    setOrderingEnabled(false)
    setNeedsTenantSelection(false)
    setAuthError(null)
    setIsLoading(false)
    void AsyncStorage.removeItem(ACTIVE_TENANT_KEY)
  }, [])

  const restoreAuth = useCallback(async () => {
    setIsLoading(true)
    setAuthError(null)
    try {
      const { data, error } = await supabase.auth.getSession()
      if (error) throw error
      const nextSession = data.session
      sessionRef.current = nextSession
      setSession(nextSession)
      setUser(nextSession?.user ?? null)
      if (nextSession?.user) {
        await fetchMembership(nextSession.user.id)
      } else {
        loadedMembershipUserIdRef.current = null
        setMemberships([])
        setTenantId(null)
        setRole(null)
        setOrderingEnabled(false)
        setNeedsTenantSelection(false)
      }
    } catch (error) {
      console.error('Auth init error:', error)
      setAuthError('网络连接异常，请检查网络后重试')
    } finally {
      setIsLoading(false)
    }
  }, [fetchMembership])

  const setActiveTenantId = useCallback(async (nextId: string) => {
    const row = memberships.find((m) => m.tenant_id === nextId)
    if (!row) {
      setNeedsTenantSelection(true)
      return
    }
    await setActiveTenant(nextId)
    await AsyncStorage.setItem(ACTIVE_TENANT_KEY, nextId)
    setTenantId(row.tenant_id)
    setRole(row.role)
    setOrderingEnabled(resolveOrdering(row))
    setNeedsTenantSelection(false)
  }, [memberships])

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    void restoreAuth()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, nextSession) => {
      if (event === 'INITIAL_SESSION') return
      if (event === 'SIGNED_OUT') {
        clearAuthState()
        return
      }

      sessionRef.current = nextSession
      setSession(nextSession)
      setUser(nextSession?.user ?? null)
      setAuthError(null)
      if (
        event === 'SIGNED_IN' &&
        nextSession?.user?.id &&
        loadedMembershipUserIdRef.current !== nextSession.user.id
      ) {
        setIsLoading(true)
        setTimeout(() => {
          void fetchMembership(nextSession.user.id).catch((error) => {
            console.error('fetchMembership error:', error)
            setAuthError('网络连接异常，请检查网络后重试')
          }).finally(() => {
            setIsLoading(false)
          })
        }, 0)
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [clearAuthState, fetchMembership, restoreAuth])

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
        authError,
        refreshMembership,
        retryAuth: restoreAuth,
        setActiveTenantId,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
