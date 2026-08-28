import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
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
import { buildMerchantShareTaplistUrl } from '../../lib/tenantQrApi'
import {
  buildTonightShareText,
  defaultTonightShareDrinkIds,
  displayDrinkName,
  shareableTonightDrinks,
  TONIGHT_SHARE_MAX_DRINKS,
} from '../../lib/tonightShare'
import { TonightSharePoster, type TonightSharePosterHandle } from './TonightSharePoster'
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
  const available = useMemo(() => shareableTonightDrinks(draft), [draft])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [previewing, setPreviewing] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [posterReady, setPosterReady] = useState(false)

  useEffect(() => {
    if (!visible) return
    setSelectedIds(defaultTonightShareDrinkIds(available))
    setPreviewing(false)
    setPosterReady(false)
    setSharing(false)
    setSaving(false)
  }, [available, visible])

  const selected = useMemo(
    () => available.filter((drink) => selectedIds.includes(drink.id)),
    [available, selectedIds],
  )
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
  const missingArtwork = selected.filter((drink) => !drink.image_url?.trim()).length
  const hasNew = available.some((drink) => drink.public_status === 'new')
  const selectedKey = selected.map((drink) => drink.id).join('|')

  useEffect(() => {
    if (!visible || !previewing || !selected.length) return
    void Clipboard.setStringAsync(shareText)
  }, [visible, previewing, shareText, selected.length])

  useEffect(() => {
    if (!previewing) {
      setPosterReady(false)
      return
    }
    setPosterReady(false)
    const timeout = setTimeout(() => setPosterReady(true), 1800)
    return () => clearTimeout(timeout)
  }, [previewing, selectedKey])

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
    if (!selected.length || sharing || saving || !posterReady) return
    setSharing(true)
    try {
      const shareAvailable = await Sharing.isAvailableAsync()
      if (!shareAvailable) throw new Error('当前设备不支持分享图片')
      const uri = await posterRef.current?.capture()
      if (!uri) throw new Error('生成分享图片失败')
      await Clipboard.setStringAsync(shareText)
      setSharing(false)
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        UTI: 'public.png',
        dialogTitle: '分享今晚上新',
      })
    } catch (error: any) {
      if (!isShareCanceled(error)) {
        Alert.alert('分享失败', error?.message || '请稍后重试')
      }
    } finally {
      setSharing(false)
    }
  }

  const handleSave = async () => {
    if (!selected.length || saving || sharing || !posterReady) return
    setSaving(true)
    try {
      const uri = await posterRef.current?.capture()
      if (!uri) throw new Error('生成分享图片失败')
      await Clipboard.setStringAsync(shareText)
      await saveImageUriToPhotoLibrary(uri)
      Alert.alert('已下载', taplistUrl ? '上新图片已保存到相册，群文案（含酒单链接）已复制' : '上新图片已保存到相册，群文案已复制')
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

  const actionsBusy = sharing || saving || !posterReady

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>分享上新</Text>
          <TouchableOpacity onPress={onClose} hitSlop={10} accessibilityLabel="关闭">
            <Ionicons name="close" size={27} color={T.text} />
          </TouchableOpacity>
        </View>

        {!previewing ? (
          <>
            <ScrollView contentContainerStyle={styles.selectionContent}>
              <Text style={styles.help}>
                {hasNew
                  ? '默认选择标记为“上新”的酒款，也可以手动调整。'
                  : '当前没有上新标记，已默认选择在枪酒款，也可以手动调整。'}
              </Text>
              <Text style={styles.count}>已选择 {selected.length}/{TONIGHT_SHARE_MAX_DRINKS}</Text>
              {missingArtwork ? (
                <Text style={styles.missingHint}>
                  有 {missingArtwork} 款没有酒标，分享图将使用默认图。
                </Text>
              ) : null}
              {available.length ? (
                available.map((drink) => {
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
                })
              ) : (
                <View style={styles.empty}>
                  <Text style={styles.emptyText}>当前没有可分享的在枪酒款</Text>
                </View>
              )}
            </ScrollView>
            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.primaryButton, !selected.length && styles.buttonDisabled]}
                disabled={!selected.length}
                onPress={() => setPreviewing(true)}
              >
                <Text style={styles.primaryButtonText}>预览分享图</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <>
            <ScrollView contentContainerStyle={styles.previewContent}>
              <View style={styles.posterScale}>
                <TonightSharePoster
                  ref={posterRef}
                  barName={barName}
                  drinks={selected}
                  showPrices={showPrices}
                  onReadyChange={setPosterReady}
                />
              </View>
              <Text style={styles.previewHint}>
                {taplistUrl
                  ? '图片将保存为高清 PNG，配套群文案和酒单链接已自动复制。'
                  : '图片将保存为高清 PNG，配套群文案已自动复制。'}
              </Text>
            </ScrollView>
            <View style={styles.previewActions}>
              <TouchableOpacity
                style={[styles.secondaryButton, (saving || sharing) && styles.buttonDisabled]}
                disabled={saving || sharing}
                onPress={() => {
                  setSharing(false)
                  setSaving(false)
                  setPreviewing(false)
                }}
              >
                <Text style={styles.secondaryButtonText}>重新选择</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.secondaryButton, styles.downloadButton, actionsBusy && styles.buttonDisabled]}
                disabled={actionsBusy}
                onPress={() => void handleSave()}
              >
                {saving || !posterReady ? (
                  <ActivityIndicator size="small" color={T.gold} />
                ) : (
                  <Text style={styles.downloadButtonText}>下载图片</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.primaryButton,
                  styles.shareButton,
                  actionsBusy && styles.buttonDisabled,
                ]}
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
          </>
        )}
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.background },
  header: { paddingTop: 54, paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: T.borderFaint, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: T.text, fontSize: 24, fontWeight: '800' },
  selectionContent: { padding: 20, paddingBottom: 120 },
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
  actions: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 20, paddingBottom: 34, backgroundColor: T.background, borderTopWidth: 1, borderTopColor: T.borderFaint },
  primaryButton: { minHeight: 50, borderRadius: 12, backgroundColor: T.gold, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  primaryButtonText: { color: '#1A1206', fontSize: 16, fontWeight: '800' },
  buttonDisabled: { opacity: 0.45 },
  previewContent: { alignItems: 'center', paddingTop: 18, paddingBottom: 120 },
  posterScale: { width: 351, transform: [{ scale: 0.9 }], marginTop: -26, marginBottom: -26, alignItems: 'center' },
  previewHint: { color: T.muted, fontSize: 13, lineHeight: 19, textAlign: 'center', paddingHorizontal: 28, marginTop: 12 },
  previewActions: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 20, paddingBottom: 34, backgroundColor: T.background, borderTopWidth: 1, borderTopColor: T.borderFaint, flexDirection: 'row', gap: 10 },
  secondaryButton: { minHeight: 50, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: T.border, alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { color: T.textSoft, fontSize: 14, fontWeight: '700' },
  downloadButton: { borderColor: T.goldBorder },
  downloadButtonText: { color: T.gold, fontSize: 14, fontWeight: '700' },
  shareButton: { flex: 1 },
})
