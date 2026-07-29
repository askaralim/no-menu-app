import Constants from 'expo-constants'
import { useEffect, useState } from 'react'
import { Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { palette, spacing, typography } from '@/constants/design'
import { TAPLIST_LEGAL_DISCLAIMER } from '@/constants/compliance'
import { formatAppVersionLabel } from '@/lib/appVersion'
import { isAnalyticsEnabled, setAnalyticsEnabled } from '@/lib/analytics'
import { useTaplistCity } from '@/lib/taplistCity'

const privacyPolicyUrl =
  (Constants.expoConfig?.extra as { privacyPolicyUrl?: string } | undefined)?.privacyPolicyUrl?.trim() ||
  'https://nomenuapp.com/privacy'
const termsUrl = privacyPolicyUrl.replace(/\/privacy\/?$/, '/terms')
const contactNumber = '15998568171'

export default function AboutScreen() {
  const insets = useSafeAreaInsets()
  const { selectedCity } = useTaplistCity()
  const [analyticsEnabled, setAnalyticsEnabledState] = useState(false)

  useEffect(() => {
    let cancelled = false
    void isAnalyticsEnabled().then((enabled) => {
      if (!cancelled) setAnalyticsEnabledState(enabled)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const onAnalyticsEnabledChange = (enabled: boolean) => {
    setAnalyticsEnabledState(enabled)
    void setAnalyticsEnabled(enabled)
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg }]}>
      <Text style={styles.title}>No Menu</Text>
      <Text style={styles.body}>
        查看合作酒吧公开的精酿酒单、门店信息与当晚在售规格，快速找到今晚想喝的生啤。
      </Text>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>联系 No Menu</Text>
        <Text style={styles.contactBody}>
          酒吧入驻、酒单信息更正或其他联系，可添加微信或直接致电。
        </Text>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>微信号</Text>
          <Text selectable style={[styles.metaValue, styles.link]}>{contactNumber}</Text>
        </View>
        <Pressable
          style={({ pressed }) => [styles.contactRow, pressed && styles.contactRowPressed]}
          onPress={() => void Linking.openURL(`tel:${contactNumber}`)}
          accessibilityRole="button"
          accessibilityLabel={`拨打 No Menu 电话 ${contactNumber}`}>
          <Text style={styles.metaLabel}>电话</Text>
          <Text style={[styles.metaValue, styles.link]}>拨打</Text>
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>法律与隐私</Text>
        <Pressable
          style={({ pressed }) => [styles.metaRow, pressed && styles.contactRowPressed]}
          onPress={() => void Linking.openURL(termsUrl)}
          accessibilityRole="link">
          <Text style={styles.metaLabel}>服务条款</Text>
          <Text style={[styles.metaValue, styles.link]}>查看</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.metaRow, pressed && styles.contactRowPressed]}
          onPress={() => void Linking.openURL(privacyPolicyUrl)}
          accessibilityRole="link">
          <Text style={styles.metaLabel}>隐私政策</Text>
          <Text style={[styles.metaValue, styles.link]}>查看</Text>
        </Pressable>
        <View style={styles.disclaimerBlock}>
          <Text style={styles.disclaimerLabel}>免责声明</Text>
          <Text style={styles.disclaimer}>{TAPLIST_LEGAL_DISCLAIMER}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>偏好设置</Text>
        <View style={styles.analyticsRow}>
          <View style={styles.analyticsCopy}>
            <Text style={styles.settingTitle}>匿名使用分析</Text>
            <Text style={styles.analyticsDescription}>
              帮助 No Menu 了解页面与功能使用情况，不记录搜索词或个人资料。关闭后不会发送使用分析数据。
            </Text>
          </View>
          <Switch
            accessibilityLabel="匿名使用分析"
            value={analyticsEnabled}
            onValueChange={onAnalyticsEnabledChange}
            trackColor={{ false: palette.line, true: palette.olive }}
            thumbColor={palette.text}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>App 信息</Text>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>城市</Text>
          <Text style={styles.metaValue}>{selectedCity.label}</Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>版本</Text>
          <Text style={styles.metaValue}>{formatAppVersionLabel()}</Text>
        </View>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: palette.background,
  },
  content: {
    padding: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  title: {
    ...typography.displayL,
    color: palette.text,
    marginBottom: spacing.sm,
  },
  body: {
    ...typography.body,
    color: palette.muted,
    marginBottom: spacing.xl,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionLabel: {
    ...typography.label,
    color: palette.tungsten,
    fontSize: 11,
    marginBottom: spacing.sm,
  },
  disclaimerBlock: {
    borderTopWidth: 1,
    borderTopColor: palette.line,
    paddingTop: spacing.md,
  },
  disclaimerLabel: {
    ...typography.label,
    color: palette.tungsten,
    fontSize: 11,
    marginBottom: spacing.sm,
  },
  disclaimer: {
    ...typography.caption,
    color: palette.faint,
  },
  contactBody: {
    ...typography.caption,
    color: palette.muted,
    marginBottom: spacing.sm,
  },
  contactRow: {
    borderTopWidth: 1,
    borderTopColor: palette.line,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.lg,
  },
  contactRowPressed: {
    opacity: 0.72,
  },
  metaRow: {
    borderTopWidth: 1,
    borderTopColor: palette.line,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.lg,
  },
  metaLabel: {
    ...typography.label,
    color: palette.faint,
    fontSize: 10,
  },
  metaValue: {
    ...typography.caption,
    color: palette.text,
  },
  link: {
    color: palette.tungsten,
  },
  analyticsRow: {
    borderTopWidth: 1,
    borderTopColor: palette.line,
    paddingVertical: spacing.md,
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.lg,
  },
  analyticsCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  analyticsDescription: {
    ...typography.caption,
    color: palette.faint,
  },
  settingTitle: {
    ...typography.caption,
    color: palette.text,
  },
})
