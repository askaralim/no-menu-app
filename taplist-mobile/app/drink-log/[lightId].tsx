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

  const confirmUnlight = () => Alert.alert('熄灭这款酒？', '这款酒在所有酒吧的记录都会被删除。', [
    { text: '取消', style: 'cancel' },
    { text: '熄灭', style: 'destructive', onPress: () => unlight.mutate() },
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
            <View style={styles.heroSection}>
              <CachedImage source={item.image_url || defaultBeerArtwork} style={styles.hero} />
              <Text numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.72} style={styles.identityLine}>
                {item.brewery ? <Text style={styles.identityBrewery}>{item.brewery} · </Text> : null}
                <Text style={styles.identityName}>{item.name}</Text>
              </Text>
              {item.country ? <Text style={styles.origin}>{item.country}</Text> : null}
              <Text style={styles.factLine}>
                {[item.beer_style, typeof item.abv === 'number' ? `ABV ${item.abv}%` : null].filter(Boolean).join(' · ')}
              </Text>
            </View>

            {item.source_drink_is_public ? (
              <Pressable
                accessibilityRole="button"
                disabled={sharing}
                onPress={() => void generateShare()}
                style={({ pressed }) => [styles.shareAction, pressed && styles.pressed]}>
                {sharing
                  ? <ActivityIndicator size="small" color={palette.black} />
                  : <FontAwesome name="share-square-o" size={16} color={palette.black} />}
                <Text style={styles.shareActionText}>生成分享图</Text>
              </Pressable>
            ) : null}

            <View style={styles.venueList}>
              {item.venues.map((venue) => (
                <View key={venue.tenant_id} style={styles.venueRow}>
                  <View style={styles.venueCopy}>
                    <Text style={styles.venueName}>{formatVenueTitle(venue)}</Text>
                    <Text style={styles.venueMeta}>{formatDate(venue.first_drank_at)}</Text>
                  </View>
                  <Pressable
                    disabled={removeVenue.isPending}
                    accessibilityRole="button"
                    accessibilityLabel={`移除${venue.tenant_name}记录`}
                    style={styles.removeVenueButton}
                    onPress={() => Alert.alert('移除这家酒吧？', '其他酒吧记录不会受到影响。', [
                      { text: '取消', style: 'cancel' },
                      { text: '移除', style: 'destructive', onPress: () => removeVenue.mutate({ tenantId: venue.tenant_id }) },
                    ])}>
                    <FontAwesome name="trash-o" size={17} color={palette.faint} />
                  </Pressable>
                </View>
              ))}
            </View>

            <Pressable
              disabled={unlight.isPending}
              accessibilityRole="button"
              accessibilityLabel="熄灭这款酒"
              onPress={confirmUnlight}
              style={styles.dangerButton}>
              <Text style={styles.dangerText}>熄灭这款酒</Text>
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

function formatVenueTitle(venue: { city: string | null; city_label: string | null; tenant_name: string }) {
  const city = venue.city_label || localizeCity(venue.city || '')
  return [city, venue.tenant_name].filter(Boolean).join(' · ')
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
  screen: { flex: 1, backgroundColor: palette.background }, content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  header: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headerButton: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(17,17,17,0.72)', borderWidth: 1, borderColor: 'rgba(245,241,230,0.14)' },
  headerSpacer: { width: 38, height: 38 },
  headerTitle: { ...typography.title, color: palette.text, flex: 1, textAlign: 'center' },
  loading: { ...typography.body, color: palette.muted, marginTop: spacing.xxl },
  heroSection: { alignItems: 'center', marginTop: spacing.md },
  hero: { width: 238, height: 238, borderRadius: 8 },
  identityLine: { ...typography.headline, color: palette.text, fontSize: 28, lineHeight: 36, textAlign: 'center', marginTop: spacing.lg },
  identityBrewery: { color: palette.amber, fontSize: 20 },
  identityName: { color: palette.text, fontSize: 28 },
  origin: { ...typography.body, color: palette.muted, textAlign: 'center', marginTop: spacing.xs },
  factLine: { ...typography.caption, color: palette.tungsten, textAlign: 'center', marginTop: spacing.xxs },
  shareAction: { minHeight: 50, marginTop: spacing.lg, borderRadius: 8, backgroundColor: palette.amber, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  shareActionText: { ...typography.title, color: palette.black },
  venueList: { marginTop: spacing.xl, borderTopWidth: 1, borderTopColor: palette.line },
  venueRow: { minHeight: 76, borderTopWidth: 1, borderTopColor: palette.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md }, venueCopy: { flex: 1 }, venueName: { ...typography.title, color: palette.text }, venueMeta: { ...typography.caption, color: palette.tungsten, marginTop: spacing.xxs },
  removeVenueButton: { width: 44, height: 44, marginRight: -spacing.sm, alignItems: 'center', justifyContent: 'center' },
  dangerButton: { marginTop: spacing.xxl, minHeight: 44, alignSelf: 'center', paddingHorizontal: spacing.sm, alignItems: 'center', justifyContent: 'center' }, dangerText: { ...typography.caption, color: palette.copper },
  hiddenCanvas: { position: 'absolute', left: -10000, top: 0 },
  pressed: { opacity: 0.82 },
})
