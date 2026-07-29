import { Redirect } from 'expo-router'
import { useAuth } from '../lib/authProvider'
import { View, ActivityIndicator } from 'react-native'
import { COLORS } from '../lib/constants'

export default function IndexRedirect() {
  const { session, tenantId, role, memberships, needsTenantSelection, isLoading } = useAuth()

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background }}>
        <ActivityIndicator size="large" color={COLORS.gold} />
      </View>
    )
  }

  if (!session) {
    return <Redirect href="/(auth)/login" />
  }

  if (needsTenantSelection) {
    return <Redirect href="/(auth)/select-tenant" />
  }

  if (session && tenantId && role) {
    const isOwnerOrAdmin = role === 'owner' || role === 'super_admin'
    return <Redirect href={isOwnerOrAdmin ? '/(tabs)/taplist' : '/(tabs)'} />
  }

  if (session && memberships.length === 0) {
    return <Redirect href="/(auth)/no-access" />
  }

  return <Redirect href="/(auth)/login" />
}
