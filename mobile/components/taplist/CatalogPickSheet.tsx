import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { TAPLIST_THEME as T } from '../../lib/taplistTheme'
import {
  assertImageAsset,
  translateImageUploadError,
  type LocalImageAsset,
} from '../../lib/taplistMedia'

interface Props {
  visible: boolean
  targetTapNumber?: number | null
  onClose: () => void
  onCreate: (
    mode: 'recognition' | 'manual',
    asset?: LocalImageAsset,
    targetTapNumber?: number | null,
  ) => void
}

export default function CatalogPickSheet({
  visible,
  targetTapNumber,
  onClose,
  onCreate,
}: Props) {
  const [selectingImage, setSelectingImage] = useState(false)
  const pendingCreateRef = useRef<{
    mode: 'recognition' | 'manual'
    asset?: LocalImageAsset
    targetTapNumber?: number | null
  } | null>(null)

  const finishPendingCreate = () => {
    const pending = pendingCreateRef.current
    if (!pending) return
    pendingCreateRef.current = null
    onCreate(pending.mode, pending.asset, pending.targetTapNumber)
  }

  const requestCreate = (mode: 'recognition' | 'manual', asset?: LocalImageAsset) => {
    // Freeze the destination before closing this Modal. On iOS the parent must
    // clear picker state first, then wait for onDismiss before opening the
    // editor; reading targetTapNumber after dismissal would lose the tap slot.
    pendingCreateRef.current = { mode, asset, targetTapNumber }
    onClose()
  }

  // React Native's Modal onDismiss is iOS-only. Other platforms can continue
  // after the close render; iOS must wait for the native dismissal to finish.
  useEffect(() => {
    if (visible || Platform.OS === 'ios' || !pendingCreateRef.current) return
    const timer = setTimeout(finishPendingCreate, 0)
    return () => clearTimeout(timer)
  }, [visible])

  const chooseRecognitionImage = async () => {
    if (selectingImage) return
    setSelectingImage(true)
    try {
      if (Platform.OS !== 'web') {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
        if (!permission.granted) {
          Alert.alert('需要相册权限', '请在系统设置中允许访问相册，以便上传酒款图片。')
          return
        }
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.7,
        exif: false,
      })
      if (result.canceled || !result.assets?.[0]) return
      const selected = result.assets[0]
      const asset: LocalImageAsset = {
        uri: selected.uri,
        mimeType: selected.mimeType,
        fileName: selected.fileName,
        fileSize: selected.fileSize,
      }
      assertImageAsset(asset)
      requestCreate('recognition', asset)
    } catch (error) {
      Alert.alert('图片选择失败', translateImageUploadError(error))
    } finally {
      setSelectingImage(false)
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      onDismiss={finishPendingCreate}
    >
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>
                {targetTapNumber ? `添加到 #${targetTapNumber}` : '添加酒款'}
              </Text>
              <Text style={styles.subtitle}>推荐识图，也可搜索或自己填写</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={22} color={T.muted} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.methodCard, styles.methodCardPrimary]}
            onPress={() => void chooseRecognitionImage()}
            disabled={selectingImage}
            activeOpacity={0.8}
          >
            <View style={styles.methodIconPrimary}>
              {selectingImage ? (
                <ActivityIndicator size="small" color={T.background} />
              ) : (
                <Ionicons name="sparkles-outline" size={22} color={T.background} />
              )}
            </View>
            <View style={styles.methodCopy}>
              <Text style={styles.methodTitle}>上传图片识别</Text>
              <Text style={styles.methodNote}>自动读取酒款资料，同时匹配本店和商品库</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={T.gold} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.methodCard}
            onPress={() => requestCreate('manual')}
            activeOpacity={0.8}
          >
            <View style={styles.methodIcon}>
              <Ionicons name="search-outline" size={22} color={T.gold} />
            </View>
            <View style={styles.methodCopy}>
              <Text style={styles.methodTitle}>搜索或手动新增</Text>
              <Text style={styles.methodNote}>输入酒名自动匹配，没有结果也可直接填写</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={T.goldSoft} />
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    backgroundColor: T.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 28,
    borderTopWidth: 1,
    borderColor: T.border,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: T.border,
    marginBottom: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: { color: T.text, fontSize: 18, fontWeight: '800' },
  subtitle: { color: T.muted, fontSize: 12, marginTop: 4 },
  methodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 88,
    paddingHorizontal: 16,
    marginTop: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surface,
  },
  methodCardPrimary: { borderColor: T.goldBorder, backgroundColor: T.goldFill },
  methodIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: T.goldFill,
  },
  methodIconPrimary: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: T.gold,
  },
  methodCopy: { flex: 1 },
  methodTitle: { color: T.text, fontSize: 16, fontWeight: '800' },
  methodNote: { color: T.muted, fontSize: 12, lineHeight: 18, marginTop: 5 },
})
