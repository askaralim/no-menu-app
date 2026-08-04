import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Alert,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native'
import { useAuth } from '../../../lib/authProvider'
import { THEME, SPACING, RADIUS } from '../../../lib/theme'
import { Screen, SectionLabel, Card, Button, Field } from '../../../components/ui'
import { HouseSubheader } from '../../../components/house/HouseSubheader'
import {
  getBarTagCatalog,
  groupTagsByCategory,
  listEnabledTaplistCities,
  loadTenantStorefront,
  saveTenantStorefront,
  type BarTagDefinition,
  type TaplistCityOption,
} from '../../../lib/tenantStorefrontApi'

function validHm(v: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(v.trim())
}

/** Digits-only clock input → HH:mm (max 4 digits). */
function maskHmInput(raw: string): string {
  const digits = String(raw || '')
    .replace(/\D/g, '')
    .slice(0, 4)
  if (digits.length <= 2) return digits
  return `${digits.slice(0, 2)}:${digits.slice(2)}`
}

function cityKeyEquals(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

export default function HouseProfileScreen() {
  const { tenantId, refreshMembership } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [district, setDistrict] = useState('')
  const [address, setAddress] = useState('')
  const [description, setDescription] = useState('')
  const [city, setCity] = useState('Shanghai')
  const [cities, setCities] = useState<TaplistCityOption[]>([])
  const [openHm, setOpenHm] = useState('')
  const [closeHm, setCloseHm] = useState('')
  const [hoursEnabled, setHoursEnabled] = useState(false)
  const [catalog, setCatalog] = useState<BarTagDefinition[]>([])
  const [selectedKeys, setSelectedKeys] = useState<string[]>([])

  const load = useCallback(async () => {
    if (!tenantId) return
    setLoading(true)
    try {
      const [store, tags, cityRows] = await Promise.all([
        loadTenantStorefront(tenantId),
        getBarTagCatalog(),
        listEnabledTaplistCities(),
      ])
      const nextCity = store.city || 'Shanghai'
      setDisplayName(store.display_name || '')
      setDistrict(store.district || '')
      setAddress(store.address || '')
      setDescription(store.description || '')
      setCity(nextCity)
      // Keep current tenant city visible even if not in enabled catalog yet.
      const hasCurrent = cityRows.some((c) => cityKeyEquals(c.city, nextCity))
      setCities(
        hasCurrent || !nextCity
          ? cityRows
          : [...cityRows, { city: nextCity, label: nextCity, sort_order: 999 }],
      )
      if (store.opening_hour) {
        setHoursEnabled(true)
        setOpenHm(store.opening_hour.open)
        setCloseHm(store.opening_hour.close)
      } else {
        setHoursEnabled(false)
        setOpenHm('17:00')
        setCloseHm('02:00')
      }
      setSelectedKeys(store.tag_keys)
      setCatalog(tags)
    } catch (e: any) {
      Alert.alert('加载失败', e?.message || '请重试')
    } finally {
      setLoading(false)
    }
  }, [tenantId])

  useEffect(() => {
    void load()
  }, [load])

  const grouped = useMemo(() => groupTagsByCategory(catalog), [catalog])

  const toggleTag = (key: string) => {
    setSelectedKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    )
  }

  const handleSave = async () => {
    if (!tenantId || saving) return
    if (hoursEnabled) {
      if (!validHm(openHm) || !validHm(closeHm)) {
        Alert.alert('提示', '请填写完整时间，例如开门 17:00、打烊 02:00')
        return
      }
    }
    setSaving(true)
    try {
      await saveTenantStorefront(tenantId, {
        display_name: displayName,
        district,
        address,
        description,
        city,
        opening_hour: hoursEnabled
          ? { open: openHm.trim(), close: closeHm.trim() }
          : null,
        tag_keys: selectedKeys,
      })
      await refreshMembership()
      Alert.alert('已保存', '门店资料已更新')
    } catch (e: any) {
      Alert.alert('保存失败', e?.message || '请重试')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <Screen>
        <HouseSubheader title="基本信息" />
        <ActivityIndicator color={THEME.gold} style={{ marginTop: 40 }} />
      </Screen>
    )
  }

  return (
    <Screen scroll keyboard>
      <HouseSubheader title="基本信息" />
      <Card>
        <Field label="展示名" value={displayName} onChangeText={setDisplayName} placeholder="顾客看到的店名" />
        <Field label="区域商圈" value={district} onChangeText={setDistrict} placeholder="如 静安 / 武康路" />
        <Field label="地址" value={address} onChangeText={setAddress} placeholder="详细地址" />
        <Text style={styles.fieldLabel}>城市</Text>
        <Text style={styles.hint}>
          与客人端城市切换一致，请选目录中的城市（存英文 key，如 Shanghai）。
        </Text>
        <View style={styles.tagRow}>
          {cities.map((c) => {
            const on = cityKeyEquals(city, c.city)
            return (
              <TouchableOpacity
                key={c.city}
                onPress={() => setCity(c.city)}
                style={[styles.tagChip, on && styles.tagChipOn]}
              >
                <Text style={[styles.tagText, on && styles.tagTextOn]}>
                  {c.label}
                  {c.label !== c.city ? ` · ${c.city}` : ''}
                </Text>
              </TouchableOpacity>
            )
          })}
        </View>
        <Field
          label="简介"
          value={description}
          onChangeText={setDescription}
          placeholder="一句话介绍门店"
          multiline
          style={{ marginTop: SPACING.md, marginBottom: 0 }}
        />
      </Card>

      <SectionLabel>营业时间</SectionLabel>
      <Card>
        <View style={styles.choiceRow}>
          <TouchableOpacity
            style={[styles.choiceChip, !hoursEnabled && styles.choiceChipActive]}
            onPress={() => setHoursEnabled(false)}
          >
            <Text style={[styles.choiceChipText, !hoursEnabled && styles.choiceChipTextActive]}>
              不展示
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.choiceChip, hoursEnabled && styles.choiceChipActive]}
            onPress={() => setHoursEnabled(true)}
          >
            <Text style={[styles.choiceChipText, hoursEnabled && styles.choiceChipTextActive]}>
              设置时段
            </Text>
          </TouchableOpacity>
        </View>
        {hoursEnabled ? (
          <View style={{ marginTop: SPACING.md, gap: SPACING.sm }}>
            <Text style={styles.hint}>
              只填数字即可，下午五点写成 1700 会自动变成 17:00。凌晨打烊可写 02:00。
            </Text>
            <Field
              label="几点开门"
              value={openHm}
              onChangeText={(v) => setOpenHm(maskHmInput(v))}
              placeholder="例如 17:00"
              keyboardType="number-pad"
              autoCorrect={false}
              maxLength={5}
            />
            <Field
              label="几点打烊"
              value={closeHm}
              onChangeText={(v) => setCloseHm(maskHmInput(v))}
              placeholder="例如 02:00"
              keyboardType="number-pad"
              autoCorrect={false}
              maxLength={5}
            />
            <Text style={styles.hint}>打烊比开门更早，表示第二天早上才关（跨夜营业）。</Text>
          </View>
        ) : null}
      </Card>

      {catalog.length > 0 ? (
        <>
          <SectionLabel>标签</SectionLabel>
          <Card>
            <Text style={styles.hint}>从目录多选；标签定义由后台维护。</Text>
            {Object.keys(grouped).map((cat) => (
              <View key={cat} style={{ marginTop: SPACING.md }}>
                <Text style={styles.catLabel}>{cat}</Text>
                <View style={styles.tagRow}>
                  {grouped[cat].map((t) => {
                    const on = selectedKeys.includes(t.key)
                    return (
                      <TouchableOpacity
                        key={t.key}
                        onPress={() => toggleTag(t.key)}
                        style={[styles.tagChip, on && styles.tagChipOn]}
                      >
                        <Text style={[styles.tagText, on && styles.tagTextOn]}>{t.label_zh}</Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      <Button
        label="保存"
        icon="checkmark-outline"
        onPress={() => void handleSave()}
        loading={saving}
        style={{ marginTop: SPACING.lg }}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  fieldLabel: {
    color: THEME.muted,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: SPACING.sm,
  },
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
  hint: { color: THEME.muted, fontSize: 13, lineHeight: 19, marginBottom: SPACING.sm },
  catLabel: { color: THEME.faint, fontSize: 12, marginBottom: SPACING.sm },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  tagChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  tagChipOn: { backgroundColor: THEME.goldFill, borderColor: THEME.goldBorder },
  tagText: { color: THEME.muted, fontSize: 13 },
  tagTextOn: { color: THEME.gold, fontWeight: '600' },
})
