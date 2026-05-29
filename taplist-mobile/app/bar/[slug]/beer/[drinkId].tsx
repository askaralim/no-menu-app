import { useQuery } from '@tanstack/react-query'
import { Link, useLocalSearchParams } from 'expo-router'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { AtmosphereImage } from '@/components/taplist/AtmosphereImage'
import { BackButton } from '@/components/taplist/BackButton'
import { palette, spacing, typography } from '@/constants/design'
import { TAPLIST_LEGAL_DISCLAIMER } from '@/constants/compliance'
import { defaultServing, displayServingOptions, formatServing } from '@/lib/formatTaplist'
import { fetchPublicDrinks, fetchPublicTenantBySlug } from '@/lib/api/taplist'
import { useTaplistSupabaseReady } from '@/lib/useTaplistSupabaseReady'
import type { PublicServingOption } from '@/lib/types'

export default function BeerDetailScreen() {
  const insets = useSafeAreaInsets()
  const { slug, drinkId } = useLocalSearchParams<{ slug: string; drinkId: string }>()
  const configured = useTaplistSupabaseReady()

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
  const drinks = drinkResult?.ok ? drinkResult.drinks : []
  const drink = drinks.find((item) => item.id === drinkId) ?? null
  const serving = drink ? defaultServing(drink) : null
  const artworkUrl = drink?.image_url
  const servingOptions = drink ? displayServingOptions(drink.serving_options) : []
  const isResolvingDrink = configured && (tenantQuery.isLoading || (!!tenant && drinksQuery.isLoading))

  return (
    <View style={styles.screen}>
      <BackButton />
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + (artworkUrl ? spacing.md : spacing.xxxl) },
        ]}>
        {!configured ? (
          <EmptyState title="尚未连接酒单服务" body="请配置 Supabase 环境变量后查看实时公开酒单。" />
        ) : isResolvingDrink ? (
          <View style={styles.loading}>
            <ActivityIndicator color={palette.amber} />
            <Text style={styles.loadingText}>正在加载酒款...</Text>
          </View>
        ) : tenantQuery.isError || tenantResult?.ok === false ? (
          <EmptyState title="找不到这家酒吧" body="该酒吧可能尚未发布公开酒单，或链接已经失效。" />
        ) : drinksQuery.isError || drinkResult?.ok === false ? (
          <EmptyState title="暂时无法加载酒款" body="请稍后重试，或以门店实际供应为准。" />
        ) : !drink && !drinksQuery.isLoading ? (
          <EmptyState title="找不到这款酒" body="这款酒可能已经下架，或不再公开展示。" />
        ) : drink ? (
          <>
            {artworkUrl ? (
              <View style={styles.coverFrame}>
                <AtmosphereImage source={artworkUrl} aspectRatio={1} overlayOpacity={0.18} scrimOpacity={0.4} />
              </View>
            ) : null}

            <Text style={styles.kicker}>{tenant?.display_name || tenant?.name || '酒吧'}</Text>
            <Text style={styles.title}>{drink.name}</Text>
            <Text style={styles.subtitle}>{drink.beer?.brewery ?? drink.brand_name ?? '酒厂待定'}</Text>

            {drink.beer?.description ? (
              <Text style={styles.description}>{drink.beer.description}</Text>
            ) : null}

            <View style={styles.metadataChips}>
              <Meta label="风格" value={drink.beer?.beer_style ?? '/'} />
              <Meta label="ABV" value={typeof drink.beer?.abv === 'number' ? `${drink.beer.abv}%` : '/'} />
              <Meta label="IBU" value={typeof drink.beer?.ibu === 'number' ? `${drink.beer.ibu}` : '/'} />
              <Meta label="酒厂" value={drink.beer?.brewery ?? drink.brand_name ?? '/'} />
              <Meta label="产地" value={drink.beer?.country ?? '/'} />
            </View>

            <Text style={styles.sectionTitle}>杯型与价格</Text>
            <View style={styles.servingList}>
              {servingOptions.length > 0 ? (
                servingOptions.map((option) => (
                  <View key={option.id} style={styles.primaryServing}>
                    <View>
                      <Text style={styles.primaryServingLabel}>
                        {option.id === serving?.id ? '默认规格' : '规格'}
                      </Text>
                      <Text style={styles.primaryServingMeta}>{servingLabel(option)}</Text>
                    </View>
                    <Text style={styles.primaryServingPrice}>¥{option.price}</Text>
                  </View>
                ))
              ) : (
                <View style={styles.primaryServing}>
                  <View>
                    <Text style={styles.primaryServingLabel}>规格</Text>
                    <Text style={styles.primaryServingMeta}>暂无规格信息</Text>
                  </View>
                </View>
              )}
            </View>

            {tenant ? (
              <View style={styles.venueSection}>
                <Link href={`/bar/${tenant.slug}`} asChild>
                  <Pressable style={({ pressed }) => [styles.venueCard, pressed && styles.venueCardPressed]}>
                    <Text style={styles.venueName}>{tenant.display_name || tenant.name}</Text>
                    <Text style={styles.venueMeta}>
                      {tenant.address || tenant.district || tenant.city}
                    </Text>
                    <Text style={styles.venueLinkHint}>查看酒单 ›</Text>
                  </Pressable>
                </Link>
              </View>
            ) : null}

            <View style={styles.complianceFooter}>
              <Text style={styles.complianceText}>{TAPLIST_LEGAL_DISCLAIMER}</Text>
            </View>
          </>
        ) : null}
      </ScrollView>
    </View>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaChip}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  )
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
    </View>
  )
}

function servingLabel(option: PublicServingOption) {
  return formatServing(option).split(' · ').slice(0, 2).join(' · ')
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: palette.background,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  loading: {
    marginTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: palette.hairline,
    paddingTop: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  loadingText: {
    ...typography.caption,
    color: palette.muted,
  },
  coverFrame: {
    width: '100%',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: palette.panelElevated,
    marginBottom: spacing.xl,
    shadowColor: palette.black,
    shadowOpacity: 0.55,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: spacing.lg },
    elevation: 8,
  },
  kicker: {
    ...typography.label,
    color: palette.tungsten,
    fontSize: 11,
    lineHeight: 15,
    marginBottom: spacing.sm,
  },
  title: {
    ...typography.displayL,
    color: palette.text,
    fontSize: 46,
    lineHeight: 52,
  },
  subtitle: {
    ...typography.title,
    color: palette.muted,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  description: {
    ...typography.body,
    color: palette.muted,
    marginBottom: spacing.lg,
  },
  metadataChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  metaChip: {
    minWidth: '31%',
    flexGrow: 1,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(245,241,232,0.06)',
    backgroundColor: 'rgba(17,17,17,0.28)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  metaLabel: {
    ...typography.label,
    color: palette.faint,
    fontSize: 10,
    marginBottom: spacing.xxs,
  },
  metaValue: {
    ...typography.caption,
    color: palette.text,
  },
  sectionTitle: {
    ...typography.displayL,
    color: palette.text,
    fontSize: 24,
    lineHeight: 30,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  primaryServing: {
    borderTopWidth: 1,
    borderTopColor: palette.hairline,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  primaryServingLabel: {
    ...typography.label,
    color: palette.faint,
    fontSize: 10,
    marginBottom: spacing.xs,
  },
  primaryServingMeta: {
    ...typography.body,
    color: palette.text,
  },
  primaryServingPrice: {
    ...typography.title,
    color: palette.tungsten,
  },
  servingList: {
    borderBottomWidth: 1,
    borderBottomColor: palette.hairline,
  },
  venueSection: {
    paddingVertical: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: palette.hairline,
  },
  venueCard: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(198,168,117,0.28)',
    backgroundColor: 'rgba(21,21,21,0.55)',
    padding: spacing.md,
  },
  venueCardPressed: {
    opacity: 0.82,
    backgroundColor: 'rgba(21,21,21,0.72)',
  },
  venueName: {
    ...typography.displayL,
    color: palette.tungsten,
    fontSize: 24,
    lineHeight: 29,
  },
  venueMeta: {
    ...typography.caption,
    color: palette.muted,
    marginTop: spacing.xs,
  },
  venueLinkHint: {
    ...typography.label,
    color: palette.amber,
    fontSize: 11,
    marginTop: spacing.sm,
  },
  complianceFooter: {
    marginTop: 0,
    paddingTop: spacing.xl,
  },
  complianceText: {
    ...typography.micro,
    color: palette.faint,
  },
  emptyState: {
    borderTopWidth: 1,
    borderTopColor: palette.hairline,
    paddingTop: spacing.lg,
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
