import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  TextInput,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { Redirect, useRouter } from 'expo-router'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../lib/authProvider'
import { orderStatusLabel } from '../../../lib/constants'
import { THEME as T, orderStatusVisual, LAYOUT } from '../../../lib/theme'
import type { Order, BusinessDay } from '../../../lib/types'

interface BusinessDayWithOrders extends BusinessDay {
  orders: Order[]
  totalAmount: number
}

function OrdersListScreen() {
  const router = useRouter()
  const [businessDays, setBusinessDays] = useState<BusinessDayWithOrders[]>([])
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'checked_out'>('all')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
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
            void fetchBusinessDays()
          } catch (e: any) {
            Alert.alert('错误', e?.message || '关闭营业日失败')
          }
        },
      },
    ])
  }

  useEffect(() => {
    void fetchBusinessDays()

    const ch1 = supabase
      .channel('orders-mgmt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        void fetchBusinessDays()
      })
      .subscribe()
    const ch2 = supabase
      .channel('bd-mgmt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'business_days' }, () => {
        void fetchBusinessDays()
      })
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
                    <TouchableOpacity
                      onPress={() => handleCloseBusinessDay(bd.id)}
                      style={styles.closeBdBtn}
                    >
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
              <TouchableOpacity
                style={styles.orderCard}
                activeOpacity={0.85}
                onPress={() => router.push(`/(tabs)/orders/${item.id}`)}
              >
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
            )
          }}
        />
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
  return <OrdersListScreen />
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
})
