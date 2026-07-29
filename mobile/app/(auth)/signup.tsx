import { useEffect } from 'react'
import { View, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { COLORS } from '../../lib/constants'

/** Phone OTP on the login screen is both login and register. */
export default function SignupScreen() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/(auth)/login')
  }, [router])

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator color={COLORS.gold} />
    </View>
  )
}
