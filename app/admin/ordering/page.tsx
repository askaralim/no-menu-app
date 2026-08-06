'use client'

import { useEffect, useState, Suspense, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import {
  Order,
  OrderWithItems,
  Drink,
  DrinkServingOption,
  CategoryWithDrinks,
  CartItem,
} from '@/lib/types'

function activeServings(drink: Drink): DrinkServingOption[] {
  return (drink.drink_serving_options ?? []).filter((s) => s.is_active && Number(s.price) > 0)
}

function formatServingLabel(s: Pick<DrinkServingOption, 'label' | 'volume_ml'>): string {
  const name = (s.label || '').trim() || '规格'
  return s.volume_ml != null && s.volume_ml > 0 ? `${name} · ${s.volume_ml}ml` : name
}

function priceHint(drink: Drink): string {
  const servings = activeServings(drink)
  if (!servings.length) return ''
  if (servings.length === 1) return `¥${Number(servings[0].price).toFixed(2)}`
  const min = Math.min(...servings.map((s) => Number(s.price)))
  return `从 ¥${min.toFixed(2)}`
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
  const [pickDrink, setPickDrink] = useState<Drink | null>(null)
  const [currentBusinessDayId, setCurrentBusinessDayId] = useState<string | null>(null)
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchTenantId = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase
      .from('user_roles')
      .select('tenant_id')
      .eq('user_id', user.id)
      .single()
    if (data) setTenantId(data.tenant_id)
  }

  const getCurrentBusinessDay = async (): Promise<{ id: string | null; error: string | null }> => {
    try {
      const { data, error } = await supabase.rpc('get_or_create_open_business_day')

      if (error) {
        console.error('Error calling get_or_create_open_business_day RPC:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        })
        if ((error.message || '').includes('BUSINESS_DAY_CLOSED')) {
          return { id: null, error: 'BUSINESS_DAY_CLOSED' }
        }
        return { id: null, error: error.message || '数据库函数调用失败' }
      }

      if (!data) {
        console.error('RPC function returned null or undefined')
        return { id: null, error: '数据库函数返回空值' }
      }

      return { id: data, error: null }
    } catch (error: any) {
      console.error('Unexpected error getting business day:', error)
      return { id: null, error: error?.message || '未知错误' }
    }
  }

  const reopenTodaysBusinessDay = async (): Promise<string | null> => {
    const { data, error } = await supabase.rpc('reopen_todays_business_day')
    if (error) {
      alert(`重新开始营业日失败: ${error.message}`)
      return null
    }
    return (data as string) || null
  }

  const fetchActiveOrders = useCallback(async () => {
    try {
      const { data: openId, error: openError } = await supabase.rpc('get_current_open_business_day')
      if (openError) throw openError

      let businessDayId = (openId as string) || null
      if (!businessDayId) {
        const result = await getCurrentBusinessDay()
        if (!result.id) {
          if (result.error === 'BUSINESS_DAY_CLOSED') {
            setCurrentBusinessDayId(null)
            setActiveOrders([])
            return
          }
          console.warn('No business day available:', result.error)
          setActiveOrders([])
          return
        }
        businessDayId = result.id
      }

      setCurrentBusinessDayId(businessDayId)

      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('status', 'active')
        .eq('business_day_id', businessDayId)
        .order('created_at', { ascending: false })

      if (error) throw error
      setActiveOrders(data || [])
    } catch (error) {
      console.error('Error fetching orders:', error)
    }
  }, [])

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
          drinks (*, drink_serving_options(id, label, volume_ml, price, is_active, is_default))
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
      setCart(
        itemsData.map((item: any) => ({
          drink_id: item.drink_id,
          drink: item.drinks,
          serving_option_id: item.serving_option_id,
          serving_label: item.label_snapshot || '规格',
          unit_price: Number(item.unit_price),
          quantity: item.quantity,
        }))
      )
      setCustomerName(orderData.customer_name)
    } catch (error) {
      console.error('Error fetching order details:', error)
    }
  }

  const fetchDrinks = async () => {
    try {
      const { data, error } = await supabase
        .from('categories')
        .select(
          `
          *,
          drinks (*, drink_serving_options(id, label, volume_ml, price, is_active, is_default))
        `
        )
        .eq('enabled', true)
        .order('sort_order', { ascending: true })

      if (error) throw error

      const categoriesWithDrinks: CategoryWithDrinks[] = (data || [])
        .map((category: any) => ({
          id: category.id,
          name: category.name,
          sort_order: category.sort_order,
          enabled: category.enabled,
          created_at: category.created_at,
          drinks: (category.drinks || [])
            .filter((drink: Drink) => drink.enabled && activeServings(drink).length > 0)
            .sort((a: Drink, b: Drink) => a.sort_order - b.sort_order),
        }))
        .filter((cat) => cat.drinks.length > 0)

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
    setPickDrink(null)
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

  const addServingToCart = (drink: Drink, serving: DrinkServingOption) => {
    const label = formatServingLabel(serving)
    const price = Number(serving.price)
    setCart((prevCart) => {
      const existingItem = prevCart.find((item) => item.serving_option_id === serving.id)
      if (existingItem) {
        return prevCart.map((item) =>
          item.serving_option_id === serving.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      }
      return [
        ...prevCart,
        {
          drink_id: drink.id,
          drink,
          serving_option_id: serving.id,
          serving_label: label,
          unit_price: price,
          quantity: 1,
        },
      ]
    })
    setPickDrink(null)
  }

  const onPressDrink = (drink: Drink) => {
    const servings = activeServings(drink)
    if (!servings.length) {
      alert('该酒款没有有效价格规格')
      return
    }
    if (servings.length === 1) {
      addServingToCart(drink, servings[0])
      return
    }
    setPickDrink(drink)
  }

  const updateCartItem = (servingOptionId: string, value: number) => {
    if (value <= 0) {
      setCart((prevCart) => prevCart.filter((item) => item.serving_option_id !== servingOptionId))
      return
    }
    setCart((prevCart) =>
      prevCart.map((item) =>
        item.serving_option_id === servingOptionId ? { ...item, quantity: value } : item
      )
    )
  }

  const removeFromCart = (servingOptionId: string) => {
    setCart((prevCart) => prevCart.filter((item) => item.serving_option_id !== servingOptionId))
  }

  const calculateCartTotal = () => {
    return cart.reduce((total, item) => total + item.quantity * item.unit_price, 0)
  }

  const handleSaveOrder = async () => {
    if (!customerName.trim()) {
      alert('请输入客户姓名')
      return
    }

    const itemsWithQuantity = cart.filter((item) => item.quantity > 0)
    if (itemsWithQuantity.length === 0) {
      alert('请至少添加一个商品')
      return
    }

    try {
      const now = new Date()
      const chinaDateString = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })
      const today = chinaDateString

      const toRows = (orderId: string) =>
        itemsWithQuantity.map((item) => ({
          order_id: orderId,
          drink_id: item.drink_id,
          serving_option_id: item.serving_option_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          label_snapshot: item.serving_label,
          tenant_id: tenantId,
        }))

      if (selectedOrder) {
        const { error: orderError } = await supabase
          .from('orders')
          .update({ customer_name: customerName })
          .eq('id', selectedOrder.id)

        if (orderError) throw orderError

        const { error: deleteError } = await supabase.from('order_items').delete().eq('order_id', selectedOrder.id)

        if (deleteError) throw deleteError

        const { error: insertError } = await supabase.from('order_items').insert(toRows(selectedOrder.id))

        if (insertError) throw insertError

        alert('订单更新成功')
      } else {
        const result = await getCurrentBusinessDay()
        if (!result.id) {
          if (result.error === 'BUSINESS_DAY_CLOSED') {
            const ok = confirm(
              '今日营业日已结束。重新开始后可开新单；此前已结账订单仍不可恢复。是否重新开始营业日？',
            )
            if (!ok) return
            const reopened = await reopenTodaysBusinessDay()
            if (!reopened) return
            // retry create with reopened day
            const { data: newOrder, error: orderError } = await supabase
              .from('orders')
              .insert({
                customer_name: customerName,
                order_date: today,
                business_day_id: reopened,
                status: 'active',
                tenant_id: tenantId,
              })
              .select()
              .single()
            if (orderError) throw orderError
            const { error: insertError } = await supabase.from('order_items').insert(toRows(newOrder.id))
            if (insertError) throw insertError
            alert('订单创建成功')
            setViewMode('list')
            setSelectedOrder(null)
            setCart([])
            setCustomerName('')
            fetchActiveOrders()
            return
          }
          const errorMsg = result.error
            ? `无法获取营业日: ${result.error}\n\n请检查:\n1. 数据库函数 get_or_create_open_business_day 是否存在\n2. 数据库权限设置是否正确\n3. 查看浏览器控制台获取详细错误信息`
            : '无法获取营业日，请重试'
          alert(errorMsg)
          return
        }

        const businessDayId = result.id

        const { data: newOrder, error: orderError } = await supabase
          .from('orders')
          .insert({
            customer_name: customerName,
            order_date: today,
            business_day_id: businessDayId,
            status: 'active',
            tenant_id: tenantId,
          })
          .select()
          .single()

        if (orderError) throw orderError

        const { error: insertError } = await supabase.from('order_items').insert(toRows(newOrder.id))

        if (insertError) throw insertError

        alert('订单创建成功')
      }

      setCustomerName('')
      setCart([])
      setSelectedOrder(null)
      setPickDrink(null)
      router.push('/admin/ordering')
      fetchActiveOrders()
    } catch (error) {
      console.error('Error saving order:', error)
      alert('保存失败，请重试')
    }
  }

  useEffect(() => {
    const loadData = async () => {
      await Promise.all([fetchActiveOrders(), fetchDrinks(), fetchTenantId()])
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
  }, [fetchActiveOrders])

  useEffect(() => {
    if (isEditing && orderId) {
      fetchOrderDetails(orderId)
    } else if (isCreating) {
      setSelectedOrder(null)
      setCustomerName('')
      setCart([])
      setPickDrink(null)
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

          {cart.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '1rem' }}>订单内容</h3>
              <div className="admin-table-wrapper">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>商品</th>
                      <th>规格</th>
                      <th>数量</th>
                      <th>单价</th>
                      <th>小计</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cart
                      .filter((item) => item.quantity > 0)
                      .map((item) => {
                        const subtotal = item.quantity * item.unit_price
                        return (
                          <tr key={item.serving_option_id}>
                            <td className="name-cell">{item.drink.name}</td>
                            <td>{item.serving_label}</td>
                            <td>
                              <input
                                type="number"
                                min="0"
                                value={item.quantity}
                                onChange={(e) =>
                                  updateCartItem(item.serving_option_id, parseInt(e.target.value) || 0)
                                }
                                className="admin-input"
                                style={{ width: '60px', textAlign: 'center' }}
                              />
                            </td>
                            <td>¥{item.unit_price.toFixed(2)}</td>
                            <td style={{ fontWeight: 600 }}>¥{subtotal.toFixed(2)}</td>
                            <td>
                              <button
                                onClick={() => removeFromCart(item.serving_option_id)}
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

          {pickDrink && (
            <div
              style={{
                marginBottom: '1.5rem',
                padding: '1rem',
                backgroundColor: '#f9fafb',
                borderRadius: '8px',
                border: '1px solid #e5e7eb',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>
                  选择规格 — {pickDrink.name}
                </h3>
                <button
                  onClick={() => setPickDrink(null)}
                  className="admin-button admin-button-secondary"
                  style={{ padding: '0.25rem 0.75rem', fontSize: '12px' }}
                >
                  取消
                </button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {activeServings(pickDrink).map((serving) => (
                  <button
                    key={serving.id}
                    onClick={() => addServingToCart(pickDrink, serving)}
                    className="admin-button admin-button-primary"
                    style={{ padding: '0.5rem 1rem', fontSize: '14px' }}
                  >
                    {formatServingLabel(serving)} · ¥{Number(serving.price).toFixed(2)}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '1rem' }}>选择商品</h3>
            <div>
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
                    {category.drinks.map((drink) => {
                      const hint = priceHint(drink)
                      const multi = activeServings(drink).length > 1
                      return (
                        <button
                          key={drink.id}
                          onClick={() => onPressDrink(drink)}
                          className="admin-button admin-button-secondary"
                          style={{
                            padding: '0.5rem 1rem',
                            fontSize: '14px',
                            whiteSpace: 'nowrap',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'flex-start',
                            gap: '0.15rem',
                          }}
                        >
                          <span>{drink.name}</span>
                          {hint && (
                            <span style={{ fontSize: '12px', color: '#6b7280', fontWeight: 400 }}>
                              {hint}{multi ? ' · 选规格' : ''}
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ marginTop: '2rem', display: 'flex', gap: '1rem' }}>
            <button
              onClick={handleSaveOrder}
              className="admin-button admin-button-primary"
              disabled={!customerName.trim() || cart.filter((i) => i.quantity > 0).length === 0}
            >
              {isEditing ? '更新订单' : '创建订单'}
            </button>
          </div>
        </div>
      </div>
    )
  }

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
                            : '#fef3c7',
                        color:
                          order.status === 'active'
                            ? '#1e40af'
                            : '#92400e',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {order.status === 'active' ? '进行中' : '已结账'}
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
