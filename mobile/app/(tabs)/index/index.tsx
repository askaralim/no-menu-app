import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
  TextInput,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import { Redirect, useRouter } from 'expo-router'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../lib/authProvider'
import { orderStatusLabel } from '../../../lib/constants'
import { THEME as T, orderStatusVisual, LAYOUT } from '../../../lib/theme'
import type { Order } from '../../../lib/types'

function isBusinessDayClosedError(err: unknown): boolean {
  const msg = typeof err === 'string' ? err : (err as { message?: string })?.message || ''
  return String(msg).includes('BUSINESS_DAY_CLOSED')
}

function OrderingScreen() {
  const router = useRouter()
  const [activeOrders, setActiveOrders] = useState<Order[]>([])
  const [dayRevenue, setDayRevenue] = useState(0)
  const [businessDayClosed, setBusinessDayClosed] = useState(false)
  const [reopeningDay, setReopeningDay] = useState(false)
  const [loading, setLoading] = useState(true)
  const [checkoutUpdatingId, setCheckoutUpdatingId] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const filteredActiveOrders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return activeOrders
    return activeOrders.filter((o) => (o.customer_name || '').toLowerCase().includes(q))
  }, [activeOrders, searchQuery])

  const loadOrdersForBusinessDay = useCallback(async (bdId: string) => {
    try {
      setBusinessDayClosed(false)
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
    try {
      const { data: openId, error: openError } = await supabase.rpc('get_current_open_business_day')
      if (openError) throw openError
      if (openId) {
        await loadOrdersForBusinessDay(openId as string)
        return
      }

      const { data, error } = await supabase.rpc('get_or_create_open_business_day')
      if (error) {
        if (isBusinessDayClosedError(error)) {
          setBusinessDayClosed(true)
          setActiveOrders([])
          setDayRevenue(0)
          setLoading(false)
          return
        }
        throw error
      }
      if (!data) {
        Alert.alert('错误', '无法获取营业日')
        setActiveOrders([])
        setDayRevenue(0)
        setLoading(false)
        return
      }
      await loadOrdersForBusinessDay(data as string)
    } catch (e) {
      if (isBusinessDayClosedError(e)) {
        setBusinessDayClosed(true)
        setActiveOrders([])
        setDayRevenue(0)
        setLoading(false)
        return
      }
      console.error('Error fetching active orders:', e)
      Alert.alert('错误', '无法获取营业日')
      setLoading(false)
    }
  }, [loadOrdersForBusinessDay])

  const reopenTodaysBusinessDay = useCallback(async () => {
    if (reopeningDay) return
    setReopeningDay(true)
    try {
      const { data, error } = await supabase.rpc('reopen_todays_business_day')
      if (error) throw error
      if (!data) throw new Error('重新开始营业日失败')
      setBusinessDayClosed(false)
      await loadOrdersForBusinessDay(data as string)
      Alert.alert('已重新开始', '可以开新单了。此前已结账的订单仍不可恢复。')
    } catch (e: unknown) {
      Alert.alert('错误', e instanceof Error ? e.message : '重新开始营业日失败')
    } finally {
      setReopeningDay(false)
    }
  }, [loadOrdersForBusinessDay, reopeningDay])

  const promptReopenBusinessDay = useCallback(() => {
    Alert.alert('今日营业日已结束', '重新开始后可开新单；该营业日里已结账的订单仍不可恢复。', [
      { text: '取消', style: 'cancel' },
      { text: '重新开始营业日', onPress: () => void reopenTodaysBusinessDay() },
    ])
  }, [reopenTodaysBusinessDay])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await fetchActiveOrders()
    setRefreshing(false)
  }, [fetchActiveOrders])

  useFocusEffect(
    useCallback(() => {
      void fetchActiveOrders()
    }, [fetchActiveOrders]),
  )

  useEffect(() => {
    const channel = supabase
      .channel('mobile-ordering')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        void fetchActiveOrders()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchActiveOrders])

  const handleNewOrder = () => {
    if (businessDayClosed) {
      promptReopenBusinessDay()
      return
    }
    router.push('/(tabs)/form')
  }

  const handleEditOrder = (order: Order) => {
    router.push({ pathname: '/(tabs)/form', params: { id: order.id } })
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
          } catch {
            Alert.alert('错误', '结账失败')
          } finally {
            setCheckoutUpdatingId(null)
          }
        },
      },
    ])
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.centered} edges={['top']}>
        <ActivityIndicator size="large" color={T.gold} />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <FlatList
        data={filteredActiveOrders}
        keyExtractor={(item) => item.id}
        contentContainerStyle={
          filteredActiveOrders.length === 0
            ? [styles.listContentEmpty, { paddingBottom: 120 }]
            : { paddingBottom: 120 }
        }
        ListHeaderComponent={
          <View style={styles.hero}>
            <Text style={styles.title}>开台</Text>
            {businessDayClosed ? (
              <View style={styles.closedBanner}>
                <Text style={styles.closedBannerText}>今日营业日已结束</Text>
                <TouchableOpacity
                  style={styles.reopenBtn}
                  onPress={() => void reopenTodaysBusinessDay()}
                  disabled={reopeningDay}
                >
                  {reopeningDay ? (
                    <ActivityIndicator size="small" color={T.background} />
                  ) : (
                    <Text style={styles.reopenBtnText}>重新开始营业日</Text>
                  )}
                </TouchableOpacity>
              </View>
            ) : null}
            <View style={styles.countsRow}>
              <Stat label="进行中" value={activeOrders.length} />
              <Stat label="营业额" value={`¥${dayRevenue.toFixed(0)}`} />
            </View>
            {!businessDayClosed && activeOrders.length > 0 ? (
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
            ) : null}
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
            {activeOrders.length > 0 && searchQuery.trim() ? (
              <>
                <Ionicons name="search-outline" size={44} color={T.faint} />
                <Text style={styles.emptyText}>未找到匹配的台</Text>
              </>
            ) : (
              <>
                <Ionicons name="wine-outline" size={44} color={T.faint} />
                <Text style={styles.emptyText}>暂无进行中的台</Text>
                <Text style={styles.emptyHint}>点击右下角开一桌</Text>
              </>
            )}
          </View>
        }
        renderItem={({ item }) => {
          const vis = orderStatusVisual(item.status)
          return (
            <View style={styles.orderCard}>
              <TouchableOpacity activeOpacity={0.85} onPress={() => handleEditOrder(item)}>
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
                    <View
                      style={[styles.statusBadge, { backgroundColor: vis.bg, borderColor: vis.border }]}
                    >
                      <Text style={[styles.statusText, { color: vis.fg }]}>
                        {orderStatusLabel(item.status)}
                      </Text>
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
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
            </View>
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
  closedBanner: {
    marginTop: 14,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: T.goldBorder,
    backgroundColor: T.goldFill,
    gap: 10,
  },
  closedBannerText: { color: T.textSoft, fontSize: 14, fontWeight: '600' },
  reopenBtn: {
    alignSelf: 'flex-start',
    backgroundColor: T.gold,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    minHeight: 36,
    justifyContent: 'center',
  },
  reopenBtnText: { color: T.background, fontSize: 13, fontWeight: '700' },
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
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: T.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: T.borderFaint,
    paddingHorizontal: 14,
    marginTop: 14,
  },
  searchInput: { flex: 1, color: T.text, fontSize: 16, paddingVertical: 12 },
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
