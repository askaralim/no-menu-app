import { useQuery } from '@tanstack/react-query'
import { Link, useLocalSearchParams } from 'expo-router'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { AtmosphereImage } from '@/components/taplist/AtmosphereImage'
import { BackButton } from '@/components/taplist/BackButton'
import { BeerArtwork } from '@/components/taplist/BeerArtwork'
import { palette, spacing, typography } from '@/constants/design'
import { displayServingOptions } from '@/lib/formatTaplist'
import { formatOpeningHourLabel } from '@/lib/openingHour'
import { TAPLIST_LEGAL_DISCLAIMER } from '@/constants/compliance'
import { fetchPublicDrinks, fetchPublicTenantBySlug } from '@/lib/api/taplist'
import { isTaplistSupabaseConfigured } from '@/lib/supabase'
import type { PublicDrinkRow } from '@/lib/types'

export default function BarDetailScreen() {
  const insets = useSafeAreaInsets()
  const { slug } = useLocalSearchParams<{ slug: string }>()
  const configured = isTaplistSupabaseConfigured()

  const tenantQuery = useQuery({
    queryKey: ['taplist', 'tenant', slug],
    queryFn: () => fetchPublicTenantBySlug(slug),
    enabled: configured && !!slug,
  })

  const tenantResult = tenantQuery.data
  const tenant = tenantResult?.ok ? tenantResult.tenant : null

  const drinksQuery = useQuery({
    queryKey: ['taplist', 'drinks', tenant?.id],
    queryFn: () => fetchPublicDrinks(tenant!.id),
    enabled: configured && !!tenant?.id,
  })

  const drinkResult = drinksQuery.data
  const remoteDrinks = drinkResult?.ok ? drinkResult.drinks : []
  const drinks = [...remoteDrinks].sort((a, b) => {
    const aSold = a.public_status === '售罄' ? 1 : 0
    const bSold = b.public_status === '售罄' ? 1 : 0
    return aSold - bSold || a.public_sort_order - b.public_sort_order
  })
  const openingHoursLabel = tenant ? formatOpeningHourLabel(tenant.opening_hour) : null

  return (
    <View style={styles.screen}>
      <BackButton />
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md }]}>
        {tenant ? (
          <>
            <AtmosphereImage source={tenant.cover_image_url} aspectRatio={4 / 3} overlayOpacity={0.54}>
              <Text style={styles.title}>{tenant.display_name || tenant.name}</Text>
              {tenant.district ? <Text style={styles.heroDistrict}>{tenant.district}</Text> : null}
              <Text style={styles.heroSub}>精酿酒吧 · 今晚 {drinks.length} 款在售</Text>
            </AtmosphereImage>
            {(tenant.address || openingHoursLabel || tenant.description) ? (
              <View style={styles.barInfoStrip}>
                {tenant.address ? <Text style={styles.barInfoText}>{tenant.address}</Text> : null}
                {openingHoursLabel ? <Text style={styles.barInfoText}>{openingHoursLabel}</Text> : null}
                {tenant.description ? <Text style={styles.barDescription}>{tenant.description}</Text> : null}
              </View>
            ) : null}
          </>
        ) : null}

        {(tenantQuery.isLoading || drinksQuery.isLoading) && configured ? (
          <View style={styles.loading}>
            <ActivityIndicator color={palette.amber} />
            <Text style={styles.muted}>正在加载实时酒单...</Text>
          </View>
        ) : null}

        {!configured ? (
          <EmptyState title="尚未连接酒单服务" body="请配置 Supabase 环境变量后查看实时公开酒单。" />
        ) : tenantQuery.isError || tenantResult?.ok === false ? (
          <EmptyState title="找不到这家酒吧" body="该酒吧可能尚未发布公开酒单，或链接已经失效。" />
        ) : tenant ? (
          <>
            {drinksQuery.isError || drinkResult?.ok === false ? (
              <EmptyState title="暂时无法加载酒单" body="请稍后重试，或以门店实际供应为准。" />
            ) : drinks.length === 0 && !drinksQuery.isLoading ? (
              <EmptyState title="暂无公开酒款" body="这家酒吧当前还没有发布可展示的酒单。" />
            ) : (
              <View style={styles.tapList}>
                {drinks.map((drink, index) => (
                  <BeerRow 
                    key={drink.id} 
                    drink={drink} 
                    slug={tenant.slug} 
                    isLast={index === drinks.length - 1} 
                  />
                ))}
              </View>
            )}
          </>
        ) : null}

        <View style={styles.complianceFooter}>
          <Text style={styles.complianceText}>{TAPLIST_LEGAL_DISCLAIMER}</Text>
        </View>
      </ScrollView>
    </View>
  )
}

function BeerRow({ drink, slug, isLast }: { drink: PublicDrinkRow; slug: string; isLast: boolean }) {
  const servingOptions = displayServingOptions(drink.serving_options)
  const publicStatus = drink.public_status ? drink.public_status : null
  const isSoldOut = publicStatus === '售罄'
  const breweryStyle = breweryStyleLine(drink)
  const abvIbu = abvIbuLine(drink)

  return (
    <Link href={`/bar/${slug}/beer/${drink.id}`} asChild>
      <Pressable style={({ pressed }) => [
        styles.beerRow, 
        pressed && styles.beerRowPressed,
        isSoldOut && styles.beerRowSoldOut
      ]}>
        <View style={styles.beerContent}>
          <BeerArtwork name={drink.name} source={drink.image_url} size={72} />
          <View style={styles.beerMain}>
            <View style={styles.beerTitleRow}>
              <Text style={styles.beerName}>{drink.name}</Text>
              {publicStatus ? (
                <View style={[styles.statusBadge, isSoldOut && styles.statusBadgeSoldOut]}>
                  <Text style={[styles.statusTag, isSoldOut && styles.statusTagSoldOut]}>{publicStatus}</Text>
                </View>
              ) : null}
            </View>
            <View style={styles.beerCopy}>
              <Text style={styles.beerMeta}>{breweryStyle}</Text>
              <Text style={styles.beerStats}>{abvIbu}</Text>
            </View>
            {servingOptions.length > 0 ? (
              <View style={styles.servingOptions}>
                {servingOptions.map((option) => (
                  <View key={option.id} style={styles.servingOptionTag}>
                    <Text style={styles.servingOptionText}>{servingOptionLine(option)}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        </View>
        {!isLast ? <View style={styles.beerSeparator} /> : null}
      </Pressable>
    </Link>
  )
}

function breweryStyleLine(drink: PublicDrinkRow) {
  const brewery = drink.beer?.brewery ?? drink.brand_name ?? '酒厂待定'
  const style = drink.beer?.beer_style ?? '风格待定'
  return `${brewery} · ${style}`
}

function abvIbuLine(drink: PublicDrinkRow) {
  const abv = typeof drink.beer?.abv === 'number' ? `ABV ${drink.beer.abv}%` : 'ABV /'
  const ibu = typeof drink.beer?.ibu === 'number' ? `IBU ${drink.beer.ibu}` : 'IBU /'
  return `${abv} · ${ibu}`
}

function servingOptionLine(option: ReturnType<typeof displayServingOptions>[number]) {
  const label = option.label || option.serving_type || '规格'
  const volume = option.volume_ml ? `${option.volume_ml}ml` : '规格待定'
  return `${label} · ${volume} · ¥${option.price}`
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: palette.background,
  },
  content: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  heroKicker: {
    ...typography.label,
    color: palette.tungsten,
    fontSize: 10,
    lineHeight: 14,
    marginBottom: spacing.sm,
  },
  title: {
    ...typography.displayL,
    color: palette.text,
  },
  heroSub: {
    ...typography.caption,
    color: palette.muted,
    marginTop: spacing.sm,
  },
  heroDistrict: {
    ...typography.title,
    color: palette.text,
    marginTop: spacing.xs,
  },
  barInfoStrip: {
    borderBottomWidth: 1,
    borderBottomColor: palette.hairline,
    paddingVertical: spacing.md,
    gap: spacing.xxs,
  },
  barInfoText: {
    ...typography.caption,
    color: palette.muted,
  },
  barDescription: {
    ...typography.caption,
    color: palette.faint,
    marginTop: spacing.xs,
  },
  loading: {
    marginTop: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.panel,
    padding: spacing.sm,
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  muted: {
    ...typography.caption,
    color: palette.muted,
  },
  tapList: {
    marginTop: spacing.lg,
  },
  beerRow: {
  },
  beerRowPressed: {
    opacity: 0.78,
  },
  beerRowSoldOut: {
    opacity: 0.58,
  },
  beerContent: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
  },
  beerSeparator: {
    height: 1,
    backgroundColor: palette.hairline,
    marginLeft: 88,
  },
  beerMain: {
    flex: 1,
    minWidth: 0,
    paddingTop: 0,
  },
  beerCopy: {
    minWidth: 0,
  },
  beerTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  beerName: {
    ...typography.displayL,
    color: palette.text,
    fontSize: 30,
    lineHeight: 34,
    flex: 1,
  },
  beerMeta: {
    ...typography.caption,
    color: palette.muted,
    marginTop: spacing.xs,
  },
  beerStats: {
    ...typography.label,
    color: palette.faint,
    fontSize: 10,
    lineHeight: 14,
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
    marginTop: spacing.md,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  servingOptionTag: {
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(245,241,232,0.08)',
    backgroundColor: 'rgba(17,17,17,0.28)',
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
  },
  servingOptionText: {
    ...typography.micro,
    color: palette.muted,
  },
  complianceFooter: {
    marginTop: spacing.xl,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: palette.line,
  },
  complianceText: {
    ...typography.micro,
    color: palette.faint,
  },
  emptyState: {
    borderTopWidth: 1,
    borderTopColor: palette.hairline,
    paddingTop: spacing.lg,
    marginTop: spacing.lg,
  },
  emptyTitle: {
    ...typography.title,
    color: palette.text,
  },
  emptyBody: {
    ...typography.body,
    color: palette.muted,
    marginTop: spacing.xs,
  },
})
