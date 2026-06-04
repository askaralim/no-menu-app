import FontAwesome from '@expo/vector-icons/FontAwesome'
import * as MediaLibrary from 'expo-media-library'
import { useQuery } from '@tanstack/react-query'
import { Link, useLocalSearchParams } from 'expo-router'
import { useRef, useState } from 'react'
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { AtmosphereImage } from '@/components/taplist/AtmosphereImage'
import { BackButton } from '@/components/taplist/BackButton'
import { BeerArtwork } from '@/components/taplist/BeerArtwork'
import {
  ShareableBarTaplistImage,
  type ShareableBarTaplistImageHandle,
} from '@/components/taplist/ShareableBarTaplistImage'
import { palette, spacing, typography } from '@/constants/design'
import { displayServingOptions, servingParts } from '@/lib/formatTaplist'
import { formatOpeningHourLabel } from '@/lib/openingHour'
import { TAPLIST_LEGAL_DISCLAIMER } from '@/constants/compliance'
import { fetchPublicDrinks, fetchPublicTenantBySlug } from '@/lib/api/taplist'
import { useTaplistSupabaseReady } from '@/lib/useTaplistSupabaseReady'
import type { PublicDrinkRow } from '@/lib/types'

export default function BarDetailScreen() {
  const insets = useSafeAreaInsets()
  const shareableRef = useRef<ShareableBarTaplistImageHandle>(null)
  const [isSavingTaplist, setIsSavingTaplist] = useState(false)
  const { slug } = useLocalSearchParams<{ slug: string }>()
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
  const remoteDrinks = drinkResult?.ok ? drinkResult.drinks : []
  const drinks = [...remoteDrinks].sort((a, b) => {
    const aSold = a.public_status === '售罄' ? 1 : 0
    const bSold = b.public_status === '售罄' ? 1 : 0
    return aSold - bSold || a.public_sort_order - b.public_sort_order
  })
  const openingHoursLabel = tenant ? formatOpeningHourLabel(tenant.opening_hour) : null
  const canSaveTaplist = Boolean(tenant && drinks.length > 0 && !isSavingTaplist)

  const handleSaveTaplistImage = async () => {
    if (!tenant || drinks.length === 0) {
      Alert.alert('暂无可保存的酒单')
      return
    }
    if (isSavingTaplist) return

    try {
      setIsSavingTaplist(true)
      const uri = await shareableRef.current?.capture()
      if (!uri) {
        Alert.alert('保存失败', '酒单图片生成失败，请稍后再试')
        return
      }

      if (Platform.OS !== 'ios') {
        const { status } = await MediaLibrary.requestPermissionsAsync(true)
        if (status !== 'granted') {
          Alert.alert('无法保存', '需要相册权限才能保存酒单')
          return
        }
      }

      await MediaLibrary.saveToLibraryAsync(uri)
      Alert.alert('保存成功', '酒单已保存到相册')
    } catch (error) {
      console.error('Save taplist image failed', error)
      Alert.alert('保存失败', '酒单图片生成失败，请稍后再试')
    } finally {
      setIsSavingTaplist(false)
    }
  }

  return (
    <View style={styles.screen}>
      <BackButton />
      {tenant ? (
        <Pressable
          accessibilityLabel="保存酒单图片"
          hitSlop={10}
          disabled={!canSaveTaplist}
          onPress={handleSaveTaplistImage}
          style={({ pressed }) => [
            styles.downloadButton,
            { top: insets.top + 14 },
            !canSaveTaplist && styles.downloadButtonDisabled,
            pressed && canSaveTaplist && styles.downloadButtonPressed,
          ]}>
          {isSavingTaplist ? (
            <ActivityIndicator size="small" color={palette.amber} />
          ) : (
            <FontAwesome name="download" size={16} color={canSaveTaplist ? palette.text : palette.faint} />
          )}
        </Pressable>
      ) : null}
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md }]}>
        {tenant ? (
          <>
            <AtmosphereImage source={tenant.cover_image_url} aspectRatio={4 / 3} overlayOpacity={0.54}>
              <View style={styles.heroCopy}>
                <Text style={styles.title}>{tenant.display_name || tenant.name}</Text>
                <Text style={styles.heroSub}>今晚 {drinks.length} 款在售</Text>
                {(tenant.address || openingHoursLabel) ? (
                  <View style={styles.heroMeta}>
                    {tenant.address ? (
                      <View style={styles.heroMetaRow}>
                        <FontAwesome name="map-marker" size={13} color={palette.muted} />
                        <Text style={styles.heroMetaText}>{tenant.address}</Text>
                      </View>
                    ) : null}
                    {openingHoursLabel ? (
                      <View style={styles.heroMetaRow}>
                        <FontAwesome name="clock-o" size={13} color={palette.muted} />
                        <Text style={styles.heroMetaText}>{openingHoursLabel}</Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </View>
            </AtmosphereImage>
            {tenant.description ? (
              <View style={styles.barDescriptionStrip}>
                <Text style={styles.barDescription}>{tenant.description}</Text>
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
      {tenant && drinks.length > 0 ? (
        <View pointerEvents="none" style={styles.shareableCanvas}>
          <ShareableBarTaplistImage ref={shareableRef} tenant={tenant} drinks={drinks} />
        </View>
      ) : null}
      {isSavingTaplist ? (
        <View style={styles.saveOverlay} pointerEvents="none">
          <View style={styles.saveToast}>
            <ActivityIndicator size="small" color={palette.amber} />
            <Text style={styles.saveText}>正在保存酒单</Text>
          </View>
        </View>
      ) : null}
    </View>
  )
}

function BeerRow({ drink, slug, isLast }: { drink: PublicDrinkRow; slug: string; isLast: boolean }) {
  const servingOptions = displayServingOptions(drink.serving_options)
  const publicStatus = drink.public_status ? drink.public_status : null
  const isSoldOut = publicStatus === '售罄'
  const breweryStyle = beerInfoLine(drink)
  const abvIbu = beerStatsLine(drink)

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
            {breweryStyle || abvIbu ? (
              <View style={styles.beerCopy}>
                {breweryStyle ? <Text style={styles.beerMeta}>{breweryStyle}</Text> : null}
                {abvIbu ? <Text style={styles.beerStats}>{abvIbu}</Text> : null}
              </View>
            ) : null}
            {servingOptions.length > 0 ? (
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
        {!isLast ? <View style={styles.beerSeparator} /> : null}
      </Pressable>
    </Link>
  )
}

function beerInfoLine(drink: PublicDrinkRow) {
  return [drink.beer?.brewery ?? drink.brand_name, drink.beer?.beer_style].filter(Boolean).join(' · ')
}

function beerStatsLine(drink: PublicDrinkRow) {
  return [
    typeof drink.beer?.abv === 'number' ? `ABV ${drink.beer.abv}%` : null,
    typeof drink.beer?.ibu === 'number' ? `IBU ${drink.beer.ibu}` : null,
  ].filter(Boolean).join(' · ')
}

function servingOptionLine(option: ReturnType<typeof displayServingOptions>[number]) {
  const parts = servingParts(option)
  return parts.length > 0 ? parts.join(' · ') : null
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
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  heroCopy: {
    transform: [{ translateY: 12 }],
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
    marginTop: spacing.xs,
  },
  heroMeta: {
    marginTop: spacing.sm,
    gap: spacing.xxs,
  },
  heroMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  heroMetaText: {
    ...typography.caption,
    color: palette.muted,
    flex: 1,
  },
  barDescriptionStrip: {
    borderBottomWidth: 1,
    borderBottomColor: palette.hairline,
    paddingVertical: spacing.md,
  },
  barDescription: {
    ...typography.caption,
    color: palette.faint,
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
