'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { resolvePosAdminTenantId } from '@/lib/adminTenant'
import { Drink, Category } from '@/lib/types'

export default function DrinksPage() {
  const [drinks, setDrinks] = useState<Drink[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    category_id: '',
    name: '',
    price: 0,
    price_unit: '杯',
    price_bottle: null as number | null,
    price_unit_bottle: '瓶',
    sort_order: 0,
  })

  const fetchCategories = useCallback(async (tid: string) => {
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .eq('tenant_id', tid)
        .order('sort_order', { ascending: true })

      if (error) throw error
      setCategories(data || [])
    } catch (error) {
      console.error('Error fetching categories:', error)
    }
  }, [])

  const fetchDrinks = useCallback(async (tid: string) => {
    try {
      const { data, error } = await supabase
        .from('drinks')
        .select('*')
        .eq('tenant_id', tid)
        .order('sort_order', { ascending: true })

      if (error) throw error
      setDrinks(data || [])
    } catch (error) {
      console.error('Error fetching drinks:', error)
    }
  }, [])

  const loadMenu = useCallback(
    async (tid: string) => {
      await Promise.all([fetchDrinks(tid), fetchCategories(tid)])
    },
    [fetchDrinks, fetchCategories]
  )

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null

    const init = async () => {
      setLoading(true)
      const tid = await resolvePosAdminTenantId(supabase)
      setTenantId(tid)
      if (!tid) {
        setDrinks([])
        setCategories([])
        setLoading(false)
        return
      }
      await loadMenu(tid)
      setLoading(false)

      channel = supabase
        .channel(`drinks-changes-${tid}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'drinks',
            filter: `tenant_id=eq.${tid}`,
          },
          () => {
            void loadMenu(tid)
          }
        )
        .subscribe()
    }

    void init()

    return () => {
      if (channel) supabase.removeChannel(channel)
    }
  }, [loadMenu])

  const refresh = () => {
    if (tenantId) void loadMenu(tenantId)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!tenantId) {
      alert('未绑定门店，无法保存酒品')
      return
    }
    try {
      if (editingId) {
        const { error } = await supabase
          .from('drinks')
          .update(formData)
          .eq('id', editingId)
          .eq('tenant_id', tenantId)

        if (error) throw error
        setEditingId(null)
      } else {
        const { error } = await supabase
          .from('drinks')
          .insert([{ ...formData, tenant_id: tenantId }])
        if (error) throw error
      }
      setFormData({
        category_id: '',
        name: '',
        price: 0,
        price_unit: '杯',
        price_bottle: null,
        price_unit_bottle: '瓶',
        sort_order: 0,
      })
      refresh()
    } catch (error) {
      console.error('Error saving drink:', error)
      alert('保存失败，请重试')
    }
  }

  const handleEdit = (drink: Drink) => {
    setEditingId(drink.id)
    setFormData({
      category_id: drink.category_id,
      name: drink.name,
      price: drink.price,
      price_unit: drink.price_unit || '杯',
      price_bottle: drink.price_bottle,
      price_unit_bottle: drink.price_unit_bottle || '瓶',
      sort_order: drink.sort_order,
    })
  }

  const handleDelete = async (id: string) => {
    if (!tenantId) return
    if (!confirm('确定要删除这个酒品吗？')) return

    try {
      const { error } = await supabase
        .from('drinks')
        .delete()
        .eq('id', id)
        .eq('tenant_id', tenantId)
      if (error) throw error
      refresh()
    } catch (error) {
      console.error('Error deleting drink:', error)
      alert('删除失败，请重试')
    }
  }

  const handleToggleEnabled = async (drink: Drink) => {
    if (!tenantId) return
    try {
      const { error } = await supabase
        .from('drinks')
        .update({ enabled: !drink.enabled })
        .eq('id', drink.id)
        .eq('tenant_id', tenantId)

      if (error) throw error
      refresh()
    } catch (error) {
      console.error('Error toggling drink:', error)
    }
  }

  // Group drinks by category
  const drinksByCategory = categories
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((category) => ({
      category,
      drinks: drinks
        .filter((drink) => drink.category_id === category.id)
        .sort((a, b) => a.sort_order - b.sort_order),
    }))
    .filter((group) => group.drinks.length > 0)

  const uncategorizedDrinks = drinks
    .filter((drink) => !categories.find((c) => c.id === drink.category_id))
    .sort((a, b) => a.sort_order - b.sort_order)

  if (loading) {
    return (
      <div className="admin-container">
        <p>加载中...</p>
      </div>
    )
  }

  if (!tenantId) {
    return (
      <div className="admin-container">
        <div className="admin-header">
          <h1>酒品管理</h1>
        </div>
        <p>当前账号未绑定门店（需要店主或员工角色）。</p>
      </div>
    )
  }

  return (
    <div className="admin-container">
      <div className="admin-header">
        <h1>酒品管理</h1>
      </div>

      <div className="admin-section">
        <h2>{editingId ? '编辑酒品' : '新增酒品'}</h2>
        <form onSubmit={handleSubmit} className="admin-form">
          <select
            value={formData.category_id}
            onChange={(e) =>
              setFormData({ ...formData, category_id: e.target.value })
            }
            className="admin-input"
            required
          >
            <option value="">选择分类</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="酒品名称"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="admin-input"
            required
          />
          <input
            type="number"
            placeholder="价格"
            step="0.01"
            value={formData.price}
            onChange={(e) =>
              setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })
            }
            className="admin-input"
            style={{ width: '120px' }}
            required
          />
          <input
            type="text"
            placeholder="价格单位（如：杯、份）"
            value={formData.price_unit}
            onChange={(e) =>
              setFormData({ ...formData, price_unit: e.target.value })
            }
            className="admin-input"
            style={{ width: '120px' }}
          />
          <input
            type="number"
            placeholder="瓶装价格（可选）"
            step="0.01"
            value={formData.price_bottle || ''}
            onChange={(e) =>
              setFormData({ ...formData, price_bottle: e.target.value ? parseFloat(e.target.value) : null })
            }
            className="admin-input"
            style={{ width: '130px' }}
          />
          <input
            type="text"
            placeholder="瓶装单位"
            value={formData.price_unit_bottle}
            onChange={(e) =>
              setFormData({ ...formData, price_unit_bottle: e.target.value })
            }
            className="admin-input"
            style={{ width: '100px' }}
          />
          <input
            type="number"
            placeholder="排序"
            value={formData.sort_order}
            onChange={(e) =>
              setFormData({ ...formData, sort_order: parseInt(e.target.value) || 0 })
            }
            className="admin-input"
            style={{ width: '100px' }}
          />
          <button type="submit" className="admin-button admin-button-primary">
            {editingId ? '更新' : '添加'}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={() => {
                setEditingId(null)
                setFormData({
                  category_id: '',
                  name: '',
                  price: 0,
                  price_unit: '杯',
                  price_bottle: null,
                  price_unit_bottle: '瓶',
                  sort_order: 0,
                })
              }}
              className="admin-button admin-button-secondary"
            >
              取消
            </button>
          )}
        </form>
      </div>

      <div className="admin-section">
        <h2>酒品列表</h2>
        {drinksByCategory.map((group) => (
          <div key={group.category.id} style={{ marginBottom: '2rem' }}>
            <h3 style={{ 
              fontSize: '18px', 
              fontWeight: 600, 
              color: '#111827', 
              marginBottom: '1rem',
              paddingBottom: '0.5rem',
              borderBottom: '2px solid #e5e7eb'
            }}>
              {group.category.name}
            </h3>
            <div className="admin-table-wrapper">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>名称</th>
                    <th>价格（杯）</th>
                    <th>价格（瓶）</th>
                    <th>排序</th>
                    <th>状态</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {group.drinks.map((drink) => (
                    <tr key={drink.id}>
                      <td className="name-cell">{drink.name}</td>
                      <td>¥{drink.price.toFixed(2)}/{drink.price_unit || '杯'}</td>
                      <td>
                        {drink.price_bottle ? (
                          <>¥{drink.price_bottle.toFixed(2)}/{drink.price_unit_bottle || '瓶'}</>
                        ) : (
                          <span style={{ color: '#9ca3af' }}>—</span>
                        )}
                      </td>
                      <td className="sort-cell">{drink.sort_order}</td>
                      <td>
                        <label className="toggle-switch">
                          <input
                            type="checkbox"
                            checked={drink.enabled}
                            onChange={() => handleToggleEnabled(drink)}
                          />
                          <span className="toggle-slider"></span>
                        </label>
                      </td>
                      <td>
                        <button
                          onClick={() => handleEdit(drink)}
                          className="admin-button admin-button-secondary"
                          style={{ marginRight: '0.5rem' }}
                        >
                          编辑
                        </button>
                        <button
                          onClick={() => handleDelete(drink.id)}
                          className="admin-button admin-button-danger"
                        >
                          删除
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
        {uncategorizedDrinks.length > 0 && (
          <div style={{ marginTop: '2rem' }}>
            <h3 style={{ 
              fontSize: '18px', 
              fontWeight: 600, 
              color: '#111827', 
              marginBottom: '1rem',
              paddingBottom: '0.5rem',
              borderBottom: '2px solid #e5e7eb'
            }}>
              未分类
            </h3>
            <div className="admin-table-wrapper">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>名称</th>
                    <th>价格（杯）</th>
                    <th>价格（瓶）</th>
                    <th>排序</th>
                    <th>状态</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {uncategorizedDrinks.map((drink) => (
                    <tr key={drink.id}>
                      <td className="name-cell">{drink.name}</td>
                      <td>¥{drink.price.toFixed(2)}/{drink.price_unit || '杯'}</td>
                      <td>
                        {drink.price_bottle ? (
                          <>¥{drink.price_bottle.toFixed(2)}/{drink.price_unit_bottle || '瓶'}</>
                        ) : (
                          <span style={{ color: '#9ca3af' }}>—</span>
                        )}
                      </td>
                      <td className="sort-cell">{drink.sort_order}</td>
                      <td>
                        <label className="toggle-switch">
                          <input
                            type="checkbox"
                            checked={drink.enabled}
                            onChange={() => handleToggleEnabled(drink)}
                          />
                          <span className="toggle-slider"></span>
                        </label>
                      </td>
                      <td>
                        <button
                          onClick={() => handleEdit(drink)}
                          className="admin-button admin-button-secondary"
                          style={{ marginRight: '0.5rem' }}
                        >
                          编辑
                        </button>
                        <button
                          onClick={() => handleDelete(drink.id)}
                          className="admin-button admin-button-danger"
                        >
                          删除
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
