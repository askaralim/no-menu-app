import FontAwesome from '@expo/vector-icons/FontAwesome'
import { useQueryClient } from '@tanstack/react-query'
import { router } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { palette, spacing, typography } from '@/constants/design'
import { trackEvent } from '@/lib/analytics'
import {
  ConsumerUsernameError,
  getMyConsumerProfile,
  updateMyConsumerUsername,
} from '@/lib/api/consumerProfile'
import { ensureDrinkLogSession } from '@/lib/drinkLogAuth'

const USERNAME_PATTERN = /^[A-Za-z0-9_\u4E00-\u9FFF]+$/

export default function EditProfileScreen() {
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()
  const [initialUsername, setInitialUsername] = useState('')
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    trackEvent('consumer_profile_edit_opened')
    let active = true
    void (async () => {
      try {
        await ensureDrinkLogSession()
        const profile = await getMyConsumerProfile()
        if (!active) return
        setInitialUsername(profile.consumer_username)
        setUsername(profile.consumer_username)
      } catch {
        if (active) setErrorMessage('暂时无法读取身份名，请稍后重试')
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [])

  const trimmedUsername = username.trim()
  const characterCount = Array.from(trimmedUsername).length
  const formatValid = characterCount >= 2 && characterCount <= 24 && USERNAME_PATTERN.test(trimmedUsername)
  const canSave = formatValid && trimmedUsername !== initialUsername && !saving
  const validationMessage = useMemo(() => {
    if (!username || formatValid) return null
    if (characterCount > 24) return '身份名最多 24 个字符'
    return '仅支持中文、英文字母、数字和下划线'
  }, [characterCount, formatValid, username])

  const save = async () => {
    if (!canSave) return
    setSaving(true)
    setErrorMessage(null)
    try {
      const profile = await updateMyConsumerUsername(trimmedUsername)
      queryClient.setQueryData(['consumer-profile'], profile)
      await queryClient.invalidateQueries({ queryKey: ['consumer-profile'] })
      trackEvent('consumer_username_updated')
      router.back()
    } catch (error) {
      const message = error instanceof ConsumerUsernameError
        ? error.code === 'USERNAME_TAKEN'
          ? '这个身份名已被使用'
          : error.code === 'USERNAME_RESERVED'
            ? '这个身份名由 No Menu 保留'
            : error.code === 'USERNAME_INVALID'
              ? '仅支持中文、英文字母、数字和下划线'
              : '暂时无法保存，请稍后重试'
        : '暂时无法保存，请稍后重试'
      setErrorMessage(message)
      trackEvent('consumer_username_update_failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.screen}>
      <View style={[styles.content, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.lg }]}>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="返回"
            hitSlop={8}
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
            <FontAwesome name="angle-left" size={28} color={palette.text} />
          </Pressable>
          <Text style={styles.headerTitle}>编辑昵称</Text>
          <View style={styles.headerSpacer} />
        </View>

        {loading ? (
          <ActivityIndicator color={palette.amber} style={styles.loading} />
        ) : (
          <View style={styles.form}>
            <Text style={styles.label}>NOMENUIST</Text>
            <View style={[styles.inputFrame, (validationMessage || errorMessage) && styles.inputFrameError]}>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel="NoMenuist 身份名"
                maxLength={24}
                onChangeText={(value) => {
                  setUsername(value)
                  setErrorMessage(null)
                }}
                onSubmitEditing={() => void save()}
                placeholder="NoMenuist_4K82P7"
                placeholderTextColor={palette.faint}
                returnKeyType="done"
                selectionColor={palette.amber}
                style={styles.input}
                value={username}
              />
              <Text style={styles.counter}>{characterCount}/24</Text>
            </View>
            <Text style={[styles.help, (validationMessage || errorMessage) && styles.error]}>
              {validationMessage || errorMessage || '支持中文、英文字母、数字和下划线；身份名全局唯一。'}
            </Text>

            <Pressable
              accessibilityRole="button"
              disabled={!canSave}
              onPress={() => void save()}
              style={({ pressed }) => [styles.saveButton, !canSave && styles.saveButtonDisabled, pressed && canSave && styles.pressed]}>
              {saving
                ? <ActivityIndicator size="small" color={palette.background} />
                : <Text style={[styles.saveText, !canSave && styles.saveTextDisabled]}>保存</Text>}
            </Pressable>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.background },
  content: { flex: 1, paddingHorizontal: spacing.lg },
  header: { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backButton: { width: 44, height: 44, alignItems: 'flex-start', justifyContent: 'center' },
  headerTitle: { ...typography.title, color: palette.text },
  headerSpacer: { width: 44 },
  loading: { marginTop: spacing.xxl },
  form: { marginTop: spacing.xl },
  label: { ...typography.label, color: palette.amber, fontSize: 11, letterSpacing: 2 },
  inputFrame: { minHeight: 58, marginTop: spacing.sm, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: palette.line, borderRadius: 8, flexDirection: 'row', alignItems: 'center' },
  inputFrameError: { borderColor: palette.copper },
  input: { ...typography.title, color: palette.text, flex: 1, minWidth: 0, paddingVertical: spacing.md },
  counter: { ...typography.micro, color: palette.faint, marginLeft: spacing.sm },
  help: { ...typography.caption, color: palette.muted, minHeight: 38, marginTop: spacing.xs },
  error: { color: palette.copper },
  saveButton: { minHeight: 52, marginTop: spacing.lg, borderRadius: 8, backgroundColor: palette.amber, alignItems: 'center', justifyContent: 'center' },
  saveButtonDisabled: { backgroundColor: palette.line },
  saveText: { ...typography.title, color: palette.background },
  saveTextDisabled: { color: palette.faint },
  pressed: { opacity: 0.72 },
})
