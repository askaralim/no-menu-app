import { StyleSheet, Text, View } from 'react-native'

import { palette, spacing, typography } from '@/constants/design'
import type { BrewingType } from '@/lib/types'

type BrewingBadgeProps = {
  label: string
  variant?: 'hero' | 'card'
}

export function BrewingBadge({ label, variant = 'hero' }: BrewingBadgeProps) {
  return (
    <View style={[styles.badge, variant === 'card' && styles.badgeCard]}>
      <Text style={[styles.text, variant === 'card' && styles.textCard]}>{label}</Text>
    </View>
  )
}

type BrewingBadgeFromTypeProps = {
  brewingType?: BrewingType | null
  brewingLabel?: string | null
  variant?: 'hero' | 'card'
}

export function BrewingBadgeFromType({
  brewingType,
  brewingLabel,
  variant = 'hero',
}: BrewingBadgeFromTypeProps) {
  if (!brewingType || !brewingLabel) return null
  return <BrewingBadge label={brewingLabel} variant={variant} />
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(212,168,75,0.42)',
    backgroundColor: 'rgba(212,168,75,0.08)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    marginTop: spacing.sm,
  },
  badgeCard: {
    alignSelf: 'flex-start',
    marginTop: spacing.xxs,
    marginBottom: spacing.xxs,
    maxWidth: '100%',
    backgroundColor: 'rgba(0,0,0,0.42)',
    borderColor: 'rgba(212,168,75,0.36)',
  },
  text: {
    ...typography.label,
    fontSize: 10,
    lineHeight: 13,
    letterSpacing: 1.2,
    color: palette.amber,
  },
  textCard: {
    fontSize: 10,
  },
})
