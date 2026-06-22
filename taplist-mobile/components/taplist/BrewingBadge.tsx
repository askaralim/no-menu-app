import { StyleSheet, Text, View } from 'react-native'

import { palette, spacing, typography } from '@/constants/design'
import type { BrewingType } from '@/lib/types'

const BREWING_LABELS: Record<BrewingType, string> = {
  house_brand: '自有品牌',
  on_site_brewery: '店内自酿',
}

type BrewingBadgeProps = {
  brewingType: BrewingType
  label?: string
  variant?: 'hero' | 'card'
}

export function BrewingBadge({ brewingType, label, variant = 'hero' }: BrewingBadgeProps) {
  const displayLabel = label ?? BREWING_LABELS[brewingType]
  const isOnSite = brewingType === 'on_site_brewery'

  return (
    <View
      style={[
        styles.badge,
        variant === 'card' && styles.badgeCard,
        isOnSite ? styles.badgeOnSite : styles.badgeHouseBrand,
        variant === 'card' && (isOnSite ? styles.badgeCardOnSite : styles.badgeCardHouseBrand),
      ]}>
      {isOnSite ? <View style={styles.onSiteDot} /> : null}
      <Text
        style={[
          styles.text,
          variant === 'card' && styles.textCard,
          isOnSite ? styles.textOnSite : styles.textHouseBrand,
        ]}>
        {displayLabel}
      </Text>
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
  if (!brewingType) return null
  return (
    <BrewingBadge
      brewingType={brewingType}
      label={brewingLabel ?? BREWING_LABELS[brewingType]}
      variant={variant}
    />
  )
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    borderRadius: 4,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    marginTop: spacing.sm,
  },
  badgeOnSite: {
    borderColor: 'rgba(211,154,69,0.62)',
    backgroundColor: 'rgba(211,154,69,0.16)',
  },
  badgeHouseBrand: {
    borderColor: 'rgba(198,168,117,0.28)',
    backgroundColor: 'rgba(17,17,17,0.36)',
  },
  badgeCard: {
    marginTop: spacing.xxs,
    marginBottom: spacing.xxs,
    maxWidth: '100%',
  },
  badgeCardOnSite: {
    backgroundColor: 'rgba(0,0,0,0.52)',
    borderColor: 'rgba(211,154,69,0.55)',
  },
  badgeCardHouseBrand: {
    backgroundColor: 'rgba(0,0,0,0.42)',
    borderColor: 'rgba(198,168,117,0.24)',
  },
  onSiteDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: palette.amber,
  },
  text: {
    ...typography.label,
    fontSize: 10,
    lineHeight: 13,
    letterSpacing: 1.2,
  },
  textOnSite: {
    color: palette.amber,
    letterSpacing: 1.6,
  },
  textHouseBrand: {
    color: palette.tungsten,
    letterSpacing: 1,
  },
  textCard: {
    fontSize: 10,
  },
})
