import FontAwesome from '@expo/vector-icons/FontAwesome'
import { useQuery } from '@tanstack/react-query'
import { type Href, router, useLocalSearchParams } from 'expo-router'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { AtmosphereImage } from '@/components/taplist/AtmosphereImage'
import { BackButton } from '@/components/taplist/BackButton'
import { palette, spacing, typography } from '@/constants/design'
import { fetchMiniProduct } from '@/lib/api/taplist'
import { useTaplistCity } from '@/lib/taplistCity'
import { useTaplistSupabaseReady } from '@/lib/useTaplistSupabaseReady'

export default function ProductDetailScreen() {
  const insets = useSafeAreaInsets()
  const configured = useTaplistSupabaseReady()
  const { selectedCity } = useTaplistCity()
  const { key } = useLocalSearchParams<{ key: string }>()
  const productKey = typeof key === 'string' ? key : ''
  const detailQuery = useQuery({
    queryKey: ['taplist', 'mini-product', selectedCity.city, productKey],
    queryFn: () => fetchMiniProduct(productKey, selectedCity.city),
    enabled: configured && productKey.length > 0,
  })
  const result = detailQuery.data
  const product = result?.ok ? result.product : null
  const venues = result?.ok ? result.venues.filter((venue) => venue.available) : []
  const collabBreweries = (product?.collab_breweries ?? [])
    .map((brewery) => brewery.trim())
    .filter((brewery) => brewery && brewery !== product?.brewery)
    .slice(0, 3)
  const metadata = product
    ? [
        product.beer_style ? { label: '风格', value: product.beer_style } : null,
        typeof product.abv === 'number' ? { label: 'ABV', value: `${product.abv}%` } : null,
        typeof product.ibu === 'number' ? { label: 'IBU', value: `${product.ibu}` } : null,
        product.country ? { label: '产地', value: product.country } : null,
      ].filter((item): item is { label: string; value: string } => item !== null)
    : []

  return (
    <View style={styles.screen}>
      <BackButton />
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[
          product?.image_url ? styles.contentWithHero : styles.content,
          !product?.image_url && { paddingTop: insets.top + 72 },
        ]}>
        {product?.image_url ? (
          <AtmosphereImage
            source={product.image_url}
            ossStyle="nm-detail"
            aspectRatio={1}
            overlayOpacity={0.18}
            scrimOpacity={1}
            topScrimOpacity={0.58}
            borderRadius={0}
          />
        ) : null}
        <View style={product?.image_url ? styles.body : undefined}>
          {!configured ? (
            <EmptyState title="尚未连接酒单服务" body="请配置 Supabase 环境变量后查看实时公开酒单。" />
          ) : detailQuery.isLoading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={palette.amber} />
              <Text style={styles.muted}>正在加载酒款...</Text>
            </View>
          ) : detailQuery.isError || result?.ok === false ? (
            <EmptyState title="找不到这款酒" body="这款酒可能已停止公开展示，或链接已经失效。" />
          ) : product ? (
            <>
              <Text style={styles.title}>{product.name}</Text>
              {product.brewery || collabBreweries.length > 0 ? (
                <View style={styles.breweryRow}>
                  {product.brewery ? (
                    <Pressable
                      accessibilityRole="link"
                      accessibilityLabel={`查看${product.brewery}酒厂`}
                      onPress={() => router.push(`/brewery/${encodeURIComponent(product.brewery!)}` as Href)}
                      style={({ pressed }) => [styles.breweryButton, pressed && styles.pressed]}>
                      <Text style={styles.breweryButtonText}>{product.brewery}</Text>
                      <FontAwesome name="angle-right" size={16} color={palette.tungsten} />
                    </Pressable>
                  ) : null}
                  {collabBreweries.length > 0 ? (
                    <Text style={styles.collabBreweries}>× {collabBreweries.join(' × ')}</Text>
                  ) : null}
                </View>
              ) : null}
              {product.description ? <Text style={styles.description}>{product.description}</Text> : null}
              {metadata.length > 0 ? (
                <View style={styles.metadata}>
                  {metadata.map((item) => (
                    <View key={item.label} style={styles.metaItem}>
                      <Text style={styles.metaLabel}>{item.label}</Text>
                      <Text style={styles.metaValue}>{item.value}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
              <Text style={styles.sectionTitle}>
                {venues.length > 0 ? `${venues.length} 家门店供应` : '供应门店'}
              </Text>
              {venues.length > 0 ? venues.map((venue) => (
                <Pressable
                  key={venue.id}
                  accessibilityRole="link"
                  accessibilityLabel={`查看${venue.name}酒吧详情`}
                  onPress={() => router.push(`/bar/${venue.slug}` as Href)}
                  style={({ pressed }) => [styles.venueCard, pressed && styles.pressed]}>
                  <View style={styles.venueIcon}>
                    <FontAwesome name="map-marker" size={15} color={palette.amber} />
                  </View>
                  <Text style={styles.venueName} numberOfLines={1}>{venue.name}</Text>
                  <FontAwesome name="angle-right" size={18} color={palette.faint} />
                </Pressable>
              )) : (
                <Text style={styles.emptySupply}>当前城市暂无供应</Text>
              )}
            </>
          ) : null}
        </View>
      </ScrollView>
    </View>
  )
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return <View style={styles.emptyState}>
    <Text style={styles.emptyTitle}>{title}</Text>
    <Text style={styles.muted}>{body}</Text>
  </View>
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.background },
  contentWithHero: { paddingBottom: spacing.xxl },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  body: { paddingHorizontal: spacing.lg },
  loading: { paddingTop: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  muted: { ...typography.body, color: palette.muted },
  title: { ...typography.displayL, color: palette.text, fontSize: 42, lineHeight: 49 },
  breweryRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  breweryButton: { minHeight: 38, borderRadius: 9, borderWidth: 1, borderColor: 'rgba(198,168,117,0.34)', backgroundColor: 'rgba(211,154,69,0.08)', paddingHorizontal: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  breweryButtonText: { ...typography.title, color: palette.tungsten, fontSize: 16, lineHeight: 22 },
  collabBreweries: { ...typography.title, color: palette.muted, fontSize: 16, lineHeight: 22 },
  description: { ...typography.body, color: palette.muted, marginTop: spacing.lg },
  metadata: { flexDirection: 'row', flexWrap: 'wrap', borderTopWidth: 1, borderBottomWidth: 1, borderColor: palette.hairline, marginTop: spacing.xl },
  metaItem: { minWidth: '25%', flexGrow: 1, paddingVertical: spacing.md, paddingRight: spacing.sm },
  metaLabel: { ...typography.label, color: palette.faint, fontSize: 10, marginBottom: spacing.xxs },
  metaValue: { ...typography.caption, color: palette.text },
  sectionTitle: { ...typography.label, color: palette.tungsten, fontSize: 12, marginTop: spacing.xl, marginBottom: spacing.sm },
  venueCard: { minHeight: 58, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(198,168,117,0.28)', backgroundColor: palette.bgSoft, paddingHorizontal: spacing.md, marginBottom: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  venueIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(211,154,69,0.10)' },
  venueName: { ...typography.body, color: palette.text, fontWeight: '600', flex: 1 },
  emptySupply: { ...typography.body, color: palette.faint },
  pressed: { opacity: 0.78 },
  emptyState: { borderTopWidth: 1, borderTopColor: palette.hairline, paddingTop: spacing.lg },
  emptyTitle: { ...typography.title, color: palette.text, marginBottom: spacing.xs },
})
