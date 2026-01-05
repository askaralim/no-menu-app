'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { Order, OrderWithItems, OrderStatus } from '@/lib/types'

function OrdersPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const selectedOrderId = searchParams.get('id')
  
  const [ordersByDate, setOrdersByDate] = useState<Record<string, Order[]>>({})
  const [selectedOrder, setSelectedOrder] = useState<OrderWithItems | null>(null)
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all')
  const [loading, setLoading] = useState(true)

  const fetchOrders = async () => {
    try {
      let query = supabase.from('orders').select('*').order('created_at', { ascending: false })

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter)
      }

      const { data, error } = await query

      if (error) throw error

      // Group orders by date
      const grouped: Record<string, Order[]> = {}
      ;(data || []).forEach((order) => {
        const date = order.order_date || order.created_at.split('T')[0]
        if (!grouped[date]) {
          grouped[date] = []
        }
        grouped[date].push(order)
      })

      setOrdersByDate(grouped)
    } catch (error) {
      console.error('Error fetching orders:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchOrderDetails = async (orderId: string) => {
    try {
      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .single()

      if (orderError) throw orderError

      const { data: itemsData, error: itemsError } = await supabase
        .from('order_items')
        .select(
          `
          *,
          drinks (*)
        `
        )
        .eq('order_id', orderId)
        .order('created_at', { ascending: true })

      if (itemsError) throw itemsError

      const orderWithItems: OrderWithItems = {
        ...orderData,
        items: itemsData.map((item: any) => ({
          ...item,
          drink: item.drinks,
        })),
      }

      setSelectedOrder(orderWithItems)
    } catch (error) {
      console.error('Error fetching order details:', error)
      setSelectedOrder(null)
    }
  }

  const handleStatusChange = async (orderId: string, newStatus: OrderStatus) => {
    try {
      const updateData: any = { status: newStatus }
      if (newStatus === 'checked_out') {
        updateData.checked_out_at = new Date().toISOString()
      }

      const { error } = await supabase.from('orders').update(updateData).eq('id', orderId)

      if (error) throw error

      fetchOrders()
      if (selectedOrder?.id === orderId) {
        fetchOrderDetails(orderId)
      }
    } catch (error) {
      console.error('Error updating order status:', error)
      alert('操作失败，请重试')
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    if (date.toDateString() === today.toDateString()) {
      return '今天'
    } else if (date.toDateString() === yesterday.toDateString()) {
      return '昨天'
    } else {
      return date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })
    }
  }

  const getStatusColor = (status: OrderStatus) => {
    switch (status) {
      case 'active':
        return { bg: '#dbeafe', color: '#1e40af', text: '进行中' }
      case 'checked_out':
        return { bg: '#fef3c7', color: '#92400e', text: '已结账' }
      case 'finished':
        return { bg: '#e5e7eb', color: '#374151', text: '已完成' }
      default:
        return { bg: '#e5e7eb', color: '#374151', text: status }
    }
  }

  useEffect(() => {
    fetchOrders()

    const channel = supabase
      .channel('orders-management')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
        },
        () => {
          fetchOrders()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [statusFilter])

  useEffect(() => {
    if (selectedOrderId) {
      fetchOrderDetails(selectedOrderId)
    } else {
      setSelectedOrder(null)
    }
  }, [selectedOrderId])

  if (loading) {
    return (
      <div className="admin-container">
        <p>加载中...</p>
      </div>
    )
  }

  const sortedDates = Object.keys(ordersByDate).sort((a, b) => b.localeCompare(a))

  return (
    <div className="admin-container">
      <div className="admin-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1>订单管理</h1>
          {selectedOrder && (
            <button
              onClick={() => router.push('/admin/orders')}
              className="admin-button admin-button-secondary"
              style={{ padding: '0.5rem 1rem' }}
            >
              返回订单列表
            </button>
          )}
        </div>
      </div>

      {selectedOrder ? (
        /* Order Details View */
        <div className="admin-section">
          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{ marginBottom: '0.75rem' }}>
              <strong style={{ color: '#111827' }}>客户姓名：</strong>
              <span style={{ color: '#111827', marginLeft: '0.5rem' }}>{selectedOrder.customer_name}</span>
            </div>
            <div style={{ marginBottom: '0.75rem' }}>
              <strong style={{ color: '#111827' }}>订单状态：</strong>
              <span
                style={{
                  marginLeft: '0.5rem',
                  padding: '0.25rem 0.5rem',
                  borderRadius: '4px',
                  backgroundColor: getStatusColor(selectedOrder.status).bg,
                  color: getStatusColor(selectedOrder.status).color,
                  fontSize: '14px',
                }}
              >
                {getStatusColor(selectedOrder.status).text}
              </span>
            </div>
            <div style={{ marginBottom: '0.75rem' }}>
              <strong style={{ color: '#111827' }}>创建时间：</strong>
              <span style={{ color: '#111827', marginLeft: '0.5rem' }}>
                {new Date(selectedOrder.created_at).toLocaleString('zh-CN')}
              </span>
            </div>
            {selectedOrder.checked_out_at && (
              <div style={{ marginBottom: '0.75rem' }}>
                <strong style={{ color: '#111827' }}>结账时间：</strong>
                <span style={{ color: '#111827', marginLeft: '0.5rem' }}>
                  {new Date(selectedOrder.checked_out_at).toLocaleString('zh-CN')}
                </span>
              </div>
            )}
            <div style={{ marginBottom: '0.75rem' }}>
              <strong style={{ color: '#111827' }}>订单总额：</strong>
              <span style={{ fontSize: '18px', fontWeight: 700, color: '#111827', marginLeft: '0.5rem' }}>
                ¥{selectedOrder.total_amount.toFixed(2)}
              </span>
            </div>
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '1rem' }}>订单项目</h3>
            <div className="admin-table-wrapper">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>商品</th>
                    <th>杯数</th>
                    <th>瓶数</th>
                    <th>单价</th>
                    <th>小计</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedOrder.items.map((item) => {
                    const subtotal =
                      item.quantity_cup * item.unit_price_cup +
                      item.quantity_bottle * (item.unit_price_bottle || 0)
                    return (
                      <tr key={item.id}>
                        <td className="name-cell">{item.drink.name}</td>
                        <td>{item.quantity_cup}</td>
                        <td>{item.quantity_bottle || 0}</td>
                        <td>
                          {item.quantity_cup > 0 && (
                            <div>¥{item.unit_price_cup.toFixed(2)}/{item.drink.price_unit}</div>
                          )}
                          {item.quantity_bottle > 0 && item.unit_price_bottle && (
                            <div>¥{item.unit_price_bottle.toFixed(2)}/{item.drink.price_unit_bottle}</div>
                          )}
                        </td>
                        <td style={{ fontWeight: 600 }}>¥{subtotal.toFixed(2)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div
              style={{
                marginTop: '1rem',
                padding: '1rem',
                backgroundColor: '#f9fafb',
                borderRadius: '8px',
                textAlign: 'right',
              }}
            >
              <div style={{ fontSize: '20px', fontWeight: 700 }}>
                总计: ¥{selectedOrder.total_amount.toFixed(2)}
              </div>
            </div>
          </div>

          {/* Status Change Buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {selectedOrder.status === 'active' && (
              <button
                onClick={() => handleStatusChange(selectedOrder.id, 'checked_out')}
                className="admin-button admin-button-primary"
              >
                标记为已结账
              </button>
            )}
            {selectedOrder.status === 'checked_out' && (
              <>
                <button
                  onClick={() => handleStatusChange(selectedOrder.id, 'finished')}
                  className="admin-button admin-button-primary"
                >
                  标记为已完成
                </button>
                <button
                  onClick={() => handleStatusChange(selectedOrder.id, 'active')}
                  className="admin-button admin-button-secondary"
                >
                  恢复为进行中
                </button>
              </>
            )}
            {selectedOrder.status === 'finished' && (
              <button
                onClick={() => handleStatusChange(selectedOrder.id, 'checked_out')}
                className="admin-button admin-button-secondary"
              >
                恢复为已结账
              </button>
            )}
          </div>
        </div>
      ) : (
        /* Orders List View */
        <>
          {/* Status Filter */}
          <div className="admin-section">
            <div className="status-filter-group" style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
              <button
                onClick={() => setStatusFilter('all')}
                className={`admin-button ${statusFilter === 'all' ? 'admin-button-primary' : 'admin-button-secondary'}`}
                style={{ padding: '0.5rem 1rem' }}
              >
                全部
              </button>
              <button
                onClick={() => setStatusFilter('active')}
                className={`admin-button ${statusFilter === 'active' ? 'admin-button-primary' : 'admin-button-secondary'}`}
                style={{ padding: '0.5rem 1rem' }}
              >
                进行中
              </button>
              <button
                onClick={() => setStatusFilter('checked_out')}
                className={`admin-button ${statusFilter === 'checked_out' ? 'admin-button-primary' : 'admin-button-secondary'}`}
                style={{ padding: '0.5rem 1rem' }}
              >
                已结账
              </button>
              <button
                onClick={() => setStatusFilter('finished')}
                className={`admin-button ${statusFilter === 'finished' ? 'admin-button-primary' : 'admin-button-secondary'}`}
                style={{ padding: '0.5rem 1rem' }}
              >
                已完成
              </button>
            </div>
          </div>

          <div className="orders-layout">
            {/* Orders List */}
            <div>
              {sortedDates.length === 0 ? (
                <div className="admin-section">
                  <p style={{ textAlign: 'center', color: '#9ca3af', padding: '2rem' }}>
                    暂无订单
                  </p>
                </div>
              ) : (
                sortedDates.map((date) => (
                  <div key={date} className="admin-section" style={{ marginBottom: '1.5rem' }}>
                    <h2
                      style={{
                        fontSize: '20px',
                        fontWeight: 700,
                        marginBottom: '1rem',
                        paddingBottom: '0.75rem',
                        borderBottom: '2px solid #e5e7eb',
                      }}
                    >
                      {formatDate(date)}
                    </h2>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {ordersByDate[date].map((order) => {
                        const statusStyle = getStatusColor(order.status)
                        return (
                          <div
                            key={order.id}
                            onClick={() => router.push(`/admin/orders?id=${order.id}`)}
                            className={`order-card ${selectedOrderId === order.id ? 'selected' : ''}`}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                              <div>
                                <div style={{ fontWeight: 600, fontSize: '16px', color: '#111827', marginBottom: '0.25rem' }}>
                                  {order.customer_name}
                                </div>
                                <div style={{ fontSize: '14px', color: '#6b7280' }}>
                                  {new Date(order.created_at).toLocaleTimeString('zh-CN', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </div>
                              </div>
                              <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: '18px', fontWeight: 700, color: '#111827', marginBottom: '0.25rem' }}>
                                  ¥{order.total_amount.toFixed(2)}
                                </div>
                                <span
                                  style={{
                                    fontSize: '12px',
                                    padding: '0.25rem 0.5rem',
                                    borderRadius: '4px',
                                    backgroundColor: statusStyle.bg,
                                    color: statusStyle.color,
                                  }}
                                >
                                  {statusStyle.text}
                                </span>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default function OrdersPage() {
  return (
    <Suspense fallback={
      <div className="admin-container">
        <p>加载中...</p>
      </div>
    }>
      <OrdersPageContent />
    </Suspense>
  )
}
