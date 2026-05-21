import Constants from 'expo-constants'
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { palette, spacing, typography } from '@/constants/design'
import { TAPLIST_LEGAL_DISCLAIMER } from '@/constants/compliance'

const privacyPolicyUrl =
  (Constants.expoConfig?.extra as { privacyPolicyUrl?: string } | undefined)?.privacyPolicyUrl?.trim() ?? ''

export default function AboutScreen() {
  const insets = useSafeAreaInsets()

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg }]}>
      <Text style={styles.kicker}>无菜单酒单</Text>
      <Text style={styles.title}>今晚在上海</Text>
      <Text style={styles.body}>
        无菜单酒单 Tap List 展示合作酒吧自愿公开的精酿酒单、门店信息与当晚在售规格，帮助你快速判断今晚有哪些好喝的生啤。
      </Text>

      <View style={styles.disclaimerBlock}>
        <Text style={styles.disclaimerLabel}>免责声明</Text>
        <Text style={styles.disclaimer}>{TAPLIST_LEGAL_DISCLAIMER}</Text>
      </View>

      <View style={styles.metaRow}>
        <Text style={styles.metaLabel}>版本</Text>
        <Text style={styles.metaValue}>1.0 MVP</Text>
      </View>
      {privacyPolicyUrl ? (
        <Pressable
          style={styles.metaRow}
          onPress={() => void Linking.openURL(privacyPolicyUrl)}
          accessibilityRole="link">
          <Text style={styles.metaLabel}>隐私政策</Text>
          <Text style={[styles.metaValue, styles.link]}>查看</Text>
        </Pressable>
      ) : null}
      <View style={styles.metaRow}>
        <Text style={styles.metaLabel}>城市</Text>
        <Text style={styles.metaValue}>上海</Text>
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
  kicker: {
    ...typography.label,
    color: palette.olive,
    fontSize: 11,
    lineHeight: 15,
    marginBottom: spacing.xs,
  },
  title: {
    ...typography.displayL,
    color: palette.text,
    marginBottom: spacing.lg,
  },
  body: {
    ...typography.body,
    color: palette.muted,
    marginBottom: spacing.xl,
  },
  disclaimerBlock: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: palette.hairline,
    paddingVertical: spacing.lg,
    marginBottom: spacing.lg,
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
  metaRow: {
    borderTopWidth: 1,
    borderTopColor: palette.line,
    paddingVertical: spacing.md,
    flexDirection: 'row',
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
})
