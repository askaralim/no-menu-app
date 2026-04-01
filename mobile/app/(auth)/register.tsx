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
  ScrollView,
  ActivityIndicator,
} from 'react-native'
import { useRouter } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { COLORS } from '../../lib/constants'

export default function RegisterScreen() {
  const router = useRouter()
  const [step, setStep] = useState<'account' | 'bar'>('account')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [barName, setBarName] = useState('')
  const [barSlug, setBarSlug] = useState('')
  const [loading, setLoading] = useState(false)

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/[\u4e00-\u9fff]/g, '')
      .slice(0, 30) || ''
  }

  const handleBarNameChange = (name: string) => {
    setBarName(name)
    if (!barSlug || barSlug === generateSlug(barName)) {
      setBarSlug(generateSlug(name))
    }
  }

  async function handleSignUp() {
    if (!email.trim() || !password) {
      return Alert.alert('提示', '请填写邮箱和密码')
    }
    if (password.length < 6) {
      return Alert.alert('提示', '密码至少6位')
    }
    if (password !== confirmPassword) {
      return Alert.alert('提示', '两次密码不一致')
    }

    setLoading(true)
    try {
      const { error } = await supabase.auth.signUp({ email: email.trim(), password })
      if (error) {
        Alert.alert('注册失败', error.message)
        return
      }
      setStep('bar')
    } catch (e) {
      Alert.alert('错误', '注册失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  async function handleRegisterBar() {
    if (!barName.trim()) {
      return Alert.alert('提示', '请输入酒吧名称')
    }
    if (!barSlug.trim() || barSlug.length < 2) {
      return Alert.alert('提示', '请输入至少2位的URL标识')
    }

    setLoading(true)
    try {
      const { error } = await supabase.rpc('register_bar', {
        bar_name: barName.trim(),
        bar_slug: barSlug.trim().toLowerCase(),
      })
      if (error) {
        Alert.alert('创建失败', error.message)
        return
      }
      Alert.alert('注册成功', '您的酒吧已创建，即将进入管理界面')
    } catch (e: any) {
      Alert.alert('错误', e?.message || '创建酒吧失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.headerContainer}>
          <Text style={styles.headerTitle}>Bar Console</Text>
          <Text style={styles.headerSubtitle}>
            {step === 'account' ? '创建您的账号' : '设置您的酒吧'}
          </Text>
        </View>

        {/* Step indicator */}
        <View style={styles.stepRow}>
          <View style={[styles.stepDot, styles.stepDotActive]} />
          <View style={[styles.stepLine, step === 'bar' && styles.stepLineActive]} />
          <View style={[styles.stepDot, step === 'bar' && styles.stepDotActive]} />
        </View>
        <View style={styles.stepLabelRow}>
          <Text style={[styles.stepLabel, styles.stepLabelActive]}>账号</Text>
          <Text style={[styles.stepLabel, step === 'bar' && styles.stepLabelActive]}>酒吧</Text>
        </View>

        {step === 'account' ? (
          <View style={styles.formContainer}>
            <TextInput
              style={styles.input}
              onChangeText={setEmail}
              value={email}
              placeholder="邮箱地址"
              placeholderTextColor={COLORS.muted}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <TextInput
              style={styles.input}
              onChangeText={setPassword}
              value={password}
              secureTextEntry
              placeholder="密码（至少6位）"
              placeholderTextColor={COLORS.muted}
              autoCapitalize="none"
            />
            <TextInput
              style={styles.input}
              onChangeText={setConfirmPassword}
              value={confirmPassword}
              secureTextEntry
              placeholder="确认密码"
              placeholderTextColor={COLORS.muted}
              autoCapitalize="none"
            />
            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              disabled={loading}
              onPress={handleSignUp}
            >
              {loading ? (
                <ActivityIndicator color="#000" />
              ) : (
                <Text style={styles.buttonText}>下一步</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.formContainer}>
            <Text style={styles.fieldLabel}>酒吧名称</Text>
            <TextInput
              style={styles.input}
              onChangeText={handleBarNameChange}
              value={barName}
              placeholder="例如: 淡水路226"
              placeholderTextColor={COLORS.muted}
            />
            <Text style={styles.fieldLabel}>URL标识 (slug)</Text>
            <TextInput
              style={styles.input}
              onChangeText={setBarSlug}
              value={barSlug}
              placeholder="例如: bar226"
              placeholderTextColor={COLORS.muted}
              autoCapitalize="none"
            />
            <Text style={styles.slugHint}>
              用于展示页链接: /display?slug={barSlug || 'your-slug'}
            </Text>
            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              disabled={loading}
              onPress={handleRegisterBar}
            >
              {loading ? (
                <ActivityIndicator color="#000" />
              ) : (
                <Text style={styles.buttonText}>创建酒吧</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity style={styles.linkBtn} onPress={() => router.replace('/(auth)/login')}>
          <Text style={styles.linkText}>已有账号？返回登录</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  headerContainer: {
    marginBottom: 32,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 36,
    fontWeight: 'bold',
    color: COLORS.gold,
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 16,
    color: COLORS.muted,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  stepDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.border,
  },
  stepDotActive: {
    backgroundColor: COLORS.gold,
  },
  stepLine: {
    width: 60,
    height: 2,
    backgroundColor: COLORS.border,
    marginHorizontal: 8,
  },
  stepLineActive: {
    backgroundColor: COLORS.gold,
  },
  stepLabelRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 64,
    marginBottom: 24,
  },
  stepLabel: {
    fontSize: 13,
    color: COLORS.muted,
    fontWeight: '500',
  },
  stepLabelActive: {
    color: COLORS.gold,
  },
  formContainer: {
    width: '100%',
  },
  fieldLabel: {
    fontSize: 13,
    color: COLORS.muted,
    marginBottom: 6,
    fontWeight: '600',
  },
  input: {
    backgroundColor: COLORS.card,
    color: COLORS.text,
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    fontSize: 16,
  },
  slugHint: {
    fontSize: 12,
    color: COLORS.muted,
    marginBottom: 20,
    marginTop: -8,
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
  linkBtn: {
    marginTop: 24,
    alignItems: 'center',
  },
  linkText: {
    color: COLORS.gold,
    fontSize: 15,
  },
})
