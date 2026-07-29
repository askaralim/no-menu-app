import FontAwesome from '@expo/vector-icons/FontAwesome'
import Constants from 'expo-constants'
import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { palette, spacing, typography } from '@/constants/design'
import { TAPLIST_LEGAL_DISCLAIMER } from '@/constants/compliance'
import { setAnalyticsEnabled } from '@/lib/analytics'
import { completeFirstLaunchConsent, hasCompletedFirstLaunchConsent } from '@/lib/firstLaunch'
import { queryClient } from '@/lib/queryClient'
import { resetTaplistSupabaseCache } from '@/lib/supabase'
import { useTaplistCity } from '@/lib/taplistCity'

type Props = {
  children: React.ReactNode
}

const privacyPolicyUrl =
  (Constants.expoConfig?.extra as { privacyPolicyUrl?: string } | undefined)?.privacyPolicyUrl?.trim() ||
  'https://nomenuapp.com/privacy'
const termsUrl = privacyPolicyUrl.replace(/\/privacy\/?$/, '/terms')

/**
 * ADR-018: first-launch age / legal notice before using the consumer app.
 */
export function FirstLaunchLegalGate({ children }: Props) {
  const insets = useSafeAreaInsets()
  const { refreshCities } = useTaplistCity()
  const [ready, setReady] = useState(false)
  const [visible, setVisible] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [storageError, setStorageError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const ack = await hasCompletedFirstLaunchConsent()
        if (cancelled) return
        setVisible(!ack)
      } catch {
        if (cancelled) return
        setStorageError('暂时无法读取隐私设置，请重新确认后继续。')
        setVisible(true)
      } finally {
        if (!cancelled) setReady(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const onContinue = async (allowAnalytics: boolean) => {
    if (submitting) return
    setSubmitting(true)
    setStorageError(null)
    try {
      await setAnalyticsEnabled(allowAnalytics)
      await completeFirstLaunchConsent()
      resetTaplistSupabaseCache()
      setVisible(false)
      void refreshCities()
      void queryClient.invalidateQueries({ queryKey: ['taplist'] })
    } catch {
      setStorageError('暂时无法保存隐私设置，请稍后重试。')
    } finally {
      setSubmitting(false)
    }
  }

  if (!ready) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator color={palette.amber} />
      </View>
    )
  }

  if (visible) {
    return (
      <Modal visible animationType="fade" transparent={false} onRequestClose={() => {}}>
        <View
          style={[
            styles.sheet,
            { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.md },
          ]}>
          <Text style={styles.title}>进入 No Menu 前</Text>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
            <Text style={styles.intro}>
              请确认你已达到所在地法定饮酒年龄，并阅读相关条款。
            </Text>
            <View style={styles.linkRow}>
              {termsUrl ? (
                <Pressable
                  onPress={() => void Linking.openURL(termsUrl)}
                  accessibilityRole="link">
                  <Text style={styles.link}>《服务条款》</Text>
                </Pressable>
              ) : null}
              {privacyPolicyUrl ? (
                <Pressable
                  onPress={() => void Linking.openURL(privacyPolicyUrl)}
                  accessibilityRole="link">
                  <Text style={styles.link}>《隐私政策》</Text>
                </Pressable>
              ) : null}
            </View>

            <Text style={styles.legalNotice}>{TAPLIST_LEGAL_DISCLAIMER}</Text>

            <View style={styles.analyticsCard}>
              <Text style={styles.optionalBadge}>可选</Text>
              <View style={styles.analyticsContent}>
                <FontAwesome name="shield" size={28} color={palette.tungsten} />
                <View style={styles.analyticsCopy}>
                  <Text style={styles.analyticsTitle}>匿名使用分析</Text>
                  <Text style={styles.analyticsBody}>
                    帮助我们了解页面和功能使用情况，不记录搜索词、姓名、电话或邮箱。
                  </Text>
                </View>
              </View>
            </View>
          </ScrollView>

          {storageError ? (
            <Text accessibilityRole="alert" style={styles.errorText}>
              {storageError}
            </Text>
          ) : null}

          <Pressable
            disabled={submitting}
            style={({ pressed }) => [
              styles.primaryButton,
              (pressed || submitting) && styles.buttonPressed,
            ]}
            onPress={() => void onContinue(true)}
            accessibilityRole="button">
            <Text style={styles.primaryButtonText}>同意匿名分析并继续</Text>
          </Pressable>
          <Pressable
            disabled={submitting}
            style={({ pressed }) => [
              styles.secondaryButton,
              (pressed || submitting) && styles.buttonPressed,
            ]}
            onPress={() => void onContinue(false)}
            accessibilityRole="button">
            <Text style={styles.secondaryButtonText}>仅使用必要功能</Text>
          </Pressable>
          <Text style={styles.hint}>你可以随时在“关于”中修改此设置。</Text>
        </View>
      </Modal>
    )
  }

  return <>{children}</>
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    backgroundColor: palette.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheet: {
    flex: 1,
    backgroundColor: palette.background,
    paddingHorizontal: spacing.lg,
  },
  title: {
    ...typography.headline,
    color: palette.text,
    fontSize: 32,
    lineHeight: 40,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  scroll: {
    flex: 1,
    marginBottom: spacing.md,
  },
  scrollContent: {
    paddingBottom: spacing.sm,
  },
  intro: {
    ...typography.body,
    color: palette.muted,
    textAlign: 'center',
  },
  linkRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  link: {
    ...typography.body,
    color: palette.tungsten,
    textDecorationLine: 'underline',
  },
  legalNotice: {
    ...typography.micro,
    color: palette.faint,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  analyticsCard: {
    backgroundColor: palette.panelElevated,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 20,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  optionalBadge: {
    ...typography.micro,
    alignSelf: 'flex-start',
    color: palette.olive,
    backgroundColor: palette.darkOlive,
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    marginBottom: spacing.md,
  },
  analyticsContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  analyticsCopy: {
    flex: 1,
  },
  analyticsTitle: {
    ...typography.title,
    color: palette.text,
    marginBottom: spacing.xs,
  },
  analyticsBody: {
    ...typography.caption,
    color: palette.muted,
  },
  primaryButton: {
    backgroundColor: palette.tungsten,
    borderRadius: 10,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: palette.muted,
    borderRadius: 10,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  buttonPressed: {
    opacity: 0.82,
  },
  primaryButtonText: {
    color: palette.background,
    ...typography.title,
  },
  secondaryButtonText: {
    color: palette.text,
    ...typography.title,
  },
  hint: {
    ...typography.micro,
    color: palette.faint,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  errorText: {
    ...typography.caption,
    color: palette.amber,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
})
