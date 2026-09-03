import Constants from 'expo-constants'
import FontAwesome from '@expo/vector-icons/FontAwesome'
import { router } from 'expo-router'
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
  const [disclaimerExpanded, setDisclaimerExpanded] = useState(false)

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
      <View style={styles.hero}>
        <View style={styles.headerRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="返回我的"
            hitSlop={8}
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
            <FontAwesome name="angle-left" size={25} color={palette.text} />
          </Pressable>
          <Text style={styles.headerTitle}>关于 No Menu</Text>
        </View>
        <Text style={styles.body}>今晚有什么，打开就知道。</Text>
        <Text style={styles.description}>
          查看合作酒吧公开的精酿酒单、门店信息与当晚在售规格，快速找到今晚想喝的生啤。
        </Text>
        <Text style={styles.version}>{selectedCity.label} · {formatAppVersionLabel()}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>联系与支持</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowCopy}>
              <Text style={styles.rowTitle}>酒吧入驻与信息更正</Text>
              <Text style={styles.rowDescription}>添加微信 {contactNumber}</Text>
            </View>
            <Text selectable style={styles.link}>{contactNumber}</Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.row, styles.rowBorder, pressed && styles.pressed]}
            onPress={() => void Linking.openURL(`tel:${contactNumber}`)}
            accessibilityRole="button"
            accessibilityLabel={`拨打 No Menu 电话 ${contactNumber}`}>
            <View style={styles.rowCopy}>
              <Text style={styles.rowTitle}>电话联系</Text>
              <Text style={styles.rowDescription}>{contactNumber}</Text>
            </View>
            <FontAwesome name="phone" size={17} color={palette.tungsten} />
          </Pressable>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>隐私与条款</Text>
        <View style={styles.card}>
          <View style={styles.analyticsRow}>
            <View style={styles.rowCopy}>
              <Text style={styles.rowTitle}>匿名使用分析</Text>
              <Text style={styles.rowDescription}>不记录搜索词或个人资料</Text>
            </View>
            <Switch
              accessibilityLabel="匿名使用分析"
              value={analyticsEnabled}
              onValueChange={onAnalyticsEnabledChange}
              trackColor={{ false: palette.line, true: palette.olive }}
              thumbColor={palette.text}
            />
          </View>
          <Pressable
            style={({ pressed }) => [styles.row, styles.rowBorder, pressed && styles.pressed]}
            onPress={() => void Linking.openURL(termsUrl)}
            accessibilityRole="link"
            accessibilityLabel="查看服务条款">
            <Text style={styles.rowTitle}>服务条款</Text>
            <FontAwesome name="angle-right" size={20} color={palette.faint} />
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.row, styles.rowBorder, pressed && styles.pressed]}
            onPress={() => void Linking.openURL(privacyPolicyUrl)}
            accessibilityRole="link"
            accessibilityLabel="查看隐私政策">
            <Text style={styles.rowTitle}>隐私政策</Text>
            <FontAwesome name="angle-right" size={20} color={palette.faint} />
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.row, styles.rowBorder, pressed && styles.pressed]}
            onPress={() => setDisclaimerExpanded((expanded) => !expanded)}
            accessibilityRole="button"
            accessibilityState={{ expanded: disclaimerExpanded }}
            accessibilityLabel={disclaimerExpanded ? '收起免责声明' : '展开免责声明'}>
            <Text style={styles.rowTitle}>免责声明</Text>
            <FontAwesome name={disclaimerExpanded ? 'angle-up' : 'angle-down'} size={20} color={palette.faint} />
          </Pressable>
          {disclaimerExpanded ? (
            <View style={styles.disclaimerBlock}>
              <Text style={styles.disclaimer}>{TAPLIST_LEGAL_DISCLAIMER}</Text>
            </View>
          ) : null}
        </View>
      </View>

      <Text style={styles.footer}>No Menu · 理性饮酒 · 未成年人禁止饮酒</Text>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: palette.background,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  hero: {
    marginBottom: spacing.xxl,
  },
  headerRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  backButton: {
    width: 32,
    height: 44,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  headerTitle: {
    ...typography.title,
    color: palette.text,
    fontSize: 20,
    lineHeight: 28,
  },
  body: {
    ...typography.title,
    color: palette.text,
    marginTop: spacing.lg,
  },
  description: {
    ...typography.body,
    color: palette.muted,
    marginTop: spacing.xs,
    maxWidth: 520,
  },
  version: {
    ...typography.micro,
    color: palette.faint,
    marginTop: spacing.md,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionLabel: {
    ...typography.label,
    color: palette.tungsten,
    fontSize: 12,
    marginBottom: spacing.sm,
  },
  card: {
    overflow: 'hidden',
    borderRadius: 12,
    backgroundColor: palette.bgSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.line,
  },
  row: {
    minHeight: 64,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  rowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.line,
  },
  rowCopy: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    ...typography.body,
    color: palette.text,
  },
  rowDescription: {
    ...typography.caption,
    color: palette.muted,
    marginTop: 2,
  },
  disclaimerBlock: {
    borderTopWidth: 1,
    borderTopColor: palette.line,
    padding: spacing.md,
  },
  disclaimer: {
    ...typography.caption,
    color: palette.muted,
  },
  link: {
    ...typography.caption,
    color: palette.tungsten,
  },
  analyticsRow: {
    minHeight: 72,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  pressed: {
    opacity: 0.72,
  },
  footer: {
    ...typography.caption,
    color: palette.faint,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
})
