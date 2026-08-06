import { useEffect, useMemo, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Alert,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  TextInput,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useAuth } from '../../../lib/authProvider'
import { THEME, SPACING, RADIUS } from '../../../lib/theme'
import { Screen, SectionLabel, Card, Button, Field } from '../../../components/ui'
import { HouseSubheader } from '../../../components/house/HouseSubheader'
import {
  POS_EVENT_TYPES,
  getBarEvent,
  saveBarEvent,
  shanghaiTodayYmd,
  toShanghaiYmd,
  uploadBarEventImage,
  maskYmdInput,
  type BarEventSaveInput,
} from '../../../lib/barEventsApi'
import { translateImageUploadError } from '../../../lib/taplistMedia'

type ImagePickerModule = typeof import('expo-image-picker')

async function loadImagePicker(): Promise<ImagePickerModule> {
  return import('expo-image-picker')
}

function blankForm(): BarEventSaveInput & { id: string } {
  return {
    id: '',
    title: '',
    subtitle: '',
    description: '',
    event_type: 'party',
    image_url: null,
    startDate: '',
    endDate: '',
    timeLabel: '',
    is_public_visible: false,
  }
}

export default function EventEditScreen() {
  const router = useRouter()
  const { tenantId } = useAuth()
  const params = useLocalSearchParams<{ id?: string }>()
  const eventId = typeof params.id === 'string' ? params.id : ''
  const isNew = !eventId

  const [form, setForm] = useState(() => blankForm())
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [draftId] = useState(() =>
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `draft-${Date.now()}`,
  )

  const resolvedId = eventId || draftId

  useEffect(() => {
    if (!tenantId || isNew) {
      setLoading(false)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const row = await getBarEvent(tenantId, eventId)
        if (cancelled) return
        if (!row) {
          Alert.alert('未找到', '活动不存在或无权访问', [
            { text: '返回', onPress: () => router.back() },
          ])
          return
        }
        setForm({
          id: row.id,
          title: row.title,
          subtitle: row.subtitle || '',
          description: row.description || '',
          event_type: row.event_type || 'other',
          image_url: row.image_url,
          startDate: toShanghaiYmd(row.start_at),
          endDate: toShanghaiYmd(row.end_at) || toShanghaiYmd(row.start_at),
          timeLabel: row.time_label || '',
          is_public_visible: row.is_public_visible,
        })
      } catch (e: any) {
        if (!cancelled) Alert.alert('错误', e?.message || '加载失败')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [tenantId, eventId, isNew, router])

  const knownType = useMemo(
    () => POS_EVENT_TYPES.some((t) => t.value === form.event_type),
    [form.event_type],
  )

  const ensurePhotoLibraryPermission = (): Promise<boolean> =>
    new Promise(async (resolve) => {
      const ImagePicker = await loadImagePicker()
      const current = await ImagePicker.getMediaLibraryPermissionsAsync()
      if (current.granted) {
        resolve(true)
        return
      }
      if (!current.canAskAgain) {
        Alert.alert('需要相册权限', '请在系统设置中允许访问相册，以便上传活动海报。')
        resolve(false)
        return
      }
      Alert.alert(
        '需要访问相册',
        '上传活动海报需要访问你的相册。点击「继续」后，请在下一步允许访问。',
        [
          { text: '取消', style: 'cancel', onPress: () => resolve(false) },
          {
            text: '继续',
            onPress: () => {
              void ImagePicker.requestMediaLibraryPermissionsAsync().then((perm) => {
                if (!perm.granted) {
                  Alert.alert('需要相册权限', '请在系统设置中允许访问相册。')
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

  const pickImage = async () => {
    if (!tenantId) return
    const ok = await ensurePhotoLibraryPermission()
    if (!ok) return
    const ImagePicker = await loadImagePicker()
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsEditing: false,
    })
    if (result.canceled || !result.assets?.[0]) return
    const asset = result.assets[0]
    setUploading(true)
    try {
      const url = await uploadBarEventImage(tenantId, resolvedId, {
        uri: asset.uri,
        mimeType: asset.mimeType,
        fileName: asset.fileName,
        fileSize: asset.fileSize,
      })
      setForm((prev) => ({ ...prev, image_url: url, id: prev.id || resolvedId }))
    } catch (e: any) {
      Alert.alert('图片未上传成功', translateImageUploadError(e))
    } finally {
      setUploading(false)
    }
  }

  const setDatePreset = (mode: 'clear' | 'today' | 'tomorrow') => {
    if (mode === 'clear') {
      setForm((prev) => ({ ...prev, startDate: '', endDate: '' }))
      return
    }
    const today = shanghaiTodayYmd()
    if (mode === 'today') {
      setForm((prev) => ({ ...prev, startDate: today, endDate: today }))
      return
    }
    const [y, m, d] = today.split('-').map(Number)
    const next = new Date(Date.UTC(y, m - 1, d + 1))
    const ymd = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(next)
    setForm((prev) => ({ ...prev, startDate: ymd, endDate: ymd }))
  }

  const persist = async (publish: boolean) => {
    if (!tenantId) return
    setSaving(true)
    try {
      await saveBarEvent(tenantId, {
        ...form,
        id: form.id || resolvedId,
        is_public_visible: publish,
        startDate: form.startDate || null,
        endDate: form.endDate || form.startDate || null,
      })
      Alert.alert('已保存', publish ? '活动已对顾客公开' : '已保存为未公开', [
        { text: '好的', onPress: () => router.back() },
      ])
    } catch (e: any) {
      Alert.alert('保存失败', e?.message || '请检查填写内容')
    } finally {
      setSaving(false)
    }
  }

  const onSaveDraft = () => void persist(false)
  const onSavePublish = () => {
    if (!form.image_url?.trim()) {
      Alert.alert('需要海报', '公开活动请先上传海报图')
      return
    }
    Alert.alert('公开此活动？', '活动将同步展示在公开网页和 No Menu 中。', [
      { text: '取消', style: 'cancel' },
      { text: '公开', onPress: () => void persist(true) },
    ])
  }

  if (loading) {
    return (
      <Screen>
        <ActivityIndicator color={THEME.gold} style={{ marginTop: 40 }} />
      </Screen>
    )
  }

  return (
    <Screen scroll keyboard>
      <HouseSubheader title={isNew ? '新建活动' : '编辑活动'} />

      <SectionLabel>海报</SectionLabel>
      <Card>
        {form.image_url ? (
          <Image source={{ uri: form.image_url }} style={styles.poster} resizeMode="cover" />
        ) : (
          <View style={[styles.poster, styles.posterEmpty]}>
            <Ionicons name="image-outline" size={28} color={THEME.faint} />
            <Text style={styles.hint}>公开前需要海报</Text>
          </View>
        )}
        <Button
          label={form.image_url ? '更换海报' : '从相册选择'}
          variant="secondary"
          icon="images-outline"
          loading={uploading}
          disabled={uploading}
          onPress={() => void pickImage()}
          style={{ marginTop: SPACING.md }}
        />
      </Card>

      <SectionLabel>基本信息</SectionLabel>
      <Card style={{ gap: SPACING.md }}>
        <Field
          placeholder="标题（必填）"
          value={form.title}
          onChangeText={(title) => setForm((p) => ({ ...p, title }))}
        />
        <Field
          placeholder="副标题（可选）"
          value={form.subtitle || ''}
          onChangeText={(subtitle) => setForm((p) => ({ ...p, subtitle }))}
        />
        <Text style={styles.fieldLabel}>类型</Text>
        <View style={styles.chipWrap}>
          {POS_EVENT_TYPES.map((t) => {
            const active = form.event_type === t.value
            return (
              <TouchableOpacity
                key={t.value + t.label}
                onPress={() => setForm((p) => ({ ...p, event_type: t.value }))}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{t.label}</Text>
              </TouchableOpacity>
            )
          })}
          {!knownType ? (
            <View style={[styles.chip, styles.chipActive]}>
              <Text style={styles.chipTextActive}>{form.event_type}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.fieldLabel}>说明（可选）</Text>
        <TextInput
          placeholder="活动介绍"
          placeholderTextColor={THEME.faint}
          value={form.description || ''}
          onChangeText={(description) => setForm((p) => ({ ...p, description }))}
          multiline
          style={styles.descriptionInput}
        />
      </Card>

      <SectionLabel>日期（可选）</SectionLabel>
      <Card style={{ gap: SPACING.md }}>
        <Text style={styles.hint}>
          不填日期则为长期展示：开公开就出现在顾客端，关掉即消失。填写日期后，活动会在结束日自动下架。
        </Text>
        <View style={styles.choiceRow}>
          {(
            [
              { key: 'clear' as const, label: '长期' },
              { key: 'today' as const, label: '今天' },
              { key: 'tomorrow' as const, label: '明天' },
            ] as const
          ).map((opt) => {
            const active =
              opt.key === 'clear'
                ? !form.startDate
                : opt.key === 'today'
                  ? form.startDate === shanghaiTodayYmd() && form.endDate === form.startDate
                  : false
            return (
              <TouchableOpacity
                key={opt.key}
                onPress={() => setDatePreset(opt.key)}
                style={[styles.choiceChip, active && styles.choiceChipActive]}
              >
                <Text style={[styles.choiceChipText, active && styles.choiceChipTextActive]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            )
          })}
        </View>
        <Field
          placeholder="开始日期 2026-08-04"
          value={form.startDate || ''}
          onChangeText={(raw) => {
            const startDate = maskYmdInput(raw)
            setForm((p) => ({
              ...p,
              startDate,
              endDate: !p.endDate || p.endDate === p.startDate ? startDate : p.endDate,
            }))
          }}
          keyboardType="number-pad"
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={10}
        />
        <Field
          placeholder="结束日期 2026-08-04（可同日）"
          value={form.endDate || ''}
          onChangeText={(raw) => setForm((p) => ({ ...p, endDate: maskYmdInput(raw) }))}
          keyboardType="number-pad"
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={10}
        />
        <Field
          placeholder="时段文案（可选）如 18:00–24:00"
          value={form.timeLabel || ''}
          onChangeText={(timeLabel) => setForm((p) => ({ ...p, timeLabel }))}
        />
      </Card>

      <View style={{ gap: SPACING.md, marginTop: SPACING.lg, marginBottom: SPACING.xl }}>
        <Button
          label="保存并公开"
          icon="eye-outline"
          loading={saving}
          disabled={saving || uploading}
          onPress={onSavePublish}
        />
        <Button
          label="保存为未公开"
          variant="secondary"
          loading={saving}
          disabled={saving || uploading}
          onPress={onSaveDraft}
        />
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  backBtn: { marginTop: -4 },
  poster: {
    width: '100%',
    height: 180,
    borderRadius: RADIUS.md,
    backgroundColor: THEME.surface,
  },
  posterEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  hint: { color: THEME.muted, fontSize: 13, lineHeight: 18 },
  fieldLabel: { color: THEME.muted, fontSize: 13, fontWeight: '600' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  chipActive: {
    backgroundColor: THEME.goldFill,
    borderColor: THEME.goldBorder,
  },
  chipText: { color: THEME.muted, fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: THEME.gold },
  choiceRow: { flexDirection: 'row', gap: SPACING.sm },
  choiceChip: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: THEME.border,
    alignItems: 'center',
  },
  choiceChipActive: {
    backgroundColor: THEME.goldFill,
    borderColor: THEME.goldBorder,
  },
  choiceChipText: { color: THEME.muted, fontSize: 14, fontWeight: '600' },
  choiceChipTextActive: { color: THEME.gold },
  descriptionInput: {
    minHeight: 88,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    color: THEME.text,
    fontSize: 15,
    textAlignVertical: 'top',
  },
})
