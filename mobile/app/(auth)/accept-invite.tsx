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
} from 'react-native'
import { useRouter } from 'expo-router'
import { useAuth } from '../../lib/authProvider'
import { acceptTenantInvite } from '../../lib/membershipApi'
import { COLORS } from '../../lib/constants'

export default function AcceptInviteScreen() {
  const router = useRouter()
  const { session, refreshMembership, setActiveTenantId } = useAuth()
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleAccept() {
    if (!session) {
      Alert.alert('请先登录', '请用被邀请的手机号登录后，再输入邀请码。', [
        { text: '去登录', onPress: () => router.replace('/(auth)/login?next=accept-invite') },
      ])
      return
    }
    if (!code.trim()) {
      return Alert.alert('提示', '请输入邀请码')
    }

    setLoading(true)
    try {
      const res = await acceptTenantInvite(code)
      if (!res.ok || !res.tenant_id) {
        Alert.alert('接受失败', '邀请无效')
        return
      }
      await refreshMembership()
      await setActiveTenantId(res.tenant_id)
      Alert.alert('已加入门店', res.tenant_name || '欢迎使用 No Menu', [
        {
          text: '进入',
          onPress: () => {
            const isOwner = res.role === 'owner' || res.role === 'super_admin'
            router.replace(isOwner ? '/(tabs)/taplist' : '/(tabs)')
          },
        },
      ])
    } catch (e: any) {
      Alert.alert('接受失败', e?.message || '请重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <Text style={styles.title}>门店邀请</Text>
      <Text style={styles.sub}>
        {session
          ? '输入店主发给你的邀请码。邀请手机号必须与当前登录账号一致。'
          : '请先用被邀请的手机号登录，再回到本页输入邀请码。'}
      </Text>

      <TextInput
        style={styles.input}
        value={code}
        onChangeText={setCode}
        placeholder="邀请码"
        placeholderTextColor={COLORS.muted}
        autoCapitalize="characters"
        autoCorrect={false}
        editable={!!session}
      />

      {session ? (
        <TouchableOpacity
          style={[styles.button, loading && styles.disabled]}
          disabled={loading}
          onPress={handleAccept}
        >
          <Text style={styles.buttonText}>{loading ? '验证中...' : '接受邀请'}</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={styles.button}
          onPress={() => router.replace('/(auth)/login?next=accept-invite')}
        >
          <Text style={styles.buttonText}>先去登录</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        onPress={() => router.replace(session ? '/(auth)/no-access' : '/(auth)/login')}
        style={{ marginTop: 18 }}
      >
        <Text style={styles.link}>{session ? '返回' : '返回登录'}</Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, justifyContent: 'center', padding: 24 },
  title: { color: COLORS.gold, fontSize: 28, fontWeight: '800', marginBottom: 8 },
  sub: { color: COLORS.muted, fontSize: 14, marginBottom: 24, lineHeight: 20 },
  input: {
    backgroundColor: COLORS.card,
    color: COLORS.text,
    borderRadius: 8,
    padding: 16,
    marginBottom: 14,
    fontSize: 18,
    letterSpacing: 2,
    fontWeight: '700',
  },
  button: {
    backgroundColor: COLORS.gold,
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
  },
  disabled: { opacity: 0.5 },
  buttonText: { color: '#000', fontSize: 16, fontWeight: '700' },
  link: { color: COLORS.gold, textAlign: 'center', fontSize: 14 },
})
