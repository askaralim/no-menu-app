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
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/authProvider'
import { COLORS, STATUS_LABELS } from '../../lib/constants'
import type { Order, CategoryWithDrinks, Drink, CartItem } from '../../lib/types'

type ViewMode = 'list' | 'form'

export default function OrderingScreen() {
  const { tenantId } = useAuth()
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [activeOrders, setActiveOrders] = useState<Order[]>([])
  const [drinks, setDrinks] = useState<CategoryWithDrinks[]>([])
  const [customerName, setCustomerName] = useState('')
  const [cart, setCart] = useState<CartItem[]>([])
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null)
  const [currentBusinessDayId, setCurrentBusinessDayId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [drinkSearch, setDrinkSearch] = useState('')

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
        .in('status', ['active', 'checked_out'])
        .eq('business_day_id', bdId)
        .order('created_at', { ascending: false })

      if (error) throw error
      setActiveOrders(data || [])
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
        .select('*, drinks(*)')
        .eq('tenant_id', tenantId)
        .eq('enabled', true)
        .order('sort_order', { ascending: true })

      if (error) throw error

      const sorted: CategoryWithDrinks[] = (data || [])
        .map((cat: any) => ({
          ...cat,
          drinks: (cat.drinks || [])
            .filter((d: Drink) => d.enabled && d.tenant_id === tenantId)
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
        .select('*, drinks(*)')
        .eq('order_id', order.id)

      if (error) throw error

      const cartItems: CartItem[] = (data || []).map((item: any) => ({
        drink_id: item.drink_id,
        drink: item.drinks,
        quantity_cup: item.quantity_cup,
        quantity_bottle: item.quantity_bottle,
      }))
      setCart(cartItems)
    } catch (e) {
      console.error('Error loading order items:', e)
      Alert.alert('错误', '加载订单详情失败')
    }

    setViewMode('form')
  }

  const handleCheckout = (orderId: string) => {
    Alert.alert('确认结账', '确定要结账吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '确定',
        onPress: async () => {
          try {
            const { error } = await supabase
              .from('orders')
              .update({ status: 'checked_out', checked_out_at: new Date().toISOString() })
              .eq('id', orderId)
            if (error) throw error
            await fetchActiveOrders()
          } catch (e) {
            Alert.alert('错误', '结账失败')
          }
        },
      },
    ])
  }

  const addToCart = (drink: Drink) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.drink_id === drink.id)
      if (existing) {
        return prev.map((item) =>
          item.drink_id === drink.id
            ? { ...item, quantity_cup: item.quantity_cup + 1 }
            : item
        )
      }
      return [...prev, { drink_id: drink.id, drink, quantity_cup: 1, quantity_bottle: 0 }]
    })
  }

  const updateCartItem = (drinkId: string, field: 'quantity_cup' | 'quantity_bottle', value: number) => {
    if (value < 0) return
    setCart((prev) =>
      prev.map((item) => (item.drink_id === drinkId ? { ...item, [field]: value } : item))
    )
  }

  const removeFromCart = (drinkId: string) => {
    setCart((prev) => prev.filter((item) => item.drink_id !== drinkId))
  }

  const cartTotal = cart.reduce((sum, item) => {
    const cupTotal = item.quantity_cup * item.drink.price
    const bottleTotal = item.quantity_bottle * (item.drink.price_bottle || 0)
    return sum + cupTotal + bottleTotal
  }, 0)

  const handleSaveOrder = async () => {
    const validItems = cart.filter((item) => item.quantity_cup > 0 || item.quantity_bottle > 0)
    if (!customerName.trim() || validItems.length === 0) {
      Alert.alert('提示', '请填写客户姓名并添加至少一个商品')
      return
    }

    setSaving(true)
    try {
      let businessDayToRefresh: string | null = null

      if (editingOrderId) {
        await supabase.from('orders').update({ customer_name: customerName.trim() }).eq('id', editingOrderId)
        await supabase.from('order_items').delete().eq('order_id', editingOrderId)

        const orderItems = validItems.map((item) => ({
          order_id: editingOrderId,
          drink_id: item.drink_id,
          quantity_cup: item.quantity_cup,
          quantity_bottle: item.quantity_bottle,
          unit_price_cup: item.drink.price,
          unit_price_bottle: item.drink.price_bottle,
          tenant_id: tenantId,
        }))
        const { error } = await supabase.from('order_items').insert(orderItems)
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

        const orderItems = validItems.map((item) => ({
          order_id: newOrder.id,
          drink_id: item.drink_id,
          quantity_cup: item.quantity_cup,
          quantity_bottle: item.quantity_bottle,
          unit_price_cup: item.drink.price,
          unit_price_bottle: item.drink.price_bottle,
          tenant_id: tenantId,
        }))
        const { error } = await supabase.from('order_items').insert(orderItems)
        if (error) throw error
      }

      setViewMode('list')
      setCart([])
      setCustomerName('')
      setEditingOrderId(null)

      const bdRefresh =
        businessDayToRefresh ?? currentBusinessDayId ?? (await getCurrentBusinessDay())
      if (bdRefresh) {
        await loadOrdersForBusinessDay(bdRefresh)
      } else {
        await fetchActiveOrders()
      }
    } catch (e) {
      console.error('Save order error:', e)
      Alert.alert('错误', '保存订单失败')
    } finally {
      setSaving(false)
    }
  }

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'active':
        return COLORS.statusActive
      case 'checked_out':
        return COLORS.statusCheckedOut
      default:
        return COLORS.statusFinished
    }
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.gold} />
      </View>
    )
  }

  // ORDER LIST VIEW
  if (viewMode === 'list') {
    return (
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <Text style={styles.sectionTitle}>今日订单</Text>
          <TouchableOpacity style={styles.addButton} onPress={handleNewOrder}>
            <Ionicons name="add" size={22} color="#000" />
            <Text style={styles.addButtonText}>新订单</Text>
          </TouchableOpacity>
        </View>

        <FlatList
          data={activeOrders}
          keyExtractor={(item) => item.id}
          contentContainerStyle={
            activeOrders.length === 0
              ? [styles.listContentEmpty, { paddingBottom: 40 }]
              : { paddingBottom: 40 }
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.gold}
              colors={[COLORS.gold]}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="receipt-outline" size={48} color={COLORS.muted} />
              <Text style={styles.emptyText}>暂无活跃订单</Text>
              <Text style={styles.emptyHint}>下拉刷新</Text>
            </View>
          }
          renderItem={({ item }) => {
            const statusStyle = getStatusStyle(item.status)
            return (
              <TouchableOpacity style={styles.orderCard} onPress={() => handleEditOrder(item)}>
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
                    <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
                      <Text style={[styles.statusText, { color: statusStyle.text }]}>
                        {STATUS_LABELS[item.status] || item.status}
                      </Text>
                    </View>
                  </View>
                </View>
                {item.status === 'active' && (
                  <TouchableOpacity
                    style={styles.checkoutBtn}
                    onPress={() => handleCheckout(item.id)}
                  >
                    <Text style={styles.checkoutBtnText}>结账</Text>
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            )
          }}
        />
      </View>
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

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.headerRow}>
          <TouchableOpacity
            onPress={() => {
              setViewMode('list')
              setDrinkSearch('')
            }}
            style={styles.backBtn}
          >
            <Ionicons name="arrow-back" size={22} color={COLORS.gold} />
            <Text style={styles.backBtnText}>返回</Text>
          </TouchableOpacity>
          <Text style={styles.sectionTitle}>{editingOrderId ? '编辑订单' : '新建订单'}</Text>
        </View>

        {/* Customer Name */}
        <View style={styles.formSection}>
          <Text style={styles.label}>客户姓名</Text>
          <TextInput
            style={styles.input}
            value={customerName}
            onChangeText={setCustomerName}
            placeholder="输入客户姓名"
            placeholderTextColor={COLORS.muted}
          />
        </View>

        {/* Cart */}
        {cart.length > 0 && (
          <View style={styles.formSection}>
            <Text style={styles.label}>已选商品</Text>
            {cart.map((item) => {
              const subtotal =
                item.quantity_cup * item.drink.price +
                item.quantity_bottle * (item.drink.price_bottle || 0)
              return (
                <View key={item.drink_id} style={styles.cartItem}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cartItemName}>{item.drink.name}</Text>
                    <Text style={styles.cartItemPrice}>¥{subtotal.toFixed(2)}</Text>
                  </View>

                  <View style={styles.stepperRow}>
                    <Text style={styles.stepperLabel}>{item.drink.price_unit || '杯'}</Text>
                    <TouchableOpacity
                      style={styles.stepperBtn}
                      onPress={() => updateCartItem(item.drink_id, 'quantity_cup', item.quantity_cup - 1)}
                    >
                      <Ionicons name="remove" size={18} color={COLORS.text} />
                    </TouchableOpacity>
                    <Text style={styles.stepperValue}>{item.quantity_cup}</Text>
                    <TouchableOpacity
                      style={styles.stepperBtn}
                      onPress={() => updateCartItem(item.drink_id, 'quantity_cup', item.quantity_cup + 1)}
                    >
                      <Ionicons name="add" size={18} color={COLORS.text} />
                    </TouchableOpacity>
                  </View>

                  {item.drink.price_bottle != null && item.drink.price_bottle > 0 && (
                    <View style={styles.stepperRow}>
                      <Text style={styles.stepperLabel}>{item.drink.price_unit_bottle || '瓶'}</Text>
                      <TouchableOpacity
                        style={styles.stepperBtn}
                        onPress={() =>
                          updateCartItem(item.drink_id, 'quantity_bottle', item.quantity_bottle - 1)
                        }
                      >
                        <Ionicons name="remove" size={18} color={COLORS.text} />
                      </TouchableOpacity>
                      <Text style={styles.stepperValue}>{item.quantity_bottle}</Text>
                      <TouchableOpacity
                        style={styles.stepperBtn}
                        onPress={() =>
                          updateCartItem(item.drink_id, 'quantity_bottle', item.quantity_bottle + 1)
                        }
                      >
                        <Ionicons name="add" size={18} color={COLORS.text} />
                      </TouchableOpacity>
                    </View>
                  )}

                  <TouchableOpacity onPress={() => removeFromCart(item.drink_id)} style={styles.removeBtn}>
                    <Ionicons name="trash-outline" size={18} color={COLORS.danger} />
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

        {/* Save Button */}
        <TouchableOpacity
          style={[
            styles.saveButton,
            (!customerName.trim() ||
              cart.filter((i) => i.quantity_cup > 0 || i.quantity_bottle > 0).length === 0) &&
              styles.saveButtonDisabled,
          ]}
          onPress={handleSaveOrder}
          disabled={
            saving ||
            !customerName.trim() ||
            cart.filter((i) => i.quantity_cup > 0 || i.quantity_bottle > 0).length === 0
          }
        >
          {saving ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={styles.saveButtonText}>{editingOrderId ? '更新订单' : '创建订单'}</Text>
          )}
        </TouchableOpacity>

        {/* Drink Selection with Search */}
        <View style={styles.formSection}>
          <Text style={styles.label}>选择商品</Text>
          <TextInput
            style={[styles.input, { marginBottom: 12 }]}
            value={drinkSearch}
            onChangeText={setDrinkSearch}
            placeholder="搜索酒品..."
            placeholderTextColor={COLORS.muted}
          />
          {filteredDrinks.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 24 }}>
              <Ionicons name="search-outline" size={36} color={COLORS.muted} />
              <Text style={styles.emptyText}>未找到匹配酒品</Text>
            </View>
          ) : (
            filteredDrinks.map((category) => (
              <View key={category.id} style={styles.drinkCategory}>
                <Text style={styles.drinkCategoryTitle}>{category.name}</Text>
                <View style={styles.drinkGrid}>
                  {category.drinks.map((drink) => (
                    <TouchableOpacity
                      key={drink.id}
                      style={styles.drinkBtn}
                      onPress={() => addToCart(drink)}
                    >
                      <Text style={styles.drinkBtnName}>{drink.name}</Text>
                      {drink.price != null && drink.price > 0 && (
                        <Text style={styles.drinkBtnPrice}>¥{drink.price}/{drink.price_unit}</Text>
                      )}
                      {drink.price_bottle != null && drink.price_bottle > 0 && (
                        <Text style={styles.drinkBtnPrice}>¥{drink.price_bottle}/{drink.price_unit_bottle}</Text>
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    padding: 16,
  },
  centered: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.gold,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 8,
    gap: 4,
  },
  addButtonText: {
    color: '#000',
    fontWeight: '600',
    fontSize: 15,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 80,
  },
  emptyText: {
    color: COLORS.muted,
    fontSize: 16,
    marginTop: 12,
  },
  emptyHint: {
    color: COLORS.muted,
    fontSize: 13,
    marginTop: 10,
    opacity: 0.75,
  },
  listContentEmpty: {
    flexGrow: 1,
  },
  orderCard: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  orderCardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  orderName: {
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 4,
  },
  orderTime: {
    fontSize: 13,
    color: COLORS.muted,
  },
  orderAmount: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 4,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  checkoutBtn: {
    marginTop: 12,
    backgroundColor: COLORS.gold,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  checkoutBtnText: {
    color: '#000',
    fontWeight: '700',
    fontSize: 15,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 4,
  },
  backBtnText: {
    color: COLORS.gold,
    fontSize: 16,
  },
  formSection: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.gold,
    textTransform: 'uppercase',
    marginBottom: 8,
    letterSpacing: 1,
  },
  input: {
    backgroundColor: COLORS.card,
    color: COLORS.text,
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
  },
  cartItem: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  cartItemName: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
  },
  cartItemPrice: {
    fontSize: 13,
    color: COLORS.gold,
    marginTop: 2,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stepperLabel: {
    fontSize: 13,
    color: COLORS.muted,
    marginRight: 2,
  },
  stepperBtn: {
    backgroundColor: COLORS.border,
    borderRadius: 6,
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepperValue: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '600',
    minWidth: 20,
    textAlign: 'center',
  },
  removeBtn: {
    padding: 12,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  totalValue: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.gold,
  },
  saveButton: {
    backgroundColor: COLORS.gold,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 24,
  },
  saveButtonDisabled: {
    opacity: 0.4,
  },
  saveButtonText: {
    color: '#000',
    fontSize: 17,
    fontWeight: '700',
  },
  drinkCategory: {
    marginBottom: 16,
  },
  drinkCategoryTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.muted,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  drinkGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  drinkBtn: {
    backgroundColor: COLORS.card,
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 14,
    minWidth: 100,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  drinkBtnName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 2,
  },
  drinkBtnPrice: {
    fontSize: 12,
    color: COLORS.gold,
  },
})
