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
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/authProvider'
import { getMyTenants } from '../../lib/membershipApi'
import { THEME, LAYOUT, SPACING, RADIUS } from '../../lib/theme'

export default function ChangePasswordScreen() {
  const router = useRouter()
  const { session, refreshMembership, setActiveTenantId } = useAuth()
  const forced = session?.user?.user_metadata?.must_change_password === true
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)

  function returnToHouse() {
    router.replace('/(tabs)/house')
  }

  async function routeAfterForcedChange() {
    await refreshMembership()
    const tenants = await getMyTenants()
    if (tenants.length === 0) {
      // New staff accounts land here before accepting an invite.
      router.replace('/(auth)/accept-invite')
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
      if (forced) {
        Alert.alert('已更新', '密码修改成功', [
          { text: '进入', onPress: () => void routeAfterForcedChange() },
        ])
      } else {
        Alert.alert('已更新', '密码修改成功', [{ text: '好的', onPress: returnToHouse }])
      }
    } catch (e: any) {
      Alert.alert('修改失败', e?.message || '请重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        {!forced ? (
          <TouchableOpacity style={styles.backBtn} onPress={returnToHouse} hitSlop={8}>
            <Ionicons name="chevron-back" size={22} color={THEME.gold} />
            <Text style={styles.backText}>返回</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.backSpacer} />
        )}

        <Text style={styles.title}>{forced ? '设置新密码' : '修改密码'}</Text>
        <Text style={styles.sub}>
          {forced
            ? '首次登录请修改临时密码，之后用手机号 + 新密码登录。'
            : '设置新密码后，请用手机号 + 新密码登录。'}
        </Text>

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
          onPress={handleSave}
        >
          <Text style={styles.buttonText}>
            {loading ? '保存中...' : forced ? '保存并进入' : '保存'}
          </Text>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: THEME.background },
  container: {
    flex: 1,
    paddingHorizontal: LAYOUT.pagePad,
    paddingTop: LAYOUT.heroPadTop,
    justifyContent: 'center',
  },
  backBtn: {
    position: 'absolute',
    top: LAYOUT.heroPadTop,
    left: LAYOUT.pagePad,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    zIndex: 2,
  },
  backSpacer: { height: 28 },
  backText: { color: THEME.gold, fontSize: 16, fontWeight: '600' },
  title: { color: THEME.gold, fontSize: 28, fontWeight: '800', marginBottom: SPACING.sm },
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
  disabled: { opacity: 0.5 },
  buttonText: { color: THEME.onGold, fontSize: 16, fontWeight: '700' },
})
