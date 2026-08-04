import { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Alert,
  Share,
  Image,
  Linking,
  ActivityIndicator,
} from 'react-native'
import * as Clipboard from 'expo-clipboard'
import * as Sharing from 'expo-sharing'
import { useAuth } from '../../../lib/authProvider'
import { THEME, SPACING, RADIUS } from '../../../lib/theme'
import { Screen, SectionLabel, Card, Button } from '../../../components/ui'
import { HouseSubheader } from '../../../components/house/HouseSubheader'
import {
  buildMerchantShareTaplistUrl,
  getMyTenantQr,
  type TenantQrLink,
} from '../../../lib/tenantQrApi'
import { downloadRemoteImageToCache } from '../../../lib/downloadRemoteImage'
import {
  PhotoLibraryPermissionError,
  saveImageUriToPhotoLibrary,
} from '../../../lib/saveImageToPhotoLibrary'

export default function HouseQrScreen() {
  const { tenantId, memberships } = useAuth()
  const tenant = memberships.find((m) => m.tenant_id === tenantId) ?? null
  const publicVisible = !!tenant?.is_public_visible

  const [qrLink, setQrLink] = useState<TenantQrLink | null>(null)
  const [qrLoading, setQrLoading] = useState(false)
  const [saveBusy, setSaveBusy] = useState(false)
  const [shareBusy, setShareBusy] = useState(false)

  const fetchQr = useCallback(async () => {
    if (!tenantId) {
      setQrLink(null)
      return
    }
    setQrLoading(true)
    try {
      setQrLink(await getMyTenantQr(tenantId))
    } catch {
      setQrLink(null)
    } finally {
      setQrLoading(false)
    }
  }, [tenantId])

  useEffect(() => {
    void fetchQr()
  }, [fetchQr])

  const taplistShareUrl =
    tenant?.slug && tenant.slug.trim()
      ? buildMerchantShareTaplistUrl(tenant.slug)
      : null
  const canShareTaplist = !!taplistShareUrl && publicVisible

  const handleShareTaplist = async () => {
    if (!canShareTaplist || !taplistShareUrl) {
      Alert.alert('无法分享', '发布门店后可分享公开酒单')
      return
    }
    try {
      await Share.share({ message: taplistShareUrl })
    } catch {
      /* cancelled */
    }
  }

  const handleCopyTaplist = async () => {
    if (!canShareTaplist || !taplistShareUrl) {
      Alert.alert('无法复制', '发布门店后可分享公开酒单')
      return
    }
    try {
      await Clipboard.setStringAsync(taplistShareUrl)
      Alert.alert('已复制', '公开酒单链接已复制')
    } catch {
      Alert.alert('复制失败', '请重试')
    }
  }

  const handleOpenTaplist = async () => {
    if (!canShareTaplist || !taplistShareUrl) {
      Alert.alert('无法打开', '发布门店后可分享公开酒单')
      return
    }
    try {
      await Linking.openURL(taplistShareUrl)
    } catch {
      Alert.alert('无法打开', '请稍后重试')
    }
  }

  const withLocalQrPng = async (): Promise<string | null> => {
    if (!qrLink?.image_url) return null
    return downloadRemoteImageToCache(qrLink.image_url, `no-menu-qr-${qrLink.qr_code}.png`)
  }

  const handleSaveQr = async () => {
    if (!qrLink || saveBusy || shareBusy) return
    setSaveBusy(true)
    try {
      const uri = await withLocalQrPng()
      if (!uri) throw new Error('二维码图片不可用')
      await saveImageUriToPhotoLibrary(uri)
      Alert.alert('已保存', '高清二维码已保存到相册')
    } catch (e: any) {
      if (e instanceof PhotoLibraryPermissionError) {
        Alert.alert('无法保存', '请在系统设置中允许写入相册')
      } else {
        Alert.alert('保存失败', e?.message || '请稍后重试')
      }
    } finally {
      setSaveBusy(false)
    }
  }

  const handleShareQrImage = async () => {
    if (!qrLink || saveBusy || shareBusy) return
    setShareBusy(true)
    try {
      const available = await Sharing.isAvailableAsync()
      if (!available) {
        Alert.alert('无法分享', '当前设备不支持分享图片')
        return
      }
      const uri = await withLocalQrPng()
      if (!uri) throw new Error('二维码图片不可用')
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        UTI: 'public.png',
        dialogTitle: '分享门店二维码',
      })
    } catch (e: any) {
      Alert.alert('分享失败', e?.message || '请稍后重试')
    } finally {
      setShareBusy(false)
    }
  }

  return (
    <Screen scroll>
      <HouseSubheader title="二维码与公开链接" />

      <SectionLabel>公开网页酒单</SectionLabel>
      <Card>
        <Text style={styles.cardLead}>
          {canShareTaplist
            ? '顾客无需安装 App，打开链接即可查看实时酒单'
            : '发布门店后即可分享公开酒单'}
        </Text>
        <View style={styles.actionRow}>
          <Button
            label="分享"
            variant="secondary"
            icon="share-outline"
            disabled={!canShareTaplist}
            onPress={() => void handleShareTaplist()}
            style={styles.actionBtn}
          />
          <Button
            label="复制"
            variant="secondary"
            icon="copy-outline"
            disabled={!canShareTaplist}
            onPress={() => void handleCopyTaplist()}
            style={styles.actionBtn}
          />
          <Button
            label="浏览器打开"
            variant="secondary"
            icon="open-outline"
            disabled={!canShareTaplist}
            onPress={() => void handleOpenTaplist()}
            style={styles.actionBtn}
          />
        </View>
      </Card>

      <SectionLabel>门店二维码</SectionLabel>
      <Card>
        {qrLoading ? (
          <ActivityIndicator color={THEME.gold} style={{ marginVertical: SPACING.lg }} />
        ) : qrLink ? (
          <>
            <Text style={styles.cardLead}>扫码查看本店酒单，适合吧台或桌贴</Text>
            {!publicVisible ? (
              <Text style={styles.hint}>门店尚未公开。二维码可先保存，发布后顾客才能正常打开。</Text>
            ) : null}
            <View style={styles.qrPreviewWrap}>
              <Image
                source={{ uri: qrLink.image_url }}
                style={styles.qrPreview}
                resizeMode="contain"
              />
            </View>
            <View style={styles.actionRow}>
              <Button
                label="保存"
                variant="secondary"
                icon="download-outline"
                loading={saveBusy}
                disabled={saveBusy || shareBusy}
                onPress={() => void handleSaveQr()}
                style={styles.actionBtnWide}
              />
              <Button
                label="分享"
                variant="secondary"
                icon="share-outline"
                loading={shareBusy}
                disabled={saveBusy || shareBusy}
                onPress={() => void handleShareQrImage()}
                style={styles.actionBtnWide}
              />
            </View>
          </>
        ) : (
          <Text style={styles.hint}>二维码尚未开通，请联系 No Menu</Text>
        )}
      </Card>
    </Screen>
  )
}

const styles = StyleSheet.create({
  cardLead: { color: THEME.textSoft, fontSize: 14, lineHeight: 20 },
  hint: { color: THEME.muted, fontSize: 13, lineHeight: 19, marginTop: SPACING.sm },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  actionBtn: { flexGrow: 1, flexBasis: '30%', minWidth: 96 },
  actionBtnWide: { flexGrow: 1, flexBasis: '46%', minWidth: 140 },
  qrPreviewWrap: {
    marginTop: SPACING.lg,
    alignSelf: 'center',
    padding: SPACING.md,
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.lg,
  },
  qrPreview: { width: 200, height: 200 },
})
