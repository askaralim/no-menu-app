import FontAwesome from '@expo/vector-icons/FontAwesome'
import { forwardRef, useImperativeHandle, useRef } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import ViewShot from 'react-native-view-shot'

import { BeerArtwork } from '@/components/taplist/BeerArtwork'
import { palette, spacing, typography } from '@/constants/design'
import { displayServingOptions, servingParts } from '@/lib/formatTaplist'
import type { PublicDrinkRow, PublicTenantDetail } from '@/lib/types'

export type ShareableBeerImageHandle = {
  capture: () => Promise<string | undefined>
}

type ShareableBeerImageProps = {
  tenant: PublicTenantDetail
  drink: PublicDrinkRow
}

export const ShareableBeerImage = forwardRef<ShareableBeerImageHandle, ShareableBeerImageProps>(
  function ShareableBeerImage({ tenant, drink }, ref) {
    const shotRef = useRef<ViewShot>(null)
    const title = tenant.display_name || tenant.name
    const addressLine = [tenant.district, tenant.address].filter(Boolean).join(' · ')
    const generatedAtLabel = formatGeneratedAt(new Date())
    const breweryStyle = beerInfoLine(drink)
    const stats = beerStatsLine(drink)
    const servingOptions = displayServingOptions(drink.serving_options)
    const status = drink.public_status || null

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
            <Text style={styles.venue}>{title}</Text>
            {addressLine ? (
              <View style={styles.addressRow}>
                <FontAwesome name="map-marker" size={12} color={palette.muted} />
                <Text style={styles.address}>{addressLine}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.beerPanel}>
            <View style={styles.hero}>
              {drink.image_url ? <BeerArtwork name={drink.name} source={drink.image_url} size={132} /> : null}
              <View style={styles.heroCopy}>
                <View style={styles.titleRow}>
                  <Text style={styles.beerName}>{drink.name}</Text>
                  {status ? (
                    <View style={styles.statusBadge}>
                      <Text style={styles.statusText}>{status}</Text>
                    </View>
                  ) : null}
                </View>
                {breweryStyle ? <Text style={styles.meta}>{breweryStyle}</Text> : null}
                {stats ? <Text style={styles.stats}>{stats}</Text> : null}
              </View>
            </View>

            {drink.beer?.description ? <Text style={styles.description}>{drink.beer.description}</Text> : null}

            {servingOptions.length > 0 ? (
              <View style={styles.servingList}>
                {servingOptions.map((option) => {
                  const line = servingOptionLine(option)
                  if (!line) return null
                  return (
                    <View key={option.id} style={styles.servingTag}>
                      <Text style={styles.servingText}>{line}</Text>
                    </View>
                  )
                })}
              </View>
            ) : null}
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>No Menu · 创建时间 {generatedAtLabel}</Text>
          </View>
        </View>
      </ViewShot>
    )
  }
)

function beerInfoLine(drink: PublicDrinkRow) {
  return [drink.beer?.brewery ?? drink.brand_name, drink.beer?.beer_style].filter(Boolean).join(' · ')
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
  },
  kicker: {
    ...typography.label,
    color: palette.tungsten,
    fontSize: 10,
    lineHeight: 14,
    marginBottom: spacing.xs,
  },
  venue: {
    ...typography.displayL,
    color: palette.text,
    fontSize: 30,
    lineHeight: 36,
  },
  addressRow: {
    marginTop: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  address: {
    ...typography.caption,
    color: palette.muted,
    flex: 1,
  },
  beerPanel: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(245,241,232,0.08)',
    backgroundColor: 'rgba(17,17,17,0.48)',
    padding: spacing.sm,
  },
  beerKicker: {
    ...typography.label,
    color: palette.tungsten,
    fontSize: 10,
    lineHeight: 14,
    marginBottom: spacing.sm,
  },
  hero: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  heroCopy: {
    flex: 1,
    minWidth: 0,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  beerName: {
    ...typography.displayL,
    color: palette.text,
    fontSize: 34,
    lineHeight: 38,
    flex: 1,
  },
  statusBadge: {
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(159,122,61,0.24)',
    backgroundColor: 'rgba(159,122,61,0.14)',
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
  },
  statusText: {
    ...typography.label,
    color: palette.tungsten,
    fontSize: 10,
    lineHeight: 12,
  },
  meta: {
    ...typography.caption,
    color: palette.muted,
    marginTop: spacing.xs,
  },
  stats: {
    ...typography.label,
    color: palette.faint,
    fontSize: 10,
    lineHeight: 14,
    marginTop: spacing.xxs,
  },
  description: {
    ...typography.caption,
    color: palette.muted,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: palette.hairline,
  },
  servingList: {
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: palette.hairline,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  servingTag: {
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(245,241,232,0.08)',
    backgroundColor: 'rgba(17,17,17,0.28)',
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
  },
  servingText: {
    ...typography.micro,
    color: palette.muted,
  },
  footer: {
    marginTop: spacing.md,
  },
  footerText: {
    ...typography.micro,
    color: palette.faint,
  },
})
