import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { LinearGradient } from 'expo-linear-gradient'

import { RailVenueBadge } from '@/components/taplist/RailVenueBadge'
import { CachedImageBackground } from '@/components/taplist/CachedImage'
import {
  RAIL_CARD_HEIGHT,
  RAIL_CARD_IMAGE_BORDER,
  RAIL_CARD_RADIUS,
  RAIL_CARD_WIDTH,
  RAIL_IMAGE_SCRIM_COLORS,
  RAIL_IMAGE_SCRIM_LOCATIONS,
  RAIL_TEXT_ONLY_SCRIM_COLORS,
  RAIL_TEXT_ONLY_SCRIM_LOCATIONS,
  RAIL_TEXT_SHADOW,
  railCardBodyStyle,
  railCardScrimStyle,
} from '@/components/taplist/railCardStyle'
import { palette, spacing, typography } from '@/constants/design'
import { formatBreweryWithCollab } from '@/lib/formatTaplist'
import { trackEvent, type AnalyticsSource } from '@/lib/analytics'
import type { PublicNewTapRow } from '@/lib/types'

export function NewTapRailCard({
  drink,
  source = 'direct',
}: {
  drink: PublicNewTapRow
  source?: AnalyticsSource
}) {
  const router = useRouter()
  const typeLine = drink.beer_style ?? null
  const brandLine = formatBreweryWithCollab(drink.brewery, drink.collab_breweries, drink.brand_name)
  const accessibilityLabel = [drink.name, typeLine, brandLine, `@ ${drink.tenant_display_name}`]
    .filter(Boolean)
    .join('，')
  const hasImage = Boolean(drink.image_url)

  const textBlock = (
    <View style={styles.newTapCardBody}>
      <Text style={styles.newTapDrinkName} numberOfLines={2} ellipsizeMode="tail">
        {drink.name}
      </Text>
      {typeLine ? (
        <Text
          style={[styles.newTapMeta, hasImage && styles.newTapMetaOnImage]}
          numberOfLines={1}
          ellipsizeMode="tail">
          {typeLine}
        </Text>
      ) : null}
      {brandLine ? (
        <Text
          style={[styles.newTapBrand, hasImage && styles.newTapBrandOnImage]}
          numberOfLines={1}
          ellipsizeMode="tail">
          {brandLine}
        </Text>
      ) : null}
    </View>
  )

  const venueBadge = <RailVenueBadge name={drink.tenant_display_name} />

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={() => {
        trackEvent('beer_opened', {
          tenant_id: drink.tenant_id,
          drink_id: drink.drink_id,
          source,
        })
        router.push(`/bar/${drink.tenant_slug}/beer/${drink.drink_id}`)
      }}
      style={({ pressed }) => [
        styles.newTapCard,
        hasImage && styles.newTapCardImage,
        pressed && styles.newTapCardPressed,
      ]}>
      {hasImage ? (
        <CachedImageBackground
          source={drink.image_url as string}
          style={styles.newTapImageFill}
          imageStyle={styles.newTapImageRadius}>
          <LinearGradient
            colors={RAIL_IMAGE_SCRIM_COLORS}
            locations={RAIL_IMAGE_SCRIM_LOCATIONS}
            style={styles.newTapImageScrim}>
            {textBlock}
            {venueBadge}
          </LinearGradient>
        </CachedImageBackground>
      ) : (
        <LinearGradient
          colors={RAIL_TEXT_ONLY_SCRIM_COLORS}
          locations={RAIL_TEXT_ONLY_SCRIM_LOCATIONS}
          style={styles.newTapCardContent}>
          {textBlock}
          {venueBadge}
        </LinearGradient>
      )}
      <View pointerEvents="none" style={styles.railBorderOverlay} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  newTapCard: {
    width: RAIL_CARD_WIDTH,
    minWidth: RAIL_CARD_WIDTH,
    height: RAIL_CARD_HEIGHT,
    borderRadius: RAIL_CARD_RADIUS,
    backgroundColor: palette.bgSoft,
    overflow: 'hidden',
    position: 'relative',
    flexShrink: 0,
  },
  newTapCardImage: {
    backgroundColor: palette.panelElevated,
  },
  railBorderOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: RAIL_CARD_RADIUS,
    borderWidth: 1,
    borderColor: RAIL_CARD_IMAGE_BORDER,
  },
  newTapImageFill: {
    flex: 1,
    width: '100%',
  },
  newTapImageRadius: {
    borderRadius: RAIL_CARD_RADIUS,
  },
  newTapImageScrim: {
    ...railCardScrimStyle,
  },
  newTapCardContent: {
    ...railCardScrimStyle,
  },
  newTapCardPressed: {
    opacity: 0.78,
  },
  newTapCardBody: {
    ...railCardBodyStyle,
  },
  newTapDrinkName: {
    ...typography.caption,
    color: palette.text,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '600',
    maxWidth: '100%',
    ...RAIL_TEXT_SHADOW,
  },
  newTapMeta: {
    ...typography.micro,
    color: palette.muted,
    fontSize: 11,
    lineHeight: 15,
    marginTop: spacing.xxs,
    marginBottom: 2,
    maxWidth: '100%',
  },
  newTapBrand: {
    ...typography.micro,
    color: palette.faint,
    fontSize: 11,
    lineHeight: 15,
    maxWidth: '100%',
  },
  newTapMetaOnImage: {
    color: 'rgba(245,241,232,0.86)',
    ...RAIL_TEXT_SHADOW,
  },
  newTapBrandOnImage: {
    color: 'rgba(245,241,232,0.72)',
    ...RAIL_TEXT_SHADOW,
  },
})
