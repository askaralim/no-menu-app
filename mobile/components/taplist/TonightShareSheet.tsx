import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as Clipboard from 'expo-clipboard'
import * as Sharing from 'expo-sharing'
import { TAPLIST_THEME as T } from '../../lib/taplistTheme'
import type { TaplistDraft } from '../../lib/taplistOwnerApi'
import { buildMerchantShareTaplistUrl, getMyTenantQr } from '../../lib/tenantQrApi'
import {
  buildTonightShareText,
  defaultTonightShareDrinkIds,
  displayDrinkName,
  shareableFullTaplistDrinks,
  shareableTonightDrinks,
  TONIGHT_SHARE_MAX_DRINKS,
} from '../../lib/tonightShare'
import { TonightSharePoster, type TonightSharePosterHandle } from './TonightSharePoster'
import {
  FullTaplistPoster,
  type FullTaplistLayout,
  type FullTaplistOutput,
  type FullTaplistPosterHandle,
  type FullTaplistTheme,
} from './FullTaplistPoster'
import {
  PhotoLibraryPermissionError,
  saveImageUriToPhotoLibrary,
} from '../../lib/saveImageToPhotoLibrary'

type Props = {
  visible: boolean
  draft: TaplistDraft
  onClose: () => void
}

function isShareCanceled(error: unknown): boolean {
  const message = String((error as { message?: string } | undefined)?.message ?? error ?? '').toLowerCase()
  return (
    message.includes('cancel') ||
    message.includes('dismiss') ||
    message.includes('did not share') ||
    message.includes('sharing cancelled')
  )
}

export default function TonightShareSheet({ visible, draft, onClose }: Props) {
  const posterRef = useRef<TonightSharePosterHandle>(null)
  const fullPosterRef = useRef<FullTaplistPosterHandle>(null)
  const available = useMemo(() => shareableTonightDrinks(draft), [draft])
  const fullAvailable = useMemo(() => shareableFullTaplistDrinks(draft), [draft])
  const [exportKind, setExportKind] = useState<'new' | 'full'>('full')
  const [fullTheme, setFullTheme] = useState<FullTaplistTheme>('dark')
  const [fullLayout, setFullLayout] = useState<FullTaplistLayout>('double')
  const [fullOutput, setFullOutput] = useState<FullTaplistOutput>('long')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [sharing, setSharing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [posterReady, setPosterReady] = useState(false)
  const [qrImageUrl, setQrImageUrl] = useState<string | null>(null)
  const [qrLoading, setQrLoading] = useState(false)
  const [qrLoadFailed, setQrLoadFailed] = useState(false)

  useEffect(() => {
    if (!visible) return
    setSelectedIds(defaultTonightShareDrinkIds(available))
    setExportKind('full')
    setFullTheme('dark')
    setFullLayout('double')
    setFullOutput('long')
    setPosterReady(false)
    setSharing(false)
    setSaving(false)
  }, [available, visible])

  useEffect(() => {
    if (!visible) return
    let active = true
    setQrImageUrl(null)
    setQrLoadFailed(false)
    setQrLoading(true)
    void getMyTenantQr(draft.tenant.id)
      .then((qr) => {
        if (!active) return
        const imageUrl = qr?.image_url || null
        setQrImageUrl(imageUrl)
        if (imageUrl) void Image.prefetch(imageUrl)
      })
      .catch(() => {
        if (!active) return
        setQrLoadFailed(true)
        setQrImageUrl(null)
      })
      .finally(() => {
        if (active) setQrLoading(false)
      })
    return () => {
      active = false
    }
  }, [draft.tenant.id, visible])

  const selected = useMemo(
    () => available.filter((drink) => selectedIds.includes(drink.id)),
    [available, selectedIds],
  )
  const exportDrinks = exportKind === 'full' ? fullAvailable : selected
  const showPrices = (draft.tenant.public_price_mode ?? 'hide') === 'show'
  const barName = draft.tenant.display_name || draft.tenant.name
  const taplistUrl =
    draft.tenant.is_public_visible && draft.tenant.slug.trim()
      ? buildMerchantShareTaplistUrl(draft.tenant.slug)
      : null
  const shareText = useMemo(
    () => buildTonightShareText(barName, selected, showPrices, taplistUrl),
    [barName, selected, showPrices, taplistUrl],
  )
  const exportShareText = exportKind === 'full'
    ? [barName, '完整酒单', taplistUrl].filter(Boolean).join('\n')
    : shareText
  const missingArtwork = selected.filter((drink) => !drink.image_url?.trim()).length
  const hasNew = available.some((drink) => drink.public_status === 'new')

  const captureImages = async () => {
    if (exportKind === 'full') return (await fullPosterRef.current?.captureAll()) ?? []
    const uri = await posterRef.current?.capture()
    return uri ? [uri] : []
  }

  const toggle = (drinkId: string) => {
    setSelectedIds((current) => {
      if (current.includes(drinkId)) return current.filter((id) => id !== drinkId)
      if (current.length >= TONIGHT_SHARE_MAX_DRINKS) {
        Alert.alert('最多选择 5 款', '如需分享更多酒款，请分成两张图片。')
        return current
      }
      return [...current, drinkId]
    })
  }

  const handleShare = async () => {
    if (!exportDrinks.length || sharing || saving || !posterReady) return
    setSharing(true)
    try {
      const shareAvailable = await Sharing.isAvailableAsync()
      if (!shareAvailable) throw new Error('当前设备不支持分享图片')
      const uris = await captureImages()
      if (!uris.length) throw new Error('生成分享图片失败')
      await Clipboard.setStringAsync(exportShareText)
      setSharing(false)
      for (const uri of uris) {
        await Sharing.shareAsync(uri, {
          mimeType: exportKind === 'full' ? 'image/jpeg' : 'image/png',
          UTI: exportKind === 'full' ? 'public.jpeg' : 'public.png',
          dialogTitle: exportKind === 'full' ? '分享完整酒单' : '分享今晚上新',
        })
      }
    } catch (error: any) {
      if (!isShareCanceled(error)) {
        Alert.alert('分享失败', error?.message || '请稍后重试')
      }
    } finally {
      setSharing(false)
    }
  }

  const handleSave = async () => {
    if (!exportDrinks.length || saving || sharing || !posterReady) return
    setSaving(true)
    try {
      const uris = await captureImages()
      if (!uris.length) throw new Error('生成分享图片失败')
      await Clipboard.setStringAsync(exportShareText)
      for (const uri of uris) await saveImageUriToPhotoLibrary(uri)
      Alert.alert(
        '已下载',
        exportKind === 'full'
          ? `${uris.length} 张完整酒单图片已保存到相册，酒单文案已复制`
          : taplistUrl
            ? '上新图片已保存到相册，群文案（含酒单链接）已复制'
            : '上新图片已保存到相册，群文案已复制',
      )
    } catch (error: any) {
      if (error instanceof PhotoLibraryPermissionError) {
        Alert.alert('无法下载', '请在系统设置中允许 No Menu Tonight 添加照片')
      } else {
        Alert.alert('下载失败', error?.message || '请稍后重试')
      }
    } finally {
      setSaving(false)
    }
  }

  const actionsBusy = sharing || saving || qrLoading || !posterReady

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>酒单图片</Text>
          <TouchableOpacity onPress={onClose} hitSlop={10} accessibilityLabel="关闭">
            <Ionicons name="close" size={27} color={T.text} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.selectionContent}>
          <View style={styles.kindTabs}>
            <Choice label="今晚上新" selected={exportKind === 'new'} onPress={() => setExportKind('new')} />
            <Choice label="完整酒单" selected={exportKind === 'full'} onPress={() => setExportKind('full')} />
          </View>

          {exportKind === 'full' ? (
            <View style={styles.fullOptions}>
              <SettingRow label="底色">
                <Choice label="黑色" selected={fullTheme === 'dark'} onPress={() => setFullTheme('dark')} />
                <Choice label="白色" selected={fullTheme === 'light'} onPress={() => setFullTheme('light')} />
              </SettingRow>
              <SettingRow label="版式" wide>
                <Choice label="单栏" selected={fullLayout === 'single'} onPress={() => setFullLayout('single')} />
                <Choice label="双栏" selected={fullLayout === 'double'} onPress={() => setFullLayout('double')} />
                <Choice label="横版 4:3" selected={fullLayout === 'landscape'} onPress={() => setFullLayout('landscape')} />
              </SettingRow>
              {fullLayout === 'landscape' ? (
                <SettingRow label="分页" last plain>
                  <Text style={styles.settingNote}>超出一页时自动分页</Text>
                </SettingRow>
              ) : (
                <SettingRow label="分页" last>
                  <Choice label="不分页" selected={fullOutput === 'long'} onPress={() => setFullOutput('long')} />
                  <Choice label="分页" selected={fullOutput === 'pages'} onPress={() => setFullOutput('pages')} />
                </SettingRow>
              )}
              <Text style={styles.fullSummary}>当前完整酒单共 {fullAvailable.length} 款</Text>
            </View>
          ) : (
            <View>
              <Text style={styles.help}>
                {hasNew
                  ? '默认选择标记为“上新”的酒款，也可以手动调整。'
                  : '当前没有上新标记，已默认选择在枪酒款，也可以手动调整。'}
              </Text>
              <Text style={styles.count}>已选择 {selected.length}/{TONIGHT_SHARE_MAX_DRINKS}</Text>
              {missingArtwork ? (
                <Text style={styles.missingHint}>有 {missingArtwork} 款没有酒标，分享图将使用默认图。</Text>
              ) : null}
              {available.length ? available.map((drink) => {
                const checked = selectedIds.includes(drink.id)
                return (
                  <TouchableOpacity
                    key={drink.id}
                    style={[styles.option, checked && styles.optionSelected]}
                    onPress={() => toggle(drink.id)}
                    activeOpacity={0.75}
                  >
                    <View style={[styles.check, checked && styles.checkSelected]}>
                      {checked ? <Ionicons name="checkmark" size={16} color="#1A1206" /> : null}
                    </View>
                    <View style={styles.optionCopy}>
                      <Text style={styles.optionName} numberOfLines={1}>
                        #{drink.public_sort_order} {displayDrinkName(drink)}
                      </Text>
                      <Text style={styles.optionMeta} numberOfLines={1}>
                        {drink.profile.brewery || drink.brand_name || '未知酒厂'}
                        {drink.profile.beer_style ? ` · ${drink.profile.beer_style}` : ''}
                      </Text>
                    </View>
                  </TouchableOpacity>
                )
              }) : (
                <View style={styles.empty}>
                  <Text style={styles.emptyText}>当前没有可分享的在枪酒款</Text>
                </View>
              )}
            </View>
          )}

          {exportDrinks.length ? (
            <View style={[styles.posterScale, exportKind === 'full' && styles.fullPosterScale]}>
              {exportKind === 'full' ? (
                <FullTaplistPoster
                  ref={fullPosterRef}
                  barName={barName}
                  drinks={fullAvailable}
                  showPrices={showPrices}
                  theme={fullTheme}
                  layout={fullLayout}
                  output={fullOutput}
                  qrImageUrl={qrImageUrl}
                  onReadyChange={setPosterReady}
                  onQrLoadError={() => setQrLoadFailed(true)}
                />
              ) : (
                <TonightSharePoster
                  ref={posterRef}
                  barName={barName}
                  drinks={selected}
                  showPrices={showPrices}
                  qrImageUrl={qrImageUrl}
                  onReadyChange={setPosterReady}
                  onQrLoadError={() => setQrLoadFailed(true)}
                />
              )}
            </View>
          ) : null}
          <Text style={styles.previewHint}>
            {qrLoading
              ? '正在加载门店二维码…'
              : qrLoadFailed
                ? '门店二维码加载失败，本次图片将不显示二维码。'
                : !qrImageUrl
                  ? '门店二维码尚未开通，本次图片将不显示二维码。'
                  : exportKind === 'full'
                    ? fullLayout === 'landscape'
                      ? '横版酒单将保存为 1600 × 1200 高清 JPG，超出一页时自动分页。'
                      : '完整酒单将保存为高清 JPG。'
                    : taplistUrl
                      ? '图片将保存为高清 PNG，配套群文案和酒单链接会在分享或下载时复制。'
                      : '图片将保存为高清 PNG，配套群文案会在分享或下载时复制。'}
          </Text>
        </ScrollView>

        <View style={styles.previewActions}>
          <TouchableOpacity
            style={[styles.secondaryButton, styles.downloadButton, actionsBusy && styles.buttonDisabled]}
            disabled={actionsBusy}
            onPress={() => void handleSave()}
          >
            {saving || !posterReady ? (
              <ActivityIndicator size="small" color={T.gold} />
            ) : (
              <Text style={styles.downloadButtonText}>
                {exportKind === 'full' && (fullLayout === 'landscape' || fullOutput === 'pages') ? '保存全部' : '下载图片'}
              </Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.primaryButton, styles.shareButton, actionsBusy && styles.buttonDisabled]}
            disabled={actionsBusy}
            onPress={() => void handleShare()}
          >
            {sharing || !posterReady ? (
              <ActivityIndicator color="#1A1206" />
            ) : (
              <Text style={styles.primaryButtonText}>分享图片</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[styles.choice, selected && styles.choiceSelected]}
      onPress={onPress}>
      <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{label}</Text>
    </TouchableOpacity>
  )
}

function SettingRow({ label, last = false, wide = false, plain = false, children }: { label: string; last?: boolean; wide?: boolean; plain?: boolean; children: ReactNode }) {
  return (
    <View style={[styles.settingRow, last && styles.settingRowLast]}>
      <Text style={styles.settingLabel}>{label}</Text>
      <View style={[styles.settingChoices, wide && styles.settingChoicesWide, plain && styles.settingChoicesPlain]}>{children}</View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.background },
  header: { paddingTop: 54, paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: T.borderFaint, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: T.text, fontSize: 24, fontWeight: '800' },
  selectionContent: { padding: 20, paddingBottom: 130 },
  kindTabs: { flexDirection: 'row', gap: 3, marginBottom: 20, padding: 3, borderRadius: 11, backgroundColor: T.surfaceSolid, borderWidth: 1, borderColor: T.borderFaint },
  fullOptions: { borderRadius: 14, borderWidth: 1, borderColor: T.borderFaint, backgroundColor: T.surfaceSolid, paddingHorizontal: 14, marginBottom: 22 },
  settingRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: T.borderFaint },
  settingRowLast: { borderBottomWidth: 0 },
  settingLabel: { color: T.textSoft, fontSize: 14, fontWeight: '700' },
  settingChoices: { width: 152, flexDirection: 'row', borderRadius: 10, backgroundColor: T.background, padding: 3 },
  settingChoicesWide: { width: 232 },
  settingChoicesPlain: { width: 'auto', backgroundColor: 'transparent', padding: 0 },
  settingNote: { color: T.muted, fontSize: 12, lineHeight: 17 },
  choice: { minHeight: 36, flex: 1, borderRadius: 8, borderWidth: 1, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  choiceSelected: { borderColor: T.goldBorder, backgroundColor: T.goldFill },
  choiceText: { color: T.muted, fontSize: 13, fontWeight: '700' },
  choiceTextSelected: { color: T.gold },
  fullSummary: { color: T.muted, fontSize: 13, paddingTop: 12, paddingBottom: 14 },
  help: { color: T.muted, fontSize: 14, lineHeight: 20 },
  count: { color: T.goldSoft, fontSize: 13, fontWeight: '700', marginTop: 18, marginBottom: 8 },
  missingHint: { color: T.muted, fontSize: 13, lineHeight: 18, marginBottom: 8 },
  option: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: T.border, paddingVertical: 12 },
  optionSelected: { backgroundColor: T.goldFill },
  check: { width: 24, height: 24, borderRadius: 7, borderWidth: 1, borderColor: T.border, alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  checkSelected: { backgroundColor: T.gold, borderColor: T.gold },
  optionCopy: { flex: 1, minWidth: 0 },
  optionName: { color: T.text, fontSize: 16, fontWeight: '700' },
  optionMeta: { color: T.muted, fontSize: 13, marginTop: 5 },
  empty: { paddingVertical: 64, alignItems: 'center' },
  emptyText: { color: T.faint, fontSize: 14 },
  primaryButton: { minHeight: 50, borderRadius: 12, backgroundColor: T.gold, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  primaryButtonText: { color: '#1A1206', fontSize: 16, fontWeight: '800' },
  buttonDisabled: { opacity: 0.45 },
  posterScale: { width: 351, alignSelf: 'center', transform: [{ scale: 0.9 }], marginTop: -4, marginBottom: -26, alignItems: 'center' },
  fullPosterScale: { width: 390, transform: [], marginTop: 0, marginBottom: 0 },
  previewHint: { color: T.muted, fontSize: 13, lineHeight: 19, textAlign: 'center', paddingHorizontal: 28, marginTop: 12 },
  previewActions: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 20, paddingBottom: 34, backgroundColor: T.background, borderTopWidth: 1, borderTopColor: T.borderFaint, flexDirection: 'row', gap: 10 },
  secondaryButton: { minHeight: 50, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: T.border, alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { color: T.textSoft, fontSize: 14, fontWeight: '700' },
  downloadButton: { borderColor: T.goldBorder },
  downloadButtonText: { color: T.gold, fontSize: 14, fontWeight: '700' },
  shareButton: { flex: 1 },
})
