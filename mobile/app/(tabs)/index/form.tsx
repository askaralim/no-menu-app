import { useEffect, useState, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Redirect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../lib/authProvider'
import { THEME as T } from '../../../lib/theme'
import { Screen } from '../../../components/ui'
import { HouseSubheader } from '../../../components/house/HouseSubheader'
import type { CategoryWithDrinks, Drink, DrinkServingOption, CartItem } from '../../../lib/types'

function isBusinessDayClosedError(err: unknown): boolean {
  const msg = typeof err === 'string' ? err : (err as { message?: string })?.message || ''
  return String(msg).includes('BUSINESS_DAY_CLOSED')
}

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

function paramId(raw: string | string[] | undefined): string {
  if (typeof raw === 'string') return raw
  if (Array.isArray(raw) && typeof raw[0] === 'string') return raw[0]
  return ''
}

function OrderFormScreen() {
  const router = useRouter()
  const navigation = useNavigation()
  const { tenantId } = useAuth()
  const params = useLocalSearchParams<{ id?: string }>()
  const editingOrderId = paramId(params.id)

  const [drinks, setDrinks] = useState<CategoryWithDrinks[]>([])
  const [customerName, setCustomerName] = useState('')
  const [cart, setCart] = useState<CartItem[]>([])
  const [saving, setSaving] = useState(false)
  const [drinkSearch, setDrinkSearch] = useState('')
  const [pickDrink, setPickDrink] = useState<Drink | null>(null)
  const [loadingEdit, setLoadingEdit] = useState(Boolean(editingOrderId))
  const [editLoadFailed, setEditLoadFailed] = useState(false)

  useEffect(() => {
    navigation.setOptions({
      gestureEnabled: !pickDrink,
      fullScreenGestureEnabled: !pickDrink,
    })
  }, [navigation, pickDrink])

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
        .map((cat: CategoryWithDrinks & { drinks?: Drink[] }) => ({
          ...cat,
          drinks: (cat.drinks || [])
            .filter(isPosOrderable)
            .sort((a: Drink, b: Drink) => a.sort_order - b.sort_order),
        }))
        .filter((cat: CategoryWithDrinks) => cat.drinks.length > 0)

      setDrinks(sorted)
    } catch {
      Alert.alert('错误', '加载酒品失败')
    }
  }, [tenantId])

  useEffect(() => {
    void fetchDrinks()
  }, [fetchDrinks])

  useEffect(() => {
    if (!editingOrderId) return
    let cancelled = false
    void (async () => {
      try {
        const { data: orderData, error: orderError } = await supabase
          .from('orders')
          .select('customer_name')
          .eq('id', editingOrderId)
          .single()
        if (orderError) throw orderError

        const { data, error } = await supabase
          .from('order_items')
          .select(
            '*, drinks(*, drink_serving_options(id, label, volume_ml, price, is_active, is_default))',
          )
          .eq('order_id', editingOrderId)
        if (error) throw error
        if (cancelled) return

        setCustomerName(orderData?.customer_name || '')
        setCart(
          (data || []).map((item: Record<string, unknown> & { drinks?: Drink }) => ({
            drink_id: item.drink_id as string,
            drink: item.drinks as Drink,
            serving_option_id: item.serving_option_id as string,
            serving_label: (item.label_snapshot as string) || '规格',
            unit_price: Number(item.unit_price),
            quantity: item.quantity as number,
          })),
        )
      } catch (e) {
        console.error('Error loading order items:', e)
        if (!cancelled) setEditLoadFailed(true)
      } finally {
        if (!cancelled) setLoadingEdit(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [editingOrderId])

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
        const { error: nameError } = await supabase
          .from('orders')
          .update({ customer_name: customerName.trim() })
          .eq('id', editingOrderId)
        if (nameError) throw nameError

        const { error: deleteError } = await supabase
          .from('order_items')
          .delete()
          .eq('order_id', editingOrderId)
        if (deleteError) throw deleteError

        const { error } = await supabase.from('order_items').insert(toRows(editingOrderId))
        if (error) throw error
      } else {
        const { data: bdId, error: bdError } = await supabase.rpc('get_or_create_open_business_day')
        if (bdError) {
          if (isBusinessDayClosedError(bdError)) {
            Alert.alert('今日营业日已结束', '请先回到开台页重新开始营业日。')
            return
          }
          throw bdError
        }
        if (!bdId) {
          Alert.alert('错误', '无法获取营业日')
          return
        }

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

      router.back()
    } catch (e: unknown) {
      console.error('Save order error:', e)
      const message = e instanceof Error ? e.message : (e as { message?: string })?.message
      Alert.alert('错误', message || '保存订单失败')
    } finally {
      setSaving(false)
    }
  }

  const filteredDrinks = drinkSearch.trim()
    ? drinks
        .map((cat) => ({
          ...cat,
          drinks: cat.drinks.filter((d) =>
            d.name.toLowerCase().includes(drinkSearch.trim().toLowerCase()),
          ),
        }))
        .filter((cat) => cat.drinks.length > 0)
    : drinks

  const canSave = !!customerName.trim() && cart.filter((i) => i.quantity > 0).length > 0

  if (loadingEdit) {
    return (
      <Screen>
        <HouseSubheader title="编辑订单" />
        <ActivityIndicator color={T.gold} style={{ marginTop: 40 }} />
      </Screen>
    )
  }

  if (editLoadFailed) {
    return (
      <Screen>
        <HouseSubheader title="编辑订单" />
        <Text style={styles.loadErrorText}>加载订单失败，请返回后重试</Text>
      </Screen>
    )
  }

  return (
    <>
      <Screen scroll keyboard>
        <HouseSubheader title={editingOrderId ? '编辑订单' : '新建订单'} />

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
                      {item.drink?.name || '未知商品'}
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
          onPress={() => void handleSaveOrder()}
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
      </Screen>

      <Modal
        visible={!!pickDrink}
        transparent
        animationType="slide"
        onRequestClose={() => setPickDrink(null)}
      >
        <View style={styles.sheetOverlay}>
          <TouchableOpacity
            style={styles.sheetBackdrop}
            activeOpacity={1}
            onPress={() => setPickDrink(null)}
          />
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
    </>
  )
}

export default function OrderFormRoute() {
  const { orderingEnabled, isLoading } = useAuth()
  if (isLoading) {
    return (
      <Screen>
        <ActivityIndicator size="large" color={T.gold} />
      </Screen>
    )
  }
  if (!orderingEnabled) return <Redirect href="/(tabs)/taplist" />
  return <OrderFormScreen />
}

const styles = StyleSheet.create({
  loadErrorText: { color: T.muted, fontSize: 15, marginTop: 8 },
  formSection: { marginBottom: 20, marginTop: 8 },
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
  emptyText: { color: T.muted, fontSize: 16, marginTop: 12 },
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
})
