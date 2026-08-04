import { useState } from 'react'
import { Alert, StyleSheet, View, TextInput, TouchableOpacity, Text } from 'react-native'
import { useRouter } from 'expo-router'
import { supabase } from '../../../lib/supabase'
import { THEME, LAYOUT, SPACING, RADIUS } from '../../../lib/theme'
import { Screen } from '../../../components/ui'
import { HouseSubheader } from '../../../components/house/HouseSubheader'

/** Voluntary password change inside house stack (swipe-back). Forced flow stays in (auth). */
export default function HouseChangePasswordScreen() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSave() {
    if (password.length < 6) {
      return Alert.alert('提示', '新密码至少 6 位')
    }
    if (password !== confirm) {
      return Alert.alert('提示', '两次密码不一致')
    }
    setLoading(true)
    try {
      const { data: current } = await supabase.auth.getUser()
      const { error } = await supabase.auth.updateUser({
        password,
        data: {
          ...(current.user?.user_metadata || {}),
          must_change_password: false,
        },
      })
      if (error) {
        Alert.alert('修改失败', error.message)
        return
      }
      Alert.alert('已更新', '密码修改成功', [{ text: '好的', onPress: () => router.back() }])
    } catch (e: any) {
      Alert.alert('修改失败', e?.message || '请重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Screen>
      <HouseSubheader title="修改密码" />
      <Text style={styles.sub}>设置新密码后，请用手机号 + 新密码登录。</Text>
      <TextInput
        style={styles.input}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        placeholder="新密码（至少 6 位）"
        placeholderTextColor={THEME.muted}
        autoCapitalize="none"
      />
      <TextInput
        style={styles.input}
        value={confirm}
        onChangeText={setConfirm}
        secureTextEntry
        placeholder="确认新密码"
        placeholderTextColor={THEME.muted}
        autoCapitalize="none"
      />
      <TouchableOpacity
        style={[styles.button, loading && styles.disabled]}
        disabled={loading}
        onPress={() => void handleSave()}
      >
        <Text style={styles.buttonText}>{loading ? '保存中...' : '保存'}</Text>
      </TouchableOpacity>
      <View style={{ height: LAYOUT.pagePad }} />
    </Screen>
  )
}

const styles = StyleSheet.create({
  sub: { color: THEME.muted, fontSize: 14, marginBottom: SPACING.xl, lineHeight: 20 },
  input: {
    backgroundColor: THEME.card,
    color: THEME.text,
    borderRadius: RADIUS.sm,
    padding: SPACING.lg,
    marginBottom: 14,
    fontSize: 16,
  },
  button: {
    backgroundColor: THEME.gold,
    borderRadius: RADIUS.sm,
    paddingVertical: SPACING.lg,
    alignItems: 'center',
  },
  disabled: { opacity: 0.6 },
  buttonText: { color: THEME.background, fontSize: 16, fontWeight: '700' },
})
