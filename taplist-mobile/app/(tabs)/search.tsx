import { type ReactNode, useEffect, useState } from 'react'
import FontAwesome from '@expo/vector-icons/FontAwesome'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'expo-router'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { BeerArtwork } from '@/components/taplist/BeerArtwork'
import { palette, spacing, typography } from '@/constants/design'
import { DEFAULT_TAPLIST_CITY } from '@/constants/taplist'
import { searchPublicTaplist } from '@/lib/api/taplist'
import { useTaplistSupabaseReady } from '@/lib/useTaplistSupabaseReady'
import type { PublicTaplistSearchResult } from '@/lib/types'

const searchPresets = [
  { label: 'IPA', query: 'IPA' },
  { label: '酸', query: '酸' },
  { label: '世涛', query: '世涛' },
  { label: '拉格', query: '拉格' },
  { label: '小麦', query: '小麦' },
]

const SEARCH_DEBOUNCE_MS = 300

export default function SearchScreen() {
  const insets = useSafeAreaInsets()
  const configured = useTaplistSupabaseReady()
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const trimmedQuery = query.trim()
  const isSearching = trimmedQuery.length > 0
  const isDebouncing = isSearching && debouncedQuery !== trimmedQuery

  useEffect(() => {
    if (!trimmedQuery) {
      setDebouncedQuery('')
      return
    }

    const timeout = setTimeout(() => setDebouncedQuery(trimmedQuery), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timeout)
  }, [trimmedQuery])

  const drinksQuery = useQuery({
    queryKey: ['taplist', 'search', DEFAULT_TAPLIST_CITY, debouncedQuery],
    queryFn: () => searchPublicTaplist(DEFAULT_TAPLIST_CITY, debouncedQuery),
    enabled: configured && debouncedQuery.length > 0,
  })

  const drinkResults = drinksQuery.data ?? []

  const showDrinkSection = isSearching

  return (
    <ScrollView
      style={styles.screen}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg }]}>
      <Text style={styles.kicker}>SHANGHAI / TAP LIST</Text>
      <Text style={styles.title}>搜索酒单</Text>

      <View style={styles.inputFrame}>
        <FontAwesome name="search" size={17} color={palette.faint} />
        <TextInput
          accessibilityLabel="搜索公开酒单"
          accessibilityHint="可搜索酒款、酒厂、风格、酒吧或区域"
          placeholder="搜索酒款、酒厂、风格或酒吧"
          placeholderTextColor={palette.faint}
          style={styles.input}
          selectionColor={palette.amber}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          autoCapitalize="none"
          clearButtonMode="never"
          returnKeyType="search"
        />
        {query.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="清空搜索"
            hitSlop={10}
            onPress={() => setQuery('')}
            style={({ pressed }) => [styles.clearButton, pressed && styles.clearButtonPressed]}>
            <FontAwesome name="times-circle" size={18} color={palette.faint} />
          </Pressable>
        ) : null}
      </View>

      {!isSearching ? (
        <SearchGuide onSelect={setQuery} />
      ) : null}

      {!configured ? (
        <EmptyState title="尚未连接酒单服务" body="请配置 Supabase 环境变量后查看实时公开酒单。" />
      ) : null}

      {configured && showDrinkSection ? (
        <>
          {isDebouncing || drinksQuery.isLoading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={palette.amber} />
              <Text style={styles.muted}>正在搜索酒款...</Text>
            </View>
          ) : drinksQuery.isError ? (
            <EmptyState
              title="酒款搜索不可用"
              body="请在 Supabase 执行 search_public_taplist 迁移后重试。"
            />
          ) : drinkResults.length === 0 ? (
            <EmptyState title="没有匹配的酒款" body="试试酒厂名、风格、酒款中文名或酒吧名称。">
              <View style={styles.emptyRecovery}>
                <Text style={styles.emptyRecoveryLabel}>换个风格试试</Text>
                <PresetSearches onSelect={setQuery} />
              </View>
            </EmptyState>
          ) : (
            drinkResults.map((drink) => <DrinkResult key={drink.drink_id} drink={drink} />)
          )}
        </>
      ) : null}

    </ScrollView>
  )
}

function SearchGuide({ onSelect }: { onSelect: (query: string) => void }) {
  return (
    <View style={styles.guide}>
      <Text style={styles.guideTitle}>不知道从哪里开始？</Text>

      <Text style={styles.presetSectionLabel}>风格</Text>
      <PresetSearches onSelect={onSelect} />
    </View>
  )
}

function PresetSearches({ onSelect }: { onSelect: (query: string) => void }) {
  return (
    <View style={styles.presetGrid}>
      {searchPresets.map((preset) => (
        <Pressable
          key={preset.label}
          accessibilityRole="button"
          accessibilityLabel={`搜索${preset.label}`}
          accessibilityHint="显示当前公开酒单中的匹配酒款"
          onPress={() => onSelect(preset.query)}
          style={({ pressed }) => [styles.presetPill, pressed && styles.presetPillPressed]}>
          <Text style={styles.presetLabel}>{preset.label}</Text>
        </Pressable>
      ))}
    </View>
  )
}

function DrinkResult({ drink }: { drink: PublicTaplistSearchResult }) {
  const brewery = drink.brewery ?? drink.brand_name
  const styleLine = [drink.beer_style, typeof drink.abv === 'number' ? `${drink.abv}%` : null]
    .filter(Boolean)
    .join(' · ')
  const servingLine = searchServingLine(drink.default_serving)
  const isSoldOut = drink.public_status === '售罄'

  return (
    <View style={[styles.resultItem, isSoldOut && styles.resultItemMuted]}>
      <Link href={`/bar/${drink.tenant_slug}/beer/${drink.drink_id}`} asChild>
        <Pressable style={({ pressed }) => [styles.drinkPressable, pressed && styles.pressed]}>
          <View style={styles.drinkRowInner}>
            {drink.image_url ? (
              <BeerArtwork name={drink.name} source={drink.image_url} size={72} />
            ) : (
              <View style={styles.artworkSpacer} />
            )}
            <View style={styles.drinkCopy}>
              <Text style={styles.resultName} numberOfLines={2}>
                {drink.name}
              </Text>
              {brewery ? <Text style={styles.resultMeta}>{brewery}</Text> : null}
              {styleLine ? <Text style={styles.drinkStyle}>{styleLine}</Text> : null}
              <Text style={styles.drinkVenue}>
                {drink.tenant_display_name}
                {drink.tenant_address
                  ? ` · ${drink.tenant_address}`
                  : drink.tenant_district
                    ? ` · ${drink.tenant_district}`
                    : ''}
              </Text>
              <View style={styles.resultDetailBlock}>
                {drink.public_status ? (
                  <View style={[styles.statusBadge, isSoldOut && styles.statusBadgeMuted]}>
                    <Text style={[styles.statusText, isSoldOut && styles.statusTextMuted]}>
                      {drink.public_status}
                    </Text>
                  </View>
                ) : null}
                {servingLine ? (
                  <View style={styles.servingPill}>
                    <Text style={styles.servingLine}>{servingLine}</Text>
                  </View>
                ) : null}
              </View>
            </View>
          </View>
        </Pressable>
      </Link>
    </View>
  )
}

function searchServingLine(serving: PublicTaplistSearchResult['default_serving']) {
  if (!serving) return null
  const parts = [
    serving.label,
    serving.volume_ml ? `${serving.volume_ml}ml` : null,
    typeof serving.price === 'number' && serving.price > 0 ? `¥${serving.price}` : null,
  ].filter(Boolean)

  return parts.length > 0 ? parts.join(' · ') : null
}

function EmptyState({ title, body, children }: { title: string; body: string; children?: ReactNode }) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: palette.background,
  },
  content: {
    padding: spacing.md,
    paddingBottom: 96,
  },
  kicker: {
    ...typography.label,
    color: palette.tungsten,
    fontSize: 11,
    lineHeight: 15,
    marginBottom: spacing.xs,
  },
  title: {
    ...typography.displayL,
    color: palette.text,
    marginBottom: spacing.lg,
  },
  inputFrame: {
    height: 54,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.hairline,
    backgroundColor: 'rgba(17,17,17,0.58)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  input: {
    ...typography.body,
    flex: 1,
    height: '100%',
    color: palette.text,
    paddingHorizontal: 0,
  },
  clearButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -spacing.sm,
  },
  clearButtonPressed: {
    opacity: 0.55,
  },
  guide: {
    paddingTop: spacing.xs,
  },
  guideTitle: {
    ...typography.title,
    color: palette.text,
    fontSize: 20,
    lineHeight: 28,
  },
  presetSectionLabel: {
    ...typography.label,
    color: palette.tungsten,
    fontSize: 11,
    lineHeight: 15,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  presetGrid: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  presetPill: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(198,168,117,0.24)',
    backgroundColor: 'rgba(184,138,61,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  presetPillPressed: {
    borderColor: 'rgba(211,154,69,0.52)',
    backgroundColor: 'rgba(184,138,61,0.18)',
    opacity: 0.82,
  },
  presetLabel: {
    ...typography.body,
    color: palette.text,
    fontWeight: '500',
    lineHeight: 20,
  },
  loading: {
    borderTopWidth: 1,
    borderTopColor: palette.hairline,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  muted: {
    ...typography.caption,
    color: palette.muted,
  },
  resultItem: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(245,241,230,0.12)',
    paddingBottom: spacing.lg,
    marginBottom: spacing.lg,
  },
  resultItemMuted: {
    opacity: 0.52,
  },
  drinkPressable: {
    paddingTop: spacing.sm,
  },
  drinkRowInner: {
    flexDirection: 'row',
    gap: spacing.lg,
    alignItems: 'flex-start',
  },
  artworkSpacer: {
    width: 72,
    height: 72,
  },
  pressed: {
    opacity: 0.78,
  },
  drinkCopy: {
    flex: 1,
    minWidth: 0,
  },
  resultName: {
    ...typography.displayL,
    color: palette.text,
    fontSize: 22,
    lineHeight: 28,
  },
  resultMeta: {
    ...typography.caption,
    color: palette.muted,
    marginTop: spacing.xxs,
    lineHeight: 19,
  },
  drinkStyle: {
    ...typography.caption,
    color: palette.faint,
    marginTop: spacing.xxs,
    lineHeight: 18,
  },
  drinkVenue: {
    ...typography.micro,
    color: palette.tungsten,
    marginTop: 3,
    lineHeight: 16,
  },
  resultDetailBlock: {
    alignItems: 'flex-start',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(159,122,61,0.24)',
    backgroundColor: 'rgba(159,122,61,0.14)',
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
  },
  statusBadgeMuted: {
    borderColor: 'rgba(117,111,101,0.18)',
    backgroundColor: 'rgba(117,111,101,0.14)',
  },
  statusText: {
    ...typography.label,
    color: palette.tungsten,
    fontSize: 10,
    lineHeight: 12,
  },
  statusTextMuted: {
    color: palette.faint,
  },
  servingPill: {
    alignSelf: 'flex-start',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(245,241,232,0.08)',
    backgroundColor: 'rgba(17,17,17,0.38)',
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
  },
  servingLine: {
    ...typography.micro,
    color: palette.muted,
    lineHeight: 16,
  },
  emptyState: {
    borderTopWidth: 1,
    borderTopColor: palette.hairline,
    paddingTop: spacing.lg,
  },
  emptyTitle: {
    ...typography.title,
    color: palette.text,
  },
  emptyBody: {
    ...typography.body,
    color: palette.muted,
    marginTop: spacing.xs,
  },
  emptyRecovery: {
    marginTop: spacing.lg,
  },
  emptyRecoveryLabel: {
    ...typography.label,
    color: palette.tungsten,
    fontSize: 11,
    lineHeight: 15,
    marginBottom: spacing.sm,
  },
})
