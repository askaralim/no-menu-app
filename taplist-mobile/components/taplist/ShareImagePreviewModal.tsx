import * as Sharing from 'expo-sharing'
import { useRef, useState } from 'react'
import { ActivityIndicator, Alert, Image, InteractionManager, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { palette, spacing, typography } from '@/constants/design'
import { PhotoLibraryPermissionError, saveImageUriToPhotoLibrary } from '@/lib/saveImageToPhotoLibrary'

type Props = {
  uri: string | null
  onClose: () => void
}

export function ShareImagePreviewModal({ uri, onClose }: Props) {
  const insets = useSafeAreaInsets()
  const pendingShareUri = useRef<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [sharing, setSharing] = useState(false)

  const beginShare = () => {
    if (!uri || sharing) return
    pendingShareUri.current = uri
    setSharing(true)
    onClose()
    if (Platform.OS !== 'ios') {
      InteractionManager.runAfterInteractions(() => void sharePendingImage())
    }
  }

  const sharePendingImage = async () => {
    const shareUri = pendingShareUri.current
    if (!shareUri) return
    pendingShareUri.current = null
    try {
      await shareImage(shareUri)
    } finally {
      setSharing(false)
    }
  }

  const save = async () => {
    if (!uri || saving) return
    setSaving(true)
    try {
      await saveImageUriToPhotoLibrary(uri)
      Alert.alert('保存成功', '图片已保存到相册')
    } catch (error) {
      Alert.alert(
        error instanceof PhotoLibraryPermissionError ? '无法保存分享图' : '保存失败',
        error instanceof PhotoLibraryPermissionError ? '请在系统设置中允许 No Menu 添加照片。' : '暂时无法保存到相册，请稍后重试。',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      visible={Boolean(uri)}
      animationType="slide"
      onDismiss={() => void sharePendingImage()}
      onRequestClose={onClose}>
      <View style={[styles.preview, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.md }]}>
        <View style={styles.header}>
          <Text style={styles.title}>分享图预览</Text>
          <Pressable accessibilityRole="button" onPress={onClose}><Text style={styles.close}>关闭</Text></Pressable>
        </View>
        {uri ? <Image source={{ uri }} resizeMode="contain" style={styles.image} /> : null}
        <View style={styles.actions}>
          <Pressable disabled={sharing} style={styles.primary} onPress={beginShare}>
            <Text style={styles.primaryText}>分享图片</Text>
          </Pressable>
          <Pressable disabled={saving} style={styles.secondary} onPress={() => void save()}>
            {saving ? <ActivityIndicator size="small" color={palette.text} /> : <Text style={styles.secondaryText}>保存图片</Text>}
          </Pressable>
        </View>
      </View>
    </Modal>
  )
}

async function shareImage(uri: string) {
  try {
    if (!await Sharing.isAvailableAsync()) {
      Alert.alert('暂时无法分享', '当前设备无法打开系统分享面板。')
      return
    }
    await Sharing.shareAsync(uri)
  } catch {
    Alert.alert('分享失败', '暂时无法打开分享面板，请稍后重试。')
  }
}

const styles = StyleSheet.create({
  preview: { flex: 1, backgroundColor: palette.background, paddingHorizontal: spacing.lg },
  header: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { ...typography.title, color: palette.text },
  close: { ...typography.caption, color: palette.amber, paddingVertical: spacing.sm },
  image: { flex: 1, width: '100%' },
  actions: { gap: spacing.sm, paddingTop: spacing.md },
  primary: { minHeight: 50, borderRadius: 8, backgroundColor: palette.amber, alignItems: 'center', justifyContent: 'center' },
  primaryText: { ...typography.title, color: palette.black },
  secondary: { minHeight: 50, borderRadius: 8, borderWidth: 1, borderColor: palette.line, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { ...typography.title, color: palette.text },
})
