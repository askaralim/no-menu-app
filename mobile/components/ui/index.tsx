import React from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  StyleProp,
  ViewStyle,
  TextStyle,
  KeyboardAvoidingView,
  Platform,
  TextInputProps,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { THEME, SPACING, RADIUS, FONT, LAYOUT } from '../../lib/theme'

/** Full-screen dark background with consistent padding. */
export function Screen({
  children,
  scroll,
  padded = true,
  keyboard,
  contentStyle,
}: {
  children: React.ReactNode
  scroll?: boolean
  padded?: boolean
  keyboard?: boolean
  contentStyle?: StyleProp<ViewStyle>
}) {
  const pad = padded
    ? {
        paddingHorizontal: LAYOUT.pagePad,
        paddingTop: LAYOUT.heroPadTop,
        paddingBottom: SPACING.xl,
      }
    : null
  const body = scroll ? (
    <ScrollView
      style={s.flex}
      contentContainerStyle={[pad, { paddingBottom: 48 }, contentStyle]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[s.flex, pad, contentStyle]}>{children}</View>
  )

  if (keyboard) {
    return (
      <SafeAreaView style={s.screen} edges={['top']}>
        <KeyboardAvoidingView
          style={s.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {body}
        </KeyboardAvoidingView>
      </SafeAreaView>
    )
  }
  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      {body}
    </SafeAreaView>
  )
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return <Text style={s.eyebrow}>{children}</Text>
}

export function Title({ children }: { children: React.ReactNode }) {
  return <Text style={s.title}>{children}</Text>
}

export function SectionLabel({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[s.section, style]}>{children}</Text>
}

export function Card({
  children,
  style,
  onPress,
}: {
  children: React.ReactNode
  style?: StyleProp<ViewStyle>
  onPress?: () => void
}) {
  if (onPress) {
    return (
      <TouchableOpacity activeOpacity={0.8} onPress={onPress} style={[s.card, style]}>
        {children}
      </TouchableOpacity>
    )
  }
  return <View style={[s.card, style]}>{children}</View>
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  icon,
  style,
}: {
  label: string
  onPress: () => void
  variant?: 'primary' | 'secondary' | 'danger'
  loading?: boolean
  disabled?: boolean
  icon?: keyof typeof Ionicons.glyphMap
  style?: StyleProp<ViewStyle>
}) {
  const isPrimary = variant === 'primary'
  const isDanger = variant === 'danger'
  const bg = isPrimary ? THEME.gold : 'transparent'
  const borderColor = isDanger ? THEME.danger : isPrimary ? THEME.gold : THEME.border
  const fg = isPrimary ? THEME.onGold : isDanger ? THEME.danger : THEME.text
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      disabled={disabled || loading}
      style={[
        s.button,
        { backgroundColor: bg, borderColor },
        (disabled || loading) && { opacity: 0.5 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={s.buttonInner}>
          {icon ? <Ionicons name={icon} size={18} color={fg} /> : null}
          <Text style={[s.buttonText, { color: fg }]}>{label}</Text>
        </View>
      )}
    </TouchableOpacity>
  )
}

export function Chip({
  label,
  active,
  onPress,
}: {
  label: string
  active?: boolean
  onPress?: () => void
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      disabled={!onPress}
      style={[s.chip, active && s.chipActive]}
    >
      <Text style={[s.chipText, active && s.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  )
}

export function SegmentedControl<T extends string>({
  segments,
  value,
  onChange,
}: {
  segments: { key: T; label: string }[]
  value: T
  onChange: (key: T) => void
}) {
  return (
    <View style={s.segmented}>
      {segments.map((seg) => {
        const active = seg.key === value
        return (
          <TouchableOpacity
            key={seg.key}
            activeOpacity={0.8}
            onPress={() => onChange(seg.key)}
            style={[s.segment, active && s.segmentActive]}
          >
            <Text style={[s.segmentText, active && s.segmentTextActive]}>{seg.label}</Text>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

export function Field({
  label,
  style,
  ...inputProps
}: { label?: string; style?: StyleProp<ViewStyle> } & TextInputProps) {
  return (
    <View style={[{ marginBottom: SPACING.lg }, style]}>
      {label ? <Text style={s.fieldLabel}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={THEME.faint}
        style={s.input}
        {...inputProps}
      />
    </View>
  )
}

export function Row({
  label,
  children,
  style,
}: {
  label: string
  children?: React.ReactNode
  style?: StyleProp<ViewStyle>
}) {
  return (
    <View style={[s.row, style]}>
      <Text style={s.rowLabel}>{label}</Text>
      {children}
    </View>
  )
}

export function EmptyState({
  icon = 'wine-outline',
  text,
  action,
}: {
  icon?: keyof typeof Ionicons.glyphMap
  text: string
  action?: React.ReactNode
}) {
  return (
    <View style={s.empty}>
      <Ionicons name={icon} size={44} color={THEME.faint} />
      <Text style={s.emptyText}>{text}</Text>
      {action}
    </View>
  )
}

export function Loading() {
  return (
    <View style={s.empty}>
      <ActivityIndicator size="large" color={THEME.gold} />
    </View>
  )
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: THEME.background },
  eyebrow: { ...FONT.eyebrow, color: THEME.gold, textTransform: 'uppercase', marginBottom: SPACING.xs },
  title: { ...FONT.title, color: THEME.text, marginBottom: SPACING.md },
  section: {
    ...FONT.section,
    color: THEME.muted,
    textTransform: 'uppercase',
    marginBottom: SPACING.sm,
    marginTop: SPACING.lg,
  },
  card: {
    backgroundColor: THEME.card,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: THEME.borderFaint,
    padding: SPACING.lg,
  },
  button: {
    borderRadius: RADIUS.md,
    borderWidth: 1,
    paddingVertical: SPACING.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonInner: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  buttonText: { fontSize: 16, fontWeight: '700' },
  chip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: THEME.border,
    backgroundColor: 'transparent',
  },
  chipActive: { borderColor: THEME.goldBorder, backgroundColor: THEME.goldFill },
  chipText: { color: THEME.muted, fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: THEME.gold },
  segmented: {
    flexDirection: 'row',
    backgroundColor: THEME.surfaceMuted,
    borderRadius: RADIUS.md,
    padding: 4,
    gap: 4,
  },
  segment: {
    flex: 1,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
  },
  segmentActive: { backgroundColor: THEME.goldFill, borderWidth: 1, borderColor: THEME.goldBorder },
  segmentText: { color: THEME.muted, fontSize: 14, fontWeight: '600' },
  segmentTextActive: { color: THEME.gold },
  fieldLabel: { color: THEME.muted, fontSize: 13, fontWeight: '600', marginBottom: SPACING.sm },
  input: {
    backgroundColor: THEME.card,
    color: THEME.text,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: THEME.borderFaint,
    padding: SPACING.lg,
    fontSize: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.md,
  },
  rowLabel: { color: THEME.text, fontSize: 15, fontWeight: '500' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: SPACING.xl, gap: SPACING.md },
  emptyText: { color: THEME.muted, fontSize: 15, textAlign: 'center', lineHeight: 21 },
})
