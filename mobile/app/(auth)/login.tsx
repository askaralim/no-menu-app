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
  Linking,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
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
    router.replace('/(tabs)/taplist')
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
        <Text style={styles.headerSubtitle}>酒吧实时酒单管理与发布</Text>
      </View>

      <View style={styles.formContainer}>
        <Text style={styles.label}>手机号</Text>
        <View style={styles.phoneRow}>
          <Text style={styles.prefix}>+86</Text>
          <View style={[styles.inputWrap, styles.phoneInputWrap]}>
            <TextInput
              style={styles.inputField}
              onChangeText={setPhone}
              value={phone}
              placeholder="11 位手机号"
              placeholderTextColor={COLORS.muted}
              keyboardType="phone-pad"
              maxLength={11}
            />
            {phone.length > 0 ? (
              <TouchableOpacity
                style={styles.clearBtn}
                onPress={() => setPhone('')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel="清空手机号"
              >
                <Ionicons name="close-circle" size={20} color={COLORS.muted} />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        <Text style={[styles.label, { marginTop: 16 }]}>密码</Text>
        <View style={[styles.inputWrap, styles.passwordInputWrap]}>
          <TextInput
            style={styles.inputField}
            onChangeText={setPassword}
            value={password}
            secureTextEntry
            placeholder="请输入密码"
            placeholderTextColor={COLORS.muted}
            autoCapitalize="none"
          />
          {password.length > 0 ? (
            <TouchableOpacity
              style={styles.clearBtn}
              onPress={() => setPassword('')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="清空密码"
            >
              <Ionicons name="close-circle" size={20} color={COLORS.muted} />
            </TouchableOpacity>
          ) : null}
        </View>

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
        <TouchableOpacity
          style={styles.supportLink}
          onPress={() => void Linking.openURL('https://nomenuapp.com/support?topic=bar_onboarding')}
        >
          <Text style={styles.supportLinkText}>申请门店开通 / 联系支持</Text>
        </TouchableOpacity>
      </View>
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
    marginBottom: 0,
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
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 8,
    paddingRight: 10,
  },
  /** Only inside phoneRow — take remaining width next to +86. */
  phoneInputWrap: {
    flex: 1,
  },
  passwordInputWrap: {
    width: '100%',
    marginBottom: 16,
  },
  inputField: {
    flex: 1,
    color: COLORS.text,
    paddingVertical: 16,
    paddingHorizontal: 16,
    paddingRight: 8,
    fontSize: 16,
  },
  clearBtn: {
    padding: 2,
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
  supportLink: { marginTop: 14, alignItems: 'center' },
  supportLinkText: { color: COLORS.muted, fontSize: 14, textDecorationLine: 'underline' },
})
