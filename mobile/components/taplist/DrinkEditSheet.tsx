import { useEffect, useRef, useState } from 'react'
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
  Platform,
  Image,
  Alert,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { TAPLIST_THEME as T, SERVING_TYPE_LABELS, EDITOR_STATUSES, statusVisual } from '../../lib/taplistTheme'
import {
  type DraftDrink,
  type DraftServing,
  type DrinkStatusEvent,
  type ProductSearchResult,
  applyProductToDraftDrink,
  getDrinkStatusEvents,
  newDraftServing,
  saveDrinkWithIntent,
  searchDrinkProducts,
  validateDraftDrink,
} from '../../lib/taplistOwnerApi'
import type { DrinkSaveIntent, DrinkUpsertResult, ServingType, TaplistCategory } from '../../lib/types'

const SERVING_TYPES: ServingType[] = ['draft', 'can', 'bottle', 'flight', 'other']

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
  onClose: () => void
  onSaved: (result?: DrinkUpsertResult) => void | Promise<void>
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
  onClose,
  onSaved,
}: Props) {
  const defaultIntent: DrinkSaveIntent =
    entryPoint === 'catalog' ? 'product_only' : 'save_and_add_to_tonight'
  const primaryIntent = saveIntentProp ?? defaultIntent

  const [local, setLocal] = useState<DraftDrink | null>(drink)
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<ProductSearchResult[]>([])
  const [saving, setSaving] = useState(false)
  const [abvText, setAbvText] = useState(
    drink?.profile.abv != null ? String(drink.profile.abv) : '',
  )
  const [statusEvents, setStatusEvents] = useState<DrinkStatusEvent[]>([])

  const searchSeq = useRef(0)

  useEffect(() => {
    setLocal(drink)
    setQuery('')
    setResults([])
    setSaving(false)
    setSearching(false)
    setAbvText(drink?.profile.abv != null ? String(drink.profile.abv) : '')
    setStatusEvents([])
  }, [drink, entryPoint])

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

  // Autocomplete: debounce product-pool search while typing
  useEffect(() => {
    if (!visible) return
    const q = query.trim()
    if (q.length < 1) {
      setResults([])
      setSearching(false)
      return
    }
    const seq = ++searchSeq.current
    setSearching(true)
    const timer = setTimeout(() => {
      void searchDrinkProducts(q)
        .then((rows) => {
          if (searchSeq.current === seq) setResults(rows)
        })
        .catch(() => {
          if (searchSeq.current === seq) setResults([])
        })
        .finally(() => {
          if (searchSeq.current === seq) setSearching(false)
        })
    }, 250)
    return () => clearTimeout(timer)
  }, [query, visible])

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

  const deleteServing = (idx: number) =>
    setLocal((d) => {
      if (!d) return d
      const s = d.servings[idx]
      if (s._new) {
        return { ...d, servings: d.servings.filter((_, i) => i !== idx) }
      }
      const servings = d.servings.map((x, i) => (i === idx ? { ...x, _deleted: true } : x))
      return { ...d, servings }
    })

  const makeDefault = (idx: number) =>
    setLocal((d) => {
      if (!d) return d
      const servings = d.servings.map((s, i) => ({ ...s, is_default: i === idx }))
      return { ...d, servings }
    })

  const applyProduct = (p: ProductSearchResult) => {
    setLocal((d) => {
      if (!d) return d
      const applied = applyProductToDraftDrink(d, p)
      return {
        ...applied,
        name: d.name.trim() ? d.name : p.name,
      }
    })
    if (p.abv != null) setAbvText(String(p.abv))
    setResults([])
    setQuery('')
  }

  const save = async (intent: DrinkSaveIntent) => {
    if (!local || saving) return
    if (!tenantId) {
      Alert.alert('无法保存', '未找到关联门店')
      return
    }
    // Visibility is list-controlled; new tonight drinks always start public.
    const toSave: DraftDrink =
      entryPoint === 'tonight' && isCreate
        ? { ...local, is_public_visible: true }
        : local
    const issues = validateDraftDrink(toSave)
    if (issues.length) {
      Alert.alert('无法保存', issues.slice(0, 5).join('\n'))
      return
    }
    setSaving(true)
    try {
      const tapNumber =
        intent === 'save_and_add_to_tonight'
          ? toSave.public_sort_order && toSave.public_sort_order > 0
            ? toSave.public_sort_order
            : suggestedTapNumber ?? null
          : null
      const res = await saveDrinkWithIntent(tenantId, toSave, intent, { tapNumber })
      if (!res.ok) {
        const msg = (res.errors ?? []).map((e) => e.message).slice(0, 5).join('\n')
        Alert.alert('保存未完成', msg || '存在校验错误')
        return
      }
      if (res.missing_price_warning || res.pos_orderable === false) {
        Alert.alert('已保存', '未设置有效价格规格：顾客端仍可公开展示，但 POS 暂不可点单。')
      }
      await onSaved(res)
    } catch (e: any) {
      Alert.alert('保存失败', e?.message || '请重试')
    } finally {
      setSaving(false)
    }
  }

  const activeServings = local.servings.filter((s) => !s._deleted)
  const selectedCategoryId = local.category_id ?? categories[0]?.id ?? null
  // One primary action per entry — tonight edit is just "保存" (product + listing).
  const primaryLabel =
    entryPoint === 'catalog'
      ? '保存'
      : isCreate
        ? '保存并加入酒单'
        : '保存'

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
              {isCreate
                ? entryPoint === 'catalog'
                  ? '新建商品'
                  : '添加酒款'
                : local.display_name || local.name || '编辑酒款'}
            </Text>
            <View style={styles.headerSide} />
          </View>

          <ScrollView
            style={{ flexGrow: 0 }}
            contentContainerStyle={{ paddingBottom: 16 }}
            keyboardShouldPersistTaps="handled"
          >
            {/* 1. Category */}
            {categories.length > 0 ? (
              <>
                <Text style={[styles.sectionLabel, { marginTop: 0 }]}>分类</Text>
                <View style={styles.chipRowWrap}>
                  {categories.map((c) => {
                    const active = selectedCategoryId === c.id
                    return (
                      <TouchableOpacity
                        key={c.id}
                        onPress={() => patch({ category_id: c.id })}
                        style={[styles.typePill, active && styles.typePillActive]}
                      >
                        <Text style={[styles.typePillText, active && styles.typePillTextActive]}>
                          {c.name}
                        </Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>
              </>
            ) : null}

            {/* 2. Product pool autofill */}
            <Text style={[styles.sectionLabel, categories.length === 0 && { marginTop: 0 }]}>
              从酒库填充（可选）
            </Text>
            <View style={styles.searchRow}>
              <TextInput
                style={[styles.input, { flex: 1, marginBottom: 0 }]}
                value={query}
                onChangeText={setQuery}
                placeholder="输入啤酒名 / 酒厂，自动搜索"
                placeholderTextColor={T.faint}
                autoCapitalize="none"
                returnKeyType="search"
              />
              {searching ? (
                <ActivityIndicator size="small" color={T.gold} style={{ width: 28 }} />
              ) : query.trim() ? (
                <TouchableOpacity
                  onPress={() => {
                    setQuery('')
                    setResults([])
                  }}
                  hitSlop={8}
                >
                  <Ionicons name="close-circle" size={20} color={T.faint} />
                </TouchableOpacity>
              ) : (
                <Ionicons name="search" size={18} color={T.faint} />
              )}
            </View>
            {results.map((r) => (
              <TouchableOpacity key={r.id} style={styles.resultRow} onPress={() => applyProduct(r)}>
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

            {/* 3. Basic info */}
            <Text style={styles.sectionLabel}>基本信息</Text>
            <Field label="酒款名称" value={local.name} onChange={(t) => patch({ name: t })} />

            {/* 4. Image — URL input hidden until upload lands */}
            <Text style={styles.sectionLabel}>图片</Text>
            {local.image_url ? (
              <View style={styles.imagePreviewRow}>
                <Image source={{ uri: local.image_url }} style={styles.imagePreview} />
                <TouchableOpacity onPress={() => patch({ image_url: null })} style={styles.clearImageBtn}>
                  <Ionicons name="trash-outline" size={18} color={T.danger} />
                  <Text style={styles.clearImageText}>移除图片</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <Text style={styles.hint}>图片上传稍后开放</Text>
            )}

            {/* 5. Beer profile */}
            <Text style={styles.sectionLabel}>啤酒信息</Text>
            <Field label="酒厂" value={local.profile.brewery} onChange={(t) => patchProfile({ brewery: t })} />
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
                  <Text style={styles.hint}>当前为售罄，可在此改为上新/在售/即将上枪，或在酒单列表操作。</Text>
                ) : null}
              </>
            ) : null}

            {/* 7. Servings */}
            <View style={styles.rowBetween}>
              <Text style={styles.sectionLabel}>规格 / 价格</Text>
              <TouchableOpacity style={styles.addServingBtn} onPress={addServing}>
                <Ionicons name="add" size={16} color={T.gold} />
                <Text style={styles.addServingText}>添加规格</Text>
              </TouchableOpacity>
            </View>
            {activeServings.length === 0 ? (
              <Text style={styles.hint}>暂无规格：仍可公开展示，但 POS 不可点单。</Text>
            ) : activeServings.every((s) => !(Number(s.price) > 0)) ? (
              <Text style={styles.hint}>不可点单：未设置有效价格（公开不受影响）。</Text>
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
                      <Text style={styles.defaultToggleText}>默认展示</Text>
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
              style={[styles.primarySave, saving && { opacity: 0.6 }]}
              disabled={saving}
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
  imagePreviewRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 12 },
  imagePreview: { width: 64, height: 64, borderRadius: 8, backgroundColor: T.surfaceMuted },
  clearImageBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  clearImageText: { color: T.danger, fontSize: 14 },
  searchRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    marginBottom: 4,
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
  hint: { color: T.faint, fontSize: 13, marginBottom: 8 },
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
