import FontAwesome from '@expo/vector-icons/FontAwesome'
import { useQuery } from '@tanstack/react-query'
import { Stack, router, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { CachedImage } from '@/components/taplist/CachedImage'
import { eventDateLabel } from '@/components/taplist/EventCards'
import { palette, spacing, typography } from '@/constants/design'
import { fetchPublicCampaign } from '@/lib/api/taplist'
import { tr, useLanguage } from '@/lib/i18n'
import { useTaplistSupabaseReady } from '@/lib/useTaplistSupabaseReady'

export default function CampaignDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const configured = useTaplistSupabaseReady()
  const { language } = useLanguage()
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const [viewing, setViewing] = useState<string | null>(null)
  const query = useQuery({
    queryKey: ['taplist', 'campaign', id],
    queryFn: () => fetchPublicCampaign(id),
    enabled: configured && !!id,
    refetchOnMount: 'always',
  })
  const campaign = !query.isError && query.data?.ok ? query.data.campaign : null
  const details = campaign?.detail_image_urls?.filter(Boolean) ?? []

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={tr(language, '返回', 'Back')}
          onPress={() => router.canGoBack() ? router.back() : router.replace('/')}
          style={styles.iconButton}>
          <FontAwesome name="chevron-left" size={18} color={palette.text} />
        </Pressable>
        <Text style={styles.headerTitle}>{tr(language, '联合活动', 'Collaboration event')}</Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}>
        {!configured ? <Text style={styles.message}>{tr(language, '尚未连接活动服务', 'Event service is not connected')}</Text>
          : query.isLoading ? <ActivityIndicator style={styles.message} color={palette.amber} />
            : query.isError ? <View style={styles.content}>
              <Text style={styles.description}>{tr(language, '暂时无法加载活动', 'Unable to load event')}</Text>
              <Pressable accessibilityRole="button" onPress={() => void query.refetch()} style={styles.retry}>
                <Text style={styles.link}>{tr(language, '重试', 'Retry')}</Text>
              </Pressable>
            </View>
              : !campaign ? <Text style={styles.message}>{tr(language, '活动暂未公开或已取消', 'This event is unavailable or cancelled')}</Text>
                : <>
                  {campaign.card_image_url ? <CampaignImage url={campaign.card_image_url} onOpen={setViewing} /> : null}
                  <View style={styles.content}>
                    <Text style={styles.title}>{campaign.title}</Text>
                    {campaign.subtitle ? <Text style={styles.subtitle}>{campaign.subtitle}</Text> : null}
                    <View style={styles.dateRow}>
                      <FontAwesome name="clock-o" size={14} color={palette.muted} />
                      <Text style={styles.subtitle}>{eventDateLabel(campaign)}</Text>
                    </View>
                    {campaign.has_ended ? <Text style={styles.subtitle}>{tr(language, '活动已结束', 'Event ended')}</Text> : null}
                    {campaign.description ? <Text style={styles.description}>{campaign.description}</Text> : null}
                    {campaign.stops?.length ? <Text style={styles.venues}>
                      {campaign.stops.map(stop => `${stop.tenant_name} × ${stop.brewery_label}`).join('\n')}
                    </Text> : null}
                  </View>
                  <View style={styles.images}>
                    {details.map((url, index) => <CampaignImage key={`${index}:${url}`} url={url} onOpen={setViewing} />)}
                  </View>
                </>}
      </ScrollView>
      <Modal visible={viewing !== null} animationType="fade" presentationStyle="fullScreen" onRequestClose={() => setViewing(null)}>
        <View style={styles.screen}>
          <View style={[styles.viewerHeader, { paddingTop: insets.top + spacing.sm }]}>
            <Text style={styles.subtitle}>{tr(language, '完整活动图片', 'Full event image')}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={tr(language, '关闭图片', 'Close image')}
              onPress={() => setViewing(null)} style={styles.iconButton}>
              <FontAwesome name="close" size={20} color={palette.text} />
            </Pressable>
          </View>
          <ScrollView key={viewing} maximumZoomScale={3} minimumZoomScale={1} centerContent
            contentContainerStyle={{ paddingBottom: insets.bottom }}>
            {viewing ? <CampaignImage url={viewing} width={width} /> : null}
          </ScrollView>
        </View>
      </Modal>
    </View>
  )
}

function CampaignImage({ url, onOpen, width }: { url: string; onOpen?: (url: string) => void; width?: number }) {
  const { language } = useLanguage()
  const [ratio, setRatio] = useState(1)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  if (failed) return <Pressable accessibilityRole="button" style={styles.imageError}
    onPress={() => { setFailed(false); setAttempt(value => value + 1) }}>
    <Text style={styles.link}>{tr(language, '图片加载失败，点击重试', 'Image unavailable. Tap to retry.')}</Text>
  </Pressable>
  const image = <CachedImage key={`${url}:${attempt}`} source={url} contentFit="contain"
    accessibilityLabel={tr(language, '活动图片', 'Event image')}
    style={{ width: width ?? '100%', aspectRatio: ratio }}
    onLoad={({ source }) => { if (source.width > 0 && source.height > 0) setRatio(source.width / source.height) }}
    onError={() => setFailed(true)} />
  return onOpen ? <Pressable accessibilityRole="button" accessibilityLabel={tr(language, '放大查看活动图片', 'View full event image')}
    onPress={() => onOpen(url)}>{image}</Pressable> : image
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { ...typography.title, color: palette.text, fontSize: 18 },
  content: { padding: spacing.lg, gap: spacing.md },
  title: { ...typography.title, color: palette.text, fontSize: 26, lineHeight: 36 },
  subtitle: { ...typography.caption, color: palette.muted, lineHeight: 22 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  description: { color: palette.text, fontSize: 16, lineHeight: 28 },
  venues: { color: palette.muted, fontSize: 14, lineHeight: 26 },
  images: { paddingHorizontal: spacing.lg, gap: spacing.lg },
  message: { margin: spacing.xl, color: palette.muted, textAlign: 'center' },
  retry: { alignSelf: 'flex-start', padding: spacing.md },
  link: { color: palette.tungsten, fontSize: 14 },
  viewerHeader: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  imageError: { minHeight: 120, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.panel },
})
