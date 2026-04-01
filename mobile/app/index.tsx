import { Redirect } from 'expo-router'
import { useAuth } from '../lib/authProvider'
import { View, ActivityIndicator } from 'react-native'
import { COLORS } from '../lib/constants'

export default function IndexRedirect() {
  const { session, tenantId, role, isLoading } = useAuth()

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background }}>
        <ActivityIndicator size="large" color={COLORS.gold} />
      </View>
    )
  }

  if (session && tenantId && role) {
    return <Redirect href="/(tabs)" />
  }

  if (session && !tenantId) {
    return <Redirect href="/(auth)/register" />
  }

  return <Redirect href="/(auth)/login" />
}
