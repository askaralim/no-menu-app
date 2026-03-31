import { useEffect, useState, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  Alert,
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/authProvider'
import { COLORS, CUSTOMER_NAME_MAP } from '../../lib/constants'
import type { Settings } from '../../lib/types'

type Section = 'dashboard' | 'analytics' | 'customers' | 'settings'

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

export default function MoreScreen() {
  const { tenantId } = useAuth()
  const [activeSection, setActiveSection] = useState<Section>('dashboard')

  // Dashboard state
  const [stats, setStats] = useState({ categories: 0, drinks: 0, enabledDrinks: 0, todayOrders: 0, todayRevenue: 0 })
  const [dashLoading, setDashLoading] = useState(true)

  // Customer state
  const [customers, setCustomers] = useState<CustomerSpending[]>([])
  const [custLoading, setCustLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  // Analytics state
  const [topDrinks, setTopDrinks] = useState<TopDrink[]>([])
  const [dailyRevenue, setDailyRevenue] = useState<DailyRevenue[]>([])
  const [analyticsLoading, setAnalyticsLoading] = useState(false)

  // Settings state
  const [settings, setSettings] = useState<Settings | null>(null)
  const [settingsForm, setSettingsForm] = useState({ theme: 'dark' as Settings['theme'], auto_refresh: true, refresh_interval: '3600' })
  const [settingsLoading, setSettingsLoading] = useState(false)

  // --- Dashboard ---
  const fetchDashboard = useCallback(async () => {
    setDashLoading(true)
    try {
      const [catRes, drinkRes] = await Promise.all([
        supabase.from('categories').select('id'),
        supabase.from('drinks').select('id, enabled'),
      ])

      const catCount = catRes.data?.length || 0
      const drinkCount = drinkRes.data?.length || 0
      const enabledCount = drinkRes.data?.filter((d: any) => d.enabled).length || 0

      let todayOrders = 0
      let todayRevenue = 0
      try {
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

      setStats({ categories: catCount, drinks: drinkCount, enabledDrinks: enabledCount, todayOrders, todayRevenue })
    } catch (e) {
      Alert.alert('错误', '加载概览失败')
    } finally {
      setDashLoading(false)
    }
  }, [])

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
        const raw = (order.customer_name || '').trim() || '(未填写)'
        const canonical = CUSTOMER_NAME_MAP[raw] ?? raw
        const amount = Number(order.total_amount || 0)
        const existing = map.get(canonical)
        if (existing) {
          existing.total += amount
          existing.count += 1
        } else {
          map.set(canonical, { total: amount, count: 1 })
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
      // Top selling drinks (last 30 days)
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

      const { data: itemsData, error: itemsError } = await supabase
        .from('order_items')
        .select('drink_id, quantity_cup, quantity_bottle, drinks(name)')
        .gte('created_at', thirtyDaysAgo.toISOString())

      if (itemsError) throw itemsError

      const drinkMap = new Map<string, { name: string; count: number }>()
      for (const item of itemsData || []) {
        const name = (item as any).drinks?.name || '未知'
        const count = (item.quantity_cup || 0) + (item.quantity_bottle || 0)
        const existing = drinkMap.get(item.drink_id)
        if (existing) {
          existing.count += count
        } else {
          drinkMap.set(item.drink_id, { name, count })
        }
      }
      const topList = Array.from(drinkMap.values()).sort((a, b) => b.count - a.count).slice(0, 10)
      setTopDrinks(topList)

      // Daily revenue (last 7 days)
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

      // Fill in missing days
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

  // --- Settings ---
  const fetchSettings = useCallback(async () => {
    setSettingsLoading(true)
    try {
      const { data, error } = await supabase.from('settings').select('*').limit(1).single()
      if (!error && data) {
        setSettings(data)
        setSettingsForm({
          theme: data.theme,
          auto_refresh: data.auto_refresh,
          refresh_interval: String(data.refresh_interval),
        })
      }
    } catch (e) {
      console.error('Settings error:', e)
    } finally {
      setSettingsLoading(false)
    }
  }, [])

  const saveSettings = async () => {
    try {
      const payload = {
        theme: settingsForm.theme,
        auto_refresh: settingsForm.auto_refresh,
        refresh_interval: parseInt(settingsForm.refresh_interval) || 3600,
        updated_at: new Date().toISOString(),
      }
      if (settings) {
        const { error } = await supabase.from('settings').update(payload).eq('id', settings.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('settings').insert([{ ...payload, tenant_id: tenantId }])
        if (error) throw error
      }
      Alert.alert('成功', '设置已保存')
      fetchSettings()
    } catch (e) {
      Alert.alert('错误', '保存失败')
    }
  }

  const handleLogout = async () => {
    Alert.alert('确认', '确定要退出登录吗？', [
      { text: '取消', style: 'cancel' },
      { text: '退出', style: 'destructive', onPress: () => supabase.auth.signOut() },
    ])
  }

  useEffect(() => {
    if (activeSection === 'dashboard') fetchDashboard()
    else if (activeSection === 'analytics') fetchAnalytics()
    else if (activeSection === 'customers') fetchCustomers()
    else if (activeSection === 'settings') fetchSettings()
  }, [activeSection, fetchDashboard, fetchAnalytics, fetchCustomers, fetchSettings])

  const themeOptions: { key: Settings['theme']; label: string }[] = [
    { key: 'dark', label: '深色夜店风' },
    { key: 'minimal', label: '简约黑白' },
    { key: 'luxury', label: '高端酒吧' },
  ]

  return (
    <View style={styles.container}>
      {/* Section Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.sectionRow}>
        {([
          { key: 'dashboard' as Section, label: '概览', icon: 'stats-chart-outline' as const },
          { key: 'analytics' as Section, label: '分析', icon: 'bar-chart-outline' as const },
          { key: 'customers' as Section, label: '客户', icon: 'people-outline' as const },
          { key: 'settings' as Section, label: '设置', icon: 'settings-outline' as const },
        ]).map((s) => (
          <TouchableOpacity
            key={s.key}
            style={[styles.sectionBtn, activeSection === s.key && styles.sectionBtnActive]}
            onPress={() => setActiveSection(s.key)}
          >
            <Ionicons name={s.icon} size={18} color={activeSection === s.key ? '#000' : COLORS.text} />
            <Text style={[styles.sectionBtnText, activeSection === s.key && styles.sectionBtnTextActive]}>
              {s.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* DASHBOARD */}
      {activeSection === 'dashboard' && (
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          {dashLoading ? (
            <ActivityIndicator size="large" color={COLORS.gold} style={{ marginTop: 40 }} />
          ) : (
            <>
              <View style={styles.statsGrid}>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>分类总数</Text>
                  <Text style={styles.statValue}>{stats.categories}</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>酒品总数</Text>
                  <Text style={styles.statValue}>{stats.drinks}</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>在售酒品</Text>
                  <Text style={styles.statValue}>{stats.enabledDrinks}</Text>
                </View>
              </View>
              <View style={styles.statsGrid}>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>今日订单</Text>
                  <Text style={styles.statValue}>{stats.todayOrders}</Text>
                </View>
                <View style={[styles.statCard, { flex: 2 }]}>
                  <Text style={styles.statLabel}>今日营收</Text>
                  <Text style={[styles.statValue, { color: COLORS.gold }]}>¥{stats.todayRevenue.toFixed(2)}</Text>
                </View>
              </View>
            </>
          )}
        </ScrollView>
      )}

      {/* ANALYTICS */}
      {activeSection === 'analytics' && (
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          {analyticsLoading ? (
            <ActivityIndicator size="large" color={COLORS.gold} style={{ marginTop: 40 }} />
          ) : (
            <>
              <Text style={styles.analyticsTitle}>近7天营收</Text>
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
                          style={[
                            styles.chartBar,
                            { width: `${Math.max((day.revenue / maxRevenue) * 100, 2)}%` },
                          ]}
                        />
                      </View>
                      <Text style={styles.chartValue}>¥{day.revenue.toFixed(0)}</Text>
                    </View>
                  ))
                })()}
              </View>

              <Text style={[styles.analyticsTitle, { marginTop: 24 }]}>热销酒品 TOP 10（近30天）</Text>
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
                            style={[
                              styles.chartBar,
                              { width: `${Math.max((drink.count / maxCount) * 100, 2)}%` },
                            ]}
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
          <ActivityIndicator size="large" color={COLORS.gold} style={{ marginTop: 40 }} />
        ) : customers.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="people-outline" size={48} color={COLORS.muted} />
            <Text style={styles.emptyText}>暂无消费记录</Text>
          </View>
        ) : (
          <FlatList
            data={customers}
            keyExtractor={(item) => item.name}
            contentContainerStyle={{ paddingBottom: 40 }}
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

      {/* SETTINGS */}
      {activeSection === 'settings' && (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
            {settingsLoading ? (
              <ActivityIndicator size="large" color={COLORS.gold} style={{ marginTop: 40 }} />
            ) : (
              <>
                <Text style={styles.formLabel}>展示页主题</Text>
                <View style={styles.themeRow}>
                  {themeOptions.map((t) => (
                    <TouchableOpacity
                      key={t.key}
                      style={[styles.themeBtn, settingsForm.theme === t.key && styles.themeBtnActive]}
                      onPress={() => setSettingsForm((f) => ({ ...f, theme: t.key }))}
                    >
                      <Text style={[styles.themeBtnText, settingsForm.theme === t.key && styles.themeBtnTextActive]}>
                        {t.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={styles.switchRow}>
                  <Text style={styles.switchLabel}>自动刷新</Text>
                  <Switch
                    value={settingsForm.auto_refresh}
                    onValueChange={(v) => setSettingsForm((f) => ({ ...f, auto_refresh: v }))}
                    trackColor={{ false: '#555', true: COLORS.gold }}
                    thumbColor="#fff"
                  />
                </View>

                <Text style={styles.formLabel}>刷新间隔（秒）</Text>
                <TextInput
                  style={styles.formInput}
                  value={settingsForm.refresh_interval}
                  onChangeText={(t) => setSettingsForm((f) => ({ ...f, refresh_interval: t }))}
                  keyboardType="number-pad"
                  placeholderTextColor={COLORS.muted}
                />

                <TouchableOpacity style={styles.saveBtn} onPress={saveSettings}>
                  <Text style={styles.saveBtnText}>保存设置</Text>
                </TouchableOpacity>

                <View style={{ marginTop: 40 }}>
                  <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
                    <Ionicons name="log-out-outline" size={20} color={COLORS.danger} />
                    <Text style={styles.logoutBtnText}>退出登录</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, padding: 16 },
  sectionRow: { flexGrow: 0, marginBottom: 20 },
  sectionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 14, borderRadius: 8, marginRight: 8,
    backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border,
  },
  sectionBtnActive: { backgroundColor: COLORS.gold, borderColor: COLORS.gold },
  sectionBtnText: { color: COLORS.text, fontSize: 14, fontWeight: '600' },
  sectionBtnTextActive: { color: '#000' },
  statsGrid: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  statCard: {
    flex: 1, backgroundColor: COLORS.card, borderRadius: 12, padding: 18, alignItems: 'center',
  },
  statLabel: { fontSize: 12, color: COLORS.muted, textTransform: 'uppercase', fontWeight: '600', letterSpacing: 1, marginBottom: 8 },
  statValue: { fontSize: 28, fontWeight: '800', color: COLORS.text },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80 },
  emptyText: { color: COLORS.muted, fontSize: 16, marginTop: 12 },
  custRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card,
    borderRadius: 10, padding: 14, marginBottom: 8,
  },
  custRank: { fontSize: 16, fontWeight: '700', color: COLORS.muted, width: 30 },
  custName: { fontSize: 16, fontWeight: '600', color: COLORS.text },
  custCount: { fontSize: 13, color: COLORS.muted, marginTop: 2 },
  custTotal: { fontSize: 17, fontWeight: '700', color: COLORS.gold },
  formLabel: { fontSize: 13, color: COLORS.muted, marginBottom: 6, fontWeight: '600' },
  formInput: {
    backgroundColor: COLORS.card, color: COLORS.text, borderRadius: 8,
    padding: 12, fontSize: 15, marginBottom: 16, borderWidth: 1, borderColor: COLORS.border,
  },
  themeRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  themeBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 8, alignItems: 'center',
    backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border,
  },
  themeBtnActive: { backgroundColor: COLORS.gold, borderColor: COLORS.gold },
  themeBtnText: { color: COLORS.text, fontSize: 14, fontWeight: '600' },
  themeBtnTextActive: { color: '#000' },
  switchRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 16,
  },
  switchLabel: { fontSize: 15, color: COLORS.text, fontWeight: '500' },
  saveBtn: {
    backgroundColor: COLORS.gold, borderRadius: 10, paddingVertical: 14, alignItems: 'center',
  },
  saveBtnText: { color: '#000', fontSize: 16, fontWeight: '700' },
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14, borderRadius: 10,
    backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.danger,
  },
  logoutBtnText: { color: COLORS.danger, fontSize: 16, fontWeight: '600' },
  analyticsTitle: {
    fontSize: 16, fontWeight: '700', color: COLORS.text, marginBottom: 12,
  },
  chartContainer: {
    backgroundColor: COLORS.card, borderRadius: 12, padding: 14,
  },
  chartRow: {
    flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8,
  },
  chartLabel: {
    width: 40, fontSize: 12, color: COLORS.muted, textAlign: 'right',
  },
  chartRank: {
    width: 20, fontSize: 13, fontWeight: '700', color: COLORS.muted, textAlign: 'right',
  },
  chartDrinkName: {
    width: 70, fontSize: 13, color: COLORS.text, fontWeight: '500',
  },
  chartBarContainer: {
    flex: 1, height: 20, backgroundColor: COLORS.background, borderRadius: 4, overflow: 'hidden',
  },
  chartBar: {
    height: '100%', backgroundColor: COLORS.gold, borderRadius: 4, minWidth: 4,
  },
  chartValue: {
    width: 55, fontSize: 12, color: COLORS.text, fontWeight: '600', textAlign: 'right',
  },
})
