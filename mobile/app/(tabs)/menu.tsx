import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  Alert,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/authProvider'
import { THEME as T, LAYOUT } from '../../lib/theme'
import type { Category, DrinkUpsertResult } from '../../lib/types'
import {
  type DraftDrink,
  type TaplistDraft,
  archiveDrink,
  buildDraft,
  emptyDraftDrink,
  isOnTonight,
  loadOwnerTaplist,
  restoreDrink,
} from '../../lib/taplistOwnerApi'
import DrinkEditSheet from '../../components/taplist/DrinkEditSheet'
import JoinTonightSheet from '../../components/taplist/JoinTonightSheet'
import AnchorMenu, { type AnchorRect } from '../../components/ui/AnchorMenu'

type ViewMode = 'categories' | 'drinks'
type DrinkStatusTab = 'active' | 'archived' | 'all'
/** Category chip key — no "全部"; default is first real category (prefer 生啤). */
type CategoryRailKey = 'uncategorized' | string

function pickDefaultCategoryKey(cats: { id: string; name: string }[]): CategoryRailKey | null {
  if (!cats.length) return null
  const shengpi = cats.find((c) => c.name.includes('生啤'))
  return (shengpi ?? cats[0]).id
}

/** Tap badge for drinks currently on tonight's list; null when not listed. */
function tonightTapLabel(drink: DraftDrink): string | null {
  if (!isOnTonight(drink)) return null
  const n = drink.public_sort_order!
  return drink.is_public_visible ? `酒单 #${n}` : `酒单 #${n} · 隐藏`
}

function servingsLine(drink: DraftDrink): string | null {
  const servings = drink.servings.filter((s) => !s._deleted && s.is_active)
  if (!servings.length) return null
  return servings
    .map((s) => {
      const parts = [
        s.label?.trim() || null,
        s.volume_ml ? `${s.volume_ml}ml` : null,
        `¥${s.price}`,
      ].filter(Boolean)
      return parts.join(' ')
    })
    .join(' · ')
}

type CatalogDrinkRowProps = {
  drink: DraftDrink
  busy: boolean
  onEdit: () => void
  onJoin: () => void
  onRestore: () => void
  onMore: (anchor: AnchorRect) => void
}

function CatalogDrinkRow({
  drink,
  busy,
  onEdit,
  onJoin,
  onRestore,
  onMore,
}: CatalogDrinkRowProps) {
  const moreRef = useRef<View>(null)
  const onTonight = isOnTonight(drink)
  const tapLabel = tonightTapLabel(drink)
  const name = drink.display_name || drink.name
  const brewery = drink.profile?.brewery || drink.brand_name
  const style = drink.profile?.beer_style
  const servings = servingsLine(drink)

  return (
    <View style={styles.catalogRow}>
      <TouchableOpacity
        style={[styles.catalogRowMain, !drink.enabled && styles.catalogRowMainArchived]}
        activeOpacity={0.78}
        onPress={onEdit}
      >
        {drink.image_url ? (
          <Image source={{ uri: drink.image_url }} style={styles.catalogRowImage} />
        ) : (
          <View style={[styles.catalogRowImage, styles.catalogRowImagePlaceholder]}>
            <Ionicons name="wine-outline" size={20} color={T.faint} />
          </View>
        )}
        <View style={styles.catalogRowBody}>
          <View style={styles.catalogRowTitleLine}>
            {brewery ? (
              <>
                <Text style={styles.catalogRowBrewery} numberOfLines={1}>
                  {brewery}
                </Text>
                <Text style={styles.catalogRowTitleDivider}> · </Text>
              </>
            ) : null}
            <Text style={styles.catalogRowTitle} numberOfLines={1}>
              {name}
            </Text>
          </View>
          <Text style={styles.catalogRowMeta} numberOfLines={1}>
            {style || '未填写风格'}
          </Text>
          {servings ? (
            <Text style={styles.catalogRowServing} numberOfLines={1}>
              {servings}
            </Text>
          ) : null}
        </View>
      </TouchableOpacity>

      <View style={styles.catalogRowRail}>
        {busy ? (
          <ActivityIndicator size="small" color={T.gold} />
        ) : !drink.enabled ? (
          <TouchableOpacity style={styles.catalogPrimaryAction} onPress={onRestore} activeOpacity={0.72}>
            <Ionicons name="arrow-up-circle-outline" size={15} color={T.gold} />
            <Text style={styles.catalogPrimaryActionText}>上架</Text>
          </TouchableOpacity>
        ) : onTonight ? (
          <View style={styles.catalogListingStatus}>
            <Ionicons
              name={drink.is_public_visible ? 'wine-outline' : 'eye-off-outline'}
              size={13}
              color={T.goldSoft}
            />
            <Text style={styles.catalogListingText} numberOfLines={1}>
              {tapLabel}
            </Text>
          </View>
        ) : (
          <TouchableOpacity style={styles.catalogPrimaryAction} onPress={onJoin} activeOpacity={0.72}>
            <Ionicons name="add-circle-outline" size={15} color={T.gold} />
            <Text style={styles.catalogPrimaryActionText}>加入酒单</Text>
          </TouchableOpacity>
        )}

        <View ref={moreRef} collapsable={false} style={styles.catalogMoreSlot}>
          <TouchableOpacity
            style={styles.catalogMoreButton}
            disabled={busy}
            activeOpacity={0.58}
            accessibilityLabel="更多商品操作"
            onPress={() => {
              moreRef.current?.measureInWindow((x, y, width, height) => {
                onMore({ x, y, width, height })
              })
            }}
          >
            <Ionicons name="ellipsis-horizontal" size={22} color={T.goldSoft} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  )
}

export default function MenuScreen() {
  const { tenantId } = useAuth()
  const [viewMode, setViewMode] = useState<ViewMode>('drinks')
  const [draft, setDraft] = useState<TaplistDraft | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [togglingCategoryId, setTogglingCategoryId] = useState<string | null>(null)
  const [togglingDrinkId, setTogglingDrinkId] = useState<string | null>(null)
  const [drinkSearchQuery, setDrinkSearchQuery] = useState('')
  const [drinkStatusTab, setDrinkStatusTab] = useState<DrinkStatusTab>('active')
  const [categoryRail, setCategoryRail] = useState<CategoryRailKey | null>(null)

  const [showCategoryForm, setShowCategoryForm] = useState(false)
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  const [categoryName, setCategoryName] = useState('')
  const [categorySortOrder, setCategorySortOrder] = useState('0')

  const [editing, setEditing] = useState<DraftDrink | null>(null)
  const [creating, setCreating] = useState(false)
  const [joinDrink, setJoinDrink] = useState<DraftDrink | null>(null)
  const [moreMenu, setMoreMenu] = useState<{ drink: DraftDrink; anchor: AnchorRect } | null>(null)

  const loadCatalog = useCallback(async () => {
    if (!tenantId) {
      setDraft(null)
      setCategories([])
      return
    }
    const [payload, catRes] = await Promise.all([
      loadOwnerTaplist(tenantId),
      supabase.from('categories').select('*').eq('tenant_id', tenantId).order('sort_order', { ascending: true }),
    ])
    if (catRes.error) throw catRes.error
    setDraft(buildDraft(payload))
    setCategories(catRes.data || [])
  }, [tenantId])

  const load = useCallback(async () => {
    try {
      setLoading(true)
      await loadCatalog()
    } catch (e: any) {
      Alert.alert('错误', e?.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }, [loadCatalog])

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load]),
  )

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await loadCatalog()
    } finally {
      setRefreshing(false)
    }
  }, [loadCatalog])

  // --- Category CRUD ---
  const openCategoryForm = (cat?: Category) => {
    if (cat) {
      setEditingCategoryId(cat.id)
      setCategoryName(cat.name)
      setCategorySortOrder(String(cat.sort_order))
    } else {
      setEditingCategoryId(null)
      setCategoryName('')
      setCategorySortOrder('0')
    }
    setShowCategoryForm(true)
  }

  const saveCategoryForm = async () => {
    if (!categoryName.trim()) return Alert.alert('提示', '请输入分类名称')
    try {
      const payload = { name: categoryName.trim(), sort_order: parseInt(categorySortOrder) || 0 }
      if (editingCategoryId) {
        const { error } = await supabase.from('categories').update(payload).eq('id', editingCategoryId)
        if (error) throw error
      } else {
        const { error } = await supabase.from('categories').insert([{ ...payload, tenant_id: tenantId }])
        if (error) throw error
      }
      setShowCategoryForm(false)
      await loadCatalog()
    } catch {
      Alert.alert('错误', '保存失败')
    }
  }

  const toggleCategoryEnabled = async (cat: Category) => {
    if (togglingCategoryId === cat.id) return
    setTogglingCategoryId(cat.id)
    try {
      const { error } = await supabase.from('categories').update({ enabled: !cat.enabled }).eq('id', cat.id)
      if (error) throw error
      await loadCatalog()
    } catch {
      Alert.alert('错误', '操作失败')
    } finally {
      setTogglingCategoryId(null)
    }
  }

  // --- Drink editor (unified) ---
  const openCreate = () => {
    const d = emptyDraftDrink({ entryPoint: 'catalog' })
    d.category_id = categories.find((c) => c.enabled)?.id ?? null
    setCreating(true)
    setEditing(d)
  }

  const openEdit = (d: DraftDrink) => {
    setCreating(false)
    setEditing(d)
  }

  const closeEditor = () => {
    setEditing(null)
    setCreating(false)
  }

  const handlePickLocalDrink = (d: DraftDrink) => {
    // catalog entry: open existing drink for edit (no duplicate create)
    setCreating(false)
    setEditing(d)
  }

  const handleSaved = async (result?: DrinkUpsertResult, savedDrink?: DraftDrink) => {
    closeEditor()
    if (draft && savedDrink && result?.ok && result.drink_id) {
      const exists = draft.drinks.some((d) => d.id === result.drink_id)
      const optimistic: TaplistDraft = {
        ...draft,
        drinks: exists
          ? draft.drinks.map((d) => (d.id === result.drink_id ? { ...d, ...savedDrink, id: result.drink_id! } : d))
          : [...draft.drinks, { ...savedDrink, id: result.drink_id! }],
      }
      setDraft(optimistic)
    }
    loadCatalog().catch(() => {})
  }

  const runArchiveRestore = async (drink: DraftDrink, archive: boolean) => {
    if (togglingDrinkId === drink.id) return
    setTogglingDrinkId(drink.id)
    try {
      if (archive) await archiveDrink(drink.id)
      else await restoreDrink(drink.id)
      await loadCatalog()
    } catch (e: any) {
      Alert.alert('错误', e?.message || '操作失败')
    } finally {
      setTogglingDrinkId(null)
    }
  }

  const confirmArchive = (drink: DraftDrink) => {
    const name = drink.display_name || drink.name
    const onTonight = isOnTonight(drink)
    Alert.alert(
      '下架商品？',
      onTonight
        ? `「${name}」将从商品库下架，并离开酒单。之后可在「已下架」中上架。`
        : `「${name}」将从商品库下架。之后可在「已下架」中上架。`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '下架商品',
          style: 'destructive',
          onPress: () => void runArchiveRestore(drink, true),
        },
      ],
    )
  }

  const confirmRestore = (drink: DraftDrink) => {
    const name = drink.display_name || drink.name
    Alert.alert('上架商品？', `「${name}」将回到商品库可用。不会自动加入酒单。`, [
      { text: '取消', style: 'cancel' },
      { text: '上架', onPress: () => void runArchiveRestore(drink, false) },
    ])
  }

  const drinks = draft?.drinks
  const drinkList = drinks ?? []
  const drinkSearchNormalized = drinkSearchQuery.trim().toLowerCase()
  const drinksInTab = useMemo(
    () =>
      drinkList.filter((d) => {
        if (drinkStatusTab === 'active') return d.enabled
        if (drinkStatusTab === 'archived') return !d.enabled
        return true
      }),
    [drinkList, drinkStatusTab],
  )
  const drinksMatched = useMemo(() => {
    if (drinkSearchNormalized === '') return drinksInTab
    return drinksInTab.filter((d) => {
      const searchable = `${d.brand_name || ''} ${d.name} ${d.display_name || ''}`.toLowerCase()
      return searchable.includes(drinkSearchNormalized)
    })
  }, [drinksInTab, drinkSearchNormalized])

  const activeCount = drinkList.filter((d) => d.enabled).length
  const archivedCount = drinkList.length - activeCount
  const allCount = drinkList.length
  const enabledCategoryCount = categories.filter((category) => category.enabled).length
  const headerSummary =
    viewMode === 'drinks'
      ? `${activeCount} 可用 · ${archivedCount} 已下架`
      : `${enabledCategoryCount} 启用 · ${categories.length - enabledCategoryCount} 已关闭`
  const archivedMatchCount =
    drinkSearchNormalized === ''
      ? archivedCount
      : drinkList.filter((d) => {
          if (d.enabled) return false
          const searchable = `${d.brand_name || ''} ${d.name} ${d.display_name || ''}`.toLowerCase()
          return searchable.includes(drinkSearchNormalized)
        }).length
  const searchPlaceholder =
    drinkStatusTab === 'active'
      ? '搜索可用商品'
      : drinkStatusTab === 'archived'
        ? '搜索已下架'
        : '搜索全部商品'

  const catalogCategories = draft?.categories ?? []
  /** Drink filter rail: only enabled categories (disabled ones stay in 分类管理). */
  const enabledCatalogCategories = useMemo(
    () => catalogCategories.filter((c) => c.enabled),
    [catalogCategories],
  )
  const categorizedIds = useMemo(
    () => new Set(enabledCatalogCategories.map((c) => c.id)),
    [enabledCatalogCategories],
  )
  const orphanCount = useMemo(
    () => drinksMatched.filter((d) => !d.category_id || !categorizedIds.has(d.category_id)).length,
    [drinksMatched, categorizedIds],
  )

  const categoryRailItems = useMemo(() => {
    const items: { key: CategoryRailKey; label: string; count: number }[] = []
    for (const cat of enabledCatalogCategories) {
      const count = drinksMatched.filter((d) => d.category_id === cat.id).length
      items.push({ key: cat.id, label: cat.name, count })
    }
    if (orphanCount > 0 || categoryRail === 'uncategorized') {
      items.push({ key: 'uncategorized', label: '未分类', count: orphanCount })
    }
    return items
  }, [enabledCatalogCategories, drinksMatched, orphanCount, categoryRail])

  useEffect(() => {
    const defaultKey = pickDefaultCategoryKey(enabledCatalogCategories)
    const currentOk =
      categoryRail != null &&
      (categoryRail === 'uncategorized'
        ? orphanCount > 0 || enabledCatalogCategories.length === 0
        : enabledCatalogCategories.some((c) => c.id === categoryRail))

    if (currentOk) return

    if (defaultKey) {
      setCategoryRail(defaultKey)
      return
    }
    if (orphanCount > 0 || enabledCatalogCategories.length === 0) {
      setCategoryRail('uncategorized')
    }
  }, [enabledCatalogCategories, categoryRail, orphanCount])

  const drinksForList = useMemo(() => {
    if (!categoryRail) return []
    const list =
      categoryRail === 'uncategorized'
        ? drinksMatched.filter((d) => !d.category_id || !categorizedIds.has(d.category_id))
        : drinksMatched.filter((d) => d.category_id === categoryRail)
    return [...list].sort((a, b) => {
      const ta = a.updated_at ? Date.parse(a.updated_at) : 0
      const tb = b.updated_at ? Date.parse(b.updated_at) : 0
      if (tb !== ta) return tb - ta
      return (a.display_name || a.name).localeCompare(b.display_name || b.name, 'zh')
    })
  }, [drinksMatched, categoryRail, categorizedIds])

  const selectedCategoryLabel =
    categoryRailItems.find((c) => c.key === categoryRail)?.label ?? '商品'

  if (loading && !draft) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={T.gold} />
      </View>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.hero}>
        <View style={styles.headerRow}>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>商品库</Text>
            <Text style={styles.headerSummary}>{headerSummary}</Text>
          </View>
          <TouchableOpacity
            style={styles.headerAddButton}
            activeOpacity={0.72}
            onPress={() => (viewMode === 'categories' ? openCategoryForm() : openCreate())}
          >
            <Ionicons name="add" size={18} color={T.gold} />
            <Text style={styles.headerAddText}>
              {viewMode === 'categories' ? '新增分类' : '新增商品'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.segmented}>
        <TouchableOpacity
          style={[styles.segment, viewMode === 'drinks' && styles.segmentActive]}
          onPress={() => setViewMode('drinks')}
        >
          <Text style={[styles.segmentText, viewMode === 'drinks' && styles.segmentTextActive]}>商品</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.segment, viewMode === 'categories' && styles.segmentActive]}
          onPress={() => setViewMode('categories')}
        >
          <Text style={[styles.segmentText, viewMode === 'categories' && styles.segmentTextActive]}>分类</Text>
        </TouchableOpacity>
      </View>

      {viewMode === 'categories' && (
        <FlatList
          data={categories}
          keyExtractor={(item) => item.id}
          refreshing={refreshing}
          onRefresh={onRefresh}
          contentContainerStyle={[styles.listContent, categories.length === 0 && styles.listContentEmpty]}
          ListHeaderComponent={
            categories.length === 0 ? null : (
              <Text style={styles.categoryPolicyHint}>
                关闭后公开酒单不显示该分类，商品仍保留在商品库。
              </Text>
            )
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="pricetags-outline" size={44} color={T.faint} />
              <Text style={styles.emptyStateText}>暂无分类</Text>
              <Text style={styles.emptyStateHint}>点击右上角新增分类</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.listItem}>
              <View style={{ flex: 1 }}>
                <Text style={styles.listItemTitle}>{item.name}</Text>
                <Text style={styles.listItemSub}>
                  {drinkList.filter((drink) => drink.category_id === item.id).length} 个商品
                </Text>
              </View>
              {togglingCategoryId === item.id ? (
                <View style={styles.switchLoadingWrap}>
                  <ActivityIndicator size="small" color={T.gold} />
                </View>
              ) : (
                <Switch
                  value={item.enabled}
                  onValueChange={() => void toggleCategoryEnabled(item)}
                  trackColor={{ false: '#3a3a3a', true: T.gold }}
                  thumbColor="#fff"
                />
              )}
              <TouchableOpacity onPress={() => openCategoryForm(item)} style={styles.iconBtn}>
                <Ionicons name="create-outline" size={20} color={T.goldSoft} />
              </TouchableOpacity>
            </View>
          )}
        />
      )}

      {viewMode === 'drinks' && (
        <View style={styles.drinksPane}>
          <View style={styles.statusTabRow}>
            {(
              [
                { key: 'active' as const, label: '可用', count: activeCount },
                { key: 'archived' as const, label: '已下架', count: archivedCount },
                { key: 'all' as const, label: '全部', count: allCount },
              ] as const
            ).map((tab) => (
              <TouchableOpacity
                key={tab.key}
                style={[styles.statusTab, drinkStatusTab === tab.key && styles.statusTabActive]}
                onPress={() => setDrinkStatusTab(tab.key)}
              >
                <Text
                  style={[styles.statusTabText, drinkStatusTab === tab.key && styles.statusTabTextActive]}
                >
                  {tab.label} {tab.count}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.drinkSearchRow}>
            <Ionicons name="search" size={18} color={T.muted} style={styles.drinkSearchIcon} />
            <TextInput
              style={styles.drinkSearchInput}
              value={drinkSearchQuery}
              onChangeText={setDrinkSearchQuery}
              placeholder={searchPlaceholder}
              placeholderTextColor={T.faint}
              clearButtonMode="while-editing"
            />
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.categoryTabs}
            contentContainerStyle={styles.categoryTabsContent}
          >
            {categoryRailItems.map((item) => {
              const active = categoryRail === item.key
              return (
                <TouchableOpacity
                  key={item.key}
                  style={[styles.categoryTab, active && styles.categoryTabActive]}
                  onPress={() => setCategoryRail(item.key)}
                >
                  <Text style={[styles.categoryTabText, active && styles.categoryTabTextActive]}>
                    {item.label}
                    {item.count > 0 ? ` ${item.count}` : ''}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </ScrollView>

          <FlatList
            style={styles.drinksList}
            data={drinksForList}
            keyExtractor={(item) => item.id}
            refreshing={refreshing}
            onRefresh={onRefresh}
            contentContainerStyle={[
              styles.drinksListContent,
              drinksForList.length === 0 && styles.listContentEmpty,
            ]}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                {drinkStatusTab === 'active' && drinkSearchNormalized !== '' && archivedMatchCount > 0 ? (
                  <>
                    <Text style={styles.emptyStateText}>「{selectedCategoryLabel}」暂无匹配</Text>
                    <TouchableOpacity
                      style={styles.searchArchivedBtn}
                      onPress={() => setDrinkStatusTab('archived')}
                    >
                      <Ionicons name="archive-outline" size={16} color={T.gold} />
                      <Text style={styles.searchArchivedText}>
                        在已下架中搜索（{archivedMatchCount}）
                      </Text>
                    </TouchableOpacity>
                  </>
                ) : drinksMatched.length === 0 && drinkStatusTab === 'active' && drinkSearchNormalized === '' ? (
                  <>
                    <Ionicons name="wine-outline" size={40} color={T.faint} />
                    <Text style={styles.emptyStateText}>暂无可用商品</Text>
                    <Text style={styles.emptyStateHint}>在此新增商品，再用「加入酒单」上墙</Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.emptyStateText}>「{selectedCategoryLabel}」暂无商品</Text>
                    <Text style={styles.emptyStateHint}>换个分类或调整筛选</Text>
                  </>
                )}
              </View>
            }
            renderItem={({ item }) => {
              const busy = togglingDrinkId === item.id
              return (
                <CatalogDrinkRow
                  drink={item}
                  busy={busy}
                  onEdit={() => openEdit(item)}
                  onJoin={() => setJoinDrink(item)}
                  onRestore={() => confirmRestore(item)}
                  onMore={(anchor) => setMoreMenu({ drink: item, anchor })}
                />
              )
            }}
          />
        </View>
      )}

      <AnchorMenu
        visible={!!moreMenu}
        anchor={moreMenu?.anchor ?? null}
        items={
          moreMenu
            ? [
                {
                  key: 'edit',
                  label: '编辑商品',
                  onPress: () => openEdit(moreMenu.drink),
                },
                ...(moreMenu.drink.enabled
                  ? [
                      {
                        key: 'archive',
                        label: '下架商品',
                        destructive: true,
                        onPress: () => confirmArchive(moreMenu.drink),
                      },
                    ]
                  : [
                      {
                        key: 'restore',
                        label: '恢复上架',
                        onPress: () => confirmRestore(moreMenu.drink),
                      },
                    ]),
              ]
            : []
        }
        onClose={() => setMoreMenu(null)}
      />

      <Modal visible={showCategoryForm} transparent animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{editingCategoryId ? '编辑分类' : '新增分类'}</Text>
            <Text style={styles.formLabel}>分类名称</Text>
            <TextInput
              style={styles.formInput}
              value={categoryName}
              onChangeText={setCategoryName}
              placeholder="输入分类名称"
              placeholderTextColor={T.faint}
            />
            <Text style={styles.formLabel}>排序</Text>
            <TextInput
              style={styles.formInput}
              value={categorySortOrder}
              onChangeText={setCategorySortOrder}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor={T.faint}
            />
            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowCategoryForm(false)}>
                <Text style={styles.modalCancelText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={() => void saveCategoryForm()}>
                <Text style={styles.modalSaveText}>保存</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <DrinkEditSheet
        visible={!!editing}
        drink={editing}
        tenantId={tenantId}
        categories={draft?.categories ?? []}
        isCreate={creating}
        entryPoint="catalog"
        catalogDrinks={drinkList}
        onPickLocalDrink={handlePickLocalDrink}
        onClose={closeEditor}
        onSaved={handleSaved}
      />

      <JoinTonightSheet
        visible={!!joinDrink}
        drink={joinDrink}
        allDrinks={drinkList}
        configuredTapCount={draft?.tenant.tap_slot_count}
        onClose={() => setJoinDrink(null)}
        onJoined={async () => {
          setJoinDrink(null)
          await loadCatalog()
        }}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.background },
  centered: { flex: 1, backgroundColor: T.background, justifyContent: 'center', alignItems: 'center' },
  hero: {
    paddingHorizontal: LAYOUT.pagePad,
    paddingTop: 18,
    paddingBottom: 16,
  },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  headerCopy: { flex: 1, minWidth: 0 },
  title: { color: T.text, fontSize: 24, fontWeight: '800' },
  headerSummary: { color: T.muted, fontSize: 14, marginTop: 7 },
  headerAddButton: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 11,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: T.goldBorder,
    backgroundColor: T.goldFill,
  },
  headerAddText: { color: T.gold, fontSize: 14, fontWeight: '700' },
  segmented: {
    flexDirection: 'row',
    backgroundColor: T.surfaceMuted,
    borderRadius: 8,
    padding: 2,
    gap: 2,
    marginHorizontal: LAYOUT.pagePad,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: T.borderFaint,
  },
  segment: { flex: 1, minHeight: 36, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  segmentActive: {
    backgroundColor: T.goldFill,
    borderWidth: 1,
    borderColor: T.goldBorder,
  },
  segmentText: { color: T.muted, fontSize: 15, fontWeight: '600' },
  segmentTextActive: { color: T.gold, fontWeight: '700' },
  statusTabRow: { flexDirection: 'row', gap: 6, marginBottom: 10, paddingHorizontal: LAYOUT.pagePad },
  statusTab: {
    flex: 1,
    minHeight: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: T.border,
  },
  statusTabActive: { backgroundColor: T.goldFill, borderColor: T.goldBorder },
  statusTabText: { color: T.muted, fontSize: 13, fontWeight: '600' },
  statusTabTextActive: { color: T.gold },
  searchArchivedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: T.goldBorder,
    backgroundColor: T.goldFill,
  },
  searchArchivedText: { color: T.gold, fontSize: 13, fontWeight: '600' },
  drinkSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: T.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: T.borderFaint,
    paddingHorizontal: 12,
    marginBottom: 10,
    marginHorizontal: LAYOUT.pagePad,
  },
  drinkSearchIcon: { marginRight: 8 },
  drinkSearchInput: { flex: 1, color: T.text, fontSize: 15, paddingVertical: 10, minHeight: 40 },
  drinksPane: { flex: 1 },
  categoryTabs: { flexGrow: 0, marginBottom: 8 },
  categoryTabsContent: {
    paddingHorizontal: LAYOUT.pagePad,
    paddingBottom: 4,
    gap: 8,
    alignItems: 'center',
  },
  categoryTab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    minHeight: 36,
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surface,
  },
  categoryTabActive: {
    borderColor: T.goldBorder,
    backgroundColor: T.goldFill,
  },
  categoryTabText: { color: T.muted, fontSize: 13, fontWeight: '600' },
  categoryTabTextActive: { color: T.gold },
  drinksList: { flex: 1 },
  drinksListContent: { paddingBottom: LAYOUT.listPadBottom },
  listContent: { paddingBottom: LAYOUT.listPadBottom },
  listContentEmpty: { flexGrow: 1 },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: LAYOUT.pagePad,
    gap: 8,
  },
  emptyStateText: { fontSize: 15, fontWeight: '600', color: T.text, textAlign: 'center', marginTop: 8 },
  emptyStateHint: { fontSize: 13, color: T.muted, textAlign: 'center' },
  categoryPolicyHint: {
    color: T.muted,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 12,
    marginHorizontal: LAYOUT.pagePad,
  },
  catalogRow: {
    minHeight: 96,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
    marginHorizontal: 16,
    paddingHorizontal: 2,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  catalogRowMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  catalogRowMainArchived: { opacity: 0.58 },
  catalogRowImage: { width: 54, height: 54, borderRadius: 7, backgroundColor: T.surfaceMuted },
  catalogRowImagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  catalogRowBody: { flex: 1, minWidth: 0 },
  catalogRowTitleLine: { flexDirection: 'row', alignItems: 'baseline', minWidth: 0 },
  catalogRowBrewery: { color: T.goldSoft, fontSize: 15, fontWeight: '600', maxWidth: '38%' },
  catalogRowTitleDivider: { color: T.faint, fontSize: 15 },
  catalogRowTitle: { color: T.text, fontSize: 17, fontWeight: '800', flex: 1 },
  catalogRowMeta: { color: T.muted, fontSize: 13, marginTop: 6 },
  catalogRowServing: { color: T.faint, fontSize: 12, marginTop: 4 },
  catalogRowRail: { width: 92, alignItems: 'flex-end', justifyContent: 'space-between' },
  catalogPrimaryAction: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 9,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: T.goldBorder,
    backgroundColor: T.goldFill,
  },
  catalogPrimaryActionText: { color: T.gold, fontSize: 13, fontWeight: '700' },
  catalogListingStatus: {
    minHeight: 28,
    maxWidth: 92,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 5,
  },
  catalogListingText: { color: T.goldSoft, fontSize: 12, fontWeight: '700', flexShrink: 1 },
  catalogMoreSlot: { flex: 1, minHeight: 44, justifyContent: 'flex-end' },
  catalogMoreButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  switchLoadingWrap: { width: 51, alignItems: 'center' },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 72,
    marginHorizontal: 16,
    paddingHorizontal: 2,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  listItemTitle: { color: T.text, fontSize: 15, fontWeight: '700' },
  listItemSub: { color: T.muted, fontSize: 12, marginTop: 4 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: T.background,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: T.border,
  },
  modalTitle: { color: T.text, fontSize: 18, fontWeight: '800', marginBottom: 16 },
  formLabel: { color: T.muted, fontSize: 13, marginBottom: 6 },
  formInput: {
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
  modalBtnRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: T.border,
    alignItems: 'center',
  },
  modalCancelText: { color: T.muted, fontWeight: '600' },
  modalSaveBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: T.gold,
    alignItems: 'center',
  },
  modalSaveText: { color: T.background, fontWeight: '800' },
})
