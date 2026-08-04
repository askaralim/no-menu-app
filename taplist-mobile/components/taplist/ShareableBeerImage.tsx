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
  litAt?: string | null
}

export const ShareableBeerImage = forwardRef<ShareableBeerImageHandle, ShareableBeerImageProps>(
  function ShareableBeerImage({ tenant, drink, litAt }, ref) {
    const shotRef = useRef<ViewShot>(null)
    const title = tenant.display_name || tenant.name
    const addressLine = [tenant.district, tenant.address].filter(Boolean).join(' · ')
    const personalLocation = uniqueLocationParts([localizeCity(tenant.city), tenant.district, tenant.address]).join(' · ')
    const generatedAtLabel = formatGeneratedAt(new Date())
    const generatedDateLabel = formatShortDate(new Date().toISOString())
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
        <View style={litAt ? styles.personalCard : styles.card} collapsable={false}>
          {litAt ? (
            <>
              <View style={styles.personalHeader}>
                <Text style={styles.personalKicker}>我在这里喝过 · {formatShortDate(litAt)}</Text>
                <Text numberOfLines={2} style={styles.personalVenue}>{title}</Text>
                {personalLocation ? (
                  <View style={styles.personalLocationRow}>
                    <FontAwesome name="map-marker" size={12} color={palette.muted} />
                    <Text numberOfLines={1} style={styles.personalLocation}>{personalLocation}</Text>
                  </View>
                ) : null}
              </View>

              <View style={[styles.personalPanel, !drink.image_url && styles.personalPanelWithoutArt]}>
                {drink.image_url ? <BeerArtwork name={drink.name} source={drink.image_url} size={154} /> : null}
                <View style={styles.personalBeerCopy}>
                  <Text numberOfLines={2} style={styles.personalBeerName}>{drink.name}</Text>
                  {drink.beer?.brewery ?? drink.brand_name ? (
                    <Text numberOfLines={2} style={styles.personalMeta}>{drink.beer?.brewery ?? drink.brand_name}</Text>
                  ) : null}
                  {drink.beer?.beer_style ? <PersonalFact label="风格" value={drink.beer.beer_style} /> : null}
                  {drink.beer?.country ? <PersonalFact label="产地" value={drink.beer.country} /> : null}
                  {stats ? <PersonalFact label="酒款参数" value={stats} /> : null}
                </View>
              </View>

              <View style={styles.personalFooter}>
                <Text style={styles.personalBrand}>NO MENU</Text>
                <Text style={styles.personalGenerated}>生成于 {generatedDateLabel}</Text>
              </View>
            </>
          ) : (
            <>
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
            </>
          )}

          {!litAt ? (
            <View style={styles.footer}>
              <Text style={styles.footerText}>No Menu · 生成于 {generatedAtLabel}</Text>
            </View>
          ) : null}
        </View>
      </ViewShot>
    )
  }
)

function PersonalFact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.personalFact}>
      <Text style={styles.personalFactLabel}>{label}</Text>
      <Text numberOfLines={2} style={styles.personalFactValue}>{value}</Text>
    </View>
  )
}

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

function formatShortDate(value: string) {
  const date = new Date(value)
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`
}

function localizeCity(city: string) {
  const labels: Record<string, string> = {
    shanghai: '上海',
    beijing: '北京',
    guangzhou: '广州',
    shenzhen: '深圳',
    chengdu: '成都',
    hangzhou: '杭州',
    nanjing: '南京',
    suzhou: '苏州',
    wuhan: '武汉',
    xian: '西安',
    "xi'an": '西安',
    chongqing: '重庆',
  }
  return labels[city.trim().toLowerCase()] ?? city
}

function uniqueLocationParts(values: Array<string | null>) {
  return values
    .map((value) => value?.trim())
    .filter((value, index, all): value is string => Boolean(value) && all.indexOf(value) === index)
}

const styles = StyleSheet.create({
  card: {
    width: 390,
    backgroundColor: palette.background,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    paddingTop: 36,
  },
  personalCard: {
    width: 390,
    height: 520,
    overflow: 'hidden',
    backgroundColor: palette.background,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 16,
  },
  header: {
    paddingBottom: spacing.md,
  },
  personalHeader: {
    paddingBottom: spacing.sm,
  },
  personalKicker: {
    ...typography.label,
    color: palette.tungsten,
    fontSize: 10,
    lineHeight: 13,
    marginBottom: spacing.xxs,
  },
  kicker: {
    ...typography.label,
    color: palette.tungsten,
    fontSize: 10,
    lineHeight: 14,
    marginBottom: spacing.xs,
  },
  personalBeerName: {
    ...typography.displayL,
    color: palette.text,
    fontSize: 30,
    lineHeight: 34,
  },
  personalMeta: {
    ...typography.caption,
    color: palette.muted,
    marginTop: spacing.xs,
  },
  personalPanel: {
    minHeight: 220,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(245,241,232,0.08)',
    backgroundColor: 'rgba(17,17,17,0.48)',
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  personalPanelWithoutArt: {
    alignItems: 'flex-start',
  },
  personalBeerCopy: {
    flex: 1,
    minWidth: 0,
  },
  personalVenue: {
    ...typography.displayL,
    color: palette.text,
    fontSize: 32,
    lineHeight: 36,
  },
  personalLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  personalLocation: {
    ...typography.caption,
    color: palette.muted,
    flex: 1,
  },
  personalFact: {
    marginTop: spacing.sm,
  },
  personalFactLabel: {
    ...typography.label,
    color: palette.tungsten,
    fontSize: 9,
    lineHeight: 12,
  },
  personalFactValue: {
    ...typography.micro,
    color: palette.text,
    marginTop: 2,
  },
  personalFooter: {
    minHeight: 24,
    marginTop: 'auto',
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: palette.line,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  personalBrand: {
    ...typography.label,
    color: palette.text,
    fontSize: 10,
  },
  personalGenerated: {
    ...typography.micro,
    color: palette.faint,
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
