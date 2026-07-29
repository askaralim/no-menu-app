import { LinearGradient } from 'expo-linear-gradient'
import { Link } from 'expo-router'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { CachedImage } from '@/components/taplist/CachedImage'
import {
  listCapsuleCardStyles,
  listCapsuleMetaStyle,
  listCapsuleSecondaryStyle,
  listCapsuleTitleStyle,
} from '@/components/taplist/listCapsuleCardStyle'
import {
  BEER_CARD_PANEL_COLORS,
  BEER_CARD_PANEL_LOCATIONS,
} from '@/components/taplist/railCardStyle'
import { palette, spacing, typography } from '@/constants/design'
import { displayServingOptions, servingParts } from '@/lib/formatTaplist'
import { trackEvent } from '@/lib/analytics'
import type { PublicDrinkRow } from '@/lib/types'

type BeerListCardProps = {
  drink: PublicDrinkRow
  slug: string
  tenantId: string
}

export function BeerListCard({ drink, slug, tenantId }: BeerListCardProps) {
  const hasArtwork = Boolean(drink.image_url)
  const publicStatus = drink.public_status || null
  const isSoldOut = publicStatus === '售罄'
  const isNew = publicStatus === '上新'
  const brewery = drink.beer?.brewery ?? drink.brand_name
  const style = drink.beer?.beer_style ?? null
  const metaLine = [brewery, style].filter(Boolean).join(' · ')
  const abv = typeof drink.beer?.abv === 'number' ? `ABV ${drink.beer.abv}%` : null
  const servingOptions = displayServingOptions(drink.serving_options)

  return (
    <Link href={`/bar/${slug}/beer/${drink.id}`} asChild>
      <Pressable
        onPress={() =>
          trackEvent('beer_opened', {
            tenant_id: tenantId,
            drink_id: drink.id,
            source: 'bar_taplist',
          })
        }
        style={({ pressed }) => [
          listCapsuleCardStyles.card,
          isSoldOut && listCapsuleCardStyles.cardSoldOut,
          pressed && listCapsuleCardStyles.cardPressed,
        ]}>
        <View style={listCapsuleCardStyles.cardInner}>
          {hasArtwork ? (
            <View style={listCapsuleCardStyles.artworkFrame}>
              <CachedImage
                source={drink.image_url as string}
                style={listCapsuleCardStyles.artwork}
              />
            </View>
          ) : (
            <View style={listCapsuleCardStyles.artworkSpacer} />
          )}

          <View style={listCapsuleCardStyles.panel}>
            <LinearGradient
              colors={BEER_CARD_PANEL_COLORS}
              locations={BEER_CARD_PANEL_LOCATIONS}
              style={StyleSheet.absoluteFill}
            />

            <View style={listCapsuleCardStyles.panelContent}>
              <View style={styles.nameRow}>
                <Text style={[listCapsuleTitleStyle, { flex: 1 }]} numberOfLines={2} ellipsizeMode="tail">
                  {drink.name}
                </Text>
                {publicStatus ? (
                  <View
                    style={[
                      styles.statusBadge,
                      isNew && styles.statusBadgeNew,
                      isSoldOut && styles.statusBadgeSoldOut,
                      !isNew && !isSoldOut && styles.statusBadgeDefault,
                    ]}>
                    <Text
                      style={[
                        styles.statusTag,
                        isNew && styles.statusTagNew,
                        isSoldOut && styles.statusTagSoldOut,
                        !isNew && !isSoldOut && styles.statusTagDefault,
                      ]}>
                      {publicStatus}
                    </Text>
                  </View>
                ) : null}
              </View>

              {metaLine ? (
                <Text style={listCapsuleMetaStyle} numberOfLines={1} ellipsizeMode="tail">
                  {metaLine}
                </Text>
              ) : null}

              {abv ? <Text style={listCapsuleSecondaryStyle}>{abv}</Text> : null}

              {servingOptions.length > 0 ? (
                <View style={styles.servingRow}>
                  {servingOptions.map((option) => {
                    const line = servingParts(option).join(' · ')
                    if (!line) return null
                    return (
                      <View key={option.id} style={styles.servingPill}>
                        <Text style={styles.servingPillText}>{line}</Text>
                      </View>
                    )
                  })}
                </View>
              ) : null}
            </View>
          </View>
        </View>
        <View pointerEvents="none" style={listCapsuleCardStyles.borderOverlay} />
      </Pressable>
    </Link>
  )
}

const styles = StyleSheet.create({
  nameRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  statusBadge: {
    flexShrink: 0,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  statusBadgeNew: {
    backgroundColor: 'rgba(8,8,8,0.28)',
    borderColor: 'rgba(214,176,105,0.55)',
  },
  statusBadgeDefault: {
    backgroundColor: 'rgba(8,8,8,0.28)',
    borderColor: 'rgba(214,176,105,0.28)',
  },
  statusBadgeSoldOut: {
    backgroundColor: 'rgba(8,8,8,0.24)',
    borderColor: 'rgba(255,255,255,0.15)',
  },
  statusTag: {
    ...typography.label,
    fontSize: 9,
    lineHeight: 11,
    letterSpacing: 1,
  },
  statusTagNew: {
    color: '#D6B069',
  },
  statusTagDefault: {
    color: 'rgba(214,176,105,0.78)',
  },
  statusTagSoldOut: {
    color: 'rgba(255,255,255,0.35)',
  },
  servingRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: spacing.xxs,
  },
  servingPill: {
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(214,176,105,0.16)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  servingPillText: {
    ...typography.micro,
    color: 'rgba(245,238,225,0.78)',
    fontSize: 11,
    lineHeight: 14,
  },
})
