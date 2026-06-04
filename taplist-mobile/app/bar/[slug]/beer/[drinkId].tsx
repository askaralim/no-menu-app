import FontAwesome from '@expo/vector-icons/FontAwesome'
import { useQuery } from '@tanstack/react-query'
import { Link, useLocalSearchParams } from 'expo-router'
import { useRef, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { AtmosphereImage } from '@/components/taplist/AtmosphereImage'
import { BackButton } from '@/components/taplist/BackButton'
import { ShareableBeerImage, type ShareableBeerImageHandle } from '@/components/taplist/ShareableBeerImage'
import { palette, spacing, typography } from '@/constants/design'
import { TAPLIST_LEGAL_DISCLAIMER } from '@/constants/compliance'
import { defaultServing, displayServingOptions, servingParts } from '@/lib/formatTaplist'
import { fetchPublicDrinks, fetchPublicTenantBySlug } from '@/lib/api/taplist'
import { PhotoLibraryPermissionError, saveImageUriToPhotoLibrary } from '@/lib/saveImageToPhotoLibrary'
import { useTaplistSupabaseReady } from '@/lib/useTaplistSupabaseReady'
import type { PublicDrinkRow, PublicServingOption } from '@/lib/types'

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
  const drinks = drinkResult?.ok ? drinkResult.drinks : []
  const drink = drinks.find((item) => item.id === drinkId) ?? null
  const serving = drink ? defaultServing(drink) : null
  const artworkUrl = drink?.image_url
  const servingOptions = drink ? displayServingOptions(drink.serving_options) : []
  const subtitle = drink ? beerSubtitle(drink) : null
  const metadata = drink ? beerMetadata(drink) : []
  const isResolvingDrink = configured && (tenantQuery.isLoading || (!!tenant && drinksQuery.isLoading))
  const canSaveBeer = Boolean(tenant && drink && !isSavingBeer)

  const handleSaveBeerImage = async () => {
    if (!tenant || !drink) {
      Alert.alert('暂无可保存的酒款')
      return
    }
    if (isSavingBeer) return

    try {
      setIsSavingBeer(true)
      const uri = await shareableRef.current?.capture()
      if (!uri) {
        Alert.alert('保存失败', '酒款图片生成失败，请稍后再试')
        return
      }

      await saveImageUriToPhotoLibrary(uri)
      Alert.alert('保存成功', '酒款已保存到相册')
    } catch (error) {
      if (error instanceof PhotoLibraryPermissionError) {
        Alert.alert('无法保存', '需要相册权限才能保存酒款')
        return
      }
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
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

            {drink.beer?.description ? (
              <Text style={styles.description}>{drink.beer.description}</Text>
            ) : null}

            {metadata.length > 0 ? (
              <View style={styles.metadataChips}>
                {metadata.map((item) => (
                  <Meta key={item.label} label={item.label} value={item.value} />
                ))}
              </View>
            ) : null}

            {servingOptions.length > 0 ? (
              <>
                <Text style={styles.sectionTitle}>杯型与价格</Text>
                <View style={styles.servingList}>
                  {servingOptions.map((option) => (
                    <View key={option.id} style={styles.primaryServing}>
                      <View>
                        <Text style={styles.primaryServingLabel}>
                          {option.id === serving?.id ? '默认规格' : '规格'}
                        </Text>
                        <Text style={styles.primaryServingMeta}>{servingLabel(option)}</Text>
                      </View>
                      <Text style={styles.primaryServingPrice}>¥{option.price}</Text>
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

            <View style={styles.complianceFooter}>
              <Text style={styles.complianceText}>{TAPLIST_LEGAL_DISCLAIMER}</Text>
            </View>
          </>
        ) : null}
      </ScrollView>
      {tenant && drink ? (
        <View pointerEvents="none" style={styles.shareableCanvas}>
          <ShareableBeerImage ref={shareableRef} tenant={tenant} drink={drink} />
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
  return servingParts(option).filter((part) => !part.startsWith('¥')).join(' · ')
}

function beerSubtitle(drink: PublicDrinkRow) {
  return [
    drink.beer?.brewery ?? drink.brand_name,
    drink.beer?.beer_style,
    typeof drink.beer?.abv === 'number' ? `${drink.beer.abv}%` : null,
  ].filter(Boolean).join(' · ')
}

function beerMetadata(drink: PublicDrinkRow) {
  return [
    drink.beer?.beer_style ? { label: '风格', value: drink.beer.beer_style } : null,
    typeof drink.beer?.abv === 'number' ? { label: 'ABV', value: `${drink.beer.abv}%` } : null,
    typeof drink.beer?.ibu === 'number' ? { label: 'IBU', value: `${drink.beer.ibu}` } : null,
    (drink.beer?.brewery ?? drink.brand_name) ? { label: '酒厂', value: drink.beer?.brewery ?? drink.brand_name! } : null,
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
