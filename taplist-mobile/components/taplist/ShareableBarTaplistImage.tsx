import FontAwesome from '@expo/vector-icons/FontAwesome'
import { forwardRef, useImperativeHandle, useRef } from 'react'
import { Platform, StyleSheet, Text, View } from 'react-native'
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

const PAPER_MENU_EXPORT_TENANT_IDS = new Set(['4d1da7d9-8b21-4706-b535-355b9ff79388'])

const monoFont = Platform.select({
  ios: 'Courier',
  android: 'monospace',
  default: 'Courier, monospace',
})

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
      {PAPER_MENU_EXPORT_TENANT_IDS.has(tenant.id) ? (
        <PaperMenuExport tenant={tenant} drinks={drinks} generatedAtLabel={generatedAtLabel} />
      ) : (
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
      )}
    </ViewShot>
  )
})

function PaperMenuExport({
  tenant,
  drinks,
  generatedAtLabel,
}: {
  tenant: PublicTenantDetail
  drinks: PublicDrinkRow[]
  generatedAtLabel: string
}) {
  const title = tenant.display_name || tenant.name
  const midIndex = Math.ceil(drinks.length / 2)
  const leftColumn = drinks.slice(0, midIndex)
  const rightColumn = drinks.slice(midIndex)

  return (
    <View style={styles.paperCard} collapsable={false}>
      <View style={styles.paperHeader}>
        <Text style={styles.paperTitle}>{title}</Text>
      </View>

      <View style={styles.paperColumns}>
        <View style={styles.paperColumn}>
          {leftColumn.map((drink, index) => (
            <PaperMenuRow key={drink.id} drink={drink} index={index} />
          ))}
        </View>
        <View style={styles.paperCenterRule} />
        <View style={styles.paperColumn}>
          {rightColumn.map((drink, index) => (
            <PaperMenuRow key={drink.id} drink={drink} index={index + midIndex} />
          ))}
        </View>
      </View>

      <View style={styles.paperFooter}>
        <Text style={styles.paperFooterText}>
          Created by <Text style={styles.paperFooterBrand}>No Menu</Text> · {generatedAtLabel}
        </Text>
        <Text style={styles.paperFooterText}>以门店实际供应为准</Text>
      </View>
    </View>
  )
}

function PaperMenuRow({ drink, index }: { drink: PublicDrinkRow; index: number }) {
  const brewery = formatBreweryWithCollab(drink.beer?.brewery, drink.beer?.collab_breweries, drink.brand_name)
  const style = drink.beer?.beer_style
  const abv = typeof drink.beer?.abv === 'number' ? `ABV:${drink.beer.abv}%` : null
  const price = paperPriceLine(drink)

  return (
    <View style={styles.paperItem}>
      <Text style={styles.paperIndex}>{index + 1}</Text>
      <View style={styles.paperArtwork}>
        {drink.image_url ? (
          <BeerArtwork name={drink.name} source={drink.image_url} size={34} />
        ) : null}
      </View>
      <View style={styles.paperItemBody}>
        <View style={styles.paperTopRow}>
          <View style={styles.paperNameBlock}>
            <Text style={styles.paperBeerName} numberOfLines={1}>
              {drink.name}
            </Text>
            {brewery ? (
              <Text style={styles.paperBrewery} numberOfLines={1}>
                {brewery}
              </Text>
            ) : null}
          </View>
          {style ? (
            <>
              <View style={styles.paperStyleRule} />
              <Text
                style={styles.paperStyleLabel}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.72}>
                {style}
              </Text>
            </>
          ) : null}
        </View>
        {(abv || price) ? (
          <View style={styles.paperStatsRow}>
            {abv ? <Text style={styles.paperAbv}>{abv}</Text> : <View />}
            {price ? <Text style={styles.paperPrice}>{price}</Text> : null}
          </View>
        ) : null}
      </View>
    </View>
  )
}

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

function paperPriceLine(drink: PublicDrinkRow) {
  const servingOptions = displayServingOptions(drink.serving_options)
  const servingOption = servingOptions.find((option) => option.is_default) ?? servingOptions[0]

  if (!servingOption || servingOption.price == null || servingOption.price <= 0) return null
  return `${formatPrice(servingOption.price)}元`
}

function formatPrice(price: number) {
  return Number.isInteger(price) ? String(price) : price.toFixed(1)
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
  paperCard: {
    width: 780,
    backgroundColor: '#FBF9F4',
    paddingHorizontal: 40,
    paddingBottom: 30,
    paddingTop: 38,
  },
  paperHeader: {
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#222222',
    paddingBottom: 16,
    marginBottom: 24,
  },
  paperTitle: {
    color: '#1A1A1A',
    fontFamily: monoFont,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '800',
    letterSpacing: 5,
  },
  paperSubtitle: {
    color: '#555555',
    fontFamily: monoFont,
    fontSize: 13,
    lineHeight: 17,
    letterSpacing: 1,
    marginTop: 4,
  },
  paperColumns: {
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'space-between',
    gap: 24,
    marginVertical: 8,
  },
  paperColumn: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'space-between',
  },
  paperCenterRule: {
    width: 1,
    height: '92%',
    alignSelf: 'center',
    backgroundColor: '#DCD8CE',
  },
  paperItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginVertical: 8,
  },
  paperIndex: {
    width: 26,
    color: '#8A8477',
    fontFamily: monoFont,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
    marginTop: 2,
  },
  paperArtwork: {
    width: 34,
    height: 34,
    marginRight: 10,
    marginTop: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  paperItemBody: {
    flex: 1,
    minWidth: 0,
    borderBottomWidth: 0.5,
    borderBottomColor: '#E8E3D5',
    paddingBottom: 8,
  },
  paperTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
  },
  paperNameBlock: {
    flexShrink: 1,
    maxWidth: '50%',
    minWidth: 0,
  },
  paperBeerName: {
    ...typography.body,
    color: '#111111',
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '700',
  },
  paperBrewery: {
    ...typography.caption,
    color: '#666666',
    fontSize: 11,
    lineHeight: 15,
    marginTop: 2,
  },
  paperStyleRule: {
    flex: 1,
    height: 0.5,
    minWidth: 18,
    backgroundColor: '#D2CDBE',
    marginHorizontal: 8,
    opacity: 0.7,
  },
  paperStyleLabel: {
    color: '#555555',
    fontFamily: monoFont,
    fontSize: 10,
    lineHeight: 14,
    letterSpacing: 1.1,
    maxWidth: 174,
    textAlign: 'right',
    textTransform: 'uppercase',
  },
  paperStatsRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  paperAbv: {
    color: '#555555',
    fontFamily: monoFont,
    fontSize: 11,
    lineHeight: 15,
  },
  paperPrice: {
    color: '#111111',
    fontFamily: monoFont,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
  },
  paperFooter: {
    marginTop: 10,
    borderTopWidth: 0.5,
    borderTopColor: '#D2CDBE',
    paddingTop: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  paperFooterText: {
    color: '#8A8477',
    fontFamily: monoFont,
    fontSize: 11,
    lineHeight: 15,
  },
  paperFooterBrand: {
    color: '#3B3832',
    fontWeight: '700',
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
