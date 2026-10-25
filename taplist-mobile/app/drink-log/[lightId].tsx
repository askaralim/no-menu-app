import FontAwesome from '@expo/vector-icons/FontAwesome'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useRef, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { CachedImage } from '@/components/taplist/CachedImage'
import { defaultBeerArtwork } from '@/components/taplist/defaultBeerArtwork'
import { ShareableDrinkHistoryImage, type ShareableDrinkHistoryImageHandle } from '@/components/taplist/ShareableDrinkHistoryImage'
import { ShareImagePreviewModal } from '@/components/taplist/ShareImagePreviewModal'
import { palette, spacing, typography } from '@/constants/design'
import { trackEvent } from '@/lib/analytics'
import { getMyDrinkHistory, removeMyDrinkVenue, unlightMyDrink } from '@/lib/api/drinkLog'

export default function DrinkLogDetailScreen() {
  const { lightId } = useLocalSearchParams<{ lightId: string }>()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const queryClient = useQueryClient()
  const shareRef = useRef<ShareableDrinkHistoryImageHandle>(null)
  const [previewUri, setPreviewUri] = useState<string | null>(null)
  const [sharing, setSharing] = useState(false)
  const historyQuery = useQuery({ queryKey: ['drink-log', 'history'], queryFn: () => getMyDrinkHistory() })
  const item = historyQuery.data?.find((row) => row.light_id === lightId)

  const refreshAndLeaveIfEmpty = async (isLit: boolean) => {
    await queryClient.invalidateQueries({ queryKey: ['drink-log'] })
    if (!isLit) router.back()
  }
  const removeVenue = useMutation({
    mutationFn: ({ tenantId }: { tenantId: string }) => removeMyDrinkVenue(lightId, tenantId),
    onSuccess: (result) => void refreshAndLeaveIfEmpty(result.is_lit),
  })
  const unlight = useMutation({
    mutationFn: () => unlightMyDrink(lightId),
    onSuccess: () => {
      trackEvent('drink_unlit')
      void refreshAndLeaveIfEmpty(false)
    },
  })

  const confirmUnlight = () => Alert.alert('删除整款 TAP 记录？', '这款酒在所有酒吧的记录都会被删除。', [
    { text: '取消', style: 'cancel' },
    { text: '删除', style: 'destructive', onPress: () => unlight.mutate() },
  ])

  const generateShare = async () => {
    if (!item?.source_drink_is_public || sharing) return
    setSharing(true)
    try {
      const uri = await shareRef.current?.capture()
      if (uri) setPreviewUri(uri)
      else Alert.alert('生成失败', '分享图暂时无法生成，请稍后重试。')
    } finally {
      setSharing(false)
    }
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.header}>
          <Pressable
            accessibilityLabel="返回"
            hitSlop={8}
            onPress={() => router.canGoBack() ? router.back() : router.replace('/')}
            style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}>
            <FontAwesome name="chevron-left" size={16} color={palette.text} />
          </Pressable>
          <Text style={styles.headerTitle}>TAP 记录</Text>
          <View style={styles.headerSpacer} />
        </View>
        {!item ? (
          <Text style={styles.loading}>{historyQuery.isLoading ? '正在加载记录…' : '找不到这条记录'}</Text>
        ) : (
          <>
            <View style={styles.beerCard}>
              <View style={styles.artworkStage}>
                <CachedImage
                  source={item.image_url || defaultBeerArtwork}
                  ossStyle="nm-detail"
                  contentFit="contain"
                  style={styles.hero}
                />
              </View>
              <View style={styles.identitySection}>
                <Text style={styles.identityName}>{item.name}</Text>
                {item.brewery ? <Text style={styles.identityBrewery}>{item.brewery}</Text> : null}
              </View>
              <View style={styles.factGrid}>
                {item.beer_style ? <Fact label="风格" value={item.beer_style} /> : null}
                {typeof item.abv === 'number' ? <Fact label="ABV" value={`${item.abv}%`} /> : null}
                {typeof item.ibu === 'number' ? <Fact label="IBU" value={`${item.ibu}`} /> : null}
                {item.country ? <Fact label="产地" value={item.country} /> : null}
              </View>
            </View>

            <View style={styles.historyHeader}>
              <Text style={styles.historyTitle}>喝过记录</Text>
              <View style={styles.historyHeaderActions}>
                <Text style={styles.historyCount}>{item.venue_count} 家</Text>
                {item.source_drink_is_public ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="生成分享图"
                    disabled={sharing}
                    onPress={() => void generateShare()}
                    style={({ pressed }) => [styles.shareAction, pressed && styles.pressed]}>
                    {sharing
                      ? <ActivityIndicator size="small" color={palette.amber} />
                      : <FontAwesome name="share-square-o" size={14} color={palette.amber} />}
                    <Text style={styles.shareActionText}>分享</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>

            <View style={styles.venueList}>
              {item.venues.map((venue) => (
                <View key={venue.tenant_id} style={styles.venueRow}>
                  <View style={styles.venueCopy}>
                    <Text style={styles.venueDate}>{formatDate(venue.first_drank_at)}</Text>
                    <Text style={styles.venueName}>{venue.tenant_name}</Text>
                    <Text numberOfLines={1} style={styles.venueMeta}>{formatVenueLocation(venue)}</Text>
                  </View>
                  <Pressable
                    disabled={removeVenue.isPending}
                    accessibilityRole="button"
                    accessibilityLabel={`移除${venue.tenant_name}记录`}
                    style={({ pressed }) => [styles.removeVenueButton, pressed && styles.pressed]}
                    onPress={() => Alert.alert('移除这家酒吧？', '其他酒吧记录不会受到影响。', [
                      { text: '取消', style: 'cancel' },
                      { text: '移除', style: 'destructive', onPress: () => removeVenue.mutate({ tenantId: venue.tenant_id }) },
                    ])}>
                    <Text style={styles.removeVenueText}>删除</Text>
                  </Pressable>
                </View>
              ))}
            </View>

            <Pressable
              disabled={unlight.isPending}
              accessibilityRole="button"
              accessibilityLabel="删除整款 TAP 记录"
              onPress={confirmUnlight}
              style={styles.dangerButton}>
              <Text style={styles.dangerText}>删除整款 TAP 记录</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
      {item?.source_drink_is_public ? (
        <View pointerEvents="none" style={styles.hiddenCanvas}>
          <ShareableDrinkHistoryImage ref={shareRef} item={item} />
        </View>
      ) : null}
      <ShareImagePreviewModal uri={previewUri} onClose={() => setPreviewUri(null)} />
    </View>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  )
}

function formatVenueLocation(venue: { city: string | null; city_label: string | null; district: string | null; address: string | null }) {
  const city = venue.city_label || localizeCity(venue.city || '')
  return [city, venue.district, venue.address].filter(Boolean).join(' · ')
}

function formatDate(value: string) { const d = new Date(value); return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}` }

function localizeCity(city: string) {
  const labels: Record<string, string> = {
    shanghai: '上海', beijing: '北京', tianjin: '天津', 天津: '天津',
    guangzhou: '广州', shenzhen: '深圳', chengdu: '成都', hangzhou: '杭州',
    nanjing: '南京', suzhou: '苏州', wuhan: '武汉', xian: '西安', "xi'an": '西安',
    chongqing: '重庆', qingdao: '青岛', 青岛: '青岛', binzhou: '滨州', 滨州: '滨州',
  }
  return labels[city.trim().toLowerCase()] ?? city
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.background }, content: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  header: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headerButton: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(17,17,17,0.72)', borderWidth: 1, borderColor: 'rgba(245,241,230,0.14)' },
  headerSpacer: { width: 38, height: 38 },
  headerTitle: { ...typography.title, color: palette.text, flex: 1, textAlign: 'center' },
  loading: { ...typography.body, color: palette.muted, marginTop: spacing.xxl },
  beerCard: { marginTop: spacing.sm, overflow: 'hidden', borderRadius: 14, borderWidth: 1, borderColor: palette.hairline, backgroundColor: palette.panel },
  artworkStage: { width: '100%', aspectRatio: 1.18, backgroundColor: palette.panelElevated, borderBottomWidth: 1, borderBottomColor: palette.hairline },
  hero: { width: '100%', height: '100%' },
  identitySection: { paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.sm },
  identityName: { ...typography.headline, color: palette.text, fontSize: 24, lineHeight: 31 },
  identityBrewery: { ...typography.caption, color: palette.muted, marginTop: spacing.xxs },
  factGrid: { flexDirection: 'row', flexWrap: 'wrap', borderTopWidth: 1, borderTopColor: palette.hairline },
  fact: { width: '50%', minHeight: 66, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRightWidth: 1, borderBottomWidth: 1, borderColor: palette.hairline },
  factLabel: { ...typography.micro, color: palette.faint },
  factValue: { ...typography.caption, color: palette.text, marginTop: spacing.xxs },
  historyHeader: { marginTop: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  historyTitle: { ...typography.title, color: palette.text, fontSize: 22, lineHeight: 29 },
  historyHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  historyCount: { ...typography.caption, color: palette.faint },
  shareAction: { minHeight: 34, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(211,154,69,0.24)', backgroundColor: 'rgba(211,154,69,0.08)', paddingHorizontal: spacing.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  shareActionText: { ...typography.caption, color: palette.tungsten },
  venueList: { marginTop: spacing.sm, gap: spacing.xs },
  venueRow: { minHeight: 100, borderWidth: 1, borderColor: palette.hairline, borderRadius: 14, backgroundColor: palette.panel, padding: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  venueCopy: { flex: 1, minWidth: 0 },
  venueDate: { ...typography.body, color: palette.tungsten, fontWeight: '500', letterSpacing: 0.8 },
  venueName: { ...typography.body, color: palette.text, fontWeight: '500', marginTop: spacing.xs },
  venueMeta: { ...typography.micro, color: palette.faint, marginTop: spacing.xxs },
  removeVenueButton: { width: 56, height: 34, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(168,102,63,0.34)', backgroundColor: 'rgba(168,102,63,0.08)', alignItems: 'center', justifyContent: 'center' },
  removeVenueText: { ...typography.caption, color: palette.copper },
  dangerButton: { marginTop: spacing.xl, minHeight: 46, alignSelf: 'center', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(168,102,63,0.28)', paddingHorizontal: spacing.lg, alignItems: 'center', justifyContent: 'center' },
  dangerText: { ...typography.caption, color: palette.copper },
  hiddenCanvas: { position: 'absolute', left: -10000, top: 0 },
  pressed: { opacity: 0.82 },
})
