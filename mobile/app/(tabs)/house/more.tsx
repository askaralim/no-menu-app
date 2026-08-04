import { useEffect, useState, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  FlatList,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../lib/authProvider'
import { THEME as T, LAYOUT } from '../../../lib/theme'
import { HouseSubheader } from '../../../components/house/HouseSubheader'

type Section = 'dashboard' | 'analytics' | 'customers'

interface CustomerSpending {
  name: string
  total: number
  count: number
}

interface TopDrink {
  name: string
  count: number
}

interface DailyRevenue {
  date: string
  revenue: number
}

interface SoldOutEventRow {
  id: string
  drink_id: string
  drink_name: string
  from_status_zh: string | null
  to_status_zh: string
  created_at: string
  /** Last time this drink was marked 上新 before this sold_out (if any). */
  new_at: string | null
  sold_out_at: string
}

function formatMonthDay(iso: string | null | undefined): string {
  if (!iso) return '—'
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(new Date(iso))
  const month = parts.find((p) => p.type === 'month')?.value
  const day = parts.find((p) => p.type === 'day')?.value
  if (!month || !day) return '—'
  return `${month}.${day}`
}

/** Calendar-day span in Asia/Shanghai from 上新 to 售罄 (inclusive of start day count as 0 on same day). */
function sellDurationLabel(newAt: string | null | undefined, soldOutAt: string | null | undefined): string | null {
  if (!newAt || !soldOutAt) return null
  const ymd = (iso: string) =>
    new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })
  const start = ymd(newAt)
  const end = ymd(soldOutAt)
  const ms =
    new Date(`${end}T00:00:00+08:00`).getTime() - new Date(`${start}T00:00:00+08:00`).getTime()
  const days = Math.round(ms / 86400000)
  if (days < 0) return null
  if (days === 0) return '售卖时间 当天'
  return `售卖时间 ${days}天`
}

function soldOutSummaryLine(ev: { new_at: string | null; sold_out_at: string }): string {
  const parts = [`上新 ${formatMonthDay(ev.new_at)}`, `售罄 ${formatMonthDay(ev.sold_out_at)}`]
  const duration = sellDurationLabel(ev.new_at, ev.sold_out_at)
  if (duration) parts.push(duration)
  return parts.join(' · ')
}

const ORDERING_SECTIONS: { key: Section; label: string }[] = [
  { key: 'dashboard', label: '概览' },
  { key: 'analytics', label: '分析' },
  { key: 'customers', label: '客户' },
]

export default function InsightsScreen() {
  const { tenantId, role, orderingEnabled } = useAuth()
  const [activeSection, setActiveSection] = useState<Section>('dashboard')

  const [stats, setStats] = useState({
    categories: 0,
    drinks: 0,
    enabledDrinks: 0,
    publicDrinks: 0,
    publicNewDrinks: 0,
    todayOrders: 0,
    todayRevenue: 0,
  })
  const [dashLoading, setDashLoading] = useState(true)

  const [customers, setCustomers] = useState<CustomerSpending[]>([])
  const [custLoading, setCustLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const [topDrinks, setTopDrinks] = useState<TopDrink[]>([])
  const [dailyRevenue, setDailyRevenue] = useState<DailyRevenue[]>([])
  const [analyticsLoading, setAnalyticsLoading] = useState(false)
  const [soldOutEvents, setSoldOutEvents] = useState<SoldOutEventRow[]>([])
  const [soldOutLoading, setSoldOutLoading] = useState(false)

  const fetchSoldOutMonth = useCallback(async () => {
    if (!tenantId) {
      setSoldOutEvents([])
      return
    }
    setSoldOutLoading(true)
    try {
      const { data, error } = await supabase.rpc('list_tenant_sold_out_events_this_month', {
        p_tenant_id: tenantId,
      })
      if (error) throw error
      const res = data as { ok?: boolean; events?: SoldOutEventRow[] }
      const rows = Array.isArray(res?.events) ? res.events : []
      setSoldOutEvents(
        rows.map((ev) => ({
          ...ev,
          sold_out_at: ev.sold_out_at || ev.created_at,
          new_at: ev.new_at ?? null,
        })),
      )
    } catch {
      setSoldOutEvents([])
    } finally {
      setSoldOutLoading(false)
    }
  }, [tenantId])

  // --- Dashboard ---
  const fetchDashboard = useCallback(async () => {
    if (!tenantId) {
      setStats({ categories: 0, drinks: 0, enabledDrinks: 0, publicDrinks: 0, publicNewDrinks: 0, todayOrders: 0, todayRevenue: 0 })
      setDashLoading(false)
      return
    }
    setDashLoading(true)
    void fetchSoldOutMonth()
    try {
      const [catRes, drinkRes] = await Promise.all([
        supabase.from('categories').select('id').eq('tenant_id', tenantId),
        supabase.from('drinks').select('id, enabled, is_public_visible, public_status').eq('tenant_id', tenantId),
      ])

      const catCount = catRes.data?.length || 0
      const drinkCount = drinkRes.data?.length || 0
      const enabledCount = drinkRes.data?.filter((d: any) => d.enabled).length || 0
      const publicCount = drinkRes.data?.filter((d: any) => d.is_public_visible).length || 0
      const publicNewCount = drinkRes.data?.filter((d: any) => d.is_public_visible && d.public_status === 'new').length || 0

      let todayOrders = 0
      let todayRevenue = 0
      if (orderingEnabled) try {
        const { data: bdId } = await supabase.rpc('get_or_create_open_business_day')
        if (bdId) {
          const { data: orders } = await supabase
            .from('orders')
            .select('total_amount')
            .eq('business_day_id', bdId)
          todayOrders = orders?.length || 0
          todayRevenue = (orders || []).reduce((s: number, o: any) => s + Number(o.total_amount || 0), 0)
        }
      } catch {
        Alert.alert('提示', '今日订单统计加载失败')
      }

      setStats({
        categories: catCount,
        drinks: drinkCount,
        enabledDrinks: enabledCount,
        publicDrinks: publicCount,
        publicNewDrinks: publicNewCount,
        todayOrders,
        todayRevenue,
      })
    } catch (e) {
      Alert.alert('错误', '加载概览失败')
    } finally {
      setDashLoading(false)
    }
  }, [tenantId, orderingEnabled, fetchSoldOutMonth])

  // --- Customers ---
  const fetchCustomers = useCallback(async (fromRefresh = false) => {
    if (fromRefresh) setRefreshing(true)
    else setCustLoading(true)
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('customer_name, total_amount, status')
        .in('status', ['checked_out', 'finished'])

      if (error) throw error

      const map = new Map<string, { total: number; count: number }>()
      for (const order of data || []) {
        const name = (order.customer_name || '').trim() || '(未填写)'
        const amount = Number(order.total_amount || 0)
        const existing = map.get(name)
        if (existing) {
          existing.total += amount
          existing.count += 1
        } else {
          map.set(name, { total: amount, count: 1 })
        }
      }

      const list: CustomerSpending[] = Array.from(map.entries())
        .map(([name, { total, count }]) => ({ name, total, count }))
        .sort((a, b) => b.total - a.total)

      setCustomers(list)
    } catch (e) {
      Alert.alert('错误', '加载客户消费失败')
    } finally {
      if (fromRefresh) setRefreshing(false)
      else setCustLoading(false)
    }
  }, [])

  // --- Analytics ---
  const fetchAnalytics = useCallback(async () => {
    setAnalyticsLoading(true)
    try {
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

      const { data: itemsData, error: itemsError } = await supabase
        .from('order_items')
        .select('drink_id, quantity, drinks(name)')
        .gte('created_at', thirtyDaysAgo.toISOString())

      if (itemsError) throw itemsError

      const drinkMap = new Map<string, { name: string; count: number }>()
      for (const item of itemsData || []) {
        const name = (item as any).drinks?.name || '未知'
        const count = item.quantity || 0
        const existing = drinkMap.get(item.drink_id)
        if (existing) {
          existing.count += count
        } else {
          drinkMap.set(item.drink_id, { name, count })
        }
      }
      const topList = Array.from(drinkMap.values()).sort((a, b) => b.count - a.count).slice(0, 10)
      setTopDrinks(topList)

      const sevenDaysAgo = new Date()
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

      const { data: ordersData, error: ordersError } = await supabase
        .from('orders')
        .select('order_date, total_amount')
        .in('status', ['checked_out', 'finished'])
        .gte('created_at', sevenDaysAgo.toISOString())

      if (ordersError) throw ordersError

      const dayMap = new Map<string, number>()
      for (const o of ordersData || []) {
        const date = o.order_date || 'unknown'
        dayMap.set(date, (dayMap.get(date) || 0) + Number(o.total_amount || 0))
      }

      const days: DailyRevenue[] = []
      for (let i = 6; i >= 0; i--) {
        const d = new Date()
        d.setDate(d.getDate() - i)
        const dateStr = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })
        days.push({ date: dateStr, revenue: dayMap.get(dateStr) || 0 })
      }
      setDailyRevenue(days)
    } catch (e) {
      Alert.alert('错误', '加载分析数据失败')
    } finally {
      setAnalyticsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (activeSection === 'dashboard') fetchDashboard()
    else if (activeSection === 'analytics') fetchAnalytics()
    else if (activeSection === 'customers') fetchCustomers()
  }, [activeSection, fetchDashboard, fetchAnalytics, fetchCustomers])

  useEffect(() => {
    if (!orderingEnabled && activeSection !== 'dashboard') setActiveSection('dashboard')
  }, [activeSection, orderingEnabled])

  const sections = orderingEnabled ? ORDERING_SECTIONS : ORDERING_SECTIONS.slice(0, 1)

  const getRoleLabel = (r: string) => {
    switch (r) {
      case 'owner': return '店主'
      case 'staff': return '员工'
      case 'super_admin': return '超级管理员'
      default: return r
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.hero}>
        <HouseSubheader title="经营数据" />
      </View>

      {/* Section switcher */}
      <View style={styles.segmented}>
        {sections.map((s) => (
          <TouchableOpacity
            key={s.key}
            style={[styles.segment, activeSection === s.key && styles.segmentActive]}
            onPress={() => setActiveSection(s.key)}
          >
            <Text style={[styles.segmentText, activeSection === s.key && styles.segmentTextActive]}>
              {s.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* DASHBOARD */}
      {activeSection === 'dashboard' && (
        <ScrollView contentContainerStyle={styles.scrollBody}>
          {dashLoading ? (
            <ActivityIndicator size="large" color={T.gold} style={{ marginTop: 40 }} />
          ) : (
            <>
              {orderingEnabled ? (
                <View style={styles.statsGrid}>
                  <View style={styles.statCard}>
                    <Text style={styles.statLabel}>今日订单</Text>
                    <Text style={styles.statValue}>{stats.todayOrders}</Text>
                  </View>
                  <View style={[styles.statCard, { flex: 2 }]}> 
                    <Text style={styles.statLabel}>今日营收</Text>
                    <Text style={[styles.statValue, { color: T.gold }]}>¥{stats.todayRevenue.toFixed(2)}</Text>
                  </View>
                </View>
              ) : null}
              <View style={styles.statsGrid}>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>商品总数</Text>
                  <Text style={styles.statValue}>{stats.drinks}</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>公开商品</Text>
                  <Text style={styles.statValue}>{stats.publicDrinks}</Text>
                </View>
                {!orderingEnabled ? (
                  <View style={styles.statCard}>
                    <Text style={styles.statLabel}>公开上新</Text>
                    <Text style={styles.statValue}>{stats.publicNewDrinks}</Text>
                  </View>
                ) : null}
              </View>

              <Text style={[styles.sectionLabel, { marginTop: 8 }]}>本月售罄</Text>
              <Text style={styles.soldOutHint}>自然月（上海时区），每次售罄一行</Text>
              {soldOutLoading ? (
                <ActivityIndicator color={T.gold} style={{ marginVertical: 12 }} />
              ) : soldOutEvents.length === 0 ? (
                <Text style={styles.emptyText}>本月暂无售罄记录</Text>
              ) : (
                <View style={styles.chartContainer}>
                  {soldOutEvents.map((ev) => (
                    <View key={ev.id} style={styles.soldOutRow}>
                      <Text style={styles.soldOutName} numberOfLines={1}>
                        {ev.drink_name}
                      </Text>
                      <Text style={styles.soldOutMeta} numberOfLines={2}>
                        {soldOutSummaryLine(ev)}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              <View style={styles.roleBadgeContainer}>
                <View style={styles.roleBadge}>
                  <Ionicons name="shield-checkmark-outline" size={15} color={T.gold} />
                  <Text style={styles.roleBadgeText}>当前角色：{getRoleLabel(role || 'staff')}</Text>
                </View>
              </View>
            </>
          )}
        </ScrollView>
      )}

      {/* ANALYTICS */}
      {activeSection === 'analytics' && (
        <ScrollView contentContainerStyle={styles.scrollBody}>
          {analyticsLoading ? (
            <ActivityIndicator size="large" color={T.gold} style={{ marginTop: 40 }} />
          ) : (
            <>
              <Text style={styles.sectionLabel}>近 7 天营收</Text>
              <View style={styles.chartContainer}>
                {dailyRevenue.length > 0 && (() => {
                  const maxRevenue = Math.max(...dailyRevenue.map((d) => d.revenue), 1)
                  return dailyRevenue.map((day) => (
                    <View key={day.date} style={styles.chartRow}>
                      <Text style={styles.chartLabel}>
                        {new Date(day.date + 'T00:00:00').toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}
                      </Text>
                      <View style={styles.chartBarContainer}>
                        <View
                          style={[styles.chartBar, { width: `${Math.max((day.revenue / maxRevenue) * 100, 2)}%` }]}
                        />
                      </View>
                      <Text style={styles.chartValue}>¥{day.revenue.toFixed(0)}</Text>
                    </View>
                  ))
                })()}
              </View>

              <Text style={[styles.sectionLabel, { marginTop: 24 }]}>热销酒品 TOP 10（近 30 天）</Text>
              {topDrinks.length === 0 ? (
                <Text style={styles.emptyText}>暂无销售数据</Text>
              ) : (
                <View style={styles.chartContainer}>
                  {(() => {
                    const maxCount = Math.max(...topDrinks.map((d) => d.count), 1)
                    return topDrinks.map((drink, idx) => (
                      <View key={drink.name} style={styles.chartRow}>
                        <Text style={styles.chartRank}>{idx + 1}</Text>
                        <Text style={styles.chartDrinkName} numberOfLines={1}>{drink.name}</Text>
                        <View style={styles.chartBarContainer}>
                          <View
                            style={[styles.chartBar, { width: `${Math.max((drink.count / maxCount) * 100, 2)}%` }]}
                          />
                        </View>
                        <Text style={styles.chartValue}>{drink.count}</Text>
                      </View>
                    ))
                  })()}
                </View>
              )}
            </>
          )}
        </ScrollView>
      )}

      {/* CUSTOMERS */}
      {activeSection === 'customers' && (
        custLoading ? (
          <ActivityIndicator size="large" color={T.gold} style={{ marginTop: 40 }} />
        ) : customers.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="people-outline" size={44} color={T.faint} />
            <Text style={styles.emptyText}>暂无消费记录</Text>
          </View>
        ) : (
          <FlatList
            data={customers}
            keyExtractor={(item) => item.name}
            contentContainerStyle={styles.scrollBody}
            refreshing={refreshing}
            onRefresh={() => fetchCustomers(true)}
            renderItem={({ item, index }) => (
              <View style={styles.custRow}>
                <Text style={styles.custRank}>{index + 1}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.custName}>{item.name}</Text>
                  <Text style={styles.custCount}>{item.count} 单</Text>
                </View>
                <Text style={styles.custTotal}>¥{item.total.toFixed(2)}</Text>
              </View>
            )}
          />
        )
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.background },
  hero: {
    paddingHorizontal: LAYOUT.pagePad,
    paddingTop: LAYOUT.heroPadTop,
    paddingBottom: LAYOUT.heroPadBottom,
  },
  title: { color: T.text, fontSize: 26, fontWeight: '800' },
  segmented: {
    flexDirection: 'row',
    backgroundColor: T.surfaceMuted,
    borderRadius: 12,
    padding: 4,
    gap: 4,
    marginHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: T.borderFaint,
  },
  segment: { flex: 1, paddingVertical: 11, borderRadius: 8, alignItems: 'center' },
  segmentActive: {
    backgroundColor: T.goldFill,
    borderWidth: 1,
    borderColor: T.goldBorder,
  },
  segmentText: { color: T.muted, fontSize: 15, fontWeight: '600' },
  segmentTextActive: { color: T.gold, fontWeight: '700' },
  scrollBody: { paddingHorizontal: LAYOUT.pagePad, paddingBottom: 48 },
  statsGrid: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  statCard: {
    flex: 1,
    backgroundColor: T.surface,
    borderRadius: 14,
    padding: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: T.borderFaint,
  },
  statLabel: { fontSize: 12, color: T.muted, textTransform: 'uppercase', fontWeight: '600', letterSpacing: 1, marginBottom: 8 },
  statValue: { fontSize: 26, fontWeight: '800', color: T.text },
  roleBadgeContainer: { alignItems: 'center', marginTop: 20 },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: T.goldFill,
    borderWidth: 1,
    borderColor: T.goldBorder,
  },
  roleBadgeText: { color: T.gold, fontSize: 13, fontWeight: '500' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyText: { color: T.muted, fontSize: 15, marginTop: 12, textAlign: 'center' },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: T.muted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  soldOutHint: { color: T.faint, fontSize: 12, marginTop: -6, marginBottom: 10 },
  soldOutRow: { marginBottom: 12 },
  soldOutName: { color: T.text, fontSize: 15, fontWeight: '600' },
  soldOutMeta: { color: T.muted, fontSize: 12, marginTop: 3 },
  chartContainer: {
    backgroundColor: T.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: T.borderFaint,
  },
  chartRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 },
  chartLabel: { width: 40, fontSize: 12, color: T.muted, textAlign: 'right' },
  chartRank: { width: 20, fontSize: 13, fontWeight: '700', color: T.muted, textAlign: 'right' },
  chartDrinkName: { width: 70, fontSize: 13, color: T.text, fontWeight: '500' },
  chartBarContainer: { flex: 1, height: 20, backgroundColor: T.surfaceMuted, borderRadius: 6, overflow: 'hidden' },
  chartBar: { height: '100%', backgroundColor: T.gold, borderRadius: 6, minWidth: 4 },
  chartValue: { width: 55, fontSize: 12, color: T.text, fontWeight: '600', textAlign: 'right' },
  custRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: T.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: T.borderFaint,
  },
  custRank: { fontSize: 16, fontWeight: '700', color: T.muted, width: 30 },
  custName: { fontSize: 16, fontWeight: '600', color: T.text },
  custCount: { fontSize: 13, color: T.muted, marginTop: 2 },
  custTotal: { fontSize: 17, fontWeight: '800', color: T.gold },
})
