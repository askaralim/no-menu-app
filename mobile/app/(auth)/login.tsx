import React, { useState } from 'react'
import {
  Alert,
  StyleSheet,
  View,
  TextInput,
  TouchableOpacity,
  Text,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/authProvider'
import { getMyTenants } from '../../lib/membershipApi'
import { mobileToLoginEmail, normalizeChinaMobile } from '../../lib/phoneAuth'
import { COLORS } from '../../lib/constants'

function mustChangePassword(user: { user_metadata?: Record<string, unknown> } | null | undefined) {
  return user?.user_metadata?.must_change_password === true
}

export default function LoginScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{ next?: string }>()
  const { refreshMembership, setActiveTenantId } = useAuth()

  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function routeAfterAuth() {
    const { data } = await supabase.auth.getUser()
    if (mustChangePassword(data.user)) {
      router.replace('/(auth)/change-password')
      return
    }

    await refreshMembership()
    const tenants = await getMyTenants()

    if (params.next === 'accept-invite' || tenants.length === 0) {
      if (params.next === 'accept-invite') {
        router.replace('/(auth)/accept-invite')
        return
      }
      router.replace('/(auth)/no-access')
      return
    }
    if (tenants.length > 1) {
      router.replace('/(auth)/select-tenant')
      return
    }
    const only = tenants[0]
    await setActiveTenantId(only.tenant_id)
    const isOwnerOrAdmin = only.role === 'owner' || only.role === 'super_admin'
    router.replace(isOwnerOrAdmin ? '/(tabs)/taplist' : '/(tabs)')
  }

  async function signInWithPhonePassword() {
    if (!normalizeChinaMobile(phone)) {
      return Alert.alert('提示', '请输入有效的中国大陆手机号')
    }
    const loginEmail = mobileToLoginEmail(phone)
    if (!loginEmail) {
      return Alert.alert('提示', '请输入有效的中国大陆手机号')
    }
    if (!password) {
      return Alert.alert('提示', '请输入密码')
    }

    setLoading(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password,
      })
      if (error) {
        Alert.alert('登录失败', error.message)
        return
      }
      await routeAfterAuth()
    } catch (e: any) {
      Alert.alert('登录失败', e?.message || '网络异常，请重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <View style={styles.headerContainer}>
        <Image
          source={require('../../assets/brand/no-menu-tonight-lockup.png')}
          style={styles.brandLockup}
          resizeMode="contain"
          accessibilityLabel="No Menu Tonight"
        />
        <Text style={styles.headerSubtitle}>酒吧今晚运营</Text>
      </View>

      <View style={styles.formContainer}>
        <Text style={styles.label}>手机号</Text>
        <View style={styles.phoneRow}>
          <Text style={styles.prefix}>+86</Text>
          <TextInput
            style={[styles.input, { flex: 1, marginBottom: 0 }]}
            onChangeText={setPhone}
            value={phone}
            placeholder="请输入中国大陆手机号"
            placeholderTextColor={COLORS.muted}
            keyboardType="phone-pad"
            maxLength={11}
          />
        </View>

        <Text style={[styles.label, { marginTop: 16 }]}>密码</Text>
        <TextInput
          style={styles.input}
          onChangeText={setPassword}
          value={password}
          secureTextEntry
          placeholder="由店主或 No Menu 提供的密码"
          placeholderTextColor={COLORS.muted}
          autoCapitalize="none"
        />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          disabled={loading}
          onPress={signInWithPhonePassword}
        >
          <Text style={styles.buttonText}>{loading ? '登录中...' : '登录'}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.inviteLink}
          onPress={() => router.push('/(auth)/accept-invite')}
        >
          <Text style={styles.inviteLinkText}>我有邀请码</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.contactHint}>
        店主账号由 No Menu 开通。员工用被邀请手机号与初始密码登录后，在「我有邀请码」中加入门店。
      </Text>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    padding: 24,
  },
  headerContainer: {
    marginBottom: 36,
    alignItems: 'center',
  },
  brandLockup: {
    width: 210,
    height: 132,
    marginBottom: 12,
  },
  headerSubtitle: {
    fontSize: 15,
    color: COLORS.muted,
  },
  formContainer: {
    width: '100%',
  },
  label: {
    color: COLORS.muted,
    fontSize: 13,
    marginBottom: 8,
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  prefix: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '700',
    paddingHorizontal: 12,
    paddingVertical: 16,
    backgroundColor: COLORS.card,
    borderRadius: 8,
  },
  input: {
    backgroundColor: COLORS.card,
    color: COLORS.text,
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    fontSize: 16,
  },
  button: {
    backgroundColor: COLORS.gold,
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold',
  },
  inviteLink: {
    marginTop: 18,
    alignItems: 'center',
  },
  inviteLinkText: {
    color: COLORS.gold,
    fontSize: 15,
    fontWeight: '600',
  },
  contactHint: {
    color: COLORS.muted,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 28,
    lineHeight: 18,
  },
})
