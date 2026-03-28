import { useEffect, useState, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  FlatList,
  TouchableOpacity,
  TextInput,
  Switch,
  Alert,
  ActivityIndicator,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/authProvider'
import { COLORS } from '../../lib/constants'
import type { Category, Drink } from '../../lib/types'

type ViewMode = 'categories' | 'drinks'

export default function MenuScreen() {
  const { tenantId } = useAuth()
  const [viewMode, setViewMode] = useState<ViewMode>('categories')
  const [categories, setCategories] = useState<Category[]>([])
  const [drinks, setDrinks] = useState<Drink[]>([])
  const [loading, setLoading] = useState(true)

  // Category form
  const [showCategoryForm, setShowCategoryForm] = useState(false)
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  const [categoryName, setCategoryName] = useState('')
  const [categorySortOrder, setCategorySortOrder] = useState('0')

  // Drink form
  const [showDrinkForm, setShowDrinkForm] = useState(false)
  const [editingDrinkId, setEditingDrinkId] = useState<string | null>(null)
  const [drinkForm, setDrinkForm] = useState({
    category_id: '',
    name: '',
    price: '',
    price_unit: '杯',
    price_bottle: '',
    price_unit_bottle: '瓶',
    sort_order: '0',
  })

  const fetchCategories = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('sort_order', { ascending: true })
      if (error) throw error
      setCategories(data || [])
    } catch (e) {
      console.error('Error fetching categories:', e)
    }
  }, [])

  const fetchDrinks = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('drinks')
        .select('*')
        .order('sort_order', { ascending: true })
      if (error) throw error
      setDrinks(data || [])
    } catch (e) {
      console.error('Error fetching drinks:', e)
    }
  }, [])

  useEffect(() => {
    Promise.all([fetchCategories(), fetchDrinks()]).finally(() => setLoading(false))

    const ch1 = supabase
      .channel('menu-cat')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, () => fetchCategories())
      .subscribe()
    const ch2 = supabase
      .channel('menu-drinks')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drinks' }, () => fetchDrinks())
      .subscribe()

    return () => {
      supabase.removeChannel(ch1)
      supabase.removeChannel(ch2)
    }
  }, [fetchCategories, fetchDrinks])

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
    } catch (e) {
      Alert.alert('错误', '保存失败')
    }
  }

  const deleteCategory = (id: string) => {
    Alert.alert('确认', '确定要删除这个分类吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('categories').delete().eq('id', id)
          if (error) Alert.alert('错误', '删除失败')
        },
      },
    ])
  }

  const toggleCategoryEnabled = async (cat: Category) => {
    const { error } = await supabase.from('categories').update({ enabled: !cat.enabled }).eq('id', cat.id)
    if (error) Alert.alert('错误', '操作失败')
  }

  // --- Drink CRUD ---
  const openDrinkForm = (drink?: Drink) => {
    if (drink) {
      setEditingDrinkId(drink.id)
      setDrinkForm({
        category_id: drink.category_id,
        name: drink.name,
        price: String(drink.price),
        price_unit: drink.price_unit || '杯',
        price_bottle: drink.price_bottle != null ? String(drink.price_bottle) : '',
        price_unit_bottle: drink.price_unit_bottle || '瓶',
        sort_order: String(drink.sort_order),
      })
    } else {
      setEditingDrinkId(null)
      setDrinkForm({
        category_id: categories[0]?.id || '',
        name: '',
        price: '',
        price_unit: '杯',
        price_bottle: '',
        price_unit_bottle: '瓶',
        sort_order: '0',
      })
    }
    setShowDrinkForm(true)
  }

  const saveDrinkForm = async () => {
    if (!drinkForm.name.trim() || !drinkForm.price || !drinkForm.category_id) {
      return Alert.alert('提示', '请填写必要字段')
    }
    try {
      const payload = {
        category_id: drinkForm.category_id,
        name: drinkForm.name.trim(),
        price: parseFloat(drinkForm.price) || 0,
        price_unit: drinkForm.price_unit,
        price_bottle: drinkForm.price_bottle ? parseFloat(drinkForm.price_bottle) : null,
        price_unit_bottle: drinkForm.price_unit_bottle,
        sort_order: parseInt(drinkForm.sort_order) || 0,
      }
      if (editingDrinkId) {
        const { error } = await supabase.from('drinks').update(payload).eq('id', editingDrinkId)
        if (error) throw error
      } else {
        const { error } = await supabase.from('drinks').insert([{ ...payload, tenant_id: tenantId }])
        if (error) throw error
      }
      setShowDrinkForm(false)
    } catch (e) {
      Alert.alert('错误', '保存失败')
    }
  }

  const deleteDrink = (id: string) => {
    Alert.alert('确认', '确定要删除这个酒品吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('drinks').delete().eq('id', id)
          if (error) Alert.alert('错误', '删除失败')
        },
      },
    ])
  }

  const toggleDrinkEnabled = async (drink: Drink) => {
    const { error } = await supabase.from('drinks').update({ enabled: !drink.enabled }).eq('id', drink.id)
    if (error) Alert.alert('错误', '操作失败')
  }

  const getCategoryName = (catId: string) => categories.find((c) => c.id === catId)?.name || '未知分类'

  // Group drinks by category
  const drinksByCategory = categories
    .map((cat) => ({
      category: cat,
      data: drinks.filter((d) => d.category_id === cat.id),
    }))
    .filter((g) => g.data.length > 0)

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.gold} />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      {/* Tab Toggle */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tabBtn, viewMode === 'categories' && styles.tabBtnActive]}
          onPress={() => setViewMode('categories')}
        >
          <Text style={[styles.tabBtnText, viewMode === 'categories' && styles.tabBtnTextActive]}>分类管理</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, viewMode === 'drinks' && styles.tabBtnActive]}
          onPress={() => setViewMode('drinks')}
        >
          <Text style={[styles.tabBtnText, viewMode === 'drinks' && styles.tabBtnTextActive]}>酒品管理</Text>
        </TouchableOpacity>
      </View>

      {/* CATEGORIES VIEW */}
      {viewMode === 'categories' && (
        <>
          <TouchableOpacity style={styles.addBtn} onPress={() => openCategoryForm()}>
            <Ionicons name="add" size={20} color="#000" />
            <Text style={styles.addBtnText}>新增分类</Text>
          </TouchableOpacity>
          <FlatList
            data={categories}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingBottom: 20 }}
            renderItem={({ item }) => (
              <View style={styles.listItem}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.listItemTitle}>{item.name}</Text>
                  <Text style={styles.listItemSub}>排序: {item.sort_order}</Text>
                </View>
                <Switch
                  value={item.enabled}
                  onValueChange={() => toggleCategoryEnabled(item)}
                  trackColor={{ false: '#555', true: COLORS.gold }}
                  thumbColor="#fff"
                />
                <TouchableOpacity onPress={() => openCategoryForm(item)} style={styles.iconBtn}>
                  <Ionicons name="pencil" size={18} color={COLORS.gold} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => deleteCategory(item.id)} style={styles.iconBtn}>
                  <Ionicons name="trash-outline" size={18} color={COLORS.danger} />
                </TouchableOpacity>
              </View>
            )}
          />
        </>
      )}

      {/* DRINKS VIEW */}
      {viewMode === 'drinks' && (
        <>
          <TouchableOpacity style={styles.addBtn} onPress={() => openDrinkForm()}>
            <Ionicons name="add" size={20} color="#000" />
            <Text style={styles.addBtnText}>新增酒品</Text>
          </TouchableOpacity>
          <SectionList
            sections={drinksByCategory.map((g) => ({ title: g.category.name, data: g.data }))}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingBottom: 20 }}
            renderSectionHeader={({ section }) => (
              <Text style={styles.drinkSectionHeader}>{section.title}</Text>
            )}
            renderItem={({ item }) => (
              <View style={styles.listItem}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.listItemTitle}>{item.name}</Text>
                  <Text style={styles.listItemSub}>
                    ¥{item.price}/{item.price_unit || '杯'}
                    {item.price_bottle != null && ` · ¥${item.price_bottle}/${item.price_unit_bottle || '瓶'}`}
                  </Text>
                </View>
                <Switch
                  value={item.enabled}
                  onValueChange={() => toggleDrinkEnabled(item)}
                  trackColor={{ false: '#555', true: COLORS.gold }}
                  thumbColor="#fff"
                />
                <TouchableOpacity onPress={() => openDrinkForm(item)} style={styles.iconBtn}>
                  <Ionicons name="pencil" size={18} color={COLORS.gold} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => deleteDrink(item.id)} style={styles.iconBtn}>
                  <Ionicons name="trash-outline" size={18} color={COLORS.danger} />
                </TouchableOpacity>
              </View>
            )}
          />
        </>
      )}

      {/* Category Form Modal */}
      <Modal visible={showCategoryForm} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{editingCategoryId ? '编辑分类' : '新增分类'}</Text>
            <Text style={styles.formLabel}>分类名称</Text>
            <TextInput style={styles.formInput} value={categoryName} onChangeText={setCategoryName}
              placeholder="输入分类名称" placeholderTextColor={COLORS.muted} />
            <Text style={styles.formLabel}>排序</Text>
            <TextInput style={styles.formInput} value={categorySortOrder} onChangeText={setCategorySortOrder}
              keyboardType="number-pad" placeholder="0" placeholderTextColor={COLORS.muted} />
            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowCategoryForm(false)}>
                <Text style={styles.modalCancelText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={saveCategoryForm}>
                <Text style={styles.modalSaveText}>保存</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Drink Form Modal */}
      <Modal visible={showDrinkForm} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>{editingDrinkId ? '编辑酒品' : '新增酒品'}</Text>

              <Text style={styles.formLabel}>分类</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                {categories.map((cat) => (
                  <TouchableOpacity
                    key={cat.id}
                    style={[styles.catPickerBtn, drinkForm.category_id === cat.id && styles.catPickerBtnActive]}
                    onPress={() => setDrinkForm((f) => ({ ...f, category_id: cat.id }))}
                  >
                    <Text style={[styles.catPickerText, drinkForm.category_id === cat.id && styles.catPickerTextActive]}>
                      {cat.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={styles.formLabel}>名称</Text>
              <TextInput style={styles.formInput} value={drinkForm.name}
                onChangeText={(t) => setDrinkForm((f) => ({ ...f, name: t }))}
                placeholder="酒品名称" placeholderTextColor={COLORS.muted} />

              <View style={styles.formRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.formLabel}>价格</Text>
                  <TextInput style={styles.formInput} value={drinkForm.price}
                    onChangeText={(t) => setDrinkForm((f) => ({ ...f, price: t }))}
                    keyboardType="decimal-pad" placeholder="0" placeholderTextColor={COLORS.muted} />
                </View>
                <View style={{ width: 80, marginLeft: 8 }}>
                  <Text style={styles.formLabel}>单位</Text>
                  <TextInput style={styles.formInput} value={drinkForm.price_unit}
                    onChangeText={(t) => setDrinkForm((f) => ({ ...f, price_unit: t }))}
                    placeholder="杯" placeholderTextColor={COLORS.muted} />
                </View>
              </View>

              <View style={styles.formRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.formLabel}>瓶装价格(选填)</Text>
                  <TextInput style={styles.formInput} value={drinkForm.price_bottle}
                    onChangeText={(t) => setDrinkForm((f) => ({ ...f, price_bottle: t }))}
                    keyboardType="decimal-pad" placeholder="留空则无" placeholderTextColor={COLORS.muted} />
                </View>
                <View style={{ width: 80, marginLeft: 8 }}>
                  <Text style={styles.formLabel}>单位</Text>
                  <TextInput style={styles.formInput} value={drinkForm.price_unit_bottle}
                    onChangeText={(t) => setDrinkForm((f) => ({ ...f, price_unit_bottle: t }))}
                    placeholder="瓶" placeholderTextColor={COLORS.muted} />
                </View>
              </View>

              <Text style={styles.formLabel}>排序</Text>
              <TextInput style={styles.formInput} value={drinkForm.sort_order}
                onChangeText={(t) => setDrinkForm((f) => ({ ...f, sort_order: t }))}
                keyboardType="number-pad" placeholder="0" placeholderTextColor={COLORS.muted} />

              <View style={styles.modalBtnRow}>
                <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowDrinkForm(false)}>
                  <Text style={styles.modalCancelText}>取消</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalSaveBtn} onPress={saveDrinkForm}>
                  <Text style={styles.modalSaveText}>保存</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, padding: 16 },
  centered: { flex: 1, backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center' },
  tabRow: { flexDirection: 'row', marginBottom: 16, gap: 8 },
  tabBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center',
    backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border,
  },
  tabBtnActive: { backgroundColor: COLORS.gold, borderColor: COLORS.gold },
  tabBtnText: { color: COLORS.text, fontSize: 15, fontWeight: '600' },
  tabBtnTextActive: { color: '#000' },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end',
    backgroundColor: COLORS.gold, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, gap: 4,
    marginBottom: 12,
  },
  addBtnText: { color: '#000', fontWeight: '600', fontSize: 14 },
  listItem: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card,
    borderRadius: 10, padding: 14, marginBottom: 8,
  },
  listItemTitle: { fontSize: 16, fontWeight: '600', color: COLORS.text },
  listItemSub: { fontSize: 13, color: COLORS.muted, marginTop: 2 },
  iconBtn: { padding: 8 },
  drinkSectionHeader: {
    fontSize: 13, fontWeight: '700', color: COLORS.gold, textTransform: 'uppercase',
    letterSpacing: 1.5, marginTop: 12, marginBottom: 8, paddingHorizontal: 4,
  },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 20,
  },
  modalContent: {
    backgroundColor: COLORS.card, borderRadius: 16, padding: 24,
  },
  modalTitle: { fontSize: 20, fontWeight: '700', color: COLORS.text, marginBottom: 20 },
  formLabel: { fontSize: 13, color: COLORS.muted, marginBottom: 4, fontWeight: '600' },
  formInput: {
    backgroundColor: COLORS.background, color: COLORS.text, borderRadius: 8,
    padding: 12, fontSize: 15, marginBottom: 12, borderWidth: 1, borderColor: COLORS.border,
  },
  formRow: { flexDirection: 'row', alignItems: 'flex-end' },
  modalBtnRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  modalCancelBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center',
    backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border,
  },
  modalCancelText: { color: COLORS.text, fontWeight: '600' },
  modalSaveBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center', backgroundColor: COLORS.gold,
  },
  modalSaveText: { color: '#000', fontWeight: '700' },
  catPickerBtn: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, marginRight: 8,
    backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border,
  },
  catPickerBtnActive: { backgroundColor: COLORS.gold, borderColor: COLORS.gold },
  catPickerText: { color: COLORS.text, fontSize: 14 },
  catPickerTextActive: { color: '#000' },
})
