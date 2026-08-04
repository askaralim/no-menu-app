import FontAwesome from '@expo/vector-icons/FontAwesome'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { BackButton } from '@/components/taplist/BackButton'
import { CachedImage } from '@/components/taplist/CachedImage'
import { palette, spacing, typography } from '@/constants/design'
import { trackEvent } from '@/lib/analytics'
import { getMyDrinkHistory, removeMyDrinkVenue, unlightMyDrink } from '@/lib/api/drinkLog'

export default function DrinkLogDetailScreen() {
  const { lightId } = useLocalSearchParams<{ lightId: string }>()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const queryClient = useQueryClient()
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

  return (
    <View style={styles.screen}>
      <BackButton />
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.xxxl }]}>
        {!item ? (
          <Text style={styles.loading}>{historyQuery.isLoading ? '正在加载记录…' : '找不到这条记录'}</Text>
        ) : (
          <>
            <View style={styles.heroRow}>
              {item.image_url ? <CachedImage source={item.image_url} style={styles.hero} /> : null}
              <View style={styles.heroCopy}>
                <Text style={styles.title}>{item.name}</Text>
                {item.brewery ? <Text style={styles.subtitle}>{item.brewery}</Text> : null}
                <View style={styles.beerFacts}>
                  {item.beer_style ? <BeerFact label="风格" value={item.beer_style} /> : null}
                  {item.country ? <BeerFact label="产地" value={item.country} /> : null}
                  {typeof item.abv === 'number' ? <BeerFact label="ABV" value={`${item.abv}%`} /> : null}
                  {typeof item.ibu === 'number' ? <BeerFact label="IBU" value={`${item.ibu}`} /> : null}
                </View>
                {item.source_drink_is_public && item.tenant_slug && item.source_drink_id ? (
                  <Pressable
                    accessibilityRole="link"
                    accessibilityLabel="查看酒款并分享"
                    onPress={() => router.push(`/bar/${item.tenant_slug}/beer/${item.source_drink_id}`)}
                    style={styles.shareLink}>
                    <FontAwesome name="share-square-o" size={13} color={palette.amber} />
                    <Text style={styles.shareLinkText}>查看并分享</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
            <View style={styles.metaRow}><Text style={styles.metaLabel}>首次喝过</Text><Text style={styles.metaValue}>{formatDate(item.first_lit_at)}</Text></View>
            <View style={styles.metaRow}><Text style={styles.metaLabel}>记录酒吧</Text><Text style={styles.metaValue}>{item.venue_count} 家</Text></View>

            <Text style={styles.sectionTitle}>酒吧记录</Text>
            {item.venues.map((venue) => (
              <View key={venue.tenant_id} style={styles.venueRow}>
                <View style={styles.venueCopy}>
                  <Text style={styles.venueName}>{venue.tenant_name}</Text>
                  <Text style={styles.venueMeta}>{[formatVenueLocation(venue), formatDate(venue.first_drank_at)].filter(Boolean).join(' · ')}</Text>
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
    </View>
  )
}

function BeerFact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.beerFact}>
      <Text style={styles.beerFactLabel}>{label}</Text>
      <Text numberOfLines={2} style={styles.beerFactValue}>{value}</Text>
    </View>
  )
}

function formatVenueLocation(venue: { city: string | null; city_label: string | null; district: string | null; address: string | null }) {
  const city = venue.city_label || localizeCity(venue.city || '')
  return uniqueLocationParts([city, venue.district, venue.address]).join(' · ')
}

function formatDate(value: string) { const d = new Date(value); return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}` }

function uniqueLocationParts(values: Array<string | null>) {
  return values
    .map((value) => value?.trim())
    .filter((value, index, all): value is string => Boolean(value) && all.indexOf(value) === index)
}

function localizeCity(city: string) {
  const labels: Record<string, string> = {
    shanghai: '上海', beijing: '北京', guangzhou: '广州', shenzhen: '深圳',
    chengdu: '成都', hangzhou: '杭州', nanjing: '南京', suzhou: '苏州',
    wuhan: '武汉', xian: '西安', "xi'an": '西安', chongqing: '重庆',
  }
  return labels[city.trim().toLowerCase()] ?? city
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.background }, content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  loading: { ...typography.body, color: palette.muted },
  heroRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.lg, marginBottom: spacing.lg },
  hero: { width: 164, height: 164, borderRadius: 8 },
  heroCopy: { flex: 1, minWidth: 0 },
  title: { ...typography.displayL, color: palette.text, fontSize: 34, lineHeight: 40 },
  subtitle: { ...typography.body, color: palette.muted, marginTop: spacing.xs },
  beerFacts: { marginTop: spacing.md, gap: spacing.xs },
  beerFact: { gap: 1 },
  beerFactLabel: { ...typography.label, color: palette.faint, fontSize: 9, lineHeight: 12 },
  beerFactValue: { ...typography.micro, color: palette.text },
  shareLink: { minHeight: 44, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
  shareLinkText: { ...typography.caption, color: palette.amber },
  metaRow: { minHeight: 48, borderTopWidth: 1, borderTopColor: palette.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, metaLabel: { ...typography.label, color: palette.faint, fontSize: 10 }, metaValue: { ...typography.caption, color: palette.text },
  sectionTitle: { ...typography.title, color: palette.text, marginTop: spacing.xl, marginBottom: spacing.sm }, venueRow: { minHeight: 64, borderTopWidth: 1, borderTopColor: palette.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md }, venueCopy: { flex: 1 }, venueName: { ...typography.body, color: palette.text }, venueMeta: { ...typography.caption, color: palette.faint, marginTop: 2 },
  removeVenueButton: { width: 44, height: 44, marginRight: -spacing.sm, alignItems: 'center', justifyContent: 'center' },
  dangerButton: { marginTop: spacing.xxl, minHeight: 44, alignSelf: 'center', paddingHorizontal: spacing.sm, alignItems: 'center', justifyContent: 'center' }, dangerText: { ...typography.caption, color: palette.copper },
})
