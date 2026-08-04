import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
  TextInput,
  Share,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { Redirect } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/authProvider'
import { orderStatusLabel, isOrderSettled } from '../../lib/constants'
import { THEME as T, orderStatusVisual, LAYOUT } from '../../lib/theme'
import type { Order, OrderWithItems, OrderStatus, BusinessDay, Drink } from '../../lib/types'

interface BusinessDayWithOrders extends BusinessDay {
  orders: Order[]
  totalAmount: number
}

type ViewMode = 'list' | 'detail'

function OrdersScreen() {
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [businessDays, setBusinessDays] = useState<BusinessDayWithOrders[]>([])
  const [selectedOrder, setSelectedOrder] = useState<OrderWithItems | null>(null)
  const [selectedBusinessDayClosedAt, setSelectedBusinessDayClosedAt] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'checked_out'>('all')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [statusUpdating, setStatusUpdating] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const fetchBusinessDays = useCallback(async () => {
    try {
      const { data: bdData, error: bdError } = await supabase
        .from('business_days')
        .select('*')
        .order('business_date', { ascending: false })

      if (bdError) throw bdError

      let ordersQuery = supabase.from('orders').select('*').order('created_at', { ascending: false })
      if (statusFilter === 'active') {
        ordersQuery = ordersQuery.eq('status', 'active')
      } else if (statusFilter === 'checked_out') {
        // Include legacy `finished` as settled.
        ordersQuery = ordersQuery.in('status', ['checked_out', 'finished'])
      }

      const { data: ordersData, error: ordersError } = await ordersQuery
      if (ordersError) throw ordersError

      const result: BusinessDayWithOrders[] = (bdData || [])
        .map((bd: BusinessDay) => {
          const dayOrders = (ordersData || []).filter((o: Order) => o.business_day_id === bd.id)
          return {
            ...bd,
            orders: dayOrders,
            totalAmount: dayOrders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0),
          }
        })
        .filter((bd) => bd.orders.length > 0)

      setBusinessDays(result)
    } catch (e) {
      Alert.alert('错误', e instanceof Error ? e.message : '加载营业日数据失败')
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await fetchBusinessDays()
    } finally {
      setRefreshing(false)
    }
  }, [fetchBusinessDays])

  const fetchOrderDetails = async (orderId: string) => {
    setDetailLoading(true)
    setSelectedBusinessDayClosedAt(null)
    try {
      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .single()

      if (orderError) throw orderError

      const { data: itemsData, error: itemsError } = await supabase
        .from('order_items')
        .select('*, drinks(*)')
        .eq('order_id', orderId)
        .order('created_at', { ascending: true })

      if (itemsError) throw itemsError

      let businessDayClosedAt: string | null = null
      if (orderData.business_day_id) {
        const { data: businessDayData, error: businessDayError } = await supabase
          .from('business_days')
          .select('closed_at')
          .eq('id', orderData.business_day_id)
          .single()

        if (businessDayError) throw businessDayError
        businessDayClosedAt = businessDayData.closed_at
      }

      setSelectedOrder({
        ...orderData,
        items: (itemsData || []).map((item: any) => ({ ...item, drink: item.drinks })),
      })
      setSelectedBusinessDayClosedAt(businessDayClosedAt)
      setViewMode('detail')
    } catch (e) {
      Alert.alert('错误', e instanceof Error ? e.message : '加载订单详情失败')
    } finally {
      setDetailLoading(false)
    }
  }

  const handleStatusChange = async (orderId: string, newStatus: OrderStatus) => {
    if (statusUpdating) return
    setStatusUpdating(true)
    try {
      const updateData: any = { status: newStatus }
      if (newStatus === 'checked_out') updateData.checked_out_at = new Date().toISOString()

      const { error } = await supabase.from('orders').update(updateData).eq('id', orderId)
      if (error) throw error

      await fetchBusinessDays()
      if (selectedOrder?.id === orderId) await fetchOrderDetails(orderId)
    } catch (e: any) {
      const message = e?.message || ''
      Alert.alert(
        '操作失败',
        message.includes('ORDER_RESTORE_CLOSED_BUSINESS_DAY')
          ? '营业日已结束，不能恢复订单'
          : message || '请重试',
      )
    } finally {
      setStatusUpdating(false)
    }
  }

  const confirmCheckout = (order: Order) => {
    Alert.alert('确认结账', `确认将「${order.customer_name}」标记为已结账？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '确认结账',
        onPress: () => void handleStatusChange(order.id, 'checked_out'),
      },
    ])
  }

  const confirmRestore = (order: Order) => {
    Alert.alert('确认恢复订单', '恢复后订单将回到进行中，并清除原结账时间。', [
      { text: '取消', style: 'cancel' },
      {
        text: '确认恢复',
        onPress: () => void handleStatusChange(order.id, 'active'),
      },
    ])
  }

  const handleCloseBusinessDay = (bdId: string) => {
    Alert.alert('确认', '确定要结束这个营业日吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '确定',
        onPress: async () => {
          try {
            const { data, error } = await supabase.rpc('close_business_day', { business_day_id: bdId })
            if (error) throw error
            if (!data) throw new Error('营业日可能已关闭')
            fetchBusinessDays()
          } catch (e: any) {
            Alert.alert('错误', e?.message || '关闭营业日失败')
          }
        },
      },
    ])
  }

  useEffect(() => {
    fetchBusinessDays()

    const ch1 = supabase
      .channel('orders-mgmt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => fetchBusinessDays())
      .subscribe()
    const ch2 = supabase
      .channel('bd-mgmt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'business_days' }, () => fetchBusinessDays())
      .subscribe()

    return () => {
      supabase.removeChannel(ch1)
      supabase.removeChannel(ch2)
    }
  }, [fetchBusinessDays])

  const filteredBusinessDays = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return businessDays
    return businessDays
      .map((bd) => {
        const orders = bd.orders.filter((o) => (o.customer_name || '').toLowerCase().includes(q))
        return {
          ...bd,
          orders,
          totalAmount: orders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0),
        }
      })
      .filter((bd) => bd.orders.length > 0)
  }, [businessDays, searchQuery])

  const shareReceipt = async (order: OrderWithItems) => {
    const lines: string[] = [
      '══════════════════════════',
      '         No Menu',
      '══════════════════════════',
      '',
      `客户: ${order.customer_name}`,
      `日期: ${new Date(order.created_at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`,
      `状态: ${orderStatusLabel(order.status)}`,
      '',
      '──────────────────────────',
      '  商品明细',
      '──────────────────────────',
    ]

    for (const item of order.items) {
      const name = item.drink?.name || '未知商品'
      const subtotal = item.quantity * item.unit_price
      lines.push(`  ${name}`)
      lines.push(`    ${item.quantity} × ${item.label_snapshot || '规格'} ¥${item.unit_price}`)
      lines.push(`    小计: ¥${subtotal.toFixed(2)}`)
      lines.push('')
    }

    lines.push('══════════════════════════')
    lines.push(`  总计: ¥${Number(order.total_amount).toFixed(2)}`)
    lines.push('══════════════════════════')
    if (order.checked_out_at) {
      lines.push(`结账时间: ${new Date(order.checked_out_at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`)
    }
    lines.push('')
    lines.push('感谢光临！')

    try {
      await Share.share({ message: lines.join('\n') })
    } catch (e) {
      // user cancelled
    }
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const compare = new Date(d)
    compare.setHours(0, 0, 0, 0)
    if (compare.getTime() === today.getTime()) return '今天'
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    if (compare.getTime() === yesterday.getTime()) return '昨天'
    return d.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.centered} edges={['top']}>
        <ActivityIndicator size="large" color={T.gold} />
      </SafeAreaView>
    )
  }

  // ORDER DETAIL VIEW
  if (viewMode === 'detail' && selectedOrder) {
    const vis = orderStatusVisual(selectedOrder.status)
    return (
      <SafeAreaView style={styles.detailRoot} edges={['top']}>
        <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
          <TouchableOpacity
            onPress={() => {
              setViewMode('list')
              setSelectedOrder(null)
              setSelectedBusinessDayClosedAt(null)
            }}
            style={styles.backBtn}
          >
            <Ionicons name="chevron-back" size={20} color={T.gold} />
            <Text style={styles.backBtnText}>返回订单列表</Text>
          </TouchableOpacity>

          <Text style={styles.title}>{selectedOrder.customer_name}</Text>

          <View style={styles.detailCard}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>状态</Text>
              <View style={[styles.statusBadge, { backgroundColor: vis.bg, borderColor: vis.border }]}>
                <Text style={[styles.statusText, { color: vis.fg }]}>
                  {orderStatusLabel(selectedOrder.status)}
                </Text>
              </View>
            </View>
            <View style={styles.detailDivider} />
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>创建时间</Text>
              <Text style={styles.detailValue}>
                {new Date(selectedOrder.created_at).toLocaleString('zh-CN')}
              </Text>
            </View>
            {selectedOrder.checked_out_at && (
              <>
                <View style={styles.detailDivider} />
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>结账时间</Text>
                  <Text style={styles.detailValue}>
                    {new Date(selectedOrder.checked_out_at).toLocaleString('zh-CN')}
                  </Text>
                </View>
              </>
            )}
          </View>

          <Text style={styles.sectionLabel}>订单项目</Text>
          {selectedOrder.items.map((item) => {
            const subtotal = item.quantity * item.unit_price
            return (
              <View key={item.id} style={styles.itemRow}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.itemName}>{item.drink?.name || '未知商品'}</Text>
                  <Text style={styles.itemQty}>
                    {item.quantity} × {item.label_snapshot || '规格'} · ¥{Number(item.unit_price).toFixed(2)}
                  </Text>
                </View>
                <Text style={styles.itemSubtotal}>¥{subtotal.toFixed(2)}</Text>
              </View>
            )
          })}

          <View style={styles.grandTotalRow}>
            <Text style={styles.grandTotalLabel}>总计</Text>
            <Text style={styles.grandTotalValue}>¥{Number(selectedOrder.total_amount).toFixed(2)}</Text>
          </View>

          {/* Share receipt */}
          <TouchableOpacity style={styles.shareBtn} onPress={() => shareReceipt(selectedOrder)}>
            <Ionicons name="share-outline" size={18} color={T.gold} />
            <Text style={styles.shareBtnText}>分享账单</Text>
          </TouchableOpacity>

          {/* Status change buttons — two states only: active ↔ checked_out */}
          <View style={styles.actionSection}>
            {selectedOrder.status === 'active' && (
              <TouchableOpacity
                style={[styles.primaryBtn, statusUpdating && styles.buttonDisabled]}
                disabled={statusUpdating}
                onPress={() => confirmCheckout(selectedOrder)}
              >
                {statusUpdating ? (
                  <ActivityIndicator size="small" color={T.background} />
                ) : (
                  <Text style={styles.primaryBtnText}>标记为已结账</Text>
                )}
              </TouchableOpacity>
            )}
            {isOrderSettled(selectedOrder.status) && (
              <>
                <TouchableOpacity
                  style={[
                    styles.secondaryBtn,
                    (statusUpdating || !!selectedBusinessDayClosedAt) && styles.buttonDisabled,
                  ]}
                  disabled={statusUpdating || !!selectedBusinessDayClosedAt}
                  onPress={() => confirmRestore(selectedOrder)}
                >
                  {statusUpdating ? (
                    <ActivityIndicator size="small" color={T.gold} />
                  ) : (
                    <Text style={styles.secondaryBtnText}>恢复订单</Text>
                  )}
                </TouchableOpacity>
                {selectedBusinessDayClosedAt ? (
                  <Text style={styles.disabledActionHint}>营业日已结束，不能恢复订单</Text>
                ) : null}
              </>
            )}
          </View>
        </ScrollView>
        {detailLoading && (
          <View style={styles.detailLoadingOverlay} pointerEvents="auto">
            <ActivityIndicator size="large" color={T.gold} />
          </View>
        )}
      </SafeAreaView>
    )
  }

  // BUSINESS DAY LIST VIEW
  const filterButtons: { key: 'all' | 'active' | 'checked_out'; label: string }[] = [
    { key: 'all', label: '全部' },
    { key: 'active', label: '进行中' },
    { key: 'checked_out', label: '已结账' },
  ]

  const listEmpty = businessDays.length === 0
  const searchEmpty = !listEmpty && filteredBusinessDays.length === 0

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.hero}>
        <Text style={styles.title}>订单记录</Text>
      </View>

      {/* Status Filters — View row (not horizontal ScrollView) so chips keep full height */}
      <View style={styles.filterRow}>
        {filterButtons.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterChip, statusFilter === f.key && styles.filterChipActive]}
            onPress={() => setStatusFilter(f.key)}
          >
            <Text style={[styles.filterText, statusFilter === f.key && styles.filterTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={T.muted} />
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="搜索客户姓名"
          placeholderTextColor={T.faint}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
      </View>

      {listEmpty ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="calendar-outline" size={44} color={T.faint} />
          <Text style={styles.emptyText}>暂无订单</Text>
        </View>
      ) : searchEmpty ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="search-outline" size={44} color={T.faint} />
          <Text style={styles.emptyText}>未找到匹配的订单</Text>
        </View>
      ) : (
        <SectionList
          sections={filteredBusinessDays.map((bd) => ({
            title: bd,
            data: bd.orders,
          }))}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 40 }}
          stickySectionHeadersEnabled={false}
          refreshing={refreshing}
          onRefresh={onRefresh}
          renderSectionHeader={({ section }) => {
            const bd = section.title as unknown as BusinessDayWithOrders
            return (
              <View style={styles.bdHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.bdDate}>{formatDate(bd.business_date)}</Text>
                  <Text style={styles.bdMeta}>
                    {bd.closed_at ? '营业日已结束' : '营业日进行中'} · {bd.orders.length} 单
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.bdTotal}>¥{bd.totalAmount.toFixed(2)}</Text>
                  {!bd.closed_at && (
                    <TouchableOpacity onPress={() => handleCloseBusinessDay(bd.id)} style={styles.closeBdBtn}>
                      <Text style={styles.closeBdBtnText}>结束营业日</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            )
          }}
          renderItem={({ item }) => {
            const vis = orderStatusVisual(item.status)
            return (
              <TouchableOpacity style={styles.orderCard} activeOpacity={0.85} onPress={() => fetchOrderDetails(item.id)}>
                <View style={styles.orderCardRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.orderName}>{item.customer_name}</Text>
                    <Text style={styles.orderTime}>
                      {new Date(item.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.orderAmount}>¥{Number(item.total_amount).toFixed(2)}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: vis.bg, borderColor: vis.border }]}>
                      <Text style={[styles.statusText, { color: vis.fg }]}>{orderStatusLabel(item.status)}</Text>
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            )
          }}
        />
      )}
      {detailLoading && (
        <View style={styles.detailLoadingOverlay} pointerEvents="auto">
          <ActivityIndicator size="large" color={T.gold} />
        </View>
      )}
    </SafeAreaView>
  )
}

export default function OrdersRoute() {
  const { orderingEnabled, isLoading } = useAuth()
  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={T.gold} />
      </View>
    )
  }
  if (!orderingEnabled) return <Redirect href="/(tabs)/taplist" />
  return <OrdersScreen />
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.background },
  detailRoot: { flex: 1, backgroundColor: T.background },
  centered: { flex: 1, backgroundColor: T.background, justifyContent: 'center', alignItems: 'center' },
  hero: {
    paddingHorizontal: LAYOUT.pagePad,
    paddingTop: LAYOUT.heroPadTop,
    paddingBottom: LAYOUT.heroPadBottom,
  },
  title: { color: T.text, fontSize: 26, fontWeight: '800' },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: LAYOUT.pagePad,
    marginBottom: 12,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: T.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterChipActive: { backgroundColor: T.goldFill, borderColor: T.goldBorder },
  filterText: { color: T.muted, fontSize: 14, lineHeight: 20 },
  filterTextActive: { color: T.text, fontWeight: '600' },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: T.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: T.borderFaint,
    paddingHorizontal: 14,
    marginHorizontal: LAYOUT.pagePad,
    marginBottom: 12,
  },
  searchInput: { flex: 1, color: T.text, fontSize: 16, paddingVertical: 12 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyText: { color: T.muted, fontSize: 16 },
  bdHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 14,
    paddingHorizontal: LAYOUT.pagePad,
    marginBottom: 8,
    marginTop: 8,
    backgroundColor: T.background,
  },
  bdDate: { fontSize: 18, fontWeight: '800', color: T.text },
  bdMeta: { fontSize: 12, color: T.muted, marginTop: 2 },
  bdTotal: { fontSize: 20, fontWeight: '800', color: T.gold },
  closeBdBtn: {
    marginTop: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,107,94,0.4)',
  },
  closeBdBtnText: { color: T.danger, fontSize: 13, fontWeight: '600' },
  orderCard: {
    backgroundColor: T.surface,
    borderRadius: 14,
    padding: 14,
    marginHorizontal: LAYOUT.pagePad,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: T.borderFaint,
  },
  orderCardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  orderName: { fontSize: 16, fontWeight: '700', color: T.text, marginBottom: 4 },
  orderTime: { fontSize: 13, color: T.muted },
  orderAmount: { fontSize: 17, fontWeight: '800', color: T.text, marginBottom: 6 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 16, borderWidth: 1 },
  statusText: { fontSize: 12, fontWeight: '600' },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: LAYOUT.pagePad, paddingTop: 12, paddingBottom: 4 },
  backBtnText: { color: T.gold, fontSize: 16, fontWeight: '600' },
  detailCard: {
    backgroundColor: T.surface,
    borderRadius: 14,
    padding: 16,
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: T.borderFaint,
  },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
  detailDivider: { height: 1, backgroundColor: T.borderFaint },
  detailLabel: { fontSize: 14, color: T.muted },
  detailValue: { fontSize: 15, color: T.text, fontWeight: '500' },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: T.muted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
    marginHorizontal: 20,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: T.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 6,
    marginHorizontal: 20,
    borderWidth: 1,
    borderColor: T.borderFaint,
  },
  itemName: { flex: 1, fontSize: 15, color: T.text, fontWeight: '500' },
  itemDetails: { marginHorizontal: 8 },
  itemQty: { fontSize: 13, color: T.muted },
  itemSubtotal: { fontSize: 15, fontWeight: '700', color: T.text },
  grandTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: T.borderFaint,
    marginBottom: 20,
    marginHorizontal: 20,
  },
  grandTotalLabel: { fontSize: 16, fontWeight: '600', color: T.text },
  grandTotalValue: { fontSize: 24, fontWeight: '800', color: T.gold },
  actionSection: { gap: 10, marginHorizontal: 20 },
  buttonDisabled: { opacity: 0.45 },
  disabledActionHint: { color: T.muted, fontSize: 13, textAlign: 'center' },
  shareBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    paddingVertical: 14,
    marginHorizontal: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: T.goldBorder,
    backgroundColor: T.goldFill,
  },
  shareBtnText: { color: T.gold, fontSize: 16, fontWeight: '700' },
  primaryBtn: { backgroundColor: T.gold, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  primaryBtnText: { color: T.background, fontSize: 16, fontWeight: '800' },
  secondaryBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryBtnText: { color: T.text, fontSize: 16, fontWeight: '600' },
  detailLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
})
