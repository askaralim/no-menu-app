import { Slot, useRouter, useSegments } from 'expo-router'
import { useEffect } from 'react'
import { StatusBar } from 'expo-status-bar'
import { AuthProvider, useAuth } from '../lib/authProvider'
import { View, ActivityIndicator } from 'react-native'
import { COLORS } from '../lib/constants'

function RootLayoutNav() {
  const { session, tenantId, role, isLoading } = useAuth()
  const segments = useSegments()
  const router = useRouter()

  useEffect(() => {
    if (isLoading) return

    const inAuthGroup = segments[0] === '(auth)'

    if (session && inAuthGroup) {
      if (tenantId && role) {
        router.replace('/(tabs)')
      }
      // If session exists but no tenantId, user is mid-registration (on the bar setup step).
      // Stay in auth group so register.tsx can call register_bar RPC.
    } else if (!session && !inAuthGroup) {
      router.replace('/(auth)/login')
    }
  }, [session, tenantId, role, isLoading])

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
