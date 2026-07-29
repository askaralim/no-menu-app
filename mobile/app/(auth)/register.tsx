import { useEffect } from 'react'
import { View, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { COLORS } from '../../lib/constants'

/** Open self-serve bar create is disabled; phone OTP on login is login + register. */
export default function RegisterScreen() {
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
