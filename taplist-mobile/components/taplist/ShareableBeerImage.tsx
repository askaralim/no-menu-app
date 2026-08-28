import FontAwesome from '@expo/vector-icons/FontAwesome'
import { forwardRef, useImperativeHandle, useRef } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import ViewShot from 'react-native-view-shot'

import { BeerArtwork } from '@/components/taplist/BeerArtwork'
import { palette, spacing, typography } from '@/constants/design'
import { displayServingOptions, formatBreweryWithCollab, servingParts } from '@/lib/formatTaplist'
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
    const personalCity = localizeCity(tenant.city)
    const generatedAtLabel = formatGeneratedAt(new Date())
    const generatedDateLabel = formatShortDate(new Date().toISOString())
    const breweryLine = formatBreweryWithCollab(
      drink.beer?.brewery,
      drink.beer?.collab_breweries,
      drink.brand_name,
    )
    const breweryStyle = beerInfoLine(drink)
    const stats = beerStatsLine(drink)
    const personalAbv = typeof drink.beer?.abv === 'number' ? `ABV ${drink.beer.abv}%` : null
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
                <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.68} style={styles.personalHeaderTitle}>
                  <Text style={styles.personalHeaderDate}>{formatShortDate(litAt)} · </Text>
                  {personalCity ? <Text style={styles.personalHeaderDate}>{personalCity} · </Text> : null}
                  <Text style={styles.personalHeaderVenue}>{title} · </Text>
                  <Text style={styles.personalHeaderAccent}>新 TAP</Text>
                </Text>
                <View style={styles.personalHeaderRule} />
              </View>

              <View style={styles.personalArtFrame}>
                <BeerArtwork name={drink.name} source={drink.image_url} size={270} />
              </View>

              <View style={styles.personalBeerCopy}>
                <Text numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.72} style={styles.personalIdentityLine}>
                  {breweryLine ? <Text style={styles.personalMeta}>{breweryLine} · </Text> : null}
                  <Text style={styles.personalBeerName}>{drink.name}</Text>
                </Text>
                {drink.beer?.country ? <Text numberOfLines={1} style={styles.personalOrigin}>{drink.beer.country}</Text> : null}
                {[drink.beer?.beer_style, personalAbv].filter(Boolean).length ? (
                  <Text numberOfLines={1} style={styles.personalFacts}>
                    {[drink.beer?.beer_style, personalAbv].filter(Boolean).join(' · ')}
                  </Text>
                ) : null}

              </View>

              <View style={styles.personalFooter}>
                <Text style={styles.personalBrand}>NO MENU · {generatedDateLabel}</Text>
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
                  <BeerArtwork name={drink.name} source={drink.image_url} size={132} />
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

function formatShortDate(value: string) {
  const date = new Date(value)
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`
}

function localizeCity(city: string) {
  const labels: Record<string, string> = {
    shanghai: '上海',
    beijing: '北京',
    tianjin: '天津',
    天津: '天津',
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
    qingdao: '青岛',
    青岛: '青岛',
    binzhou: '滨州',
    滨州: '滨州',
  }
  return labels[city.trim().toLowerCase()] ?? city
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
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  personalHeaderTitle: { ...typography.body, fontSize: 13, lineHeight: 18, fontWeight: '500', flexShrink: 1 },
  personalHeaderDate: { color: palette.muted },
  personalHeaderVenue: { color: palette.text, fontSize: 15, fontWeight: '600' },
  personalHeaderAccent: { color: palette.tungsten },
  personalHeaderRule: { flex: 1, minWidth: 18, height: 1, backgroundColor: palette.line },
  kicker: {
    ...typography.label,
    color: palette.tungsten,
    fontSize: 10,
    lineHeight: 14,
    marginBottom: spacing.xs,
  },
  personalIdentityLine: {
    ...typography.headline,
    color: palette.text,
    fontSize: 24,
    lineHeight: 31,
    textAlign: 'center',
  },
  personalBeerName: {
    color: palette.text,
    fontSize: 24,
  },
  personalMeta: {
    color: palette.amber,
    fontSize: 17,
  },
  personalOrigin: { ...typography.caption, color: palette.muted, fontSize: 11, lineHeight: 15, marginTop: spacing.xxs, textAlign: 'center' },
  personalArtFrame: { width: 280, height: 280, alignSelf: 'center', marginTop: spacing.sm, padding: 5, borderRadius: 5, backgroundColor: palette.text },
  personalBeerCopy: {
    marginTop: spacing.md,
  },
  personalFacts: { ...typography.micro, color: palette.tungsten, fontSize: 10, lineHeight: 14, marginTop: 2, textAlign: 'center' },
  personalFooter: {
    minHeight: 24,
    marginTop: 'auto',
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: palette.line,
    justifyContent: 'flex-end',
  },
  personalBrand: {
    ...typography.label,
    color: palette.text,
    fontSize: 10,
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
