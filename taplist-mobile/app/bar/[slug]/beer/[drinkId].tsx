import FontAwesome from '@expo/vector-icons/FontAwesome'
import { useQuery } from '@tanstack/react-query'
import { Link, useLocalSearchParams } from 'expo-router'
import * as Sharing from 'expo-sharing'
import { useRef, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { AtmosphereImage } from '@/components/taplist/AtmosphereImage'
import { BackButton } from '@/components/taplist/BackButton'
import { BeerRoadmapSection } from '@/components/taplist/BeerRoadmapSection'
import { DrinkLightAction, DrinkLightFeedback, useDrinkLightController } from '@/components/taplist/DrinkLightSection'
import { ShareableBeerImage, type ShareableBeerImageHandle } from '@/components/taplist/ShareableBeerImage'
import { palette, spacing, typography } from '@/constants/design'
import { TAPLIST_LEGAL_DISCLAIMER } from '@/constants/compliance'
import { displayServingOptions, formatBreweryWithCollab, localizeServingLabel } from '@/lib/formatTaplist'
import { fetchPublicDrinks, fetchPublicTenantBySlug } from '@/lib/api/taplist'
import { partitionPublicDrinks } from '@/lib/types'
import { getMyDrinkState } from '@/lib/api/drinkLog'
import { PhotoLibraryPermissionError, saveImageUriToPhotoLibrary } from '@/lib/saveImageToPhotoLibrary'
import { useTaplistSupabaseReady } from '@/lib/useTaplistSupabaseReady'
import type { PublicDrinkRow, PublicServingOption } from '@/lib/types'
import { trackEvent } from '@/lib/analytics'

export default function BeerDetailScreen() {
  const insets = useSafeAreaInsets()
  const shareableRef = useRef<ShareableBeerImageHandle>(null)
  const [isSavingBeer, setIsSavingBeer] = useState(false)
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
  const drinks = drinkResult?.ok ? partitionPublicDrinks(drinkResult).allForLookup : []
  const drink = drinks.find((item) => item.id === drinkId) ?? null
  const breweryLine = drink
    ? formatBreweryWithCollab(drink.beer?.brewery, drink.beer?.collab_breweries, drink.brand_name)
    : null
  const artworkUrl = drink?.image_url
  const servingOptions = drink ? displayServingOptions(drink.serving_options) : []
  const servingGroups = groupServingOptions(servingOptions)
  const metadata = drink ? beerMetadata(drink) : []
  const isResolvingDrink = configured && (tenantQuery.isLoading || (!!tenant && drinksQuery.isLoading))
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

  const handleShareBeerImage = async () => {
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
      if (!uri || !(await Sharing.isAvailableAsync())) {
        Alert.alert('分享失败', '暂时无法打开系统分享面板')
        return
      }
      await Sharing.shareAsync(uri)
    } catch {
      Alert.alert('分享失败', '酒款图片生成失败，请稍后再试')
    } finally {
      setIsSavingBeer(false)
    }
  }

  const handleSaveBeerImage = async () => {
    if (!tenant || !drink) {
      Alert.alert('暂无可保存的酒款')
      return
    }
    if (isSavingBeer) return
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
        trackEvent('beer_image_save_failed', {
          tenant_id: tenant.id,
          drink_id: drink.id,
          reason: 'capture_failed',
        })
        Alert.alert('保存失败', '酒款图片生成失败，请稍后再试')
        return
      }

      await saveImageUriToPhotoLibrary(uri)
      trackEvent('beer_image_save_succeeded', {
        tenant_id: tenant.id,
        drink_id: drink.id,
      })
      Alert.alert('保存成功', '酒款已保存到相册')
    } catch (error) {
      if (error instanceof PhotoLibraryPermissionError) {
        trackEvent('beer_image_save_failed', {
          tenant_id: tenant.id,
          drink_id: drink.id,
          reason: 'permission_denied',
        })
        Alert.alert('无法保存', '需要相册权限才能保存酒款')
        return
      }
      trackEvent('beer_image_save_failed', {
        tenant_id: tenant.id,
        drink_id: drink.id,
        reason: 'unknown',
      })
      console.error('Save beer image failed', error)
      Alert.alert('保存失败', '酒款图片生成失败，请稍后再试')
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
          onPress={() => void handleShareBeerImage()}
          style={({ pressed }) => [
            styles.shareButton,
            { top: insets.top + 14 },
            !canSaveBeer && styles.downloadButtonDisabled,
            pressed && canSaveBeer && styles.downloadButtonPressed,
          ]}>
          <FontAwesome name="share-square-o" size={16} color={canSaveBeer ? palette.text : palette.faint} />
        </Pressable>
      ) : null}
      {tenant && drink ? (
        <Pressable
          accessibilityLabel="保存酒款图片"
          hitSlop={10}
          disabled={!canSaveBeer}
          onPress={handleSaveBeerImage}
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
          <AtmosphereImage source={artworkUrl} aspectRatio={1} overlayOpacity={0.18} scrimOpacity={1} borderRadius={0} />
        ) : null}

        <View style={artworkUrl ? styles.paddedContent : undefined}>
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
              <Text style={styles.kicker}>{tenant?.display_name || tenant?.name || '酒吧'}</Text>
              <View style={styles.titleRow}>
                <View style={styles.titleCopy}>
                  <Text style={styles.title}>{drink.name}</Text>
                  {breweryLine ? <Text style={styles.brewery}>{breweryLine}</Text> : null}
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
            <Text style={styles.saveText}>正在保存酒款</Text>
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
  brewery: {
    ...typography.title,
    color: palette.muted,
    marginTop: spacing.xs,
    fontSize: 16,
    lineHeight: 23,
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
