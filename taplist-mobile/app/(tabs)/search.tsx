import { useState } from 'react'
import FontAwesome from '@expo/vector-icons/FontAwesome'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'expo-router'
import {
  ActivityIndicator,
  ImageBackground,
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

const styleTiles = [
  {
    label: 'IPA',
    query: 'IPA',
    image:
      'https://images.unsplash.com/photo-1600788886242-5c96aabe3757?auto=format&fit=crop&w=600&q=80',
  },
  {
    label: 'STOUT',
    query: 'Stout',
    image:
      'https://images.unsplash.com/photo-1618885472179-5e474019f2a9?auto=format&fit=crop&w=600&q=80',
  },
  {
    label: 'SOUR',
    query: 'Sour',
    image:
      'https://images.unsplash.com/photo-1571613316887-6f8d5cbf7ef7?auto=format&fit=crop&w=600&q=80',
  },
]

export default function SearchScreen() {
  const insets = useSafeAreaInsets()
  const configured = useTaplistSupabaseReady()
  const [query, setQuery] = useState('')
  const trimmedQuery = query.trim()
  const isSearching = trimmedQuery.length > 0

  const drinksQuery = useQuery({
    queryKey: ['taplist', 'search', DEFAULT_TAPLIST_CITY, trimmedQuery],
    queryFn: () => searchPublicTaplist(DEFAULT_TAPLIST_CITY, trimmedQuery),
    enabled: configured && isSearching,
  })

  const drinkResults = drinksQuery.data ?? []

  const showDrinkSection = isSearching

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg }]}>
      <Text style={styles.kicker}>SHANGHAI / TAP LIST</Text>
      <Text style={styles.title}>搜索酒单</Text>

      <View style={styles.inputFrame}>
        <FontAwesome name="search" size={17} color={palette.faint} />
        <TextInput
          placeholder="搜索酒款、酒厂或风格"
          placeholderTextColor={palette.faint}
          style={styles.input}
          selectionColor={palette.amber}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          autoCapitalize="none"
          clearButtonMode="never"
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
        <>
          <Text style={styles.sectionTitle}>风格</Text>
          <View style={styles.tileGrid}>
            {styleTiles.map((tile) => (
              <Pressable
                key={tile.label}
                style={({ pressed }) => [styles.styleTile, pressed && styles.tilePressed]}
                onPress={() => setQuery(tile.query)}>
                <ImageBackground source={{ uri: tile.image }} style={styles.tileImage} imageStyle={styles.tileImageRadius}>
                  <View style={styles.tileOverlay}>
                    <Text style={styles.tileLabel}>{tile.label}</Text>
                  </View>
                </ImageBackground>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}

      {!configured ? (
        <EmptyState title="尚未连接酒单服务" body="请配置 Supabase 环境变量后查看实时公开酒单。" />
      ) : null}

      {configured && showDrinkSection ? (
        <>
          {drinksQuery.isLoading ? (
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
            <EmptyState title="没有匹配的酒款" body="试试酒厂名、风格或酒款中文名。" />
          ) : (
            drinkResults.map((drink) => <DrinkResult key={drink.drink_id} drink={drink} />)
          )}
        </>
      ) : null}

    </ScrollView>
  )
}

function DrinkResult({ drink }: { drink: PublicTaplistSearchResult }) {
  const brewery = drink.brewery ?? drink.brand_name ?? '酒厂待定'
  const styleLine =
    typeof drink.abv === 'number'
      ? `${drink.beer_style ?? '风格待定'} · ${drink.abv}%`
      : drink.beer_style ?? '风格待定'

  return (
    <View style={styles.resultItem}>
      <Link href={`/bar/${drink.tenant_slug}/beer/${drink.drink_id}`} asChild>
        <Pressable style={({ pressed }) => [styles.drinkPressable, pressed && styles.pressed]}>
          <View style={styles.drinkRowInner}>
            <BeerArtwork name={drink.name} source={drink.image_url} size={72} />
            <View style={styles.drinkCopy}>
              <Text style={styles.resultName} numberOfLines={2}>
                {drink.name}
              </Text>
              <Text style={styles.resultMeta}>{brewery}</Text>
              <Text style={styles.drinkStyle}>{styleLine}</Text>
              <Text style={styles.drinkVenue}>
                {drink.tenant_display_name}
                {drink.tenant_address
                  ? ` · ${drink.tenant_address}`
                  : drink.tenant_district
                    ? ` · ${drink.tenant_district}`
                    : ''}
              </Text>
            </View>
          </View>
        </Pressable>
      </Link>
    </View>
  )
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
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
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearButtonPressed: {
    opacity: 0.55,
  },
  sectionTitle: {
    ...typography.displayL,
    color: palette.text,
    fontSize: 23,
    lineHeight: 29,
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
  },
  tileGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  styleTile: {
    flex: 1,
    height: 92,
    borderRadius: 8,
    overflow: 'hidden',
  },
  tilePressed: {
    opacity: 0.78,
  },
  tileImage: {
    flex: 1,
  },
  tileImageRadius: {
    borderRadius: 8,
  },
  tileOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: spacing.sm,
    backgroundColor: 'rgba(8,8,8,0.65)',
  },
  tileLabel: {
    ...typography.label,
    color: palette.text,
    fontSize: 15,
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
  drinkPressable: {
    paddingTop: spacing.sm,
  },
  drinkRowInner: {
    flexDirection: 'row',
    gap: spacing.lg,
    alignItems: 'flex-start',
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
})
