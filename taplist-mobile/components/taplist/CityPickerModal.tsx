import FontAwesome from '@expo/vector-icons/FontAwesome'
import { useMemo } from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'

import { palette, spacing, typography } from '@/constants/design'
import { taplistCityMatches } from '@/lib/taplistCity'
import type { PublicTaplistCity } from '@/lib/types'

type CityPickerEntry =
  | { kind: 'city'; city: PublicTaplistCity }
  | { kind: 'region'; key: string; label: string; cities: PublicTaplistCity[] }

const MUNICIPALITY_CITY_KEYS = new Set(['beijing', 'chongqing', 'shanghai', 'tianjin'])

export function CityPickerModal({
  visible,
  cities,
  selectedCity,
  onClose,
  onSelect,
}: {
  visible: boolean
  cities: PublicTaplistCity[]
  selectedCity: PublicTaplistCity
  onClose: () => void
  onSelect: (city: PublicTaplistCity) => void
}) {
  const entries = useMemo(() => buildCityPickerEntries(cities), [cities])

  const renderCity = (city: PublicTaplistCity, nested = false, separated = false) => {
    const selected = taplistCityMatches(city.city, selectedCity.city)
    return (
      <Pressable
        key={city.city}
        accessibilityRole="button"
        accessibilityLabel={`切换到${city.label}`}
        accessibilityState={{ selected }}
        onPress={() => onSelect(city)}
        style={({ pressed }) => [
          styles.cityOption,
          nested && styles.cityOptionNested,
          separated && styles.cityOptionSibling,
          selected && styles.cityOptionSelected,
          pressed && styles.pressed,
        ]}>
        <Text numberOfLines={1} style={[styles.cityOptionLabel, selected && styles.cityOptionLabelSelected]}>
          {city.label}
        </Text>
        <View style={styles.cityOptionTrailing}>
          <Text numberOfLines={1} style={styles.cityOptionMeta}>
            {city.bar_count} 家公开酒吧
          </Text>
          <View style={styles.cityOptionStatus}>
            {selected ? <FontAwesome name="check" size={15} color={palette.amber} /> : null}
          </View>
        </View>
      </Pressable>
    )
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View accessibilityViewIsModal style={styles.panel} onStartShouldSetResponder={() => true}>
          <View style={styles.header}>
            <Text style={styles.title}>选择城市</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="关闭城市选择"
              hitSlop={10}
              onPress={onClose}
              style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}>
              <FontAwesome name="times" size={16} color={palette.faint} />
            </Pressable>
          </View>
          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
            nestedScrollEnabled
            showsVerticalScrollIndicator>
            {entries.map((entry) => {
              if (entry.kind === 'city') {
                return <View key={entry.city.city} style={styles.topLevelEntry}>{renderCity(entry.city)}</View>
              }

              return (
                <View key={entry.key} style={styles.topLevelEntry}>
                  <Text accessibilityRole="header" style={styles.regionLabel}>{entry.label}</Text>
                  {entry.cities.map((city, index) => renderCity(city, true, index > 0))}
                </View>
              )
            })}
          </ScrollView>
        </View>
      </Pressable>
    </Modal>
  )
}

function buildCityPickerEntries(cities: PublicTaplistCity[]): CityPickerEntry[] {
  const entries: CityPickerEntry[] = []
  const regions = new Map<string, Extract<CityPickerEntry, { kind: 'region' }>>()

  cities.forEach((city) => {
    const cityKey = normalizeKey(city.city)
    const regionLabel = city.region_label?.trim()
    const regionKey = normalizeKey(city.region_code) || regionLabel

    if (MUNICIPALITY_CITY_KEYS.has(cityKey) || !regionLabel || !regionKey) {
      entries.push({ kind: 'city', city })
      return
    }

    const existing = regions.get(regionKey)
    if (existing) {
      existing.cities.push(city)
      return
    }

    const region: Extract<CityPickerEntry, { kind: 'region' }> = {
      kind: 'region',
      key: regionKey,
      label: regionLabel,
      cities: [city],
    }
    regions.set(regionKey, region)
    entries.push(region)
  })

  entries.forEach((entry) => {
    if (entry.kind === 'region') entry.cities.sort((a, b) => compareLabels(a.label, b.label))
  })

  return entries.sort((a, b) => {
    const aLabel = a.kind === 'city' ? a.city.label : a.label
    const bLabel = b.kind === 'city' ? b.city.label : b.label
    return compareLabels(aLabel, bLabel)
  })
}

function normalizeKey(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? ''
}

function compareLabels(a: string, b: string) {
  return a.localeCompare(b, 'zh-CN-u-co-pinyin', { sensitivity: 'base' })
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  panel: {
    width: '100%',
    height: 560,
    maxWidth: 360,
    maxHeight: '72%',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.hairline,
    backgroundColor: palette.panelElevated,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingBottom: spacing.xs,
  },
  title: { ...typography.label, color: palette.tungsten, fontSize: 11, lineHeight: 15 },
  closeButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -spacing.xs,
  },
  list: { flex: 1 },
  listContent: { paddingBottom: spacing.md },
  topLevelEntry: { borderTopWidth: 1, borderTopColor: palette.line },
  regionLabel: {
    ...typography.label,
    color: palette.tungsten,
    fontSize: 11,
    lineHeight: 16,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxs,
  },
  cityOption: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  cityOptionNested: { paddingLeft: spacing.sm },
  cityOptionSibling: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.line },
  cityOptionSelected: { borderBottomWidth: 1, borderBottomColor: 'rgba(211,154,69,0.38)' },
  cityOptionLabel: {
    ...typography.title,
    color: palette.text,
    fontSize: 18,
    lineHeight: 24,
    flex: 1,
    minWidth: 0,
  },
  cityOptionLabelSelected: { color: palette.amber },
  cityOptionTrailing: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' },
  cityOptionMeta: { ...typography.micro, color: palette.faint, textAlign: 'right' },
  cityOptionStatus: { width: 23, marginLeft: spacing.xs, alignItems: 'flex-end' },
  pressed: { opacity: 0.78 },
})
