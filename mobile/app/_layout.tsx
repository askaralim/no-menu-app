import 'react-native-gesture-handler'
import 'react-native-reanimated'

import { Slot, useRouter, useSegments } from 'expo-router'
import { useEffect } from 'react'
import { StatusBar } from 'expo-status-bar'
import { AuthProvider, useAuth } from '../lib/authProvider'
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native'
import { COLORS } from '../lib/constants'
import { isSupabaseConfigured } from '../lib/supabase'

function RootLayoutNav() {
  const { session, tenantId, role, memberships, needsTenantSelection, isLoading, authError, retryAuth } = useAuth()
  const segments = useSegments() as string[]
  const router = useRouter()

  useEffect(() => {
    if (isLoading || authError) return

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
        router.replace('/(tabs)/taplist')
      }
    }
  }, [session, tenantId, role, memberships, needsTenantSelection, isLoading, authError, segments])

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background }}>
        <ActivityIndicator size="large" color={COLORS.gold} />
      </View>
    )
  }

  if (authError) {
    return (
      <View style={styles.authErrorWrap}>
        <Text style={styles.authErrorTitle}>暂时无法连接</Text>
        <Text style={styles.authErrorBody}>{authError}</Text>
        <Text style={styles.authErrorAction} onPress={() => void retryAuth()}>重新连接</Text>
      </View>
    )
  }

  return <Slot />
}

function MissingConfigScreen() {
  return (
    <View style={styles.configWrap}>
      <Text style={styles.configTitle}>应用配置不完整</Text>
      <Text style={styles.configBody}>
        当前安装包缺少生产环境的 Supabase 地址。请在 EAS Production 环境设置
        EXPO_PUBLIC_SUPABASE_URL 与 EXPO_PUBLIC_SUPABASE_ANON_KEY 后重新打包。
      </Text>
    </View>
  )
}

export default function RootLayout() {
  if (!isSupabaseConfigured) {
    return (
      <>
        <StatusBar style="light" />
        <MissingConfigScreen />
      </>
    )
  }

  return (
    <AuthProvider>
      <StatusBar style="light" />
      <RootLayoutNav />
    </AuthProvider>
  )
}

const styles = StyleSheet.create({
  configWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
    backgroundColor: COLORS.background,
  },
  configTitle: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 12,
  },
  configBody: {
    color: COLORS.muted,
    fontSize: 15,
    lineHeight: 22,
  },
  authErrorWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
    backgroundColor: COLORS.background,
  },
  authErrorTitle: { color: COLORS.text, fontSize: 18, fontWeight: '700', marginBottom: 8 },
  authErrorBody: { color: COLORS.muted, fontSize: 14, textAlign: 'center', marginBottom: 20 },
  authErrorAction: { color: COLORS.gold, fontSize: 15, fontWeight: '700', padding: 12 },
})

