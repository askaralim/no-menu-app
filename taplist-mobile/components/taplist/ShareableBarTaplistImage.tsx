import FontAwesome from '@expo/vector-icons/FontAwesome'
import { forwardRef, useImperativeHandle, useRef } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import ViewShot from 'react-native-view-shot'

import { BeerArtwork } from '@/components/taplist/BeerArtwork'
import { palette, spacing, typography } from '@/constants/design'
import { displayServingOptions, formatBreweryWithCollab, servingParts } from '@/lib/formatTaplist'
import type { PublicDrinkRow, PublicTenantDetail } from '@/lib/types'

export type ShareableBarTaplistImageHandle = {
  capture: () => Promise<string | undefined>
}

type ShareableBarTaplistImageProps = {
  tenant: PublicTenantDetail
  drinks: PublicDrinkRow[]
}

export const ShareableBarTaplistImage = forwardRef<
  ShareableBarTaplistImageHandle,
  ShareableBarTaplistImageProps
>(function ShareableBarTaplistImage({ tenant, drinks }, ref) {
  const shotRef = useRef<ViewShot>(null)
  const title = tenant.display_name || tenant.name
  const addressLine = [tenant.district, tenant.address].filter(Boolean).join(' · ')
  const generatedAtLabel = formatGeneratedAt(new Date())

  useImperativeHandle(ref, () => ({
    capture: async () => {
      const uri = await shotRef.current?.capture?.()
      return uri ?? undefined
    },
  }))

  return (
    <ViewShot ref={shotRef} options={{ format: 'png', quality: 1 }}>
      <View style={styles.card} collapsable={false}>
        <View style={styles.header}>
          <Text style={styles.kicker}>NO MENU</Text>
          <Text style={styles.title}>{title}</Text>
          {addressLine ? (
            <View style={styles.headerMetaRow}>
              <FontAwesome name="map-marker" size={12} color={palette.muted} />
              <Text style={styles.headerMetaText}>{addressLine}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.summaryRow}>
          <Text style={styles.summaryText}>今晚 {drinks.length} 款在售</Text>
          <Text style={styles.summaryAccent}>以门店实际供应为准</Text>
        </View>

        <View style={styles.list}>
          {drinks.map((drink, index) => (
            <ExportBeerRow key={drink.id} drink={drink} isLast={index === drinks.length - 1} />
          ))}
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>No Menu · 酒单创建时间 {generatedAtLabel}</Text>
        </View>
      </View>
    </ViewShot>
  )
})

function ExportBeerRow({ drink, isLast }: { drink: PublicDrinkRow; isLast: boolean }) {
  const servingOptions = displayServingOptions(drink.serving_options)
  const publicStatus = drink.public_status ? drink.public_status : null
  const isSoldOut = publicStatus === '售罄'
  const breweryStyle = beerInfoLine(drink)
  const abvIbu = beerStatsLine(drink)
  const showServingOptions = servingOptions.length > 1

  return (
    <View style={[styles.beerRow, !isLast && styles.beerRowSpacing, isSoldOut && styles.beerRowSoldOut]}>
      <View style={styles.beerContent}>
        {drink.image_url ? (
          <BeerArtwork name={drink.name} source={drink.image_url} size={72} />
        ) : (
          <View style={styles.beerArtworkSpacer} />
        )}
        <View style={styles.beerMain}>
          <View style={styles.beerTitleRow}>
            <Text style={styles.beerName}>{drink.name}</Text>
            <View style={styles.beerRightRail}>
              {publicStatus ? (
                <View style={[styles.statusBadge, isSoldOut && styles.statusBadgeSoldOut]}>
                  <Text style={[styles.statusTag, isSoldOut && styles.statusTagSoldOut]}>{publicStatus}</Text>
                </View>
              ) : null}
            </View>
          </View>
          {breweryStyle || abvIbu ? (
            <View style={styles.beerCopy}>
              {breweryStyle ? <Text style={styles.beerMeta}>{breweryStyle}</Text> : null}
              {abvIbu ? <Text style={styles.beerStats}>{abvIbu}</Text> : null}
            </View>
          ) : null}
          {showServingOptions ? (
            <View style={styles.servingOptions}>
              {servingOptions.map((option) => {
                const line = servingOptionLine(option)
                if (!line) return null
                return (
                  <View key={option.id} style={styles.servingOptionTag}>
                    <Text style={styles.servingOptionText}>{line}</Text>
                  </View>
                )
              })}
            </View>
          ) : null}
        </View>
      </View>
    </View>
  )
}

function beerInfoLine(drink: PublicDrinkRow) {
  return [
    formatBreweryWithCollab(drink.beer?.brewery, drink.beer?.collab_breweries, drink.brand_name),
    drink.beer?.beer_style,
  ]
    .filter(Boolean)
    .join(' · ')
}

function beerStatsLine(drink: PublicDrinkRow) {
  return [
    typeof drink.beer?.abv === 'number' ? `ABV ${drink.beer.abv}%` : null,
    typeof drink.beer?.ibu === 'number' ? `IBU ${drink.beer.ibu}` : null,
  ]
    .filter(Boolean)
    .join(' · ')
}

function servingOptionLine(option: ReturnType<typeof displayServingOptions>[number]) {
  const parts = servingParts(option)
  return parts.length > 0 ? parts.join(' · ') : null
}

function formatGeneratedAt(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')

  return `${year}/${month}/${day} ${hour}:${minute}`
}

const styles = StyleSheet.create({
  card: {
    width: 390,
    backgroundColor: palette.background,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    paddingTop: 36,
  },
  header: {
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: palette.hairline,
  },
  kicker: {
    ...typography.label,
    color: palette.tungsten,
    fontSize: 10,
    lineHeight: 14,
    marginBottom: spacing.xs,
  },
  title: {
    ...typography.displayL,
    color: palette.text,
    fontSize: 44,
    lineHeight: 50,
  },
  headerMetaRow: {
    marginTop: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  headerMetaText: {
    ...typography.caption,
    color: palette.muted,
    flex: 1,
  },
  summaryRow: {
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: palette.hairline,
    gap: spacing.xxs,
  },
  summaryText: {
    ...typography.title,
    color: palette.text,
  },
  summaryAccent: {
    ...typography.micro,
    color: palette.faint,
  },
  list: {
    paddingTop: spacing.sm,
  },
  footer: {
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: palette.hairline,
  },
  footerText: {
    ...typography.micro,
    color: palette.faint,
  },
  beerRow: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(245,241,230,0.07)',
    backgroundColor: 'rgba(17,17,17,0.58)',
    overflow: 'hidden',
  },
  beerRowSpacing: {
    marginBottom: spacing.xs,
  },
  beerRowSoldOut: {
    opacity: 0.58,
  },
  beerContent: {
    flexDirection: 'row',
    gap: spacing.xs,
    alignItems: 'flex-start',
    padding: spacing.xs,
  },
  beerArtworkSpacer: {
    width: 72,
  },
  beerMain: {
    flex: 1,
    minWidth: 0,
  },
  beerTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  beerName: {
    ...typography.displayL,
    color: palette.text,
    fontSize: 24,
    lineHeight: 28,
    flex: 1,
  },
  beerRightRail: {
    minWidth: 50,
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  beerCopy: {
    minWidth: 0,
  },
  beerMeta: {
    ...typography.caption,
    color: palette.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: spacing.xxs,
  },
  beerStats: {
    ...typography.label,
    color: palette.faint,
    fontSize: 9,
    lineHeight: 12,
    marginTop: spacing.xxs,
  },
  statusBadge: {
    backgroundColor: 'rgba(159,122,61,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(159,122,61,0.24)',
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusBadgeSoldOut: {
    backgroundColor: 'rgba(117,111,101,0.14)',
    borderColor: 'rgba(117,111,101,0.18)',
  },
  statusTag: {
    ...typography.label,
    color: palette.tungsten,
    fontSize: 10,
    lineHeight: 12,
  },
  statusTagSoldOut: {
    color: palette.faint,
  },
  servingOptions: {
    marginTop: spacing.xs,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xxs,
  },
  servingOptionTag: {
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(245,241,232,0.08)',
    backgroundColor: 'rgba(17,17,17,0.28)',
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  servingOptionText: {
    ...typography.micro,
    color: palette.muted,
    fontSize: 10,
    lineHeight: 13,
  },
})
