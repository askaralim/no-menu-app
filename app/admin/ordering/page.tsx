'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { Order, OrderItem, OrderWithItems, Drink, CategoryWithDrinks } from '@/lib/types'

interface CartItem {
  drink_id: string
  drink: Drink
  quantity_cup: number
  quantity_bottle: number
}

function OrderingPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const action = searchParams.get('action')
  const orderId = searchParams.get('id')
  const isCreating = action === 'new'
  const isEditing = action === 'edit' && orderId

  const [activeOrders, setActiveOrders] = useState<Order[]>([])
  const [selectedOrder, setSelectedOrder] = useState<OrderWithItems | null>(null)
  const [drinks, setDrinks] = useState<CategoryWithDrinks[]>([])
  const [customerName, setCustomerName] = useState('')
  const [cart, setCart] = useState<CartItem[]>([])
  const [loading, setLoading] = useState(true)

  // Fetch active orders (status = 'active' or 'checked_out' for today)
  const fetchActiveOrders = async () => {
    try {
      const today = new Date().toISOString().split('T')[0]
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .in('status', ['active', 'checked_out'])
        .eq('order_date', today)
        .order('created_at', { ascending: false })

      if (error) throw error
      setActiveOrders(data || [])
    } catch (error) {
      console.error('Error fetching orders:', error)
    }
  }

  // Fetch selected order with items
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
        .select(`
          *,
          drinks (*)
        `)
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
      // Initialize cart with existing items
      setCart(
        itemsData.map((item: any) => ({
          drink_id: item.drink_id,
          drink: item.drinks,
          quantity_cup: item.quantity_cup,
          quantity_bottle: item.quantity_bottle,
        }))
      )
      setCustomerName(orderData.customer_name)
    } catch (error) {
      console.error('Error fetching order details:', error)
    }
  }

  // Fetch drinks grouped by category
  const fetchDrinks = async () => {
    try {
      const { data, error } = await supabase
        .from('categories')
        .select(
          `
          *,
          drinks (*)
        `
        )
        .eq('enabled', true)
        .order('sort_order', { ascending: true })

      if (error) throw error

      const categoriesWithDrinks: CategoryWithDrinks[] = (data || []).map((category: any) => ({
        id: category.id,
        name: category.name,
        sort_order: category.sort_order,
        enabled: category.enabled,
        created_at: category.created_at,
        drinks: (category.drinks || [])
          .filter((drink: any) => drink.enabled)
          .sort((a: any, b: any) => a.sort_order - b.sort_order),
      }))

      setDrinks(categoriesWithDrinks)
    } catch (error) {
      console.error('Error fetching drinks:', error)
    }
  }

  const handleNewOrder = () => {
    router.push('/admin/ordering?action=new')
    setSelectedOrder(null)
    setCustomerName('')
    setCart([])
  }

  const handleSelectOrder = (order: Order) => {
    router.push(`/admin/ordering?action=edit&id=${order.id}`)
  }

  const handleCheckout = async (orderId: string) => {
    if (!confirm('确定要结账这个订单吗？')) return

    try {
      const { error } = await supabase
        .from('orders')
        .update({ status: 'checked_out', checked_out_at: new Date().toISOString() })
        .eq('id', orderId)

      if (error) throw error

      fetchActiveOrders()
    } catch (error) {
      console.error('Error checking out order:', error)
      alert('结账失败，请重试')
    }
  }

  const addToCart = (drink: Drink) => {
    setCart((prevCart) => {
      const existingItem = prevCart.find((item) => item.drink_id === drink.id)
      if (existingItem) {
        return prevCart.map((item) =>
          item.drink_id === drink.id
            ? {
                ...item,
                quantity_cup: item.quantity_cup + 1,
              }
            : item
        )
      }
      return [
        ...prevCart,
        {
          drink_id: drink.id,
          drink,
          quantity_cup: 1,
          quantity_bottle: 0,
        },
      ]
    })
  }

  const updateCartItem = (drinkId: string, field: 'quantity_cup' | 'quantity_bottle', value: number) => {
    setCart((prevCart) =>
      prevCart.map((item) => (item.drink_id === drinkId ? { ...item, [field]: value } : item))
    )
  }

  const removeFromCart = (drinkId: string) => {
    setCart((prevCart) => prevCart.filter((item) => item.drink_id !== drinkId))
  }

  const calculateCartTotal = () => {
    return cart.reduce((total, item) => {
      return total + item.quantity_cup * item.drink.price + item.quantity_bottle * (item.drink.price_bottle || 0)
    }, 0)
  }

  const handleSaveOrder = async () => {
    if (!customerName.trim()) {
      alert('请输入客户姓名')
      return
    }

    const itemsWithQuantity = cart.filter((item) => item.quantity_cup > 0 || item.quantity_bottle > 0)
    if (itemsWithQuantity.length === 0) {
      alert('请至少添加一个商品')
      return
    }

    try {
      const today = new Date().toISOString().split('T')[0]

      if (selectedOrder) {
        // Update existing order
        const { error: orderError } = await supabase
          .from('orders')
          .update({ customer_name: customerName })
          .eq('id', selectedOrder.id)

        if (orderError) throw orderError

        // Delete existing items
        const { error: deleteError } = await supabase.from('order_items').delete().eq('order_id', selectedOrder.id)

        if (deleteError) throw deleteError

        // Insert new items
        const orderItems = itemsWithQuantity.map((item) => ({
          order_id: selectedOrder.id,
          drink_id: item.drink_id,
          quantity_cup: item.quantity_cup,
          quantity_bottle: item.quantity_bottle,
          unit_price_cup: item.drink.price,
          unit_price_bottle: item.drink.price_bottle,
        }))

        const { error: insertError } = await supabase.from('order_items').insert(orderItems)

        if (insertError) throw insertError

        alert('订单更新成功')
      } else {
        // Create new order
        const { data: newOrder, error: orderError } = await supabase
          .from('orders')
          .insert({
            customer_name: customerName,
            order_date: today,
            status: 'active',
          })
          .select()
          .single()

        if (orderError) throw orderError

        // Insert order items
        const orderItems = itemsWithQuantity.map((item) => ({
          order_id: newOrder.id,
          drink_id: item.drink_id,
          quantity_cup: item.quantity_cup,
          quantity_bottle: item.quantity_bottle,
          unit_price_cup: item.drink.price,
          unit_price_bottle: item.drink.price_bottle,
        }))

        const { error: insertError } = await supabase.from('order_items').insert(orderItems)

        if (insertError) throw insertError

        alert('订单创建成功')
      }

      // Reset form and go back to list
      setCustomerName('')
      setCart([])
      setSelectedOrder(null)
      router.push('/admin/ordering')
      fetchActiveOrders()
    } catch (error) {
      console.error('Error saving order:', error)
      alert('保存失败，请重试')
    }
  }

  useEffect(() => {
    const loadData = async () => {
      await Promise.all([fetchActiveOrders(), fetchDrinks()])
      setLoading(false)
    }
    loadData()

    const channel = supabase
      .channel('ordering-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
        },
        () => {
          fetchActiveOrders()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  useEffect(() => {
    if (isEditing && orderId) {
      fetchOrderDetails(orderId)
    } else if (isCreating) {
      setSelectedOrder(null)
      setCustomerName('')
      setCart([])
    } else {
      setSelectedOrder(null)
    }
  }, [isEditing, isCreating, orderId])

  if (loading) {
    return (
      <div className="admin-container">
        <p>加载中...</p>
      </div>
    )
  }

  // Show form view for create/edit
  if (isCreating || isEditing) {
    return (
      <div className="admin-container">
        <div className="admin-header">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h1>{isEditing ? '编辑订单' : '新建订单'}</h1>
            <button
              onClick={() => router.push('/admin/ordering')}
              className="admin-button admin-button-secondary"
              style={{ padding: '0.5rem 1rem' }}
            >
              返回订单列表
            </button>
          </div>
        </div>

        <div className="admin-section">
          {/* Customer Name */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label className="admin-label">客户姓名</label>
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="admin-input"
              placeholder="请输入客户姓名"
              style={{ width: '100%', maxWidth: '400px' }}
            />
          </div>

          {/* Cart */}
          {cart.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '1rem' }}>订单内容</h3>
              <div className="admin-table-wrapper">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>商品</th>
                      <th>杯数</th>
                      <th>瓶数</th>
                      <th>单价（杯）</th>
                      <th>单价（瓶）</th>
                      <th>小计</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cart
                      .filter((item) => item.quantity_cup > 0 || item.quantity_bottle > 0)
                      .map((item) => {
                        const subtotal =
                          item.quantity_cup * item.drink.price +
                          item.quantity_bottle * (item.drink.price_bottle || 0)
                        return (
                          <tr key={item.drink_id}>
                            <td className="name-cell">{item.drink.name}</td>
                            <td>
                              <input
                                type="number"
                                min="0"
                                value={item.quantity_cup}
                                onChange={(e) =>
                                  updateCartItem(item.drink_id, 'quantity_cup', parseInt(e.target.value) || 0)
                                }
                                className="admin-input"
                                style={{ width: '60px', textAlign: 'center' }}
                              />
                            </td>
                            <td>
                              {item.drink.price_bottle ? (
                                <input
                                  type="number"
                                  min="0"
                                  value={item.quantity_bottle}
                                  onChange={(e) =>
                                    updateCartItem(item.drink_id, 'quantity_bottle', parseInt(e.target.value) || 0)
                                  }
                                  className="admin-input"
                                  style={{ width: '60px', textAlign: 'center' }}
                                />
                              ) : (
                                <span style={{ color: '#9ca3af' }}>—</span>
                              )}
                            </td>
                            <td>¥{item.drink.price.toFixed(2)}/{item.drink.price_unit}</td>
                            <td>
                              {item.drink.price_bottle
                                ? `¥${item.drink.price_bottle.toFixed(2)}/${item.drink.price_unit_bottle}`
                                : '—'}
                            </td>
                            <td style={{ fontWeight: 600 }}>¥{subtotal.toFixed(2)}</td>
                            <td>
                              <button
                                onClick={() => removeFromCart(item.drink_id)}
                                className="admin-button admin-button-danger"
                                style={{ padding: '0.25rem 0.75rem', fontSize: '12px' }}
                              >
                                删除
                              </button>
                            </td>
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
                <div style={{ fontSize: '18px', fontWeight: 700 }}>
                  总计: ¥{calculateCartTotal().toFixed(2)}
                </div>
              </div>
            </div>
          )}

          {/* Drink Selection */}
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '1rem' }}>选择商品</h3>
            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
              {drinks.map((category) => (
                <div key={category.id} style={{ marginBottom: '1.5rem' }}>
                  <h4
                    style={{
                      fontSize: '14px',
                      fontWeight: 600,
                      color: '#6b7280',
                      marginBottom: '0.75rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                    }}
                  >
                    {category.name}
                  </h4>
                  <div className="drink-selection-grid">
                    {category.drinks.map((drink) => (
                      <button
                        key={drink.id}
                        onClick={() => addToCart(drink)}
                        className="admin-button admin-button-secondary"
                        style={{
                          padding: '0.5rem 1rem',
                          fontSize: '14px',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {drink.name}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Save Button */}
          <div style={{ marginTop: '2rem', display: 'flex', gap: '1rem' }}>
            <button
              onClick={handleSaveOrder}
              className="admin-button admin-button-primary"
              disabled={!customerName.trim() || cart.filter((i) => i.quantity_cup > 0 || i.quantity_bottle > 0).length === 0}
            >
              {isEditing ? '更新订单' : '创建订单'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Show list view
  return (
    <div className="admin-container">
      <div className="admin-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1>点单</h1>
          <button
            onClick={handleNewOrder}
            className="admin-button admin-button-primary"
            style={{ padding: '0.5rem 1rem' }}
          >
            + 新订单
          </button>
        </div>
      </div>

      <div className="admin-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ margin: 0 }}>今日订单</h2>
        </div>

        <div className="orders-list-container">
          {activeOrders.length === 0 ? (
            <p style={{ color: '#9ca3af', textAlign: 'center', padding: '2rem' }}>
              暂无活跃订单
            </p>
          ) : (
            activeOrders.map((order) => (
              <div
                key={order.id}
                onClick={() => handleSelectOrder(order)}
                className="order-card"
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: 0 }}>
                    <span style={{ fontWeight: 600, fontSize: '15px', color: '#111827', whiteSpace: 'nowrap' }}>
                      {order.customer_name}
                    </span>
                    <span style={{ fontSize: '14px', color: '#6b7280', whiteSpace: 'nowrap' }}>
                      ¥{order.total_amount.toFixed(2)}
                    </span>
                    <span
                      style={{
                        fontSize: '12px',
                        padding: '0.2rem 0.5rem',
                        borderRadius: '4px',
                        backgroundColor:
                          order.status === 'active'
                            ? '#dbeafe'
                            : order.status === 'checked_out'
                            ? '#fef3c7'
                            : '#e5e7eb',
                        color:
                          order.status === 'active'
                            ? '#1e40af'
                            : order.status === 'checked_out'
                            ? '#92400e'
                            : '#374151',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {order.status === 'active'
                        ? '进行中'
                        : order.status === 'checked_out'
                        ? '已结账'
                        : '已完成'}
                    </span>
                  </div>
                  {order.status === 'active' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleCheckout(order.id)
                      }}
                      className="admin-button admin-button-secondary"
                      style={{ padding: '0.25rem 0.75rem', fontSize: '12px', flexShrink: 0 }}
                    >
                      结账
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

export default function OrderingPage() {
  return (
    <Suspense fallback={
      <div className="admin-container">
        <p>加载中...</p>
      </div>
    }>
      <OrderingPageContent />
    </Suspense>
  )
}
