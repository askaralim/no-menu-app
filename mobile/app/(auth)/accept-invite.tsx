import React, { useEffect, useState } from 'react'
import {
  Alert,
  StyleSheet,
  View,
  TextInput,
  TouchableOpacity,
  Text,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native'
import { useRouter } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/authProvider'
import { acceptTenantInvite } from '../../lib/membershipApi'
import { mobileToLoginEmail, normalizeChinaMobile } from '../../lib/phoneAuth'
import {
  clearPendingInviteCode,
  peekPendingInviteCode,
  savePendingInviteCode,
} from '../../lib/pendingInvite'
import { COLORS } from '../../lib/constants'

export default function AcceptInviteScreen() {
  const router = useRouter()
  const { session, refreshMembership, setActiveTenantId } = useAuth()
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    void peekPendingInviteCode().then((pending) => {
      if (pending) setCode(pending)
    })
  }, [])

  async function finishJoin(inviteCode: string) {
    const res = await acceptTenantInvite(inviteCode)
    if (!res.ok || !res.tenant_id) {
      throw new Error('邀请无效')
    }
    await clearPendingInviteCode()
    await refreshMembership()
    await setActiveTenantId(res.tenant_id)
    Alert.alert('已加入门店', res.tenant_name || '欢迎使用 No Menu', [
      {
        text: '进入',
        onPress: () => {
          router.replace('/(tabs)/taplist')
        },
      },
    ])
  }

  async function handleLoggedInAccept() {
    if (!code.trim()) {
      return Alert.alert('提示', '请输入邀请码')
    }
    setLoading(true)
    try {
      await finishJoin(code)
    } catch (e: any) {
      Alert.alert('接受失败', e?.message || '请重试')
    } finally {
      setLoading(false)
    }
  }

  async function handleJoinWithLogin() {
    if (!normalizeChinaMobile(phone)) {
      return Alert.alert('提示', '请输入被邀请的手机号')
    }
    const loginEmail = mobileToLoginEmail(phone)
    if (!loginEmail) {
      return Alert.alert('提示', '请输入被邀请的手机号')
    }
    if (!password) {
      return Alert.alert(
        '需要初始密码',
        '店主生成邀请时会显示一次性初始密码。请向店主索取手机号、初始密码和邀请码。',
      )
    }
    if (!code.trim()) {
      return Alert.alert('提示', '请输入邀请码')
    }

    setLoading(true)
    try {
      await savePendingInviteCode(code)

      const { error } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password,
      })
      if (error) {
        const detail =
          (error.message || '').toLowerCase().includes('invalid login credentials') ||
          (error.message || '').toLowerCase().includes('invalid_credentials')
            ? '手机号或初始密码不正确'
            : error.message || '登录失败'
        Alert.alert(
          '登录失败',
          `${detail}\n\n请确认使用店主发给你的手机号和初始密码。若没有密码，请让店主重新生成邀请并复制发给你。`,
        )
        return
      }

      const { data } = await supabase.auth.getUser()
      if (data.user?.user_metadata?.must_change_password === true) {
        router.replace('/(auth)/change-password')
        return
      }

      await finishJoin(code)
    } catch (e: any) {
      Alert.alert('加入失败', e?.message || '请重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>加入门店</Text>

        {session ? (
          <>
            <Text style={styles.sub}>
              你已登录。输入店主发给你的邀请码即可加入（须与当前登录手机号一致）。
            </Text>
            <Text style={styles.label}>邀请码</Text>
            <TextInput
              style={styles.input}
              value={code}
              onChangeText={setCode}
              placeholder="店主发给你的邀请码"
              placeholderTextColor={COLORS.muted}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={[styles.button, loading && styles.disabled]}
              disabled={loading}
              onPress={handleLoggedInAccept}
            >
              <Text style={styles.buttonText}>{loading ? '验证中...' : '接受邀请'}</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.sub}>
              请填写店主发给你的三项信息：手机号、初始密码、邀请码。一次完成登录并加入门店。
            </Text>

            <Text style={styles.steps}>① 手机号　② 初始密码　③ 邀请码</Text>

            <Text style={styles.label}>手机号</Text>
            <View style={styles.phoneRow}>
              <Text style={styles.prefix}>+86</Text>
              <TextInput
                style={[styles.input, styles.phoneInput]}
                value={phone}
                onChangeText={setPhone}
                placeholder="被邀请的手机号"
                placeholderTextColor={COLORS.muted}
                keyboardType="phone-pad"
                maxLength={11}
              />
            </View>

            <Text style={styles.label}>初始密码</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="店主发给你的一次性密码"
              placeholderTextColor={COLORS.muted}
              secureTextEntry
              autoCapitalize="none"
            />
            <Text style={styles.hint}>没有密码？请让店主重新生成邀请，并点「复制」发给你。</Text>

            <Text style={styles.label}>邀请码</Text>
            <TextInput
              style={styles.input}
              value={code}
              onChangeText={setCode}
              placeholder="店主发给你的邀请码"
              placeholderTextColor={COLORS.muted}
              autoCapitalize="characters"
              autoCorrect={false}
            />

            <TouchableOpacity
              style={[styles.button, loading && styles.disabled]}
              disabled={loading}
              onPress={handleJoinWithLogin}
            >
              <Text style={styles.buttonText}>{loading ? '加入中...' : '登录并加入门店'}</Text>
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity
          onPress={() => router.replace(session ? '/(auth)/no-access' : '/(auth)/login')}
          style={{ marginTop: 18 }}
        >
          <Text style={styles.link}>{session ? '返回' : '返回登录'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24, paddingVertical: 48 },
  title: { color: COLORS.gold, fontSize: 28, fontWeight: '800', marginBottom: 8 },
  sub: { color: COLORS.muted, fontSize: 14, marginBottom: 16, lineHeight: 20 },
  steps: {
    color: COLORS.gold,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 18,
    letterSpacing: 0.5,
  },
  label: { color: COLORS.muted, fontSize: 13, marginBottom: 8 },
  hint: { color: COLORS.muted, fontSize: 12, marginTop: -8, marginBottom: 14, lineHeight: 18 },
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  prefix: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '700',
    paddingHorizontal: 12,
    paddingVertical: 16,
    backgroundColor: COLORS.card,
    borderRadius: 8,
  },
  phoneInput: { flex: 1, marginBottom: 0 },
  input: {
    backgroundColor: COLORS.card,
    color: COLORS.text,
    borderRadius: 8,
    padding: 16,
    marginBottom: 14,
    fontSize: 16,
    fontWeight: '600',
  },
  button: {
    backgroundColor: COLORS.gold,
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  disabled: { opacity: 0.5 },
  buttonText: { color: '#000', fontSize: 16, fontWeight: '700' },
  link: { color: COLORS.gold, textAlign: 'center', fontSize: 14 },
})
