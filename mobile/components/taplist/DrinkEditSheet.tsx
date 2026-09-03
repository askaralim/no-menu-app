import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Modal,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  Image,
  Alert,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated'
import { TAPLIST_THEME as T, SERVING_TYPE_LABELS, EDITOR_STATUSES, statusVisual } from '../../lib/taplistTheme'
import {
  type DraftDrink,
  type DraftServing,
  type DrinkStatusEvent,
  type ProductSearchResult,
  applyProductToDraftDrink,
  getDrinkStatusEvents,
  loadDrinkServingsForEdit,
  newDraftServing,
  saveDrinkWithIntent,
  searchDrinkProducts,
  upsertDrinkProduct,
  validateDraftDrink,
  withPersistedServings,
} from '../../lib/taplistOwnerApi'
import { matchLocalDrinks } from '../../lib/taplistLocalDrinkMatch'
import {
  type LocalImageAsset,
  TAPLIST_IMAGE_MAX_BYTES,
  translateImageUploadError,
  uploadDrinkImageFromAsset,
} from '../../lib/taplistMedia'
import type { DrinkSaveIntent, DrinkUpsertResult, ServingType, TaplistCategory } from '../../lib/types'
import { useAuth } from '../../lib/authProvider'
import { getTenantDefaultCupSizes } from '../../lib/tenantStorefrontApi'

type ImagePickerModule = typeof import('expo-image-picker')

async function loadImagePicker(): Promise<ImagePickerModule> {
  return import('expo-image-picker')
}

const SERVING_TYPES: ServingType[] = ['draft', 'can', 'bottle', 'flight', 'other']
const IMAGE_PREVIEW_MAX_SCALE = 4

function ZoomablePreviewImage({ uri }: { uri: string }) {
  const scale = useSharedValue(1)
  const savedScale = useSharedValue(1)
  const translateX = useSharedValue(0)
  const translateY = useSharedValue(0)
  const savedTranslateX = useSharedValue(0)
  const savedTranslateY = useSharedValue(0)

  const reset = () => {
    'worklet'
    scale.value = withSpring(1)
    savedScale.value = 1
    translateX.value = withSpring(0)
    translateY.value = withSpring(0)
    savedTranslateX.value = 0
    savedTranslateY.value = 0
  }

  const pinch = Gesture.Pinch()
    .onUpdate((event) => {
      scale.value = Math.min(IMAGE_PREVIEW_MAX_SCALE, Math.max(1, savedScale.value * event.scale))
    })
    .onEnd(() => {
      savedScale.value = scale.value
      if (scale.value <= 1) reset()
    })

  const pan = Gesture.Pan()
    .onUpdate((event) => {
      if (scale.value <= 1) return
      translateX.value = savedTranslateX.value + event.translationX
      translateY.value = savedTranslateY.value + event.translationY
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value
      savedTranslateY.value = translateY.value
    })

  const doubleTap = Gesture.Tap().numberOfTaps(2).onEnd(reset)
  const gesture = Gesture.Simultaneous(pinch, pan, doubleTap)
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }))

  return (
    <GestureDetector gesture={gesture}>
      <Animated.Image
        source={{ uri }}
        style={[styles.imagePreviewFull, animatedStyle]}
        resizeMode="contain"
      />
    </GestureDetector>
  )
}

function findEnabledSameNameDrink(drinks: DraftDrink[], name: string): DraftDrink | undefined {
  const normalized = name.trim().toLowerCase()
  if (!normalized) return undefined
  return drinks.find((d) => d.enabled && (d.name || '').trim().toLowerCase() === normalized)
}

export type DrinkEditorEntryPoint = 'tonight' | 'catalog'

interface Props {
  visible: boolean
  drink: DraftDrink | null
  tenantId: string | null
  categories: TaplistCategory[]
  isCreate?: boolean
  /** Entry decides default intent + whether listing controls are shown. */
  entryPoint?: DrinkEditorEntryPoint
  /** Override default intent from entryPoint. */
  saveIntent?: DrinkSaveIntent
  /** Suggested tap # when joining tonight (create / no existing tap). */
  suggestedTapNumber?: number | null
  /** Tenant catalog for local-dedup suggestions (create mode). */
  catalogDrinks?: DraftDrink[]
  /** User picked an existing local drink from suggestions. */
  onPickLocalDrink?: (drink: DraftDrink) => void
  onClose: () => void
  onSaved: (result?: DrinkUpsertResult, savedDrink?: DraftDrink) => void | Promise<void>
}

export default function DrinkEditSheet({
  visible,
  drink,
  tenantId,
  categories,
  isCreate,
  entryPoint = 'tonight',
  saveIntent: saveIntentProp,
  suggestedTapNumber,
  catalogDrinks = [],
  onPickLocalDrink,
  onClose,
  onSaved,
}: Props) {
  const { orderingEnabled } = useAuth()
  const defaultIntent: DrinkSaveIntent =
    entryPoint === 'catalog' ? 'product_only' : 'save_and_add_to_tonight'
  const primaryIntent = saveIntentProp ?? defaultIntent

  const [local, setLocal] = useState<DraftDrink | null>(drink)
  const [searching, setSearching] = useState(false)
  const [poolResults, setPoolResults] = useState<ProductSearchResult[]>([])
  const [poolSearchDone, setPoolSearchDone] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [pendingImage, setPendingImage] = useState<LocalImageAsset | null>(null)
  const [showImagePreview, setShowImagePreview] = useState(false)
  const [previewImageSize, setPreviewImageSize] = useState<{ width: number; height: number } | null>(null)
  const [abvText, setAbvText] = useState(
    drink?.profile.abv != null ? String(drink.profile.abv) : '',
  )
  const [statusEvents, setStatusEvents] = useState<DrinkStatusEvent[]>([])

  const searchSeq = useRef(0)
  const savingRef = useRef(false)

  useEffect(() => {
    let next = drink
    // Create: default to first enabled category (never a disabled one).
    if (drink && isCreate) {
      const assigned = drink.category_id
        ? categories.find((c) => c.id === drink.category_id)
        : null
      if (!assigned?.enabled) {
        const firstEnabled = categories.find((c) => c.enabled)
        if (firstEnabled) next = { ...(next || drink), category_id: firstEnabled.id }
      }
    }
    setLocal(next)
    setPoolResults([])
    setPoolSearchDone(false)
    setSaving(false)
    savingRef.current = false
    setSearching(false)
    setUploadingImage(false)
    setPendingImage(null)
    setShowImagePreview(false)
    setPreviewImageSize(null)
    setAbvText(drink?.profile.abv != null ? String(drink.profile.abv) : '')
    setStatusEvents([])
  }, [drink, entryPoint, isCreate, categories])

  useEffect(() => {
    if (!visible || !drink?.id || isCreate) {
      setStatusEvents([])
      return
    }
    let cancelled = false
    void getDrinkStatusEvents(drink.id)
      .then((events) => {
        if (!cancelled) setStatusEvents(events)
      })
      .catch(() => {
        if (!cancelled) setStatusEvents([])
      })
    return () => {
      cancelled = true
    }
  }, [visible, drink?.id, isCreate])

  const nameQuery = (local?.name ?? '').trim()
  const linkedProductId = local?.product_id ?? null

  const localMatches = useMemo(() => {
    if (!isCreate || !visible || linkedProductId || nameQuery.length < 1) return []
    return matchLocalDrinks(catalogDrinks, nameQuery)
  }, [isCreate, visible, linkedProductId, nameQuery, catalogDrinks])

  // Create mode: debounce product-pool search from 酒款名称.
  // Skip while linked — otherwise applying a pool hit renames the field and reopens suggestions.
  useEffect(() => {
    if (!visible || !isCreate || linkedProductId) {
      setPoolResults([])
      setPoolSearchDone(false)
      setSearching(false)
      return
    }
    if (nameQuery.length < 1) {
      setPoolResults([])
      setPoolSearchDone(false)
      setSearching(false)
      return
    }
    const seq = ++searchSeq.current
    setSearching(true)
    setPoolSearchDone(false)
    const timer = setTimeout(() => {
      void searchDrinkProducts(nameQuery)
        .then((rows) => {
          if (searchSeq.current === seq) setPoolResults(rows)
        })
        .catch(() => {
          if (searchSeq.current === seq) setPoolResults([])
        })
        .finally(() => {
          if (searchSeq.current === seq) {
            setSearching(false)
            setPoolSearchDone(true)
          }
        })
    }, 250)
    return () => clearTimeout(timer)
  }, [nameQuery, visible, isCreate, linkedProductId])

  const previewImageUri = pendingImage?.uri || local?.image_url || null

  useEffect(() => {
    if (!showImagePreview || !previewImageUri) {
      setPreviewImageSize(null)
      return
    }
    let cancelled = false
    Image.getSize(
      previewImageUri,
      (width, height) => {
        if (!cancelled) setPreviewImageSize({ width, height })
      },
      () => {
        if (!cancelled) setPreviewImageSize(null)
      },
    )
    return () => {
      cancelled = true
    }
  }, [previewImageUri, showImagePreview])

  if (!local) return null

  const patch = (p: Partial<DraftDrink>) => setLocal((d) => (d ? { ...d, ...p } : d))
  const patchProfile = (p: Partial<DraftDrink['profile']>) =>
    setLocal((d) => (d ? { ...d, profile: { ...d.profile, ...p } } : d))

  const setServing = (idx: number, p: Partial<DraftServing>) =>
    setLocal((d) => {
      if (!d) return d
      const servings = d.servings.map((s, i) => (i === idx ? { ...s, ...p } : s))
      return { ...d, servings }
    })

  const addServing = () =>
    setLocal((d) =>
      d ? { ...d, servings: [...d.servings, newDraftServing(d.id, d.servings.length)] } : d,
    )

  const fillDefaultCupSizes = async () => {
    if (!tenantId || !local) return
    try {
      const items = await getTenantDefaultCupSizes(tenantId)
      if (items.length === 0) {
        Alert.alert('未设置常用杯型', '请先在门店 → 常用杯型里设置，再一键填入。')
        return
      }
      setLocal((d) => {
        if (!d) return d
        // Keep tombstones for ANY persisted row we must remove on save — including
        // ones already marked _deleted. Dropping them would leave orphans in DB.
        const seenIds = new Set<string>()
        const toRemove: DraftServing[] = []
        for (const s of d.servings) {
          if (!s.id || s._new) continue
          if (seenIds.has(s.id)) continue
          seenIds.add(s.id)
          toRemove.push({ ...s, _deleted: true })
        }
        const filled: DraftServing[] = items.map((it, i) => ({
          ...newDraftServing(d.id, i),
          label: it.label || '',
          volume_ml: it.volume_ml,
          price: 0,
          serving_type: 'draft',
          is_default: i === 0,
          is_active: true,
        }))
        return { ...d, servings: [...toRemove, ...filled] }
      })
    } catch (e: any) {
      Alert.alert('填入失败', e?.message || '请重试')
    }
  }

  const deleteServing = (idx: number) =>
    setLocal((d) => {
      if (!d) return d
      const s = d.servings[idx]
      if (!s || s._deleted) return d
      if (s._new) {
        return { ...d, servings: d.servings.filter((_, i) => i !== idx) }
      }
      // Tombstone so save sends delete:true (hard delete or archive-if-in-orders).
      const servings = d.servings.map((x, i) => (i === idx ? { ...x, _deleted: true } : x))
      return { ...d, servings }
    })

  const makeDefault = (idx: number) =>
    setLocal((d) => {
      if (!d) return d
      const target = d.servings[idx]
      if (!target || target._deleted) return d
      const servings = d.servings.map((s, i) => ({
        ...s,
        is_default: !s._deleted && i === idx,
      }))
      return { ...d, servings }
    })

  const applyProduct = (p: ProductSearchResult) => {
    Keyboard.dismiss()
    // Invalidate any in-flight pool search before name update.
    searchSeq.current += 1
    setSearching(false)
    setPoolResults([])
    setPoolSearchDone(false)
    setLocal((d) => {
      if (!d) return d
      const applied = applyProductToDraftDrink(d, p)
      // Combobox search is the name field — always take the pool's full name.
      return { ...applied, name: p.name }
    })
    if (p.abv != null) setAbvText(String(p.abv))
  }

  const unlinkProduct = () => {
    setLocal((d) => (d ? { ...d, product_id: null } : d))
  }

  const onChangeName = (t: string) => {
    patch({ name: t })
  }

  const ensurePhotoLibraryPermission = (): Promise<boolean> =>
    new Promise(async (resolve) => {
      const ImagePicker = await loadImagePicker()
      const current = await ImagePicker.getMediaLibraryPermissionsAsync()
      if (current.granted) {
        resolve(true)
        return
      }
      if (!current.canAskAgain) {
        Alert.alert('需要相册权限', '请在系统设置中允许访问相册，以便上传酒款图片。')
        resolve(false)
        return
      }

      // Expo Go 的系统授权框是英文；先用中文说明用途，再唤起系统权限。
      Alert.alert(
        '需要访问相册',
        '上传酒款图片需要访问你的相册。点击「继续」后，请在下一步允许访问。',
        [
          { text: '取消', style: 'cancel', onPress: () => resolve(false) },
          {
            text: '继续',
            onPress: () => {
              void ImagePicker.requestMediaLibraryPermissionsAsync().then((perm) => {
                if (!perm.granted) {
                  Alert.alert('需要相册权限', '请在系统设置中允许访问相册，以便上传酒款图片。')
                  resolve(false)
                  return
                }
                resolve(true)
              })
            },
          },
        ],
      )
    })

  const pickDrinkImage = async () => {
    if (!local || !tenantId || uploadingImage || saving) return
    try {
      const ImagePicker = await loadImagePicker()
      const allowed = await ensurePhotoLibraryPermission()
      if (!allowed) return

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.7,
        exif: false,
      })
      if (result.canceled || !result.assets?.[0]) return

      const asset = result.assets[0]
      const localAsset: LocalImageAsset = {
        uri: asset.uri,
        mimeType: asset.mimeType,
        fileName: asset.fileName,
        fileSize: asset.fileSize,
      }

      if (localAsset.fileSize != null && localAsset.fileSize > TAPLIST_IMAGE_MAX_BYTES) {
        Alert.alert(
          '图片过大',
          `图片不能超过 ${Math.round(TAPLIST_IMAGE_MAX_BYTES / 1024 / 1024)}MB，请换一张或压缩后再传`,
        )
        return
      }

      // Create flow: keep local preview until save creates drink_id.
      if (isCreate || !local.id) {
        setPendingImage(localAsset)
        return
      }

      setPendingImage(localAsset)
      setUploadingImage(true)
      const publicUrl = await uploadDrinkImageFromAsset(tenantId, local.id, localAsset)
      setPendingImage(null)
      const withImage = { ...local, image_url: publicUrl }
      setLocal(withImage)
      const imageSave = await upsertDrinkProduct(tenantId, withImage, { includeServings: false })
      if (!imageSave.ok) {
        Alert.alert('图片已上传', '写入酒款失败，请再点保存。')
      }
    } catch (e: any) {
      Alert.alert('图片未上传成功', translateImageUploadError(e) + '\n图片已保留，可点「更换」重试。')
    } finally {
      setUploadingImage(false)
    }
  }

  const clearDrinkImage = () => {
    if (!local || uploadingImage || saving) return
    setPendingImage(null)
    const cleared = { ...local, image_url: null as string | null }
    setLocal(cleared)
    // Existing drink: clear URL in DB immediately. Create flow only clears draft.
    if (!isCreate && local.id && tenantId) {
      void upsertDrinkProduct(tenantId, cleared, { includeServings: false }).catch((e: any) => {
        Alert.alert('移除失败', e?.message || '请重试')
        setLocal(local)
      })
    }
  }

  const save = async (intent: DrinkSaveIntent) => {
    if (!local || saving || uploadingImage || savingRef.current) return
    if (!tenantId) {
      Alert.alert('无法保存', '未找到关联门店')
      return
    }
    // A direct tonight action always publishes the selected drink on that tap.
    const toSave: DraftDrink =
      intent === 'save_and_add_to_tonight'
        ? { ...local, is_public_visible: true }
        : local
    const issues = validateDraftDrink(toSave)
    if (issues.length) {
      Alert.alert('无法保存', issues.slice(0, 5).join('\n'))
      return
    }

    if (isCreate && toSave.name?.trim()) {
      const duplicate = findEnabledSameNameDrink(catalogDrinks, toSave.name)
      if (duplicate) {
        Alert.alert(
          '已有同名酒款',
          `商品库中已有名为「${duplicate.name}」的在售酒款，仍要创建？`,
          [
            { text: '取消', style: 'cancel' },
            { text: '仍要创建', onPress: () => void performSave(intent, toSave) },
          ],
        )
        return
      }
    }

    await performSave(intent, toSave)
  }

  const performSave = async (intent: DrinkSaveIntent, toSave: DraftDrink) => {
    if (!local || saving || uploadingImage || savingRef.current) return
    if (!tenantId) return
    savingRef.current = true
    setSaving(true)
    try {
      const tapNumber =
        intent === 'save_and_add_to_tonight'
          ? toSave.public_sort_order && toSave.public_sort_order > 0
            ? toSave.public_sort_order
            : suggestedTapNumber ?? null
          : null
      let res = await saveDrinkWithIntent(tenantId, toSave, intent, { tapNumber })

      // Product save and tap assignment are separate RPCs. If assignment fails,
      // keep editing the persisted product instead of inserting it again on retry.
      let savedDrink: DraftDrink = {
        ...toSave,
        id: res.drink_id || toSave.id,
      }
      if (res.drink_id) {
        if (res.servings) {
          savedDrink = withPersistedServings(savedDrink, res.servings as DraftServing[])
        } else {
          // Defensive: never leave `_new` servings in parent optimistic state.
          try {
            const servings = await loadDrinkServingsForEdit(res.drink_id)
            savedDrink = withPersistedServings(savedDrink, servings)
            res = { ...res, servings }
          } catch {
            savedDrink = { ...savedDrink, servings: [] }
          }
        }
        setLocal(savedDrink)
      }

      if (!res.ok) {
        const msg = (res.errors ?? []).map((e) => e.message).slice(0, 5).join('\n')
        Alert.alert(
          res.drink_id ? '商品已保存，尚未上枪' : '保存未完成',
          msg || '存在校验错误',
        )
        return
      }

      // New drink: upload pending image after we have drink_id, then persist URL only.
      if (pendingImage && res.drink_id) {
        setUploadingImage(true)
        try {
          const publicUrl = await uploadDrinkImageFromAsset(tenantId, res.drink_id, pendingImage)
          const withImage: DraftDrink = {
            ...savedDrink,
            id: res.drink_id,
            image_url: publicUrl,
          }
          const imageSave = await upsertDrinkProduct(tenantId, withImage, { includeServings: false })
          if (!imageSave.ok) {
            Alert.alert('已保存酒款', '图片上传后写入失败，请重新打开编辑器再试上传。')
          } else {
            setPendingImage(null)
            setLocal(withImage)
            savedDrink = withImage
            res = { ...res, ...imageSave, drink_id: res.drink_id, servings: res.servings }
          }
        } catch (e: any) {
          Alert.alert(
            '已保存酒款',
            `${translateImageUploadError(e)}\n酒款本身已保存，可稍后在编辑里再传图。`,
          )
        } finally {
          setUploadingImage(false)
        }
      }

      const finalDrink: DraftDrink = {
        ...savedDrink,
        ...(res.public_sort_order != null ? { public_sort_order: res.public_sort_order } : {}),
        ...(intent === 'save_and_add_to_tonight' ? { enabled: true, is_public_visible: true } : {}),
      }
      await onSaved(res, finalDrink)
    } catch (e: any) {
      Alert.alert('保存失败', e?.message || '请重试')
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  const activeServings = local.servings.filter((s) => !s._deleted)
  // Only enabled categories are selectable; keep current if it was disabled after assign.
  const selectableCategories = categories.filter(
    (c) => c.enabled || (!isCreate && c.id === local.category_id),
  )
  const selectedCategoryId =
    local.category_id ?? selectableCategories.find((c) => c.enabled)?.id ?? null
  const directTapNumber =
    primaryIntent === 'save_and_add_to_tonight' ? suggestedTapNumber : null
  const primaryLabel = directTapNumber
    ? `保存并上到 #${directTapNumber}`
    : entryPoint === 'catalog'
      ? '保存'
      : isCreate
        ? '保存并加入酒单'
        : '保存'
  const editorTitle = isCreate
    ? directTapNumber
      ? `为 #${directTapNumber} 上酒`
      : entryPoint === 'catalog'
        ? '新建商品'
        : '添加酒款'
    : local.display_name || local.name || '编辑酒款'

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.sheet}>
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} hitSlop={10} disabled={saving} style={styles.headerSide}>
              <Text style={styles.cancel}>取消</Text>
            </TouchableOpacity>
            <Text style={styles.title} numberOfLines={1}>
              {editorTitle}
            </Text>
            <View style={styles.headerSide} />
          </View>

          <ScrollView
            style={{ flexGrow: 0 }}
            contentContainerStyle={{ paddingBottom: 16 }}
            keyboardShouldPersistTaps="handled"
          >
            {/* 1. Category */}
            {selectableCategories.length > 0 ? (
              <>
                <Text style={[styles.sectionLabel, { marginTop: 0 }]}>分类</Text>
                <View style={styles.chipRowWrap}>
                  {selectableCategories.map((c) => {
                    const active = selectedCategoryId === c.id
                    return (
                      <TouchableOpacity
                        key={c.id}
                        onPress={() => patch({ category_id: c.id })}
                        style={[styles.typePill, active && styles.typePillActive]}
                      >
                        <Text style={[styles.typePillText, active && styles.typePillTextActive]}>
                          {c.name}
                          {!c.enabled ? '（已关闭）' : ''}
                        </Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>
              </>
            ) : null}

            {/* 2. Name combobox (create) / name field (edit) */}
            <Text style={[styles.sectionLabel, selectableCategories.length === 0 && { marginTop: 0 }]}>
              基本信息
            </Text>
            {isCreate ? (
              <View style={{ marginBottom: 12 }}>
                <Text style={styles.fieldLabel}>酒款名称</Text>
                <View style={styles.searchRow}>
                  <TextInput
                    style={[styles.input, { flex: 1, marginBottom: 0 }]}
                    value={local.name}
                    onChangeText={onChangeName}
                    placeholder="输入酒名，可匹配已有或商品池"
                    placeholderTextColor={T.faint}
                    autoCapitalize="none"
                    returnKeyType="search"
                  />
                  {searching ? (
                    <ActivityIndicator size="small" color={T.gold} style={{ width: 28 }} />
                  ) : null}
                </View>

                {!linkedProductId && localMatches.length > 0 ? (
                  <View style={styles.suggestGroup}>
                    <Text style={styles.suggestGroupTitle}>本店已有</Text>
                    {localMatches.map((d) => (
                      <TouchableOpacity
                        key={d.id}
                        style={styles.resultRow}
                        onPress={() => onPickLocalDrink?.(d)}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={styles.resultName} numberOfLines={1}>
                            {d.display_name || d.name}
                          </Text>
                          <Text style={styles.resultMeta} numberOfLines={1}>
                            {[d.profile?.brewery || d.brand_name, d.profile?.beer_style]
                              .filter(Boolean)
                              .join(' · ')}
                          </Text>
                        </View>
                        <Text style={styles.localBadge}>{d.enabled ? '已有' : '已下架'}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}

                {/* Prefer local dedup; hide pool when linked or this store already has hits. */}
                {!linkedProductId && localMatches.length === 0 && poolResults.length > 0 ? (
                  <View style={styles.suggestGroup}>
                    <Text style={styles.suggestGroupTitle}>商品池</Text>
                    {poolResults.map((r) => (
                      <TouchableOpacity
                        key={r.id}
                        style={styles.resultRow}
                        onPress={() => applyProduct(r)}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={styles.resultName} numberOfLines={1}>
                            {r.name}
                          </Text>
                          <Text style={styles.resultMeta} numberOfLines={1}>
                            {[r.brewery || r.brand_name, r.beer_style, r.abv ? `${r.abv}%` : null]
                              .filter(Boolean)
                              .join(' · ')}
                          </Text>
                        </View>
                        <Ionicons name="add-circle-outline" size={22} color={T.gold} />
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}

                {nameQuery.length >= 1 &&
                !local.product_id &&
                poolSearchDone &&
                !searching &&
                localMatches.length === 0 &&
                poolResults.length === 0 ? (
                  <Text style={styles.hintText}>未找到匹配，保存后将新建</Text>
                ) : null}

                {local.product_id ? (
                  <View style={styles.linkRow}>
                    <Text style={[styles.hintText, { flex: 1, marginTop: 0, marginBottom: 0 }]}>
                      已匹配商品池
                    </Text>
                    <TouchableOpacity onPress={unlinkProduct} hitSlop={8}>
                      <Text style={styles.unlinkText}>取消关联</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <Text style={styles.hintText}>
                    后台会审核新建商品，可能会修改商品属性，请理解。
                  </Text>
                )}
              </View>
            ) : (
              <Field label="酒款名称" value={local.name} onChange={(t) => patch({ name: t })} />
            )}

            {/* 3. Image */}
            <Text style={styles.sectionLabel}>图片</Text>
            {previewImageUri ? (
              <View style={styles.imagePreviewRow}>
                <Image source={{ uri: previewImageUri }} style={styles.imagePreview} />
                <View style={styles.imageActions}>
                  <TouchableOpacity
                    onPress={() => setShowImagePreview(true)}
                    style={styles.imageActionBtn}
                  >
                    <Ionicons name="expand-outline" size={18} color={T.gold} />
                    <Text style={styles.imageActionText}>查看原图</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => void pickDrinkImage()}
                    style={styles.imageActionBtn}
                    disabled={uploadingImage || saving}
                  >
                    {uploadingImage ? (
                      <ActivityIndicator color={T.gold} />
                    ) : (
                      <>
                        <Ionicons name="image-outline" size={18} color={T.gold} />
                        <Text style={styles.imageActionText}>更换</Text>
                      </>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={clearDrinkImage}
                    style={styles.clearImageBtn}
                    disabled={uploadingImage || saving}
                  >
                    <Ionicons name="trash-outline" size={18} color={T.danger} />
                    <Text style={styles.clearImageText}>移除</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.pickImageBtn}
                onPress={() => void pickDrinkImage()}
                disabled={uploadingImage || saving}
              >
                {uploadingImage ? (
                  <ActivityIndicator color={T.gold} />
                ) : (
                  <>
                    <Ionicons name="image-outline" size={20} color={T.gold} />
                    <Text style={styles.pickImageText}>从相册选择</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
            {isCreate && pendingImage ? (
              <Text style={styles.hint}>保存酒款后会自动上传图片</Text>
            ) : (
              <Text style={styles.hint}>支持 JPEG / PNG / WebP，最大 2MB</Text>
            )}

            {/* 5. Beer profile */}
            <Text style={styles.sectionLabel}>啤酒信息</Text>
            <Field label="酒厂" value={local.profile.brewery} onChange={(t) => patchProfile({ brewery: t })} />
            {(local.profile.collab_breweries ?? []).map((name, idx) => (
              <View key={`collab-${idx}`} style={styles.collabRow}>
                <View style={{ flex: 1 }}>
                  <Field
                    label={`合酿酒厂 ${idx + 1}`}
                    value={name}
                    onChange={(t) => {
                      const next = [...(local.profile.collab_breweries ?? [])]
                      next[idx] = t
                      patchProfile({ collab_breweries: next })
                    }}
                    placeholder="请填写合酿酒厂"
                  />
                </View>
                <TouchableOpacity
                  onPress={() => {
                    const next = (local.profile.collab_breweries ?? []).filter((_, i) => i !== idx)
                    patchProfile({ collab_breweries: next })
                  }}
                  style={styles.collabRemove}
                  hitSlop={8}
                >
                  <Ionicons name="close-circle-outline" size={22} color={T.danger} />
                </TouchableOpacity>
              </View>
            ))}
            {(local.profile.collab_breweries ?? []).length < 3 ? (
              <TouchableOpacity
                style={styles.addCollabBtn}
                onPress={() =>
                  patchProfile({
                    collab_breweries: [...(local.profile.collab_breweries ?? []), ''],
                  })
                }
              >
                <Text style={styles.addCollabText}>+ 添加合酿酒厂</Text>
              </TouchableOpacity>
            ) : null}
            <Field label="风格" value={local.profile.beer_style} onChange={(t) => patchProfile({ beer_style: t })} />
            <View style={styles.row2}>
              <View style={{ flex: 1 }}>
                <View style={{ marginBottom: 12 }}>
                  <Text style={styles.fieldLabel}>酒精度 %</Text>
                  <TextInput
                    style={[styles.input, { marginBottom: 0 }]}
                    value={abvText}
                    onChangeText={(t) => {
                      if (t !== '' && !/^\d*\.?\d*$/.test(t)) return
                      setAbvText(t)
                      if (t === '' || t === '.') {
                        patchProfile({ abv: null })
                        return
                      }
                      const n = Number(t)
                      if (!Number.isNaN(n)) patchProfile({ abv: n })
                    }}
                    keyboardType="decimal-pad"
                    placeholderTextColor={T.faint}
                    placeholder="例如 5.5"
                  />
                </View>
              </View>
              <View style={{ width: 12 }} />
              <View style={{ flex: 1 }}>
                <Field label="产地" value={local.profile.country} onChange={(t) => patchProfile({ country: t })} />
              </View>
            </View>
            <Field
              label="简介"
              value={local.profile.description}
              onChange={(t) => patchProfile({ description: t })}
              multiline
            />

            {/* 6. Status — only when editing from tonight listing flow (not catalog) */}
            {entryPoint === 'tonight' ? (
              <>
                <Text style={styles.sectionLabel}>状态</Text>
                <View style={styles.chipRowWrap}>
                  {EDITOR_STATUSES.map((s) => {
                    const vis = statusVisual(s)
                    const active = local.public_status === s
                    return (
                      <TouchableOpacity
                        key={s}
                        onPress={() => patch({ public_status: s })}
                        style={[
                          styles.chip,
                          {
                            borderColor: active ? vis.border : T.border,
                            backgroundColor: active ? vis.bg : 'transparent',
                          },
                        ]}
                      >
                        <Text style={[styles.chipText, { color: active ? vis.fg : T.muted }]}>
                          {vis.label}
                        </Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>
                {local.public_status === 'sold_out' ? (
                  <Text style={styles.hint}>当前为售罄，可在此改为上新/在售/即将上新，或在酒单列表操作。</Text>
                ) : null}
              </>
            ) : null}

            {/* 7. Servings */}
            <View style={styles.rowBetween}>
              <Text style={styles.sectionLabel}>规格 / 价格</Text>
              <View style={styles.servingActions}>
                <TouchableOpacity style={styles.addServingBtn} onPress={() => void fillDefaultCupSizes()}>
                  <Ionicons name="beaker-outline" size={16} color={T.gold} />
                  <Text style={styles.addServingText}>填入常用杯型</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.addServingBtn} onPress={addServing}>
                  <Ionicons name="add" size={16} color={T.gold} />
                  <Text style={styles.addServingText}>添加规格</Text>
                </TouchableOpacity>
              </View>
            </View>
            <Text style={styles.hint}>一键填入杯型，只需改价格。也可手填或删除多余规格。</Text>
            {activeServings.length === 0 ? (
              <Text style={styles.hint}>
                {orderingEnabled
                  ? '规格可选；未设置不影响加入酒单。有效价格规格可用于门店点单，是否公开显示价格由门店设置决定。'
                  : '规格可选；未设置不影响加入酒单。是否公开显示价格由门店设置决定。'}
              </Text>
            ) : activeServings.every((s) => !(Number(s.price) > 0)) ? (
              <Text style={styles.hint}>
                {orderingEnabled
                  ? '当前没有有效价格，无法用于门店点单；是否公开显示价格由门店设置决定。'
                  : '当前没有有效价格；是否公开显示价格由门店设置决定。'}
              </Text>
            ) : null}
            {local.servings.map((s, idx) => {
              if (s._deleted) return null
              return (
                <View key={s.id || s.client_id} style={styles.servingCard}>
                  <View style={styles.servingTypeRow}>
                    {SERVING_TYPES.map((st) => (
                      <TouchableOpacity
                        key={st}
                        onPress={() => setServing(idx, { serving_type: st })}
                        style={[styles.typePill, s.serving_type === st && styles.typePillActive]}
                      >
                        <Text
                          style={[styles.typePillText, s.serving_type === st && styles.typePillTextActive]}
                        >
                          {SERVING_TYPE_LABELS[st]}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <View style={styles.row2}>
                    <View style={{ flex: 1.2 }}>
                      <Field
                        label="名称（可选）"
                        value={s.label}
                        onChange={(t) => setServing(idx, { label: t })}
                        placeholder="如杯 / 瓶"
                      />
                    </View>
                    <View style={{ width: 10 }} />
                    <View style={{ flex: 1 }}>
                      <Field
                        label="容量 ml"
                        keyboard="number-pad"
                        value={s.volume_ml != null ? String(s.volume_ml) : ''}
                        onChange={(t) =>
                          setServing(idx, { volume_ml: t.trim() === '' ? null : parseInt(t) || 0 })
                        }
                        placeholder="可选"
                      />
                    </View>
                    <View style={{ width: 10 }} />
                    <View style={{ flex: 1 }}>
                      <Field
                        label="价格 ¥"
                        keyboard="decimal-pad"
                        value={s.price ? String(s.price) : ''}
                        onChange={(t) =>
                          setServing(idx, { price: t.trim() === '' ? 0 : Number(t) || 0 })
                        }
                      />
                    </View>
                  </View>
                  <View style={styles.servingFooter}>
                    <TouchableOpacity style={styles.defaultToggle} onPress={() => makeDefault(idx)}>
                      <Ionicons
                        name={s.is_default ? 'radio-button-on' : 'radio-button-off'}
                        size={18}
                        color={s.is_default ? T.gold : T.muted}
                      />
                      <Text style={styles.defaultToggleText}>主规格</Text>
                    </TouchableOpacity>
                    <View style={styles.defaultToggle}>
                      <Switch
                        value={s.is_active}
                        onValueChange={(v) => setServing(idx, { is_active: v })}
                        trackColor={{ false: '#3a3a3a', true: T.gold }}
                        thumbColor="#fff"
                      />
                      <Text style={styles.defaultToggleText}>供应中</Text>
                    </View>
                    <TouchableOpacity onPress={() => deleteServing(idx)} hitSlop={8}>
                      <Ionicons name="trash-outline" size={18} color={T.danger} />
                    </TouchableOpacity>
                  </View>
                </View>
              )
            })}

            {/* 8. Status history (edit only) */}
            {statusEvents.length > 0 ? (
              <View style={styles.statusHistory}>
                <Text style={styles.sectionLabel}>最近状态记录</Text>
                {statusEvents.slice(0, 5).map((ev) => (
                  <Text key={ev.id} style={styles.statusHistoryLine} numberOfLines={1}>
                    {(ev.from_status_zh || '—') + ' → ' + ev.to_status_zh}
                    {' · '}
                    {new Date(ev.created_at).toLocaleString('zh-CN', {
                      month: 'numeric',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                ))}
              </View>
            ) : null}
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.primarySave, (saving || uploadingImage) && { opacity: 0.6 }]}
              disabled={saving || uploadingImage}
              onPress={() => void save(primaryIntent)}
            >
              {saving ? (
                <ActivityIndicator size="small" color={T.background} />
              ) : (
                <Text style={styles.primarySaveText}>{primaryLabel}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        <Modal
          visible={showImagePreview}
          animationType="fade"
          transparent
          onRequestClose={() => setShowImagePreview(false)}
        >
          <GestureHandlerRootView style={styles.imagePreviewRoot}>
            <TouchableOpacity
              style={styles.imagePreviewBackdrop}
              activeOpacity={1}
              onPress={() => setShowImagePreview(false)}
            >
              <TouchableOpacity activeOpacity={1} style={styles.imagePreviewContent}>
                {showImagePreview && previewImageUri ? (
                  <ZoomablePreviewImage uri={previewImageUri} />
                ) : null}
                {previewImageSize ? (
                  <Text style={styles.imagePreviewSize}>
                    {previewImageSize.width} × {previewImageSize.height} px
                  </Text>
                ) : null}
                <TouchableOpacity
                  style={styles.imagePreviewClose}
                  onPress={() => setShowImagePreview(false)}
                  hitSlop={10}
                >
                  <Ionicons name="close" size={28} color="#fff" />
                </TouchableOpacity>
              </TouchableOpacity>
            </TouchableOpacity>
          </GestureHandlerRootView>
        </Modal>
      </KeyboardAvoidingView>
    </Modal>
  )
}

function Field({
  label,
  value,
  onChange,
  keyboard,
  multiline,
  placeholder,
}: {
  label: string
  value: string | null | undefined
  onChange: (t: string) => void
  keyboard?: 'default' | 'number-pad' | 'decimal-pad'
  multiline?: boolean
  placeholder?: string
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.input, { marginBottom: 0 }, multiline && { height: 80, textAlignVertical: 'top' }]}
        value={value ?? ''}
        onChangeText={onChange}
        keyboardType={keyboard ?? 'default'}
        placeholder={placeholder}
        placeholderTextColor={T.faint}
        multiline={multiline}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: T.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 18,
    paddingTop: 14,
    maxHeight: '92%',
    borderTopWidth: 1,
    borderColor: T.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: T.borderFaint,
    marginBottom: 14,
  },
  headerSide: { minWidth: 48 },
  cancel: { color: T.muted, fontSize: 15 },
  title: { color: T.text, fontSize: 16, fontWeight: '700', flex: 1, textAlign: 'center', marginHorizontal: 12 },
  sectionLabel: {
    color: T.goldSoft,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 18,
    marginBottom: 10,
  },
  collabRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  collabRemove: { marginTop: 28, padding: 4 },
  addCollabBtn: {
    alignSelf: 'flex-start',
    marginBottom: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: T.goldBorder,
  },
  addCollabText: { color: T.gold, fontSize: 13, fontWeight: '600' },
  hintText: {
    color: T.muted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
    marginBottom: 4,
  },
  fieldLabel: { color: T.muted, fontSize: 13, marginBottom: 6 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  row2: { flexDirection: 'row', alignItems: 'flex-start' },
  chipRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  chipRowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  chipText: { fontSize: 14, fontWeight: '600' },
  statusHistory: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: T.borderFaint,
    gap: 4,
  },
  statusHistoryLine: { color: T.faint, fontSize: 12 },
  input: {
    backgroundColor: T.surfaceMuted,
    color: T.text,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    borderWidth: 1,
    borderColor: T.border,
    marginBottom: 12,
  },
  imagePreviewRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 8 },
  imagePreview: { width: 72, height: 72, borderRadius: 8, backgroundColor: T.surfaceMuted },
  imageActions: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 14 },
  imageActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  imageActionText: { color: T.gold, fontSize: 14, fontWeight: '600' },
  clearImageBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  clearImageText: { color: T.danger, fontSize: 14 },
  imagePreviewRoot: { flex: 1 },
  imagePreviewBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  imagePreviewContent: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  imagePreviewFull: { width: '100%', height: '85%' },
  imagePreviewSize: { color: '#fff', fontSize: 13, marginTop: 12 },
  imagePreviewClose: { position: 'absolute', top: 24, right: 4, padding: 8 },
  pickImageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: T.goldBorder,
    backgroundColor: T.goldFill,
    marginBottom: 8,
  },
  pickImageText: { color: T.gold, fontSize: 15, fontWeight: '600' },
  searchRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    marginBottom: 4,
  },
  suggestGroup: { marginTop: 4 },
  suggestGroupTitle: {
    color: T.muted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 10,
    marginBottom: 2,
    letterSpacing: 0.5,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginTop: 8,
    borderRadius: 10,
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.borderFaint,
  },
  resultName: { color: T.text, fontSize: 15, fontWeight: '600' },
  resultMeta: { color: T.muted, fontSize: 12, marginTop: 2 },
  localBadge: { color: T.gold, fontSize: 13, fontWeight: '700', marginLeft: 8 },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
    marginBottom: 4,
  },
  unlinkText: { color: T.gold, fontSize: 13, fontWeight: '600' },
  hint: { color: T.faint, fontSize: 13, marginBottom: 8 },
  servingActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  addServingBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addServingText: { color: T.gold, fontSize: 14, fontWeight: '600' },
  servingCard: {
    backgroundColor: T.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: T.borderFaint,
  },
  servingTypeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  typePill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: T.border,
  },
  typePillActive: { backgroundColor: T.goldFill, borderColor: T.goldBorder },
  typePillText: { color: T.muted, fontSize: 13 },
  typePillTextActive: { color: T.text, fontWeight: '600' },
  servingFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  defaultToggle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  defaultToggleText: { color: T.muted, fontSize: 13 },
  footer: {
    borderTopWidth: 1,
    borderTopColor: T.borderFaint,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 24 : 14,
    gap: 8,
  },
  primarySave: {
    backgroundColor: T.gold,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  primarySaveText: { color: T.background, fontSize: 16, fontWeight: '700' },
})
