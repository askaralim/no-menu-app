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
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { COLORS, STATUS_LABELS } from '../../lib/constants'
import type { Order, OrderWithItems, OrderStatus, BusinessDay, Drink } from '../../lib/types'

interface BusinessDayWithOrders extends BusinessDay {
  orders: Order[]
  totalAmount: number
}

type ViewMode = 'list' | 'detail'

export default function OrdersScreen() {
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [businessDays, setBusinessDays] = useState<BusinessDayWithOrders[]>([])
  const [selectedOrder, setSelectedOrder] = useState<OrderWithItems | null>(null)
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const fetchBusinessDays = useCallback(async () => {
    try {
      const { data: bdData, error: bdError } = await supabase
        .from('business_days')
        .select('*')
        .order('business_date', { ascending: false })

      if (bdError) throw bdError

      let ordersQuery = supabase.from('orders').select('*').order('created_at', { ascending: false })
      if (statusFilter !== 'all') {
        ordersQuery = ordersQuery.eq('status', statusFilter)
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

      setSelectedOrder({
        ...orderData,
        items: (itemsData || []).map((item: any) => ({ ...item, drink: item.drinks })),
      })
      setViewMode('detail')
    } catch (e) {
      Alert.alert('错误', e instanceof Error ? e.message : '加载订单详情失败')
    } finally {
      setDetailLoading(false)
    }
  }

  const handleStatusChange = async (orderId: string, newStatus: OrderStatus) => {
    try {
      const updateData: any = { status: newStatus }
      if (newStatus === 'checked_out') updateData.checked_out_at = new Date().toISOString()

      const { error } = await supabase.from('orders').update(updateData).eq('id', orderId)
      if (error) throw error

      fetchBusinessDays()
      if (selectedOrder?.id === orderId) fetchOrderDetails(orderId)
    } catch (e) {
      Alert.alert('错误', '操作失败')
    }
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
      `状态: ${STATUS_LABELS[order.status] || order.status}`,
      '',
      '──────────────────────────',
      '  商品明细',
      '──────────────────────────',
    ]

    for (const item of order.items) {
      const name = item.drink?.name || '未知商品'
      const subtotal = item.quantity_cup * item.unit_price_cup + item.quantity_bottle * (item.unit_price_bottle || 0)
      lines.push(`  ${name}`)
      if (item.quantity_cup > 0) {
        lines.push(`    ${item.quantity_cup} ${item.drink?.price_unit || '杯'} × ¥${item.unit_price_cup}`)
      }
      if (item.quantity_bottle > 0) {
        lines.push(`    ${item.quantity_bottle} ${item.drink?.price_unit_bottle || '瓶'} × ¥${item.unit_price_bottle}`)
      }
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

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'active': return COLORS.statusActive
      case 'checked_out': return COLORS.statusCheckedOut
      default: return COLORS.statusFinished
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
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.gold} />
      </View>
    )
  }

  // ORDER DETAIL VIEW
  if (viewMode === 'detail' && selectedOrder) {
    const statusStyle = getStatusStyle(selectedOrder.status)
    return (
      <View style={styles.detailRoot}>
        <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
          <TouchableOpacity onPress={() => { setViewMode('list'); setSelectedOrder(null) }} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={COLORS.gold} />
            <Text style={styles.backBtnText}>返回订单列表</Text>
          </TouchableOpacity>

          <View style={styles.detailCard}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>客户姓名</Text>
              <Text style={styles.detailValue}>{selectedOrder.customer_name}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>状态</Text>
              <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
                <Text style={[styles.statusText, { color: statusStyle.text }]}>
                  {STATUS_LABELS[selectedOrder.status]}
                </Text>
              </View>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>创建时间</Text>
              <Text style={styles.detailValue}>
                {new Date(selectedOrder.created_at).toLocaleString('zh-CN')}
              </Text>
            </View>
            {selectedOrder.checked_out_at && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>结账时间</Text>
                <Text style={styles.detailValue}>
                  {new Date(selectedOrder.checked_out_at).toLocaleString('zh-CN')}
                </Text>
              </View>
            )}
          </View>

          <Text style={styles.sectionLabel}>订单项目</Text>
          {selectedOrder.items.map((item) => {
            const subtotal = item.quantity_cup * item.unit_price_cup +
              item.quantity_bottle * (item.unit_price_bottle || 0)
            return (
              <View key={item.id} style={styles.itemRow}>
                <Text style={styles.itemName}>{item.drink?.name || '未知商品'}</Text>
                <View style={styles.itemDetails}>
                  {item.quantity_cup > 0 && (
                    <Text style={styles.itemQty}>{item.quantity_cup} {item.drink?.price_unit || '杯'}</Text>
                  )}
                  {item.quantity_bottle > 0 && (
                    <Text style={styles.itemQty}>{item.quantity_bottle} {item.drink?.price_unit_bottle || '瓶'}</Text>
                  )}
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
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.gold, flexDirection: 'row', justifyContent: 'center', gap: 8 }]}
            onPress={() => shareReceipt(selectedOrder)}
          >
            <Ionicons name="share-outline" size={18} color={COLORS.gold} />
            <Text style={[styles.actionBtnText, { color: COLORS.gold }]}>分享账单</Text>
          </TouchableOpacity>

          {/* Status change buttons */}
          <View style={styles.actionSection}>
            {selectedOrder.status === 'active' && (
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: COLORS.gold }]}
                onPress={() => handleStatusChange(selectedOrder.id, 'checked_out')}
              >
                <Text style={styles.actionBtnTextDark}>标记为已结账</Text>
              </TouchableOpacity>
            )}
            {selectedOrder.status === 'checked_out' && (
              <>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: COLORS.gold }]}
                  onPress={() => handleStatusChange(selectedOrder.id, 'finished')}
                >
                  <Text style={styles.actionBtnTextDark}>标记为已完成</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border }]}
                  onPress={() => handleStatusChange(selectedOrder.id, 'active')}
                >
                  <Text style={styles.actionBtnText}>恢复为进行中</Text>
                </TouchableOpacity>
              </>
            )}
            {selectedOrder.status === 'finished' && (
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border }]}
                onPress={() => handleStatusChange(selectedOrder.id, 'checked_out')}
              >
                <Text style={styles.actionBtnText}>恢复为已结账</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
        {detailLoading && (
          <View style={styles.detailLoadingOverlay} pointerEvents="auto">
            <ActivityIndicator size="large" color={COLORS.gold} />
          </View>
        )}
      </View>
    )
  }

  // BUSINESS DAY LIST VIEW
  const filterButtons: { key: OrderStatus | 'all'; label: string }[] = [
    { key: 'all', label: '全部' },
    { key: 'active', label: '进行中' },
    { key: 'checked_out', label: '已结账' },
    { key: 'finished', label: '已完成' },
  ]

  const listEmpty = businessDays.length === 0
  const searchEmpty = !listEmpty && filteredBusinessDays.length === 0

  return (
    <View style={styles.container}>
      {/* Status Filters */}
      <View style={styles.filterRow}>
        {filterButtons.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterBtn, statusFilter === f.key && styles.filterBtnActive]}
            onPress={() => setStatusFilter(f.key)}
          >
            <Text style={[styles.filterBtnText, statusFilter === f.key && styles.filterBtnTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <TextInput
        style={styles.searchInput}
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder="搜索客户姓名"
        placeholderTextColor={COLORS.muted}
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="while-editing"
      />

      {listEmpty ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="calendar-outline" size={48} color={COLORS.muted} />
          <Text style={styles.emptyText}>暂无订单</Text>
        </View>
      ) : searchEmpty ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="search-outline" size={48} color={COLORS.muted} />
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
                    {bd.closed_at ? '已结束' : '进行中'} · {bd.orders.length} 单
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
            const ss = getStatusStyle(item.status)
            return (
              <TouchableOpacity style={styles.orderCard} onPress={() => fetchOrderDetails(item.id)}>
                <View style={styles.orderCardRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.orderName}>{item.customer_name}</Text>
                    <Text style={styles.orderTime}>
                      {new Date(item.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.orderAmount}>¥{Number(item.total_amount).toFixed(2)}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: ss.bg }]}>
                      <Text style={[styles.statusText, { color: ss.text }]}>{STATUS_LABELS[item.status]}</Text>
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
          <ActivityIndicator size="large" color={COLORS.gold} />
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, padding: 16 },
  detailRoot: { flex: 1, backgroundColor: COLORS.background },
  centered: { flex: 1, backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center' },
  filterRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  filterBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 8,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border,
  },
  filterBtnActive: { backgroundColor: COLORS.gold, borderColor: COLORS.gold },
  filterBtnText: { color: COLORS.text, fontSize: 14, fontWeight: '600' },
  filterBtnTextActive: { color: '#000' },
  searchInput: {
    backgroundColor: COLORS.card,
    color: COLORS.text,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 12,
  },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80 },
  emptyText: { color: COLORS.muted, fontSize: 16, marginTop: 12 },
  bdHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingVertical: 14, paddingHorizontal: 4, borderBottomWidth: 2, borderBottomColor: COLORS.border,
    marginBottom: 8, marginTop: 8,
    backgroundColor: COLORS.background,
  },
  bdDate: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  bdMeta: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  bdTotal: { fontSize: 20, fontWeight: '800', color: COLORS.gold },
  closeBdBtn: {
    marginTop: 6, paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 6, borderWidth: 1, borderColor: COLORS.danger,
  },
  closeBdBtnText: { color: COLORS.danger, fontSize: 13, fontWeight: '600' },
  orderCard: { backgroundColor: COLORS.card, borderRadius: 12, padding: 14, marginBottom: 10 },
  orderCardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  orderName: { fontSize: 16, fontWeight: '600', color: COLORS.text, marginBottom: 4 },
  orderTime: { fontSize: 13, color: COLORS.muted },
  orderAmount: { fontSize: 17, fontWeight: '700', color: COLORS.text, marginBottom: 4 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  statusText: { fontSize: 12, fontWeight: '600' },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 16, paddingVertical: 10 },
  backBtnText: { color: COLORS.gold, fontSize: 16 },
  detailCard: { backgroundColor: COLORS.card, borderRadius: 12, padding: 16, marginBottom: 20 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  detailLabel: { fontSize: 14, color: COLORS.muted },
  detailValue: { fontSize: 15, color: COLORS.text, fontWeight: '500' },
  sectionLabel: { fontSize: 14, fontWeight: '600', color: COLORS.gold, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 },
  itemRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card,
    borderRadius: 8, padding: 12, marginBottom: 6,
  },
  itemName: { flex: 1, fontSize: 15, color: COLORS.text, fontWeight: '500' },
  itemDetails: { marginHorizontal: 8 },
  itemQty: { fontSize: 13, color: COLORS.muted },
  itemSubtotal: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  grandTotalRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 8, paddingTop: 14, borderTopWidth: 1, borderTopColor: COLORS.border, marginBottom: 20,
  },
  grandTotalLabel: { fontSize: 16, fontWeight: '600', color: COLORS.text },
  grandTotalValue: { fontSize: 24, fontWeight: '800', color: COLORS.gold },
  actionSection: { gap: 10 },
  actionBtn: { borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  actionBtnText: { color: COLORS.text, fontSize: 16, fontWeight: '600' },
  actionBtnTextDark: { color: '#000', fontSize: 16, fontWeight: '700' },
  detailLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
})
