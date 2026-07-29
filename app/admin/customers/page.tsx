'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabaseClient'

interface CustomerSpending {
  customer_name: string
  total_paid: number
  order_count: number
}

// Map variant customer names to canonical name for grouping
const CUSTOMER_NAME_MAP: Record<string, string> = {
  '阿尔法': '阿尔法, 凯瑟琳',
  '凯瑟琳': '阿尔法, 凯瑟琳',
  '阿尔法凯瑟琳': '阿尔法, 凯瑟琳',
  'Arafat': '阿尔法, 凯瑟琳',
  'kamil': '卡门',
  '尼加提': 'nijat',
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<CustomerSpending[]>([])
  const [loading, setLoading] = useState(true)

  const fetchCustomerSpending = useCallback(async () => {
    try {
      const { data: ordersData, error } = await supabase
        .from('orders')
        .select('customer_name, total_amount, status')
        .in('status', ['checked_out', 'finished'])

      if (error) throw error

      // Group by customer_name and sum total_amount
      const map = new Map<string, { total: number; count: number }>()

      const toCanonicalName = (raw: string) =>
        CUSTOMER_NAME_MAP[raw] ?? raw

      for (const order of ordersData || []) {
        const raw = (order.customer_name || '').trim() || '(未填写)'
        const name = toCanonicalName(raw)
        const amount = Number(order.total_amount || 0)
        const existing = map.get(name)
        if (existing) {
          existing.total += amount
          existing.count += 1
        } else {
          map.set(name, { total: amount, count: 1 })
        }
      }

      const list: CustomerSpending[] = Array.from(map.entries()).map(([customer_name, { total, count }]) => ({
        customer_name,
        total_paid: total,
        order_count: count,
      }))

      list.sort((a, b) => b.total_paid - a.total_paid)
      setCustomers(list)
    } catch (error) {
      console.error('Error fetching customer spending:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchCustomerSpending()
  }, [fetchCustomerSpending])

  if (loading) {
    return (
      <div className="admin-container">
        <p>加载中...</p>
      </div>
    )
  }

  return (
    <div className="admin-container">
      <div className="admin-header">
        <h1>客户消费排行</h1>
        <p style={{ color: '#6b7280', fontSize: '14px', marginTop: '0.5rem' }}>
          按已结账订单的消费总额排序
        </p>
      </div>

      <div className="admin-section">
        {customers.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#9ca3af', padding: '2rem' }}>暂无消费记录</p>
        ) : (
          <div className="admin-table-wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th style={{ width: '60px' }}>排名</th>
                  <th>客户姓名</th>
                  <th style={{ textAlign: 'right' }}>订单数</th>
                  <th style={{ textAlign: 'right' }}>消费总额</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c, index) => (
                  <tr key={c.customer_name}>
                    <td style={{ color: '#6b7280', fontWeight: 500 }}>{index + 1}</td>
                    <td style={{ fontWeight: 600, color: '#111827' }}>{c.customer_name}</td>
                    <td style={{ textAlign: 'right', color: '#111827' }}>{c.order_count}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: '#111827' }}>
                      ¥{c.total_paid.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
