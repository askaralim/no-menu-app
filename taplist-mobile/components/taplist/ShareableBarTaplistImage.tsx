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
  const generatedAtLabel = formatGeneratedAt(new Date())
  const isDense = drinks.length >= 13
  const drinkRows = chunkDrinks(drinks)

  useImperativeHandle(ref, () => ({
    capture: async () => {
      const uri = await shotRef.current?.capture?.()
      return uri ?? undefined
    },
  }))

  return (
    <ViewShot ref={shotRef} options={{ format: 'png', quality: 1 }} style={styles.shot}>
      <View style={styles.card} collapsable={false}>
        <View style={styles.header}>
          <Text style={styles.title} numberOfLines={2} ellipsizeMode="tail">
            {title}
          </Text>
          <Text style={styles.headerCount}>今晚 {drinks.length} 款在售</Text>
        </View>

        <View style={[styles.list, isDense && styles.listDense]}>
          {drinkRows.map((row) => (
            <View key={row[0].id} style={styles.beerGridRow}>
              {row.map((drink) => (
                <ExportBeerRow key={drink.id} drink={drink} isDense={isDense} />
              ))}
              {row.length === 1 ? <View style={styles.beerRowPlaceholder} /> : null}
            </View>
          ))}
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>No Menu · {generatedAtLabel}</Text>
        </View>
      </View>
    </ViewShot>
  )
})

function ExportBeerRow({ drink, isDense }: { drink: PublicDrinkRow; isDense: boolean }) {
  const servingOptions = displayServingOptions(drink.serving_options)
  const publicStatus = drink.public_status ? drink.public_status : null
  const isSoldOut = publicStatus === '售罄'
  const beerStyle = drink.beer?.beer_style ?? null
  const brewery = formatBreweryWithCollab(
    drink.beer?.brewery,
    drink.beer?.collab_breweries,
    drink.brand_name,
  )
  const abv = typeof drink.beer?.abv === 'number' ? `ABV ${drink.beer.abv}%` : null
  const priceLine = servingOptions.map(servingOptionLine).filter(Boolean).join(' / ')
  const tapNumber = drink.public_sort_order > 0 ? drink.public_sort_order : null

  return (
    <View style={[styles.beerRow, isDense && styles.beerRowDense, isSoldOut && styles.beerRowSoldOut]}>
      <View style={[styles.beerContent, isDense && styles.beerContentDense]}>
        <View style={styles.artworkWrap}>
          <BeerArtwork name={drink.name} source={drink.image_url} size={isDense ? 40 : 44} />
          {tapNumber ? (
            <View style={styles.tapNumberBadge}>
              <Text style={styles.tapNumberText}>{tapNumber}</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.beerMain}>
          <View style={styles.beerTitleRow}>
            <Text
              style={[styles.beerName, isDense && styles.beerNameDense]}
              numberOfLines={2}
              ellipsizeMode="tail">
              {drink.name}
            </Text>
            <View style={styles.beerRightRail}>
              {publicStatus ? (
                <View style={[styles.statusBadge, isDense && styles.statusBadgeDense, isSoldOut && styles.statusBadgeSoldOut]}>
                  <Text style={[styles.statusTag, isDense && styles.statusTagDense, isSoldOut && styles.statusTagSoldOut]}>
                    {publicStatus}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
          {beerStyle || brewery || abv || priceLine ? (
            <View style={styles.beerCopy}>
              {beerStyle ? (
                <Text style={styles.beerStyle} numberOfLines={1} ellipsizeMode="tail">
                  {beerStyle}
                </Text>
              ) : null}
              {brewery ? (
                <Text style={styles.brewery} numberOfLines={1} ellipsizeMode="tail">
                  {brewery}
                </Text>
              ) : null}
              {abv ? <Text style={styles.beerStats}>{abv}</Text> : null}
              {priceLine ? <Text style={styles.price}>{priceLine}</Text> : null}
            </View>
          ) : null}
        </View>
      </View>
    </View>
  )
}

function servingOptionLine(option: ReturnType<typeof displayServingOptions>[number]) {
  const parts = servingParts(option)
  return parts.length > 0 ? parts.join(' · ') : null
}

function chunkDrinks(drinks: PublicDrinkRow[]) {
  const rows: PublicDrinkRow[][] = []
  for (let index = 0; index < drinks.length; index += 2) {
    rows.push(drinks.slice(index, index + 2))
  }
  return rows
}

function formatGeneratedAt(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')

  return `${year}.${month}.${day} ${hour}:${minute}`
}

const styles = StyleSheet.create({
  shot: {
    backgroundColor: palette.background,
  },
  card: {
    width: 390,
    backgroundColor: palette.background,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md + 1,
    paddingTop: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: palette.hairline,
  },
  title: {
    ...typography.displayL,
    color: palette.text,
    fontSize: 36,
    lineHeight: 42,
    flex: 1,
    minWidth: 0,
  },
  headerCount: {
    ...typography.caption,
    color: palette.muted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
    textAlign: 'right',
    flexShrink: 0,
  },
  list: {
    paddingTop: spacing.sm,
    gap: 6,
  },
  listDense: {
    gap: 4,
  },
  beerGridRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'stretch',
  },
  footer: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: palette.hairline,
  },
  footerText: {
    ...typography.micro,
    color: palette.faint,
  },
  beerRow: {
    flex: 1,
    minWidth: 0,
    minHeight: 78,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(245,241,230,0.07)',
    backgroundColor: 'rgba(17,17,17,0.58)',
    overflow: 'hidden',
  },
  beerRowDense: {
    minHeight: 66,
  },
  beerRowPlaceholder: {
    flex: 1,
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
  beerContentDense: {
    gap: 5,
    padding: 4,
  },
  artworkWrap: {
    position: 'relative',
    flexShrink: 0,
  },
  tapNumberBadge: {
    position: 'absolute',
    top: 2,
    left: 2,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(8,8,8,0.82)',
    borderWidth: 1,
    borderColor: 'rgba(245,241,230,0.3)',
  },
  tapNumberText: {
    ...typography.micro,
    color: palette.text,
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  beerMain: {
    flex: 1,
    minWidth: 0,
  },
  beerTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 3,
  },
  beerName: {
    ...typography.title,
    color: palette.text,
    fontSize: 14,
    lineHeight: 17,
    flex: 1,
  },
  beerNameDense: {
    fontSize: 14,
    lineHeight: 17,
  },
  beerRightRail: {
    minWidth: 30,
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  beerCopy: {
    minWidth: 0,
  },
  beerStyle: {
    ...typography.caption,
    color: '#D6B069',
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  brewery: {
    ...typography.caption,
    color: palette.muted,
    fontSize: 9,
    lineHeight: 11,
    marginTop: 1,
  },
  beerStats: {
    ...typography.label,
    color: palette.faint,
    fontSize: 8,
    lineHeight: 10,
    marginTop: 1,
  },
  price: {
    ...typography.micro,
    color: palette.muted,
    fontSize: 8,
    lineHeight: 10,
    marginTop: 1,
  },
  statusBadge: {
    backgroundColor: 'rgba(159,122,61,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(159,122,61,0.24)',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusBadgeSoldOut: {
    backgroundColor: 'rgba(117,111,101,0.14)',
    borderColor: 'rgba(117,111,101,0.18)',
  },
  statusBadgeDense: {
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  statusTag: {
    ...typography.label,
    color: palette.tungsten,
    fontSize: 8,
    lineHeight: 10,
  },
  statusTagDense: {
    fontSize: 8,
    lineHeight: 10,
  },
  statusTagSoldOut: {
    color: palette.faint,
  },
})
