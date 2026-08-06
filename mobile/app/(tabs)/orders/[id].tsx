import { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Share,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { Redirect, useLocalSearchParams } from 'expo-router'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../lib/authProvider'
import { orderStatusLabel, isOrderSettled } from '../../../lib/constants'
import { THEME as T, orderStatusVisual, LAYOUT, SPACING } from '../../../lib/theme'
import { HouseSubheader } from '../../../components/house/HouseSubheader'
import type { OrderStatus, OrderWithItems } from '../../../lib/types'

async function shareReceipt(order: OrderWithItems) {
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
    lines.push(
      `结账时间: ${new Date(order.checked_out_at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`,
    )
  }
  lines.push('')
  lines.push('感谢光临！')

  try {
    await Share.share({ message: lines.join('\n') })
  } catch {
    // user cancelled
  }
}

export default function OrderDetailScreen() {
  const { orderingEnabled, isLoading: authLoading } = useAuth()
  const params = useLocalSearchParams<{ id?: string }>()
  const orderId = typeof params.id === 'string' ? params.id : ''

  const [order, setOrder] = useState<OrderWithItems | null>(null)
  const [restoreLocked, setRestoreLocked] = useState(false)
  const [loading, setLoading] = useState(true)
  const [statusUpdating, setStatusUpdating] = useState(false)

  const load = useCallback(async () => {
    if (!orderId) {
      setLoading(false)
      return
    }
    setLoading(true)
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

      let locked = false
      if (orderData.business_day_id) {
        const { data: businessDayData, error: businessDayError } = await supabase
          .from('business_days')
          .select('closed_at, ever_closed_at')
          .eq('id', orderData.business_day_id)
          .single()
        if (businessDayError) throw businessDayError
        locked = Boolean(businessDayData.ever_closed_at || businessDayData.closed_at)
      }

      setOrder({
        ...orderData,
        items: (itemsData || []).map((item: any) => ({ ...item, drink: item.drinks })),
      })
      setRestoreLocked(locked)
    } catch (e) {
      Alert.alert('错误', e instanceof Error ? e.message : '加载订单详情失败')
      setOrder(null)
    } finally {
      setLoading(false)
    }
  }, [orderId])

  useEffect(() => {
    void load()
  }, [load])

  const handleStatusChange = async (newStatus: OrderStatus) => {
    if (!order || statusUpdating) return
    setStatusUpdating(true)
    try {
      const updateData: Record<string, unknown> = { status: newStatus }
      if (newStatus === 'checked_out') updateData.checked_out_at = new Date().toISOString()

      const { error } = await supabase.from('orders').update(updateData).eq('id', order.id)
      if (error) throw error
      await load()
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

  const confirmCheckout = () => {
    if (!order) return
    Alert.alert('确认结账', `确认将「${order.customer_name}」标记为已结账？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '确认结账',
        onPress: () => void handleStatusChange('checked_out'),
      },
    ])
  }

  const confirmRestore = () => {
    Alert.alert('确认恢复订单', '恢复后订单将回到进行中，并清除原结账时间。', [
      { text: '取消', style: 'cancel' },
      {
        text: '确认恢复',
        onPress: () => void handleStatusChange('active'),
      },
    ])
  }

  if (authLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={T.gold} />
      </View>
    )
  }
  if (!orderingEnabled) return <Redirect href="/(tabs)/taplist" />

  if (loading) {
    return (
      <SafeAreaView style={styles.centered} edges={['top']}>
        <ActivityIndicator size="large" color={T.gold} />
      </SafeAreaView>
    )
  }

  if (!order) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <View style={styles.pad}>
          <HouseSubheader title="订单详情" />
          <Text style={styles.emptyText}>订单不存在或已删除</Text>
        </View>
      </SafeAreaView>
    )
  }

  const vis = orderStatusVisual(order.status)

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.pad}>
          <HouseSubheader title={order.customer_name || '订单详情'} />
        </View>

        <View style={styles.detailCard}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>状态</Text>
            <View style={[styles.statusBadge, { backgroundColor: vis.bg, borderColor: vis.border }]}>
              <Text style={[styles.statusText, { color: vis.fg }]}>
                {orderStatusLabel(order.status)}
              </Text>
            </View>
          </View>
          <View style={styles.detailDivider} />
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>创建时间</Text>
            <Text style={styles.detailValue}>
              {new Date(order.created_at).toLocaleString('zh-CN')}
            </Text>
          </View>
          {order.checked_out_at ? (
            <>
              <View style={styles.detailDivider} />
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>结账时间</Text>
                <Text style={styles.detailValue}>
                  {new Date(order.checked_out_at).toLocaleString('zh-CN')}
                </Text>
              </View>
            </>
          ) : null}
        </View>

        <Text style={styles.sectionLabel}>订单项目</Text>
        {order.items.map((item) => {
          const subtotal = item.quantity * item.unit_price
          return (
            <View key={item.id} style={styles.itemRow}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.itemName}>{item.drink?.name || '未知商品'}</Text>
                <Text style={styles.itemQty}>
                  {item.quantity} × {item.label_snapshot || '规格'} · ¥
                  {Number(item.unit_price).toFixed(2)}
                </Text>
              </View>
              <Text style={styles.itemSubtotal}>¥{subtotal.toFixed(2)}</Text>
            </View>
          )
        })}

        <View style={styles.grandTotalRow}>
          <Text style={styles.grandTotalLabel}>总计</Text>
          <Text style={styles.grandTotalValue}>¥{Number(order.total_amount).toFixed(2)}</Text>
        </View>

        <TouchableOpacity style={styles.shareBtn} onPress={() => void shareReceipt(order)}>
          <Ionicons name="share-outline" size={18} color={T.gold} />
          <Text style={styles.shareBtnText}>分享账单</Text>
        </TouchableOpacity>

        <View style={styles.actionSection}>
          {order.status === 'active' ? (
            <TouchableOpacity
              style={[styles.primaryBtn, statusUpdating && styles.buttonDisabled]}
              disabled={statusUpdating}
              onPress={confirmCheckout}
            >
              {statusUpdating ? (
                <ActivityIndicator size="small" color={T.background} />
              ) : (
                <Text style={styles.primaryBtnText}>标记为已结账</Text>
              )}
            </TouchableOpacity>
          ) : null}
          {isOrderSettled(order.status) ? (
            <>
              <TouchableOpacity
                style={[
                  styles.secondaryBtn,
                  (statusUpdating || restoreLocked) && styles.buttonDisabled,
                ]}
                disabled={statusUpdating || restoreLocked}
                onPress={confirmRestore}
              >
                {statusUpdating ? (
                  <ActivityIndicator size="small" color={T.gold} />
                ) : (
                  <Text style={styles.secondaryBtnText}>恢复订单</Text>
                )}
              </TouchableOpacity>
              {restoreLocked ? (
                <Text style={styles.disabledActionHint}>营业日已结束，不能恢复订单</Text>
              ) : null}
            </>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.background },
  centered: { flex: 1, backgroundColor: T.background, justifyContent: 'center', alignItems: 'center' },
  content: { paddingBottom: 40 },
  pad: { paddingHorizontal: LAYOUT.pagePad, paddingTop: LAYOUT.heroPadTop },
  emptyText: { color: T.muted, fontSize: 15, marginTop: SPACING.md },
  detailCard: {
    backgroundColor: T.surface,
    borderRadius: 14,
    padding: 16,
    marginHorizontal: LAYOUT.pagePad,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: T.borderFaint,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  detailDivider: { height: 1, backgroundColor: T.borderFaint },
  detailLabel: { fontSize: 14, color: T.muted },
  detailValue: { fontSize: 15, color: T.text, fontWeight: '500' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 16, borderWidth: 1 },
  statusText: { fontSize: 12, fontWeight: '600' },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: T.muted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
    marginHorizontal: LAYOUT.pagePad,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: T.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 6,
    marginHorizontal: LAYOUT.pagePad,
    borderWidth: 1,
    borderColor: T.borderFaint,
  },
  itemName: { fontSize: 15, color: T.text, fontWeight: '500' },
  itemQty: { fontSize: 13, color: T.muted, marginTop: 2 },
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
    marginHorizontal: LAYOUT.pagePad,
  },
  grandTotalLabel: { fontSize: 16, fontWeight: '600', color: T.text },
  grandTotalValue: { fontSize: 24, fontWeight: '800', color: T.gold },
  shareBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    paddingVertical: 14,
    marginHorizontal: LAYOUT.pagePad,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: T.goldBorder,
    backgroundColor: T.goldFill,
  },
  shareBtnText: { color: T.gold, fontSize: 16, fontWeight: '700' },
  actionSection: { gap: 10, marginHorizontal: LAYOUT.pagePad },
  buttonDisabled: { opacity: 0.45 },
  disabledActionHint: { color: T.muted, fontSize: 13, textAlign: 'center' },
  primaryBtn: {
    backgroundColor: T.gold,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
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
})
