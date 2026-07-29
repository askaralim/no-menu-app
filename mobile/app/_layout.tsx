import { Slot, useRouter, useSegments } from 'expo-router'
import { useEffect } from 'react'
import { StatusBar } from 'expo-status-bar'
import { AuthProvider, useAuth } from '../lib/authProvider'
import { View, ActivityIndicator } from 'react-native'
import { COLORS } from '../lib/constants'

function RootLayoutNav() {
  const { session, tenantId, role, memberships, needsTenantSelection, isLoading } = useAuth()
  const segments = useSegments() as string[]
  const router = useRouter()

  useEffect(() => {
    if (isLoading) return

    const group = segments[0]
    const screen = segments[1]
    const inAuthGroup = group === '(auth)'
    const authAllowWhileAuthed =
      screen === 'accept-invite' ||
      screen === 'select-tenant' ||
      screen === 'no-access' ||
      screen === 'change-password'

    if (!session) {
      if (!inAuthGroup) {
        router.replace('/(auth)/login')
      }
      return
    }

    const needsPasswordChange = session.user?.user_metadata?.must_change_password === true
    if (needsPasswordChange) {
      if (!(inAuthGroup && screen === 'change-password')) {
        router.replace('/(auth)/change-password')
      }
      return
    }

    // Authenticated
    if (needsTenantSelection) {
      if (!(inAuthGroup && screen === 'select-tenant')) {
        router.replace('/(auth)/select-tenant')
      }
      return
    }

    if (!tenantId || !role) {
      if (memberships.length === 0) {
        if (!(inAuthGroup && (screen === 'no-access' || screen === 'accept-invite'))) {
          router.replace('/(auth)/no-access')
        }
        return
      }
    }

    if (session && inAuthGroup && !authAllowWhileAuthed) {
      if (tenantId && role) {
        const isOwnerOrAdmin = role === 'owner' || role === 'super_admin'
        router.replace(isOwnerOrAdmin ? '/(tabs)/taplist' : '/(tabs)')
      }
    }
  }, [session, tenantId, role, memberships, needsTenantSelection, isLoading, segments])

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background }}>
        <ActivityIndicator size="large" color={COLORS.gold} />
      </View>
    )
  }

  return <Slot />
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="light" />
      <RootLayoutNav />
    </AuthProvider>
  )
}
