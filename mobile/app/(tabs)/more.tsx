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
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/authProvider'
import { COLORS, CUSTOMER_NAME_MAP } from '../../lib/constants'
import type { Settings } from '../../lib/types'

type Section = 'dashboard' | 'customers' | 'settings'

interface CustomerSpending {
  name: string
  total: number
  count: number
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
      } catch {}

      setStats({ categories: catCount, drinks: drinkCount, enabledDrinks: enabledCount, todayOrders, todayRevenue })
    } catch (e) {
      console.error('Dashboard error:', e)
    } finally {
      setDashLoading(false)
    }
  }, [])

  // --- Customers ---
  const fetchCustomers = useCallback(async () => {
    setCustLoading(true)
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
      console.error('Customer error:', e)
    } finally {
      setCustLoading(false)
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
    else if (activeSection === 'customers') fetchCustomers()
    else if (activeSection === 'settings') fetchSettings()
  }, [activeSection, fetchDashboard, fetchCustomers, fetchSettings])

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
          { key: 'customers' as Section, label: '客户消费', icon: 'people-outline' as const },
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
        <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
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
            contentContainerStyle={{ paddingBottom: 20 }}
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
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, padding: 16 },
  sectionRow: { flexGrow: 0, marginBottom: 20 },
  sectionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, marginRight: 8,
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
    flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center',
    backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border,
  },
  themeBtnActive: { backgroundColor: COLORS.gold, borderColor: COLORS.gold },
  themeBtnText: { color: COLORS.text, fontSize: 13, fontWeight: '600' },
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
})
