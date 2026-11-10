import FontAwesome from '@expo/vector-icons/FontAwesome'
import { ScrollView, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { BackButton } from '@/components/taplist/BackButton'
import { palette, spacing, typography } from '@/constants/design'
import { tr, useLanguage, type LanguagePreference } from '@/lib/i18n'

export default function SettingsScreen() {
  const insets = useSafeAreaInsets()
  const { language, preference, setPreference, text } = useLanguage()
  const options: Array<[LanguagePreference, string, string]> = [
    ['auto', text.followSystem, tr(language, '中文系统使用中文，其他系统语言使用英文', 'Chinese system languages use Chinese; all others use English')],
    ['zh', text.chinese, tr(language, '始终使用中文', 'Always use Chinese')],
    ['en', text.english, tr(language, '始终使用英文', 'Always use English')],
  ]

  return (
    <View style={styles.screen}>
      <BackButton />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 74 }]}>
        <Text style={styles.title}>{text.settings}</Text>
        <Text style={styles.sectionTitle}>{text.language}</Text>
        <View style={styles.panel}>
          {options.map(([value, label, description], index) => {
            const selected = preference === value
            return (
              <Pressable
                key={value}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => void setPreference(value)}
                style={({ pressed }) => [
                  styles.option,
                  index > 0 && styles.optionSeparated,
                  pressed && styles.pressed,
                ]}>
                <View style={styles.optionCopy}>
                  <Text style={[styles.optionTitle, selected && styles.optionTitleSelected]}>{label}</Text>
                  <Text style={styles.optionBody}>{description}</Text>
                </View>
                <View style={[styles.radio, selected && styles.radioSelected]}>
                  {selected ? <FontAwesome name="check" size={12} color={palette.background} /> : null}
                </View>
              </Pressable>
            )
          })}
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.background },
  content: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  title: { ...typography.headline, color: palette.text, fontSize: 30, lineHeight: 38 },
  sectionTitle: {
    ...typography.label,
    color: palette.tungsten,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  panel: {
    overflow: 'hidden',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.line,
    backgroundColor: palette.bgSoft,
  },
  option: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  optionSeparated: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.line },
  optionCopy: { flex: 1, minWidth: 0 },
  optionTitle: { ...typography.title, color: palette.text, fontSize: 17, lineHeight: 23 },
  optionTitleSelected: { color: palette.amber },
  optionBody: { ...typography.caption, color: palette.muted, marginTop: 2 },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.faint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: { borderColor: palette.amber, backgroundColor: palette.amber },
  pressed: { opacity: 0.72 },
})
