import { useEffect, useState, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
  RefreshControl,
  Modal,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import { Redirect } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/authProvider'
import { orderStatusLabel } from '../../lib/constants'
import { THEME as T, orderStatusVisual, LAYOUT } from '../../lib/theme'
import type { Order, CategoryWithDrinks, Drink, DrinkServingOption, CartItem } from '../../lib/types'

type ViewMode = 'list' | 'form'

function activeServings(drink: Drink): DrinkServingOption[] {
  return (drink.drink_serving_options ?? []).filter((s) => s.is_active && Number(s.price) > 0)
}

function formatServingLabel(s: Pick<DrinkServingOption, 'label' | 'volume_ml'>): string {
  const name = (s.label || '').trim() || '规格'
  return s.volume_ml != null && s.volume_ml > 0 ? `${name} · ${s.volume_ml}ml` : name
}

function priceHint(drink: Drink): string {
  const servings = activeServings(drink)
  if (!servings.length) return ''
  if (servings.length === 1) return `¥${Number(servings[0].price)}`
  const min = Math.min(...servings.map((s) => Number(s.price)))
  return `从 ¥${min}`
}

function OrderingScreen() {
  const { tenantId } = useAuth()
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [activeOrders, setActiveOrders] = useState<Order[]>([])
  const [dayRevenue, setDayRevenue] = useState(0)
  const [drinks, setDrinks] = useState<CategoryWithDrinks[]>([])
  const [customerName, setCustomerName] = useState('')
  const [cart, setCart] = useState<CartItem[]>([])
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null)
  const [currentBusinessDayId, setCurrentBusinessDayId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [checkoutUpdatingId, setCheckoutUpdatingId] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [drinkSearch, setDrinkSearch] = useState('')
  const [pickDrink, setPickDrink] = useState<Drink | null>(null)

  const getCurrentBusinessDay = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('get_or_create_open_business_day')
      if (error) {
        console.error('Business day RPC error:', error)
        return null
      }
      return data as string
    } catch (e) {
      console.error('Unexpected business day error:', e)
      return null
    }
  }, [])

  /** Load orders for a known business day (avoids re-calling RPC right after insert — fixes missing new row until pull-refresh). */
  const loadOrdersForBusinessDay = useCallback(async (bdId: string) => {
    try {
      setCurrentBusinessDayId(bdId)
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .in('status', ['active', 'checked_out', 'finished'])
        .eq('business_day_id', bdId)
        .order('created_at', { ascending: false })

      if (error) throw error
      const rows = data || []
      setActiveOrders(rows.filter((o) => o.status === 'active'))
      setDayRevenue(rows.reduce((s, o) => s + Number(o.total_amount || 0), 0))
    } catch (e) {
      console.error('Error fetching orders:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchActiveOrders = useCallback(async () => {
    const bdId = await getCurrentBusinessDay()
    if (!bdId) {
      Alert.alert('错误', '无法获取营业日')
      setLoading(false)
      return
    }
    await loadOrdersForBusinessDay(bdId)
  }, [getCurrentBusinessDay, loadOrdersForBusinessDay])

  const fetchDrinks = useCallback(async () => {
    if (!tenantId) {
      setDrinks([])
      return
    }
    try {
      const { data, error } = await supabase
        .from('categories')
        .select(
          '*, drinks(*, drink_serving_options(id, label, volume_ml, price, serving_type, is_default, is_active))',
        )
        .eq('tenant_id', tenantId)
        .eq('enabled', true)
        .order('sort_order', { ascending: true })

      if (error) throw error

      const isPosOrderable = (
        d: Drink & { drink_serving_options?: DrinkServingOption[] },
      ) => {
        if (!d.enabled || d.tenant_id !== tenantId) return false
        if (d.public_status === 'sold_out' || d.public_status === 'coming_soon') return false
        return activeServings(d).length > 0
      }

      const sorted: CategoryWithDrinks[] = (data || [])
        .map((cat: any) => ({
          ...cat,
          drinks: (cat.drinks || [])
            .filter(isPosOrderable)
            .sort((a: Drink, b: Drink) => a.sort_order - b.sort_order),
        }))
        .filter((cat: CategoryWithDrinks) => cat.drinks.length > 0)

      setDrinks(sorted)
    } catch (e) {
      Alert.alert('错误', '加载酒品失败')
    }
  }, [tenantId])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await Promise.all([fetchActiveOrders(), fetchDrinks()])
    setRefreshing(false)
  }, [fetchActiveOrders, fetchDrinks])

  useFocusEffect(
    useCallback(() => {
      fetchDrinks()
    }, [fetchDrinks])
  )

  useEffect(() => {
    fetchActiveOrders()
    fetchDrinks()

    const channel = supabase
      .channel('mobile-ordering')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        fetchActiveOrders()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, () => {
        fetchDrinks()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drinks' }, () => {
        fetchDrinks()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [tenantId, fetchActiveOrders, fetchDrinks])

  const handleNewOrder = () => {
    setEditingOrderId(null)
    setCustomerName('')
    setCart([])
    setViewMode('form')
  }

  const handleEditOrder = async (order: Order) => {
    setEditingOrderId(order.id)
    setCustomerName(order.customer_name)

    try {
      const { data, error } = await supabase
        .from('order_items')
        .select('*, drinks(*, drink_serving_options(id, label, volume_ml, price, is_active, is_default))')
        .eq('order_id', order.id)

      if (error) throw error

      const cartItems: CartItem[] = (data || []).map((item: any) => ({
        drink_id: item.drink_id,
        drink: item.drinks,
        serving_option_id: item.serving_option_id,
        serving_label: item.label_snapshot || '规格',
        unit_price: Number(item.unit_price),
        quantity: item.quantity,
      }))
      setCart(cartItems)
    } catch (e) {
      console.error('Error loading order items:', e)
      Alert.alert('错误', '加载订单详情失败')
    }

    setViewMode('form')
  }

  const handleCheckout = (order: Order) => {
    Alert.alert('确认结账', `确认将「${order.customer_name}」标记为已结账？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '确认结账',
        onPress: async () => {
          if (checkoutUpdatingId) return
          setCheckoutUpdatingId(order.id)
          try {
            const { error } = await supabase
              .from('orders')
              .update({ status: 'checked_out', checked_out_at: new Date().toISOString() })
              .eq('id', order.id)
            if (error) throw error
            await fetchActiveOrders()
          } catch (e) {
            Alert.alert('错误', '结账失败')
          } finally {
            setCheckoutUpdatingId(null)
          }
        },
      },
    ])
  }

  const addServingToCart = (drink: Drink, serving: DrinkServingOption) => {
    const label = formatServingLabel(serving)
    const price = Number(serving.price)
    setCart((prev) => {
      const existing = prev.find((item) => item.serving_option_id === serving.id)
      if (existing) {
        return prev.map((item) =>
          item.serving_option_id === serving.id
            ? { ...item, quantity: item.quantity + 1 }
            : item,
        )
      }
      return [
        ...prev,
        {
          drink_id: drink.id,
          drink,
          serving_option_id: serving.id,
          serving_label: label,
          unit_price: price,
          quantity: 1,
        },
      ]
    })
    setPickDrink(null)
  }

  const onPressDrink = (drink: Drink) => {
    const servings = activeServings(drink)
    if (!servings.length) {
      Alert.alert('不可点单', '该酒款没有有效价格规格')
      return
    }
    if (servings.length === 1) {
      addServingToCart(drink, servings[0])
      return
    }
    setPickDrink(drink)
  }

  const updateCartQty = (servingOptionId: string, value: number) => {
    if (value <= 0) {
      setCart((prev) => prev.filter((item) => item.serving_option_id !== servingOptionId))
      return
    }
    setCart((prev) =>
      prev.map((item) =>
        item.serving_option_id === servingOptionId ? { ...item, quantity: value } : item,
      ),
    )
  }

  const removeFromCart = (servingOptionId: string) => {
    setCart((prev) => prev.filter((item) => item.serving_option_id !== servingOptionId))
  }

  const cartTotal = cart.reduce((sum, item) => sum + item.quantity * item.unit_price, 0)

  const handleSaveOrder = async () => {
    const validItems = cart.filter((item) => item.quantity > 0)
    if (!customerName.trim() || validItems.length === 0) {
      Alert.alert('提示', '请填写客户姓名并添加至少一个商品')
      return
    }

    setSaving(true)
    try {
      let businessDayToRefresh: string | null = null

      const toRows = (orderId: string) =>
        validItems.map((item) => ({
          order_id: orderId,
          drink_id: item.drink_id,
          serving_option_id: item.serving_option_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          label_snapshot: item.serving_label,
          tenant_id: tenantId,
        }))

      if (editingOrderId) {
        await supabase.from('orders').update({ customer_name: customerName.trim() }).eq('id', editingOrderId)
        await supabase.from('order_items').delete().eq('order_id', editingOrderId)

        const { error } = await supabase.from('order_items').insert(toRows(editingOrderId))
        if (error) throw error
        businessDayToRefresh = currentBusinessDayId
      } else {
        const bdId = await getCurrentBusinessDay()
        if (!bdId) {
          Alert.alert('错误', '无法获取营业日')
          return
        }
        businessDayToRefresh = bdId

        const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })
        const { data: newOrder, error: orderError } = await supabase
          .from('orders')
          .insert({
            customer_name: customerName.trim(),
            order_date: today,
            business_day_id: bdId,
            status: 'active',
            tenant_id: tenantId,
          })
          .select()
          .single()

        if (orderError) throw orderError

        const { error } = await supabase.from('order_items').insert(toRows(newOrder.id))
        if (error) throw error
      }

      setViewMode('list')
      setCart([])
      setCustomerName('')
      setEditingOrderId(null)
      setPickDrink(null)

      const bdRefresh =
        businessDayToRefresh ?? currentBusinessDayId ?? (await getCurrentBusinessDay())
      if (bdRefresh) {
        await loadOrdersForBusinessDay(bdRefresh)
      } else {
        await fetchActiveOrders()
      }
    } catch (e: any) {
      console.error('Save order error:', e)
      Alert.alert('错误', e?.message || '保存订单失败')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.centered} edges={['top']}>
        <ActivityIndicator size="large" color={T.gold} />
      </SafeAreaView>
    )
  }

  // ORDER LIST VIEW
  if (viewMode === 'list') {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <FlatList
          data={activeOrders}
          keyExtractor={(item) => item.id}
          contentContainerStyle={
            activeOrders.length === 0
              ? [styles.listContentEmpty, { paddingBottom: 120 }]
              : { paddingBottom: 120 }
          }
          ListHeaderComponent={
            <View style={styles.hero}>
              <Text style={styles.title}>开台</Text>
              <View style={styles.countsRow}>
                <Stat label="进行中" value={activeOrders.length} />
                <Stat label="营业额" value={`¥${dayRevenue.toFixed(0)}`} />
              </View>
            </View>
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={T.gold}
              colors={[T.gold]}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="wine-outline" size={44} color={T.faint} />
              <Text style={styles.emptyText}>暂无进行中的台</Text>
              <Text style={styles.emptyHint}>点击右下角开一桌</Text>
            </View>
          }
          renderItem={({ item }) => {
            const vis = orderStatusVisual(item.status)
            return (
              <TouchableOpacity style={styles.orderCard} activeOpacity={0.85} onPress={() => handleEditOrder(item)}>
                <View style={styles.orderCardRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.orderName}>{item.customer_name}</Text>
                    <Text style={styles.orderTime}>
                      {new Date(item.created_at).toLocaleTimeString('zh-CN', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.orderAmount}>¥{Number(item.total_amount).toFixed(2)}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: vis.bg, borderColor: vis.border }]}>
                      <Text style={[styles.statusText, { color: vis.fg }]}>
                        {orderStatusLabel(item.status)}
                      </Text>
                    </View>
                  </View>
                </View>
                {item.status === 'active' && (
                  <TouchableOpacity
                    style={[styles.checkoutBtn, checkoutUpdatingId === item.id && { opacity: 0.55 }]}
                    disabled={checkoutUpdatingId !== null}
                    onPress={() => handleCheckout(item)}
                  >
                    {checkoutUpdatingId === item.id ? (
                      <ActivityIndicator size="small" color={T.background} />
                    ) : (
                      <Text style={styles.checkoutBtnText}>结账</Text>
                    )}
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            )
          }}
        />

        <TouchableOpacity style={styles.fab} onPress={handleNewOrder} activeOpacity={0.85}>
          <Ionicons name="add" size={22} color={T.background} />
          <Text style={styles.fabText}>开台</Text>
        </TouchableOpacity>
      </SafeAreaView>
    )
  }

  // ORDER FORM VIEW - filter drinks by search
  const filteredDrinks = drinkSearch.trim()
    ? drinks
        .map((cat) => ({
          ...cat,
          drinks: cat.drinks.filter((d) =>
            d.name.toLowerCase().includes(drinkSearch.trim().toLowerCase())
          ),
        }))
        .filter((cat) => cat.drinks.length > 0)
    : drinks

  const canSave = !!customerName.trim() && cart.filter((i) => i.quantity > 0).length > 0

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: T.background }} edges={['top']}>
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
        <TouchableOpacity
          onPress={() => {
            setViewMode('list')
            setDrinkSearch('')
            setPickDrink(null)
          }}
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={20} color={T.gold} />
          <Text style={styles.backBtnText}>返回</Text>
        </TouchableOpacity>

        <Text style={styles.title}>{editingOrderId ? '编辑订单' : '新建订单'}</Text>

        <View style={styles.formSection}>
          <Text style={styles.label}>客户姓名</Text>
          <TextInput
            style={styles.input}
            value={customerName}
            onChangeText={setCustomerName}
            placeholder="输入客户姓名"
            placeholderTextColor={T.faint}
          />
        </View>

        {cart.length > 0 && (
          <View style={styles.formSection}>
            <Text style={styles.label}>已选商品</Text>
            {cart.map((item) => {
              const subtotal = item.quantity * item.unit_price
              return (
                <View key={item.serving_option_id} style={styles.cartItem}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.cartItemName} numberOfLines={1}>
                      {item.drink.name}
                    </Text>
                    <Text style={styles.cartItemMeta} numberOfLines={1}>
                      {item.serving_label} · ¥{item.unit_price}
                    </Text>
                    <Text style={styles.cartItemPrice}>¥{subtotal.toFixed(2)}</Text>
                  </View>

                  <View style={styles.stepperRow}>
                    <TouchableOpacity
                      style={styles.stepperBtn}
                      onPress={() => updateCartQty(item.serving_option_id, item.quantity - 1)}
                    >
                      <Ionicons name="remove" size={18} color={T.text} />
                    </TouchableOpacity>
                    <Text style={styles.stepperValue}>{item.quantity}</Text>
                    <TouchableOpacity
                      style={styles.stepperBtn}
                      onPress={() => updateCartQty(item.serving_option_id, item.quantity + 1)}
                    >
                      <Ionicons name="add" size={18} color={T.text} />
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity
                    onPress={() => removeFromCart(item.serving_option_id)}
                    style={styles.removeBtn}
                  >
                    <Ionicons name="trash-outline" size={18} color={T.danger} />
                  </TouchableOpacity>
                </View>
              )
            })}

            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>总计</Text>
              <Text style={styles.totalValue}>¥{cartTotal.toFixed(2)}</Text>
            </View>
          </View>
        )}

        <TouchableOpacity
          style={[styles.saveButton, !canSave && styles.saveButtonDisabled]}
          onPress={handleSaveOrder}
          disabled={saving || !canSave}
        >
          {saving ? (
            <ActivityIndicator color={T.background} />
          ) : (
            <Text style={styles.saveButtonText}>{editingOrderId ? '更新订单' : '创建订单'}</Text>
          )}
        </TouchableOpacity>

        <View style={styles.formSection}>
          <Text style={styles.label}>选择商品</Text>
          <TextInput
            style={[styles.input, { marginBottom: 12 }]}
            value={drinkSearch}
            onChangeText={setDrinkSearch}
            placeholder="搜索酒品..."
            placeholderTextColor={T.faint}
          />
          {filteredDrinks.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 24 }}>
              <Ionicons name="search-outline" size={36} color={T.faint} />
              <Text style={styles.emptyText}>未找到匹配酒品</Text>
            </View>
          ) : (
            filteredDrinks.map((category) => (
              <View key={category.id} style={styles.drinkCategory}>
                <Text style={styles.drinkCategoryTitle}>{category.name}</Text>
                <View style={styles.drinkGrid}>
                  {category.drinks.map((drink) => {
                    const hint = priceHint(drink)
                    const multi = activeServings(drink).length > 1
                    return (
                      <TouchableOpacity
                        key={drink.id}
                        style={styles.drinkBtn}
                        onPress={() => onPressDrink(drink)}
                      >
                        <Text style={styles.drinkBtnName} numberOfLines={2}>
                          {drink.name}
                        </Text>
                        {hint ? <Text style={styles.drinkBtnPrice}>{hint}</Text> : null}
                        {multi ? <Text style={styles.drinkBtnHint}>选规格</Text> : null}
                      </TouchableOpacity>
                    )
                  })}
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>

    <Modal visible={!!pickDrink} transparent animationType="slide" onRequestClose={() => setPickDrink(null)}>
      <View style={styles.sheetOverlay}>
        <TouchableOpacity style={styles.sheetBackdrop} activeOpacity={1} onPress={() => setPickDrink(null)} />
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle} numberOfLines={2}>
            {pickDrink?.name}
          </Text>
          <Text style={styles.sheetSub}>选择规格</Text>
          {(pickDrink ? activeServings(pickDrink) : []).map((s) => (
            <TouchableOpacity
              key={s.id}
              style={styles.sheetOption}
              onPress={() => pickDrink && addServingToCart(pickDrink, s)}
            >
              <Text style={styles.sheetOptionLabel}>{formatServingLabel(s)}</Text>
              <Text style={styles.sheetOptionPrice}>¥{Number(s.price)}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.sheetCancel} onPress={() => setPickDrink(null)}>
            <Text style={styles.sheetCancelText}>取消</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
    </SafeAreaView>
  )
}

export default function OrderingRoute() {
  const { orderingEnabled, isLoading } = useAuth()
  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={T.gold} />
      </View>
    )
  }
  if (!orderingEnabled) return <Redirect href="/(tabs)/taplist" />
  return <OrderingScreen />
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.background },
  centered: { flex: 1, backgroundColor: T.background, justifyContent: 'center', alignItems: 'center' },
  hero: {
    paddingHorizontal: LAYOUT.pagePad,
    paddingTop: LAYOUT.heroPadTop,
    paddingBottom: LAYOUT.heroPadBottom,
  },
  title: { color: T.text, fontSize: 26, fontWeight: '800' },
  countsRow: { flexDirection: 'row', gap: 10, marginTop: 18 },
  stat: {
    flex: 1,
    backgroundColor: T.surfaceMuted,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: T.borderFaint,
  },
  statValue: { color: T.text, fontSize: 22, fontWeight: '800' },
  statLabel: { color: T.muted, fontSize: 12, marginTop: 4 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80, gap: 8 },
  emptyText: { color: T.muted, fontSize: 16, marginTop: 12 },
  emptyHint: { color: T.faint, fontSize: 13 },
  listContentEmpty: { flexGrow: 1 },
  orderCard: {
    backgroundColor: T.surface,
    borderRadius: 14,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: T.borderFaint,
  },
  orderCardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  orderName: { fontSize: 17, fontWeight: '700', color: T.text, marginBottom: 4 },
  orderTime: { fontSize: 13, color: T.muted },
  orderAmount: { fontSize: 18, fontWeight: '800', color: T.text, marginBottom: 6 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 16, borderWidth: 1 },
  statusText: { fontSize: 12, fontWeight: '600' },
  checkoutBtn: {
    marginTop: 14,
    backgroundColor: T.gold,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
  },
  checkoutBtnText: { color: T.background, fontWeight: '800', fontSize: 15 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: LAYOUT.pagePad, paddingTop: 12, paddingBottom: 4 },
  backBtnText: { color: T.gold, fontSize: 16, fontWeight: '600' },
  formSection: { marginBottom: 20, paddingHorizontal: LAYOUT.pagePad, marginTop: 8 },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: T.muted,
    textTransform: 'uppercase',
    marginBottom: 10,
    letterSpacing: 1,
  },
  input: {
    backgroundColor: T.card,
    color: T.text,
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    borderWidth: 1,
    borderColor: T.borderFaint,
  },
  cartItem: {
    backgroundColor: T.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    borderWidth: 1,
    borderColor: T.borderFaint,
  },
  cartItemName: { fontSize: 15, fontWeight: '600', color: T.text },
  cartItemMeta: { fontSize: 12, color: T.muted, marginTop: 2 },
  cartItemPrice: { fontSize: 13, color: T.goldSoft, marginTop: 2 },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepperLabel: { fontSize: 13, color: T.muted, marginRight: 2 },
  stepperBtn: {
    backgroundColor: T.surfaceMuted,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 8,
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepperValue: { color: T.text, fontSize: 15, fontWeight: '700', minWidth: 20, textAlign: 'center' },
  removeBtn: { padding: 12 },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: T.borderFaint,
  },
  totalLabel: { fontSize: 16, fontWeight: '600', color: T.text },
  totalValue: { fontSize: 22, fontWeight: '800', color: T.gold },
  saveButton: {
    backgroundColor: T.gold,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginBottom: 24,
    marginHorizontal: 20,
  },
  saveButtonDisabled: { opacity: 0.4 },
  saveButtonText: { color: T.background, fontSize: 17, fontWeight: '800' },
  drinkCategory: { marginBottom: 16 },
  drinkCategoryTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: T.muted,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  drinkGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  drinkBtn: {
    backgroundColor: T.surface,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    minWidth: 100,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: T.borderFaint,
  },
  drinkBtnName: { fontSize: 14, fontWeight: '600', color: T.text, marginBottom: 2, textAlign: 'center' },
  drinkBtnPrice: { fontSize: 12, color: T.goldSoft },
  drinkBtnHint: { fontSize: 11, color: T.faint, marginTop: 2 },
  sheetOverlay: { flex: 1, justifyContent: 'flex-end' },
  sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    backgroundColor: T.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 28,
    borderTopWidth: 1,
    borderColor: T.border,
  },
  sheetTitle: { color: T.text, fontSize: 18, fontWeight: '800' },
  sheetSub: { color: T.muted, fontSize: 13, marginTop: 6, marginBottom: 14 },
  sheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surface,
    marginBottom: 8,
  },
  sheetOptionLabel: { color: T.text, fontSize: 15, fontWeight: '600', flex: 1 },
  sheetOptionPrice: { color: T.gold, fontSize: 16, fontWeight: '800', marginLeft: 12 },
  sheetCancel: {
    marginTop: 8,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: T.border,
  },
  sheetCancelText: { color: T.muted, fontSize: 15, fontWeight: '600' },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: T.gold,
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderRadius: 28,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  fabText: { color: T.background, fontSize: 16, fontWeight: '800' },
})
