import FontAwesome from '@expo/vector-icons/FontAwesome'
import { useQuery } from '@tanstack/react-query'
import { type Href, router, useLocalSearchParams } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { AtmosphereImage } from '@/components/taplist/AtmosphereImage'
import { BackButton } from '@/components/taplist/BackButton'
import { BeerRoadmapSection } from '@/components/taplist/BeerRoadmapSection'
import { DrinkLightAction, DrinkLightFeedback, useDrinkLightController } from '@/components/taplist/DrinkLightSection'
import { DrinkRecordSuccessSheet } from '@/components/taplist/DrinkRecordSuccessSheet'
import { CachedImage } from '@/components/taplist/CachedImage'
import { defaultBeerArtwork } from '@/components/taplist/defaultBeerArtwork'
import { ShareImagePreviewModal } from '@/components/taplist/ShareImagePreviewModal'
import { ShareableBeerImage, type ShareableBeerImageHandle } from '@/components/taplist/ShareableBeerImage'
import { palette, spacing, typography } from '@/constants/design'
import { TAPLIST_LEGAL_DISCLAIMER } from '@/constants/compliance'
import { displayServingOptions, formatPrimaryBrewery, localizeServingLabel } from '@/lib/formatTaplist'
import { fetchPublicDrink } from '@/lib/api/taplist'
import { getMyDrinkInsights, getMyDrinkState } from '@/lib/api/drinkLog'
import { useTaplistSupabaseReady } from '@/lib/useTaplistSupabaseReady'
import type { PublicDrinkRow, PublicProductVenue, PublicServingOption, PublicTenantDetail } from '@/lib/types'

export default function BeerDetailScreen() {
  const insets = useSafeAreaInsets()
  const shareableRef = useRef<ShareableBeerImageHandle>(null)
  const [isSavingBeer, setIsSavingBeer] = useState(false)
  const [beerPreviewUri, setBeerPreviewUri] = useState<string | null>(null)
  const { slug, drinkId, fromPush, discovery } = useLocalSearchParams<{
    slug: string
    drinkId: string
    fromPush?: string
    discovery?: string
  }>()
  const configured = useTaplistSupabaseReady()

  const detailQuery = useQuery({
    queryKey: ['taplist', 'drink', slug, drinkId],
    queryFn: () => fetchPublicDrink(slug, drinkId),
    enabled: configured && !!slug && !!drinkId,
  })

  const detailResult = detailQuery.data
  const tenant = detailResult?.ok ? detailResult.tenant : null
  const drink = detailResult?.ok ? detailResult.drink : null
  const primaryBrewery = drink
    ? formatPrimaryBrewery(drink.beer?.brewery, drink.brand_name)
    : null
  const collabBreweries = (drink?.beer?.collab_breweries ?? [])
    .map((brewery) => brewery.trim())
    .filter((brewery) => brewery && brewery !== primaryBrewery)
    .slice(0, 3)
  const artworkUrl = drink?.image_url
  const servingOptions = drink ? displayServingOptions(drink.serving_options) : []
  const servingGroups = groupServingOptions(servingOptions)
  const metadata = drink ? beerMetadata(drink) : []
  const productVenues = detailResult?.ok
    ? discovery === 'product' && detailResult.venues?.length
      ? detailResult.venues
      : tenant && drink
        ? [sourceVenue(tenant, drink)]
        : []
    : []
  const isResolvingDrink = configured && detailQuery.isLoading
  const drinkLogStateQuery = useQuery({
    queryKey: ['drink-log', 'state', drink?.id],
    queryFn: () => getMyDrinkState(drink!.id),
    enabled: Boolean(drink?.id),
  })
  const canSaveBeer = Boolean(tenant && drink && !isSavingBeer && !drinkLogStateQuery.isLoading)
  const drinkLightController = useDrinkLightController({
    drinkId: drink?.id ?? '',
    tenantId: tenant?.id ?? '',
  })
  const insightsQuery = useQuery({
    queryKey: ['drink-log', 'insights'],
    queryFn: () => getMyDrinkInsights(),
    enabled: Boolean(drinkLightController.lastResult?.created_venue),
  })
  const handleReviewTonight = () => {
    drinkLightController.clearLastResult()
    setTimeout(() => router.push('/tonight-recap' as Href), 250)
  }

  useEffect(() => {
    if (fromPush !== '1' || isResolvingDrink || !configured) return
    if (
      detailQuery.isError ||
      (detailResult?.ok === false && detailResult.code.startsWith('tenant_'))
    ) {
      router.replace('/')
    } else if (detailResult?.ok === false) {
      router.replace(`/bar/${slug}?fromPush=1`)
    }
  }, [configured, detailQuery.isError, detailResult, fromPush, isResolvingDrink, slug])

  const handlePreviewBeerImage = async () => {
    if (!tenant || !drink || isSavingBeer) return
    if (drinkLogStateQuery.isLoading) return
    if (drinkLogStateQuery.isError) {
      Alert.alert('暂时无法生成图片', '无法确认这款酒的喝过状态，请稍后重试。')
      void drinkLogStateQuery.refetch()
      return
    }
    try {
      setIsSavingBeer(true)
      const uri = await shareableRef.current?.capture()
      if (!uri) {
        Alert.alert('生成失败', '酒款图片生成失败，请稍后再试')
        return
      }
      setBeerPreviewUri(uri)
    } catch {
      Alert.alert('生成失败', '酒款图片生成失败，请稍后再试')
    } finally {
      setIsSavingBeer(false)
    }
  }

  return (
    <View style={styles.screen}>
      <BackButton />
      {tenant && drink ? (
        <Pressable
          accessibilityLabel="分享酒款图片"
          hitSlop={10}
          disabled={!canSaveBeer}
          onPress={() => void handlePreviewBeerImage()}
          style={({ pressed }) => [
            styles.shareButton,
            { top: insets.top + 14 },
            !canSaveBeer && styles.downloadButtonDisabled,
            pressed && canSaveBeer && styles.downloadButtonPressed,
          ]}>
          <FontAwesome name="share-square-o" size={16} color={canSaveBeer ? palette.text : palette.faint} />
        </Pressable>
      ) : null}
      <DrinkRecordSuccessSheet
        result={drinkLightController.lastResult}
        insights={insightsQuery.data}
        insightsLoading={insightsQuery.isLoading}
        drinkImageUrl={drink?.image_url}
        drinkName={drink?.name}
        onDismiss={drinkLightController.clearLastResult}
        onReviewTonight={handleReviewTonight}
      />
      <ShareImagePreviewModal uri={beerPreviewUri} onClose={() => setBeerPreviewUri(null)} />
      {tenant && drink ? (
        <Pressable
          accessibilityLabel="保存酒款图片"
          hitSlop={10}
          disabled={!canSaveBeer}
          onPress={() => void handlePreviewBeerImage()}
          style={({ pressed }) => [
            styles.downloadButton,
            { top: insets.top + 14 },
            !canSaveBeer && styles.downloadButtonDisabled,
            pressed && canSaveBeer && styles.downloadButtonPressed,
          ]}>
          {isSavingBeer ? (
            <ActivityIndicator size="small" color={palette.amber} />
          ) : (
            <FontAwesome name="download" size={16} color={canSaveBeer ? palette.text : palette.faint} />
          )}
        </Pressable>
      ) : null}
      <ScrollView
        style={styles.screen}
        contentContainerStyle={artworkUrl ? styles.scrollContent : [styles.paddedContent, { paddingTop: insets.top + spacing.xxxl, paddingBottom: spacing.xxl }]}>
        {artworkUrl ? (
          <AtmosphereImage source={artworkUrl} ossStyle="nm-detail" aspectRatio={1} overlayOpacity={0.18} scrimOpacity={1} topScrimOpacity={0.58} borderRadius={0} />
        ) : null}

        <View style={artworkUrl ? styles.paddedContent : undefined}>
          {!artworkUrl && drink ? (
            <CachedImage
              accessibilityLabel={`${drink.name}默认酒款图片`}
              source={defaultBeerArtwork}
              style={styles.fallbackHero}
            />
          ) : null}
          {!configured ? (
            <EmptyState title="尚未连接酒单服务" body="请配置 Supabase 环境变量后查看实时公开酒单。" />
          ) : isResolvingDrink ? (
            <View style={styles.loading}>
              <ActivityIndicator color={palette.amber} />
              <Text style={styles.loadingText}>正在加载酒款...</Text>
            </View>
          ) : detailQuery.isError ? (
            <EmptyState title="暂时无法加载酒款" body="请稍后重试，或以门店实际供应为准。" />
          ) : detailResult?.ok === false && detailResult.code.startsWith('tenant_') ? (
            <EmptyState title="找不到这家酒吧" body="该酒吧可能尚未发布公开酒单，或链接已经失效。" />
          ) : detailResult?.ok === false || (!drink && !detailQuery.isLoading) ? (
            <EmptyState title="找不到这款酒" body="这款酒可能已经下架，或不再公开展示。" />
          ) : drink ? (
            <>
              <Text style={styles.kicker}>{tenant?.display_name || tenant?.name || '酒吧'}</Text>
              <View style={styles.titleRow}>
                <View style={styles.titleCopy}>
                  <Text style={styles.title}>{drink.name}</Text>
                  {primaryBrewery || collabBreweries.length > 0 ? (
                    <View style={styles.breweryRow}>
                      {primaryBrewery ? (
                        <Pressable
                          accessibilityRole="link"
                          accessibilityLabel={`查看${primaryBrewery}酒厂`}
                          onPress={() => router.push(`/brewery/${encodeURIComponent(primaryBrewery)}` as Href)}
                          style={({ pressed }) => [styles.breweryButton, pressed && styles.breweryButtonPressed]}>
                          <Text style={styles.breweryButtonText}>{primaryBrewery}</Text>
                          <FontAwesome name="angle-right" size={16} color={palette.tungsten} />
                        </Pressable>
                      ) : null}
                      {collabBreweries.length > 0 ? (
                        <Text style={styles.collabBreweries}>× {collabBreweries.join(' × ')}</Text>
                      ) : null}
                    </View>
                  ) : null}
                </View>
                <DrinkLightAction controller={drinkLightController} />
              </View>

              <DrinkLightFeedback controller={drinkLightController} />

              {drink.beer?.description ? (
                <Text style={styles.description}>{drink.beer.description}</Text>
              ) : null}

              {metadata.length > 0 ? (
                <View style={styles.metadataChips}>
                  {metadata.map((item, index) => (
                    <Meta key={item.label} label={item.label} value={item.value} divided={index > 0} />
                  ))}
                </View>
              ) : null}
            {servingGroups.length > 0 ? (
              <>
                <Text style={styles.sectionTitle}>
                  {servingOptions.some((o) => typeof o.price === 'number' && o.price > 0)
                    ? '杯型与价格'
                    : '杯型'}
                </Text>
                <View style={styles.servingList}>
                  {servingGroups.map((group) => (
                    <View key={group.servingType} style={styles.primaryServing}>
                      {servingGroups.length > 1 ? (
                        <Text style={styles.primaryServingLabel}>{group.label}</Text>
                      ) : null}
                      <View style={[styles.servingValues, servingGroups.length === 1 && styles.servingValuesSingle]}>
                        {group.options.map((option) => {
                          const priceText =
                            typeof option.price === 'number' && option.price > 0
                              ? `¥${option.price}`
                              : null
                          const volumeText = option.volume_ml ? `${option.volume_ml}ml` : null
                          const meta = [volumeText, priceText].filter(Boolean).join(' ')
                          if (!meta) return null
                          return (
                            <View key={option.id} style={styles.servingOption}>
                              {volumeText ? <Text style={styles.primaryServingMeta}>{volumeText}</Text> : null}
                              {priceText ? (
                                <Text style={styles.primaryServingPrice}>{priceText}</Text>
                              ) : null}
                            </View>
                          )
                        })}
                      </View>
                    </View>
                  ))}
                </View>
              </>
            ) : null}

            {productVenues.length > 0 ? (
              <View style={[styles.venueSection, discovery !== 'product' && styles.venueSectionCompact]}>
                {discovery === 'product' && productVenues.length > 1 ? (
                  <Text style={styles.sectionTitle}>{productVenues.length} 家门店供应</Text>
                ) : null}
                {productVenues.map((venue) => (
                  <Pressable
                    key={`${venue.tenant_id}:${venue.drink_id}`}
                    accessibilityRole="link"
                    accessibilityLabel={`查看${venue.tenant_display_name}酒吧详情`}
                    onPress={() => router.push(`/bar/${venue.tenant_slug}` as Href)}
                    style={({ pressed }) => [styles.venueCard, pressed && styles.venueCardPressed]}>
                    <View style={styles.venueIcon}>
                      <FontAwesome name="map-marker" size={15} color={palette.amber} />
                    </View>
                    <Text style={styles.venueName} numberOfLines={1}>{venue.tenant_display_name}</Text>
                    <FontAwesome name="angle-right" size={17} color={palette.faint} />
                  </Pressable>
                ))}
              </View>
            ) : null}

            <BeerRoadmapSection startTenantId={tenant?.id} enabled={configured} />

            <View style={styles.complianceFooter}>
              <Text style={styles.complianceText}>{TAPLIST_LEGAL_DISCLAIMER}</Text>
            </View>
          </>
        ) : null}
        </View>
      </ScrollView>
      {tenant && drink ? (
        <View pointerEvents="none" style={styles.shareableCanvas}>
          <ShareableBeerImage ref={shareableRef} tenant={tenant} drink={drink} litAt={drinkLogStateQuery.data?.is_lit ? drinkLogStateQuery.data.first_lit_at : null} />
        </View>
      ) : null}
      {isSavingBeer ? (
        <View style={styles.saveOverlay} pointerEvents="none">
          <View style={styles.saveToast}>
            <ActivityIndicator size="small" color={palette.amber} />
            <Text style={styles.saveText}>正在生成预览</Text>
          </View>
        </View>
      ) : null}
    </View>
  )
}

function Meta({ label, value, divided }: { label: string; value: string; divided: boolean }) {
  return (
    <View style={[styles.metaChip, label === '风格' && styles.metaChipWide, divided && styles.metaChipDivided]}>
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

function groupServingOptions(options: PublicServingOption[]) {
  const groups = new Map<string, PublicServingOption[]>()
  options.forEach((option) => {
    const current = groups.get(option.serving_type) ?? []
    current.push(option)
    groups.set(option.serving_type, current)
  })
  return Array.from(groups, ([servingType, groupedOptions]) => ({
    servingType,
    label: localizeServingLabel(servingType),
    options: groupedOptions,
  }))
}

function beerMetadata(drink: PublicDrinkRow) {
  return [
    drink.beer?.beer_style ? { label: '风格', value: drink.beer.beer_style } : null,
    typeof drink.beer?.abv === 'number' ? { label: 'ABV', value: `${drink.beer.abv}%` } : null,
    typeof drink.beer?.ibu === 'number' ? { label: 'IBU', value: `${drink.beer.ibu}` } : null,
    drink.beer?.country ? { label: '产地', value: drink.beer.country } : null,
  ].filter((item): item is { label: string; value: string } => item !== null)
}

function sourceVenue(
  tenant: PublicTenantDetail,
  drink: PublicDrinkRow,
): PublicProductVenue {
  return {
    drink_id: drink.id,
    tenant_id: tenant.id,
    tenant_slug: tenant.slug,
    tenant_display_name: tenant.display_name || tenant.name,
    tenant_district: tenant.district,
    tenant_address: tenant.address,
    public_status: drink.public_status,
    default_serving: null,
    last_menu_updated_at: tenant.last_menu_updated_at,
  }
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: palette.background,
  },
  downloadButton: {
    position: 'absolute',
    right: 16,
    zIndex: 10,
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(17,17,17,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(245,241,230,0.14)',
  },
  shareButton: {
    position: 'absolute',
    right: 62,
    zIndex: 10,
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(17,17,17,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(245,241,230,0.14)',
  },
  downloadButtonPressed: {
    transform: [{ scale: 0.96 }],
  },
  downloadButtonDisabled: {
    opacity: 0.48,
  },
  shareableCanvas: {
    position: 'absolute',
    left: -10000,
    top: 0,
  },
  saveOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  saveToast: {
    minWidth: 148,
    minHeight: 52,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(245,241,230,0.14)',
    backgroundColor: 'rgba(17,17,17,0.92)',
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  saveText: {
    ...typography.caption,
    color: palette.text,
  },
  scrollContent: {
    paddingBottom: spacing.xxl,
  },
  paddedContent: {
    paddingHorizontal: spacing.lg,
  },
  fallbackHero: {
    width: 238,
    height: 238,
    alignSelf: 'center',
    borderRadius: 8,
    marginBottom: spacing.lg,
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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  titleCopy: {
    flex: 1,
    minWidth: 0,
  },
  breweryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  breweryButton: {
    minHeight: 38,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: 'rgba(198,168,117,0.34)',
    backgroundColor: 'rgba(211,154,69,0.08)',
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  breweryButtonPressed: {
    opacity: 0.72,
  },
  breweryButtonText: {
    ...typography.title,
    color: palette.tungsten,
    fontSize: 16,
    lineHeight: 22,
  },
  collabBreweries: {
    ...typography.title,
    color: palette.muted,
    fontSize: 16,
    lineHeight: 22,
  },
  description: {
    ...typography.body,
    color: palette.muted,
    marginTop: spacing.lg,
  },
  metadataChips: {
    flexDirection: 'row',
    marginTop: spacing.xl,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: palette.hairline,
  },
  metaChip: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
  },
  metaChipWide: {
    flex: 1.45,
  },
  metaChipDivided: {
    borderLeftWidth: 1,
    borderLeftColor: palette.hairline,
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
    ...typography.label,
    color: palette.tungsten,
    fontSize: 12,
    lineHeight: 17,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  primaryServing: {
    minHeight: 48,
    borderTopWidth: 1,
    borderTopColor: palette.hairline,
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  primaryServingLabel: {
    ...typography.body,
    color: palette.text,
    width: 76,
    paddingVertical: spacing.sm,
    paddingRight: spacing.sm,
  },
  primaryServingMeta: {
    ...typography.body,
    color: palette.muted,
    fontSize: 16,
    lineHeight: 23,
  },
  primaryServingPrice: {
    ...typography.body,
    color: palette.tungsten,
    fontSize: 16,
    lineHeight: 23,
  },
  servingOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  servingValues: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: spacing.lg,
    rowGap: spacing.xs,
    borderLeftWidth: 1,
    borderLeftColor: palette.hairline,
    paddingVertical: spacing.sm,
    paddingLeft: spacing.md,
  },
  servingValuesSingle: {
    borderLeftWidth: 0,
    paddingLeft: 0,
  },
  servingList: {
    borderBottomWidth: 1,
    borderBottomColor: palette.hairline,
  },
  venueSection: {
    paddingVertical: spacing.xl,
  },
  venueSectionCompact: {
    paddingTop: spacing.xl,
  },
  venueCard: {
    minHeight: 58,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(198,168,117,0.28)',
    backgroundColor: palette.bgSoft,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  venueIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(211,154,69,0.10)',
  },
  venueCardPressed: {
    opacity: 0.82,
    backgroundColor: 'rgba(21,21,21,0.72)',
  },
  venueName: {
    ...typography.body,
    flex: 1,
    minWidth: 0,
    color: palette.text,
    fontWeight: '600',
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
