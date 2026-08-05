import { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Alert,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '../../../lib/authProvider'
import { THEME, SPACING } from '../../../lib/theme'
import { Screen, Card, Button, Field } from '../../../components/ui'
import { HouseSubheader } from '../../../components/house/HouseSubheader'
import {
  getTenantDefaultCupSizes,
  setTenantDefaultCupSizes,
} from '../../../lib/tenantStorefrontApi'

type DraftRow = {
  key: string
  label: string
  volumeText: string
}

const MAX_ROWS = 4

function newRow(): DraftRow {
  return {
    key: `row-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    label: '',
    volumeText: '',
  }
}

export default function HouseCupSizesScreen() {
  const { tenantId } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [rows, setRows] = useState<DraftRow[]>([newRow()])

  const load = useCallback(async () => {
    if (!tenantId) return
    setLoading(true)
    try {
      const items = await getTenantDefaultCupSizes(tenantId)
      if (items.length === 0) {
        setRows([newRow()])
      } else {
        setRows(
          items.map((it, i) => ({
            key: `saved-${i}-${it.sort_order}`,
            label: it.label || '',
            volumeText: it.volume_ml != null ? String(it.volume_ml) : '',
          })),
        )
      }
    } catch (e: any) {
      Alert.alert('加载失败', e?.message || '请重试')
    } finally {
      setLoading(false)
    }
  }, [tenantId])

  useEffect(() => {
    void load()
  }, [load])

  const patchRow = (key: string, p: Partial<DraftRow>) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...p } : r)))
  }

  const removeRow = (key: string) => {
    setRows((prev) => {
      const next = prev.filter((r) => r.key !== key)
      return next.length === 0 ? [newRow()] : next
    })
  }

  const addRow = () => {
    if (rows.length >= MAX_ROWS) {
      Alert.alert('提示', `常用杯型最多 ${MAX_ROWS} 个`)
      return
    }
    setRows((prev) => [...prev, newRow()])
  }

  const handleSave = async () => {
    if (!tenantId || saving) return

    const parsed: { label: string | null; volume_ml: number | null }[] = []
    for (const r of rows) {
      const label = r.label.trim() || null
      const volRaw = r.volumeText.replace(/\D/g, '')
      const volume_ml = volRaw ? parseInt(volRaw, 10) : null
      if (volume_ml != null && (!Number.isFinite(volume_ml) || volume_ml <= 0)) {
        Alert.alert('提示', '容量请填写大于 0 的整数毫升')
        return
      }
      if (!label && volume_ml == null) {
        // allow blank draft rows only if every row is blank → save empty
        continue
      }
      parsed.push({ label, volume_ml })
    }

    // If user left only empty rows, treat as clear
    const nonEmptyDraft = rows.some((r) => r.label.trim() || r.volumeText.replace(/\D/g, ''))
    if (nonEmptyDraft && parsed.length === 0) {
      Alert.alert('提示', '每一行请至少填写名称或容量')
      return
    }
    if (parsed.length > MAX_ROWS) {
      Alert.alert('提示', `常用杯型最多 ${MAX_ROWS} 个`)
      return
    }

    setSaving(true)
    try {
      const saved = await setTenantDefaultCupSizes(tenantId, parsed)
      if (saved.length === 0) {
        setRows([newRow()])
      } else {
        setRows(
          saved.map((it, i) => ({
            key: `saved-${i}-${it.sort_order}`,
            label: it.label || '',
            volumeText: it.volume_ml != null ? String(it.volume_ml) : '',
          })),
        )
      }
      Alert.alert(
        '已保存',
        saved.length === 0
          ? '已清空常用杯型。编辑酒款时可手填规格。'
          : `已保存 ${saved.length} 个常用杯型。编辑酒款时可一键填入。`,
      )
    } catch (e: any) {
      Alert.alert('保存失败', e?.message || '请重试')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <Screen>
        <HouseSubheader title="常用杯型" />
        <ActivityIndicator color={THEME.gold} style={{ marginTop: 40 }} />
      </Screen>
    )
  }

  return (
    <Screen scroll keyboard>
      <HouseSubheader title="常用杯型" />
      <Text style={styles.lead}>
        设置本店常用杯型（名称、容量）。编辑酒款时可一键填入，只需改价格。不设价格。
      </Text>

      {rows.map((r, idx) => (
        <Card key={r.key} style={styles.rowCard}>
          <View style={styles.rowHeader}>
            <Text style={styles.rowTitle}>杯型 {idx + 1}</Text>
            <TouchableOpacity onPress={() => removeRow(r.key)} hitSlop={8}>
              <Ionicons name="trash-outline" size={18} color={THEME.danger} />
            </TouchableOpacity>
          </View>
          <View style={styles.fieldsRow}>
            <View style={{ flex: 1.2 }}>
              <Field
                label="名称（可选）"
                value={r.label}
                onChangeText={(label) => patchRow(r.key, { label })}
                placeholder="如 S / 杯"
              />
            </View>
            <View style={{ width: SPACING.sm }} />
            <View style={{ flex: 1 }}>
              <Field
                label="容量 ml（可选）"
                value={r.volumeText}
                onChangeText={(volumeText) =>
                  patchRow(r.key, { volumeText: volumeText.replace(/\D/g, '').slice(0, 5) })
                }
                placeholder="如 300"
                keyboardType="number-pad"
                maxLength={5}
              />
            </View>
          </View>
          <Text style={styles.rowHint}>名称与容量至少一个即可</Text>
        </Card>
      ))}

      {rows.length < MAX_ROWS ? (
        <Button
          label="添加杯型"
          variant="secondary"
          icon="add-outline"
          onPress={addRow}
          style={{ marginBottom: SPACING.md }}
        />
      ) : null}

      <Button label="保存" icon="checkmark-outline" loading={saving} onPress={() => void handleSave()} />
    </Screen>
  )
}

const styles = StyleSheet.create({
  lead: {
    color: THEME.muted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: SPACING.lg,
  },
  rowCard: { marginBottom: SPACING.md },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  rowTitle: { color: THEME.text, fontSize: 15, fontWeight: '700' },
  fieldsRow: { flexDirection: 'row', alignItems: 'flex-start' },
  rowHint: { color: THEME.faint, fontSize: 12, marginTop: -SPACING.sm },
})
