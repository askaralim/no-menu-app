import Constants from 'expo-constants'
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { palette, spacing, typography } from '@/constants/design'
import { TAPLIST_LEGAL_DISCLAIMER } from '@/constants/compliance'
import { formatAppVersionLabel } from '@/lib/appVersion'
import { useTaplistCity } from '@/lib/taplistCity'

const privacyPolicyUrl =
  (Constants.expoConfig?.extra as { privacyPolicyUrl?: string } | undefined)?.privacyPolicyUrl?.trim() ?? ''
const contactNumber = '15998568171'

export default function AboutScreen() {
  const insets = useSafeAreaInsets()
  const { selectedCity } = useTaplistCity()

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg }]}>
      <Text style={styles.kicker}>No Menu</Text>
      <Text style={styles.title}>今晚 · {selectedCity.label}</Text>
      <Text style={styles.body}>
        No Menu 展示合作酒吧自愿公开的精酿酒单、门店信息与当晚在售规格，帮助你快速判断今晚有哪些好喝的生啤。
      </Text>

      <View style={styles.disclaimerBlock}>
        <Text style={styles.disclaimerLabel}>免责声明</Text>
        <Text style={styles.disclaimer}>{TAPLIST_LEGAL_DISCLAIMER}</Text>
      </View>

      <View style={styles.contactBlock}>
        <Text style={styles.disclaimerLabel}>联系 No Menu</Text>
        <Text style={styles.contactBody}>
          酒吧入驻、酒单信息更正或其他联系，请通过微信联系。
        </Text>
        <Pressable
          style={({ pressed }) => [styles.contactRow, pressed && styles.contactRowPressed]}
          onPress={() => void Linking.openURL(`tel:${contactNumber}`)}
          accessibilityRole="button"
          accessibilityLabel="联系 No Menu">
          <Text style={styles.metaLabel}>微信 / 电话</Text>
          <Text style={[styles.metaValue, styles.link]}>{contactNumber}</Text>
        </Pressable>
      </View>

      <View style={styles.metaRow}>
        <Text style={styles.metaLabel}>版本</Text>
        <Text style={styles.metaValue}>{formatAppVersionLabel()}</Text>
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
        <Text style={styles.metaValue}>{selectedCity.label}</Text>
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
  contactBlock: {
    paddingBottom: spacing.lg,
    marginBottom: spacing.lg,
  },
  contactBody: {
    ...typography.caption,
    color: palette.muted,
    marginBottom: spacing.md,
  },
  contactRow: {
    borderTopWidth: 1,
    borderTopColor: palette.line,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.lg,
  },
  contactRowPressed: {
    opacity: 0.72,
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
